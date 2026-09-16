/**
 * Calendario de flujo proyectado: mes a mes, de aquí al horizonte que se le pida.
 *
 * Existe porque la app solo sabía mirar hasta fin de mes. `buildFutureFlowWindows` (7/15/30
 * días) lee la PRÓXIMA ocurrencia de cada compromiso y para ahí, así que nunca podía contestar
 * "cuánto voy a tener en abril": ni repite el sueldo, ni sigue el cronograma de una deuda más
 * allá de su siguiente cuota.
 *
 * Dos reglas que gobiernan todo lo de abajo:
 *
 * 1. **Lo pactado se expande; lo demás se estima.** Una cuota acordada tiene fecha y monto, y
 *    entra tal cual. El gasto del día a día no: entra como una sola línea estimada por mes.
 *    Cada línea dice de cuál de los dos lados viene (`source`), porque un total que mezcla
 *    ambos sin distinguirlos se lee como si todo fuera igual de firme, y no lo es.
 *
 * 2. **El gasto típico se mide con la MEDIANA, no con el promedio.** Un mes con una compra
 *    grande arrastra el promedio hacia arriba y la proyección cobra ese gasto único otra vez
 *    cada mes que queda por delante. La mediana ignora al mes raro por construcción. Ver
 *    `typicalMonthlySpend`.
 *
 * RN-free a propósito: solo datos y fechas. Quien lo llama convierte monedas y lo pinta.
 */
import { addDays, addMonths, addQuarters, addWeeks, addYears, format, getDaysInMonth, parseISO } from "date-fns";

import { obligationViewerDirection } from "../../../lib/obligation-viewer-labels";
import { expandPaymentPlan, parsePaymentPlan } from "../../obligations/lib/payment-plan";

/** Tope de ocurrencias por compromiso. Una cadencia diaria a 12 meses son ~365 de una sola. */
const MAX_OCCURRENCES = 500;
/** Por debajo de esto un monto es ruido de redondeo y no merece una línea. */
const EPSILON = 0.009;

export type ProjectionLineKind =
  | "recurring_income"
  | "obligation_receivable"
  | "obligation_payable"
  | "subscription"
  | "planned_movement"
  | "typical_spend";

export type ProjectionLine = {
  kind: ProjectionLineKind;
  label: string;
  /** Siempre positivo. El signo lo da el lado en el que vive: `inflows` u `outflows`. */
  amount: number;
  /**
   * `scheduled`: alguien pactó esta fecha y este monto — una cuota, un sueldo, una suscripción.
   * `estimated`: lo dedujo el motor del historial.
   *
   * La distinción es la que permite decir "de los 2.400 que salen en noviembre, 1.800 están
   * pactados y 600 son estimación". Sin ella los dos números pesan igual en pantalla.
   */
  source: "scheduled" | "estimated";
};

export type ProjectedMonth = {
  /** `yyyy-MM`. */
  monthKey: string;
  openingBalance: number;
  inflows: ProjectionLine[];
  outflows: ProjectionLine[];
  inflowTotal: number;
  outflowTotal: number;
  netFlow: number;
  closingBalance: number;
  /**
   * Qué parte del movimiento del mes viene de compromisos con fecha (0..1). Es el indicador de
   * confianza: 1 = todo pactado, 0 = todo estimado a partir del historial.
   */
  scheduledShare: number;
  /** Compromisos cuyo monto no se pudo convertir a la moneda de la proyección: sumaron 0. */
  unconvertedCount: number;
  /** El mes en curso arranca hoy, no el día 1: su gasto típico va prorrateado. */
  isPartial: boolean;
};

export type ProjectionRecurringIncome = {
  name: string;
  amount: number;
  currencyCode: string;
  frequency: string;
  intervalCount?: number | null;
  nextExpectedDate: string;
  endDate?: string | null;
  status: string;
};

export type ProjectionSubscription = {
  name: string;
  amount: number;
  currencyCode: string;
  frequency: string;
  intervalCount?: number | null;
  nextDueDate: string;
  endDate?: string | null;
  status: string;
};

