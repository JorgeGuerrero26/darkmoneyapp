import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns";

/**
 * El plan de pagos de una obligación.
 *
 * Dos formas, y solo dos:
 *
 * - **`equal`**: el monto se divide entre N pagos. La cuota **se calcula, no se escribe** —antes
 *   eran dos campos libres, "cuota" y "# cuotas", que admitían datos que se contradicen: seis
 *   cuotas de S/ 50 sobre un monto de S/ 1.000.
 * - **`custom`**: un acuerdo real casi nunca lista todos los pagos. Se pactan los primeros —los
 *   que son distintos por algún motivo— y después "lo de siempre". Por eso se guardan los pagos
 *   acordados uno por uno y **un solo monto que se repite hasta terminar el saldo**. Cuántos
 *   pagos son en total no se declara: se deduce.
 *
 * Las fechas son mensuales, con el día tomado de la fecha de inicio (decisión del 2026-08-30).
 * El plan queda **fijo**: si alguien paga distinto a lo pactado, se muestra la diferencia en vez
 * de recalcular lo que sigue — es un acuerdo entre dos personas.
 *
 * **De dónde salen los meses** (2026-08-31): del `firstDueDate` del plan, y de ahí uno por mes.
 * Antes salían siempre de la fecha de inicio de la obligación, así que una deuda abierta en marzo
 * proponía su primer pago en abril aunque el plan se estuviera pactando en agosto: la lista
 * arrancaba con cuatro meses ya vencidos y sin decir el año. Al crear un plan nuevo el primer
 * pago cae en **el mes actual**, y se puede mover.
 *
 * Cada pago acordado puede además llevar su propio mes, para un acuerdo que salta uno ("en
 * diciembre no, en enero sí"). El orden no se puede romper: un pago nunca cae antes que el
 * anterior — si su fecha lo contradice, se corre al mes siguiente del que lo precede.
 */
export type AgreedPayment = {
  amount: number;
  /** ISO `yyyy-MM-dd`. Ausente = el mes que le toca por posición. */
  dueDate?: string;
};

export type PaymentPlan =
  | { mode: "equal"; count: number; firstDueDate?: string }
  | { mode: "custom"; agreed: readonly AgreedPayment[]; tail: number | null; firstDueDate?: string };

export type ScheduledPayment = {
  /** 1, 2, 3… en el orden en que se pagan. */
  seq: number;
  /** ISO `yyyy-MM-dd`. Mensual desde la fecha de inicio. */
  dueDate: string;
  amount: number;
  /**
   * `agreed`: lo escribió el usuario. `calculated`: lo dedujo el plan.
   *
   * La distinción se ve en pantalla: las calculadas van en gris y no se editan ahí. Así el
   * usuario ve el plan completo sin que la app finja que él escribió los últimos pagos.
   */
  source: "agreed" | "calculated";
};

/** Tope de pagos generados. Un monto de cola diminuto no puede colgar la pantalla. */
const MAX_SCHEDULED = 600;

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

function dueDateFor(startDate: string, monthsAhead: number) {
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return startDate;
  return format(addMonths(start, monthsAhead), "yyyy-MM-dd");
}