export type ProjectionObligation = {
  title: string;
  direction: string;
  status: string;
  currencyCode: string;
  pendingAmount: number;
  /** Principal vigente: con él y `pendingAmount` se deduce cuánto se lleva pagado. */
  principalCurrentAmount: number;
  startDate: string | null;
  dueDate: string | null;
  paymentPlan: unknown;
  installmentAmount?: number | null;
};

export type ProjectionPlannedMovement = {
  description: string;
  /** Positivo entra, negativo sale. */
  signedAmount: number;
  currencyCode: string;
  occurredAt: string;
};

export type ProjectionInput = {
  /** Saldo líquido de hoy, ya convertido a la moneda de la proyección. */
  startingBalance: number;
  /** Desde cuándo se proyecta, `yyyy-MM-dd`. Normalmente hoy. */
  fromDate: string;
  /** Cuántos meses devolver, contando el mes en curso. */
  months: number;
  recurringIncome: readonly ProjectionRecurringIncome[];
  subscriptions: readonly ProjectionSubscription[];
  obligations: readonly ProjectionObligation[];
  plannedMovements: readonly ProjectionPlannedMovement[];
  /**
   * Mediana del gasto mensual que NO está ya representado arriba.
   *
   * Quien lo calcula debe excluir los movimientos ligados a suscripciones y a deudas, o se
   * cuentan dos veces: una en su línea pactada y otra dentro de este bulto. `typicalMonthlySpend`
   * calcula la mediana; el filtrado es de quien reúne los meses.
   */
  typicalDiscretionarySpend: number;
  /** Conversor. Devuelve null cuando no hay tasa; ese ítem suma 0 y se cuenta aparte. */
  convert: (amount: number, fromCurrency: string) => number | null;
};

export type ProjectionResult = {
  months: ProjectedMonth[];
  /** Saldo al final del último mes. El número que el usuario viene a buscar. */
  endingBalance: number;
  /** Promedio de `scheduledShare`. Baja mientras más lejos mire la proyección. */
  overallScheduledShare: number;
  unconvertedCount: number;
};

/**
 * El mes típico, no el mes promedio.
 *
 * Con [780, 820, 850, 800, 2180, 810] el promedio da 1.040 y la mediana 815. Los 2.180 fueron
 * una compra que no se repite; el promedio la reparte entre todos los meses futuros y la cobra
 * una y otra vez. La mediana la deja donde estaba: arriba, sola, sin arrastrar a nadie.
 *
 * Con un número par de meses se promedian los dos del medio, que es la definición de mediana.
 */
export function typicalMonthlySpend(monthlyTotals: readonly number[]): number {
  const values = monthlyTotals
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.abs(value))
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function monthKeyOf(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Siguiente ocurrencia de una cadencia. `custom` cae en mensual: es lo que es casi siempre. */
function advance(date: Date, frequency: string, intervalCount: number | null | undefined): Date {
  const step = Math.max(1, Math.floor(intervalCount ?? 1));
  switch (frequency) {
    case "daily":
      return addDays(date, step);
    case "weekly":
      return addWeeks(date, step);
    case "quarterly":
      return addQuarters(date, step);
    case "yearly":
      return addYears(date, step);
    case "monthly":
    default:
      return addMonths(date, step);
  }
}

/** Fechas de una cadencia dentro de la ventana. Vacío si la fecha de arranque no se puede leer. */
function occurrencesWithin(
  startIso: string,
  frequency: string,
  intervalCount: number | null | undefined,
  endIso: string | null | undefined,
  fromDate: Date,
  horizonDate: Date,
): Date[] {
  const first = parseISO(startIso);
  if (Number.isNaN(first.getTime())) return [];
  const hardEnd = endIso ? parseISO(endIso) : null;
  const limit = hardEnd && !Number.isNaN(hardEnd.getTime()) && hardEnd < horizonDate ? hardEnd : horizonDate;

  const dates: Date[] = [];
  let cursor = first;
  for (let i = 0; i < MAX_OCCURRENCES && cursor <= limit; i += 1) {
    if (cursor >= fromDate) dates.push(cursor);
    const next = advance(cursor, frequency, intervalCount);
    // Una cadencia que no avanza colgaría el bucle hasta el tope. Mejor cortar aquí.
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

/**
 * Las cuotas que TODAVÍA no se han pagado.
 *
 * No hace falta leer los eventos de pago: lo abonado es `principal vigente - saldo pendiente`,
 * y eso cubre las primeras cuotas del cronograma en orden. Si un pago dejó una cuota a medias,
 * la cuota sigue en la lista por lo que le falta, no por su monto entero.
 */
function pendingInstallments(obligation: ProjectionObligation): Array<{ dueDate: Date; amount: number }> {
  const plan = parsePaymentPlan(obligation.paymentPlan);
  const principal = obligation.principalCurrentAmount;
  const pending = obligation.pendingAmount;

  if (!plan || principal <= EPSILON) {
    // Sin plan hay dos salidas honestas: la cuota pactada repetida hasta cubrir el saldo, o —si
    // tampoco hay cuota— el saldo entero en su fecha de vencimiento. Inventar un cronograma
    // mensual donde nadie acordó uno sería peor que no proyectar nada.
    if (obligation.installmentAmount && obligation.installmentAmount > EPSILON) {
      const anchor = obligation.dueDate ?? obligation.startDate;
      const start = anchor ? parseISO(anchor) : null;
      if (!start || Number.isNaN(start.getTime())) return [];
      const rows: Array<{ dueDate: Date; amount: number }> = [];
      let remaining = pending;
      for (let i = 0; i < MAX_OCCURRENCES && remaining > EPSILON; i += 1) {
        const amount = Math.min(obligation.installmentAmount, remaining);
        rows.push({ dueDate: addMonths(start, i), amount });
        remaining -= amount;
      }
      return rows;
    }
    if (!obligation.dueDate || pending <= EPSILON) return [];
    const dueDate = parseISO(obligation.dueDate);
    if (Number.isNaN(dueDate.getTime())) return [];
    return [{ dueDate, amount: pending }];
  }

  const startDate = obligation.startDate ?? format(new Date(), "yyyy-MM-dd");
  const schedule = expandPaymentPlan({ plan, principal, startDate });
  let alreadyPaid = Math.max(0, principal - pending);

  const rows: Array<{ dueDate: Date; amount: number }> = [];
  for (const payment of schedule) {
    if (alreadyPaid >= payment.amount - EPSILON) {
      alreadyPaid -= payment.amount;
      continue;
    }
    const remainingOnThis = payment.amount - alreadyPaid;
    alreadyPaid = 0;
    const dueDate = parseISO(payment.dueDate);
    if (Number.isNaN(dueDate.getTime())) continue;
    if (remainingOnThis > EPSILON) rows.push({ dueDate, amount: remainingOnThis });
  }
  return rows;
}

type MonthBucket = {
  monthKey: string;
  inflows: ProjectionLine[];
  outflows: ProjectionLine[];
  unconvertedCount: number;
};

export function buildCashflowCalendar(input: ProjectionInput): ProjectionResult {
  const fromDate = parseISO(input.fromDate);
  const monthCount = Math.max(1, Math.floor(input.months));
  if (Number.isNaN(fromDate.getTime())) {
    return { months: [], endingBalance: input.startingBalance, overallScheduledShare: 0, unconvertedCount: 0 };
  }

  // Ventana: desde hoy hasta el último día del último mes proyectado.
  const lastMonth = addMonths(fromDate, monthCount - 1);
  const horizonDate = addDays(addMonths(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1), 1), -1);

  const buckets = new Map<string, MonthBucket>();
  const orderedKeys: string[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const key = monthKeyOf(addMonths(fromDate, i));
    orderedKeys.push(key);
    buckets.set(key, { monthKey: key, inflows: [], outflows: [], unconvertedCount: 0 });
  }

  const push = (date: Date, line: ProjectionLine, into: "inflows" | "outflows", converted: number | null) => {
    const bucket = buckets.get(monthKeyOf(date));
    if (!bucket) return;
    if (converted === null) bucket.unconvertedCount += 1;
    if (line.amount <= EPSILON) return;
    bucket[into].push(line);
  };

  for (const income of input.recurringIncome) {
    if (income.status !== "active") continue;
    const converted = input.convert(income.amount, income.currencyCode);
    const amount = converted ?? 0;
    for (const date of occurrencesWithin(
      income.nextExpectedDate,
      income.frequency,
      income.intervalCount,
      income.endDate,
      fromDate,
      horizonDate,
    )) {
      push(date, { kind: "recurring_income", label: income.name, amount, source: "scheduled" }, "inflows", converted);
    }
  }

  for (const subscription of input.subscriptions) {
    if (subscription.status !== "active") continue;
    const converted = input.convert(subscription.amount, subscription.currencyCode);
    const amount = converted ?? 0;
    for (const date of occurrencesWithin(
      subscription.nextDueDate,
      subscription.frequency,
      subscription.intervalCount,
      subscription.endDate,
      fromDate,
      horizonDate,
    )) {
      push(
        date,
        { kind: "subscription", label: subscription.name, amount, source: "scheduled" },
        "outflows",
        converted,
      );
    }
  }

  for (const obligation of input.obligations) {
    if (obligation.status !== "active" && obligation.status !== "defaulted") continue;
    const collects = obligationViewerDirection(obligation) === "receivable";
    for (const installment of pendingInstallments(obligation)) {
      if (installment.dueDate < fromDate || installment.dueDate > horizonDate) continue;
      const converted = input.convert(installment.amount, obligation.currencyCode);
      const line: ProjectionLine = {
        kind: collects ? "obligation_receivable" : "obligation_payable",
        label: obligation.title,
        amount: converted ?? 0,
        source: "scheduled",
      };
      push(installment.dueDate, line, collects ? "inflows" : "outflows", converted);
    }
  }

  for (const planned of input.plannedMovements) {
    const date = parseISO(planned.occurredAt);
    if (Number.isNaN(date.getTime()) || date < fromDate || date > horizonDate) continue;
    const converted = input.convert(Math.abs(planned.signedAmount), planned.currencyCode);
    const line: ProjectionLine = {
      kind: "planned_movement",
      label: planned.description,
      amount: converted ?? 0,
      source: "scheduled",
    };
    push(date, line, planned.signedAmount >= 0 ? "inflows" : "outflows", converted);
  }

  const months: ProjectedMonth[] = [];
  let balance = input.startingBalance;
  let unconvertedTotal = 0;

  orderedKeys.forEach((key, index) => {
    const bucket = buckets.get(key)!;
    const isPartial = index === 0;

    // El gasto típico: una línea estimada por mes. El mes en curso va prorrateado por los días
    // que le quedan — a día 16 ya gastaste medio mes, y cobrarlo entero hunde la primera fila.
    if (input.typicalDiscretionarySpend > EPSILON) {
      const daysInMonth = getDaysInMonth(addMonths(fromDate, index));
      const share = isPartial ? Math.max(0, daysInMonth - fromDate.getDate() + 1) / daysInMonth : 1;
      const amount = input.typicalDiscretionarySpend * share;
      if (amount > EPSILON) {
        bucket.outflows.push({
          kind: "typical_spend",
          label: isPartial ? "Gasto típico (resto del mes)" : "Gasto típico",
          amount,
          source: "estimated",
        });
      }
    }

    const inflowTotal = bucket.inflows.reduce((sum, line) => sum + line.amount, 0);
    const outflowTotal = bucket.outflows.reduce((sum, line) => sum + line.amount, 0);
    const movement = inflowTotal + outflowTotal;
    const scheduled = [...bucket.inflows, ...bucket.outflows]
      .filter((line) => line.source === "scheduled")
      .reduce((sum, line) => sum + line.amount, 0);

    const openingBalance = balance;
    const netFlow = inflowTotal - outflowTotal;
    balance = openingBalance + netFlow;
    unconvertedTotal += bucket.unconvertedCount;

    months.push({
      monthKey: key,
      openingBalance,
      inflows: bucket.inflows,
      outflows: bucket.outflows,
      inflowTotal,
      outflowTotal,
      netFlow,
      closingBalance: balance,
      scheduledShare: movement > EPSILON ? scheduled / movement : 1,
      unconvertedCount: bucket.unconvertedCount,
      isPartial,
    });
  });

  return {
    months,
    endingBalance: balance,
    overallScheduledShare:
      months.length > 0 ? months.reduce((sum, month) => sum + month.scheduledShare, 0) / months.length : 0,
    unconvertedCount: unconvertedTotal,
  };
}