/** El mismo día, `months` meses después. Devuelve el ISO tal cual si no se puede leer. */
export function addMonthsIso(isoDate: string, months: number) {
  const date = parseISO(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return format(addMonths(date, months), "yyyy-MM-dd");
}

/**
 * El mes del primer pago de un plan nuevo: **el mes actual**, con el día de la fecha de inicio.
 *
 * Si la obligación empieza en el futuro, manda su fecha: no se puede cobrar antes de prestar.
 */
export function defaultFirstDueDate(startDate: string, today: Date = new Date()) {
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return startDate;
  const monthsAhead = differenceInCalendarMonths(today, start);
  return format(addMonths(start, Math.max(0, monthsAhead)), "yyyy-MM-dd");
}

/** El mes en el que cae una fecha, como `yyyy-MM`. Para comparar y ordenar meses. */
export function monthKey(isoDate: string) {
  return isoDate.slice(0, 7);
}

/** El ancla del plan: su primer pago, o —planes viejos— el mes siguiente al inicio. */
function anchorFor(plan: PaymentPlan, startDate: string) {
  return plan.firstDueDate ?? dueDateFor(startDate, 1);
}

/**
 * Convierte el plan en la lista de pagos que el usuario va a ver.
 *
 * En los dos modos, **el último pago se ajusta al saldo que queda**: es el número que un plan a
 * medida suele calcular mal, y por eso se muestra con su etiqueta en vez de esconderlo en el
 * total. Nunca se programa de más: si los pagos acordados ya cubren el monto, la cola no genera
 * nada.
 */
export function expandPaymentPlan({
  plan,
  principal,
  startDate,
}: {
  plan: PaymentPlan;
  principal: number;
  startDate: string;
}): ScheduledPayment[] {
  const principalCents = toCents(principal);
  if (principalCents <= 0) return [];

  const anchor = anchorFor(plan, startDate);

  if (plan.mode === "equal") {
    const count = Math.floor(plan.count);
    if (count <= 0) return [];
    // Se redondea al céntimo, como se dice la cuota: 1.000 ÷ 6 = 166,67. El último pago absorbe
    // la diferencia, así que la suma siempre cuadra con el monto.
    const share = Math.round(principalCents / count);
    const payments: ScheduledPayment[] = [];
    let assigned = 0;
    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1;
      const cents = isLast ? principalCents - assigned : share;
      assigned += cents;
      payments.push({
        seq: i + 1,
        dueDate: addMonthsIso(anchor, i),
        amount: fromCents(cents),
        source: "calculated",
      });
    }
    return payments;
  }

  const payments: ScheduledPayment[] = [];
  let remaining = principalCents;
  /** El mes del último pago colocado: nada puede caer antes que él. */
  let previous: string | null = null;

  /**
   * El orden manda sobre la fecha escrita: si un pago dice "marzo" cuando el anterior ya cayó en
   * abril, se corre a mayo. Un plan es una sucesión, y dos personas no acuerdan pagar hacia atrás.
   */
  const placeAfterPrevious = (candidate: string): string => {
    if (previous && monthKey(candidate) <= monthKey(previous)) return addMonthsIso(previous, 1);
    return candidate;
  };

  plan.agreed.forEach((agreed, index) => {
    const cents = toCents(agreed.amount);
    if (cents <= 0) return;
    const dueDate: string = placeAfterPrevious(agreed.dueDate ?? addMonthsIso(anchor, index));
    previous = dueDate;
    payments.push({
      seq: payments.length + 1,
      dueDate,
      amount: fromCents(cents),
      source: "agreed",
    });
    remaining -= cents;
  });

  const tailCents = plan.tail != null ? toCents(plan.tail) : 0;
  if (tailCents > 0) {
    while (remaining > 0 && payments.length < MAX_SCHEDULED) {
      const cents = Math.min(tailCents, remaining);
      const dueDate: string = previous ? addMonthsIso(previous, 1) : addMonthsIso(anchor, payments.length);
      previous = dueDate;
      payments.push({
        seq: payments.length + 1,
        dueDate,
        amount: fromCents(cents),
        source: "calculated",
      });
      remaining -= cents;
    }
  }

  return payments;
}

/** Lo que suman los pagos programados. */
export function planTotal(payments: readonly ScheduledPayment[]) {
  return fromCents(payments.reduce((sum, payment) => sum + toCents(payment.amount), 0));
}

/**
 * La diferencia entre lo programado y el monto de la obligación.
 *
 * Es la única validación que importa en la pantalla del plan: positivo = falta por programar,
 * negativo = sobra. Cero = el plan está completo.
 */
export function planDifference(principal: number, payments: readonly ScheduledPayment[]) {
  return fromCents(toCents(principal) - toCents(planTotal(payments)));
}

/** ¿El plan cubre exactamente el monto? */
export function isPlanComplete(principal: number, payments: readonly ScheduledPayment[]) {
  return toCents(principal) > 0 && toCents(planDifference(principal, payments)) === 0;
}

/**
 * El plan vigente en una línea, para la fila que lo abre: "6 cuotas iguales de S/ 166.67" o
 * "A medida · 6 pagos".
 */
export function describePlan({
  plan,
  principal,
  startDate,
  formatAmount,
}: {
  plan: PaymentPlan | null;
  principal: number;
  startDate: string;
  formatAmount: (amount: number) => string;
}) {
  if (!plan) return null;
  if (plan.mode === "equal") {
    if (plan.count <= 0 || principal <= 0) return null;
    const payments = expandPaymentPlan({ plan, principal, startDate });
    const first = payments[0];
    if (!first) return null;
    return `${plan.count} cuotas iguales de ${formatAmount(first.amount)}`;
  }
  const payments = expandPaymentPlan({ plan, principal, startDate });
  if (payments.length === 0) return null;
  return `A medida · ${payments.length} ${payments.length === 1 ? "pago" : "pagos"}`;
}

/** El plan tal como se guarda, o `null` si no hay uno que valga la pena guardar. */
export function normalizePaymentPlan(plan: PaymentPlan | null): PaymentPlan | null {
  if (!plan) return null;
  const firstDueDate = plan.firstDueDate ? { firstDueDate: plan.firstDueDate } : {};
  if (plan.mode === "equal") {
    return plan.count > 0 ? { mode: "equal", count: Math.floor(plan.count), ...firstDueDate } : null;
  }
  const agreed = plan.agreed
    .filter((payment) => payment.amount > 0)
    .map((payment) => (payment.dueDate ? { amount: payment.amount, dueDate: payment.dueDate } : { amount: payment.amount }));
  const tail = plan.tail != null && plan.tail > 0 ? plan.tail : null;
  if (agreed.length === 0 && tail == null) return null;
  return { mode: "custom", agreed, tail, ...firstDueDate };
}

/** Lee lo que vino de la base sin confiar en su forma. */
export function parsePaymentPlan(raw: unknown): PaymentPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const firstDueDate = readIsoDate(value.firstDueDate);
  const anchor = firstDueDate ? { firstDueDate } : {};
  if (value.mode === "equal") {
    const count = Number(value.count);
    return Number.isFinite(count) && count > 0 ? { mode: "equal", count: Math.floor(count), ...anchor } : null;
  }
  if (value.mode === "custom") {
    // Los planes guardados antes del 2026-08-31 traen `agreed` como lista de números sueltos.
    const agreed = Array.isArray(value.agreed)
      ? value.agreed.map(readAgreedPayment).filter((payment): payment is AgreedPayment => payment != null)
      : [];
    const tailRaw = Number(value.tail);
    const tail = Number.isFinite(tailRaw) && tailRaw > 0 ? tailRaw : null;
    if (agreed.length === 0 && tail == null) return null;
    return { mode: "custom", agreed, tail, ...anchor };
  }
  return null;
}

function readIsoDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) ? raw.slice(0, 10) : undefined;
}

function readAgreedPayment(raw: unknown): AgreedPayment | null {
  if (raw != null && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    const amount = Number(value.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const dueDate = readIsoDate(value.dueDate);
    return dueDate ? { amount, dueDate } : { amount };
  }
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? { amount } : null;
}

/** Un pago real, tal como quedó registrado. */
export type ActualPayment = { amount: number; date: string };

export type ReconciledPayment = ScheduledPayment & {
  /** Lo que se pagó contra este pago del plan, si ya se pagó. */
  paid: number | null;
  paidDate: string | null;
  /** `paid - amount` cuando difieren. `null` si coinciden o si aún no se pagó. */
  deviation: number | null;
  /**
   * El monto que este pago tenía antes de absorber la desviación acumulada.
   *
   * Solo lo lleva el último pago calculado: "Cierra el saldo · era 50.00".
   */
  adjustedFrom: number | null;
};

/**
 * Cruza el plan con los pagos que de verdad entraron.
 *
 * **El plan queda fijo** (decisión del 2026-08-30): si alguien paga S/ 320 donde el acuerdo decía
 * 300, los S/ 20 de más NO se reparten ni corrigen los pagos siguientes —son montos pactados con
 * otra persona—. Bajan al **último pago calculado**, que es el que ya existía para absorber el
 * saldo. Si paga de menos, ese pago final sube.
 *
 * Cuando todos los pagos son acordados no hay dónde absorber la diferencia: el plan se queda como
 * está y la diferencia se ve en el saldo, no reescribiendo lo que dos personas pactaron.
 */
export function reconcilePlan({
  plan,
  principal,
  startDate,
  payments,
}: {
  plan: PaymentPlan;
  principal: number;
  startDate: string;
  payments: readonly ActualPayment[];
}): ReconciledPayment[] {
  const scheduled = expandPaymentPlan({ plan, principal, startDate });
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  const rows: ReconciledPayment[] = scheduled.map((payment, index) => {
    const actual = ordered[index] ?? null;
    const deviationCents = actual ? toCents(actual.amount) - toCents(payment.amount) : 0;
    return {
      ...payment,
      paid: actual ? actual.amount : null,
      paidDate: actual ? actual.date : null,
      deviation: actual && deviationCents !== 0 ? fromCents(deviationCents) : null,
      adjustedFrom: null,
    };
  });

  // La desviación acumulada de lo ya pagado baja al último pago calculado que siga pendiente.
  const netDeviationCents = rows.reduce(
    (sum, row) => sum + (row.paid != null ? toCents(row.paid) - toCents(row.amount) : 0),
    0,
  );
  if (netDeviationCents === 0) return rows;

  const absorberIndex = rows.reduce(
    (found, row, index) => (row.source === "calculated" && row.paid == null ? index : found),
    -1,
  );
  if (absorberIndex < 0) return rows;

  const absorber = rows[absorberIndex];
  const adjustedCents = toCents(absorber.amount) - netDeviationCents;
  rows[absorberIndex] = {
    ...absorber,
    amount: fromCents(Math.max(0, adjustedCents)),
    adjustedFrom: absorber.amount,
  };
  return rows;
}

/** Lo que falta por cobrar o pagar según el plan cruzado con lo real. */
export function remainingFromPlan(rows: readonly ReconciledPayment[]) {
  return fromCents(
    rows.reduce((sum, row) => (row.paid == null ? sum + toCents(row.amount) : sum), 0),
  );
}
