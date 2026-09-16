/**
 * ESPEJO Deno de `features/projection/lib/cashflow-calendar.ts`.
 *
 * Por qué hay dos. El dashboard necesita el calendario en el cliente; el asistente lo necesita
 * dentro de la Edge Function, y las Edge Functions no importan de `features/` — corren en Deno,
 * resuelven por URL y el bundler de Supabase solo sigue lo que cuelga de `supabase/functions/`.
 * El repo ya vive con este arreglo en otro sitio: `next_subscription_due` en SQL es espejo
 * declarado de `computeNextRecurringDate` en TS.
 *
 * **Lo que evita que las dos se separen en silencio** es
 * `features/projection/lib/__tests__/engine-parity.test.ts`: corre las dos sobre los mismos
 * escenarios y exige el mismo resultado. Tocar una sin tocar la otra rompe ese test. No lo
 * borres para "arreglarlo": si las dos difieren, alguien va a ver dos cifras distintas para el
 * mismo mes y no va a saber cuál creer.
 *
 * Diferencias deliberadas con el original, todas de forma y ninguna de fondo:
 *
 * - **Sin dependencias.** El original usa `date-fns` y reusa `expandPaymentPlan` de obligations.
 *   Aquí la aritmética de fechas va a mano sobre `{año, mes, día}` y la expansión del plan está
 *   incluida. Sin imports, este archivo lo puede cargar tanto Deno como Jest — que es lo que
 *   hace posible el test de paridad.
 * - **Fechas como cifras de calendario, no como `Date`.** Un `Date` arrastra hora y zona; aquí
 *   nada de eso puede cambiar en qué mes cae una cuota.
 */

/** Tope de ocurrencias por compromiso. Una cadencia diaria a 12 meses son ~365 de una sola. */
const MAX_OCCURRENCES = 500;
/** Tope de pagos generados por un plan. Espejo de MAX_SCHEDULED en payment-plan.ts. */
const MAX_SCHEDULED = 600;
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
  amount: number;
  source: "scheduled" | "estimated";
};

export type ProjectedMonth = {
  monthKey: string;
  openingBalance: number;
  inflows: ProjectionLine[];
  outflows: ProjectionLine[];
  inflowTotal: number;
  outflowTotal: number;
  netFlow: number;
  closingBalance: number;
  scheduledShare: number;
  unconvertedCount: number;
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
  principalCurrentAmount: number;
  startDate: string | null;
  dueDate: string | null;
  paymentPlan: unknown;
  installmentAmount?: number | null;
};

export type ProjectionPlannedMovement = {
  description: string;
  signedAmount: number;
  currencyCode: string;
  occurredAt: string;
};

export type ProjectionInput = {
  startingBalance: number;
  fromDate: string;
  months: number;
  recurringIncome: readonly ProjectionRecurringIncome[];
  subscriptions: readonly ProjectionSubscription[];
  obligations: readonly ProjectionObligation[];
  plannedMovements: readonly ProjectionPlannedMovement[];
  typicalDiscretionarySpend: number;
  convert: (amount: number, fromCurrency: string) => number | null;
};

export type ProjectionResult = {
  months: ProjectedMonth[];
  endingBalance: number;
  overallScheduledShare: number;
  unconvertedCount: number;
};

/** El mes típico, no el mes promedio. Ver el original para el porqué. */
export function typicalMonthlySpend(monthlyTotals: readonly number[]): number {
  const values = monthlyTotals
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.abs(value))
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Espejo de `lib/movement-amounts.ts`.
 *
 * Está aquí porque de esto depende qué cuenta como gasto al medir la mediana. Si el asistente
 * usara una regla y el dashboard otra, los dos dirían un "gasto típico" distinto sin que ningún
 * test lo notara: los totales por mes cuadrarían, solo estarían sumando movimientos distintos.
 */
export type MovementAmountLike = {
  movementType?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};

const toNumber = (value: number | null | undefined) => Number(value ?? 0);

export function movementIsTransfer(movement: MovementAmountLike): boolean {
  return movement.movementType === "transfer";
}

export function movementActsAsIncome(movement: MovementAmountLike): boolean {
  if (movement.movementType === "income" || movement.movementType === "refund") return true;
  if (movement.movementType === "expense" || movement.movementType === "subscription_payment") return false;
  if (movementIsTransfer(movement)) return false;
  return toNumber(movement.destinationAmount) > toNumber(movement.sourceAmount);
}

export function movementActsAsExpense(movement: MovementAmountLike): boolean {
  if (movementIsTransfer(movement)) return false;
  return !movementActsAsIncome(movement);
}

export function movementDisplayAmount(movement: MovementAmountLike): number {
  const raw = movementActsAsIncome(movement)
    ? movement.destinationAmount ?? movement.sourceAmount ?? 0
    : movement.sourceAmount ?? movement.destinationAmount ?? 0;
  return Math.abs(toNumber(raw));
}

export function movementDisplayAccountId(movement: MovementAmountLike): number | null {
  if (movementIsTransfer(movement)) {
    return movement.sourceAccountId ?? movement.destinationAccountId ?? null;
  }
  return movementActsAsIncome(movement)
    ? movement.destinationAccountId ?? movement.sourceAccountId ?? null
    : movement.sourceAccountId ?? movement.destinationAccountId ?? null;
}

/**
 * Espejo de `features/projection/lib/discretionary-history.ts`. Mismo contrato y mismos dos
 * filtros: fuera lo que el calendario ya proyecta con su propia línea, y solo meses terminados.
 */
export type SpendHistoryMovement = {
  movementType: string;
  status: string;
  occurredAt: string;
};

const LINE_OF_THEIR_OWN = new Set(["subscription_payment", "obligation_payment", "obligation_opening"]);

export function monthlyDiscretionarySpend<TMovement extends SpendHistoryMovement>({
  movements,
  months,
  expenseAmountOf,
  earliestCoveredDate = null,
  now = new Date(),
}: {
  movements: readonly TMovement[];
  months: number;
  expenseAmountOf: (movement: TMovement) => number;
  earliestCoveredDate?: Date | null;
  now?: Date;
}): number[] {
  const monthCount = Math.max(0, Math.floor(months));
  if (monthCount === 0) return [];

  const anchor: Ymd = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  const coveredFrom = earliestCoveredDate
    ? {
        y: earliestCoveredDate.getFullYear(),
        m: earliestCoveredDate.getMonth() + 1,
        d: earliestCoveredDate.getDate(),
      }
    : null;

  const totals = new Map<string, number>();
  const orderedKeys: string[] = [];
  for (let i = monthCount; i >= 1; i -= 1) {
    const monthDate = addMonthsYmd(anchor, -i);
    const monthStart: Ymd = { y: monthDate.y, m: monthDate.m, d: 1 };
    if (coveredFrom && compareYmd(monthStart, coveredFrom) < 0) continue;
    const key = monthKeyOf(monthDate);
    orderedKeys.push(key);
    totals.set(key, 0);
  }
  if (orderedKeys.length === 0) return [];

  const oldestMonth = addMonthsYmd(anchor, -monthCount);
  const oldest: Ymd = { y: oldestMonth.y, m: oldestMonth.m, d: 1 };
  const newestMonth = addMonthsYmd(anchor, -1);
  const newest: Ymd = { y: newestMonth.y, m: newestMonth.m, d: daysInMonth(newestMonth.y, newestMonth.m) };

  for (const movement of movements) {
    if (movement.status !== "posted") continue;
    if (LINE_OF_THEIR_OWN.has(movement.movementType)) continue;
    // Con `Date` y no con `parseYmd`, para leer el timestamp igual que el original.
    //
    // Consecuencia conocida: un movimiento de madrugada cerca de fin de mes puede caer en un mes
    // distinto aquí (el servidor corre en UTC) que en el teléfono (Lima, UTC-5). Sobre una
    // mediana de seis meses eso no mueve la cifra, pero está escrito para que nadie lo descubra
    // como un misterio.
    const raw = new Date(movement.occurredAt);
    if (Number.isNaN(raw.getTime())) continue;
    const occurred: Ymd = { y: raw.getFullYear(), m: raw.getMonth() + 1, d: raw.getDate() };
    if (compareYmd(occurred, oldest) < 0 || compareYmd(occurred, newest) > 0) continue;
    const key = monthKeyOf(occurred);
    const current = totals.get(key);
    if (current === undefined) continue;
    totals.set(key, current + Math.abs(expenseAmountOf(movement)));
  }

  return orderedKeys.map((key) => totals.get(key) ?? 0);
}

// ─── Aritmética de calendario ────────────────────────────────────────────────

type Ymd = { y: number; m: number; d: number };

function parseYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthKeyOf(ymd: Ymd): string {
  return `${String(ymd.y).padStart(4, "0")}-${String(ymd.m).padStart(2, "0")}`;
}

function toIso(ymd: Ymd): string {
  return `${monthKeyOf(ymd)}-${String(ymd.d).padStart(2, "0")}`;
}

/** Mismo día, `months` meses después. El día se recorta al último del mes destino, como date-fns. */
function addMonthsYmd(ymd: Ymd, months: number): Ymd {
  const total = ymd.y * 12 + (ymd.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(ymd.d, daysInMonth(y, m)) };
}

function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. */
function compareYmd(a: Ymd, b: Ymd): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function advance(ymd: Ymd, frequency: string, intervalCount: number | null | undefined): Ymd {
  const step = Math.max(1, Math.floor(intervalCount ?? 1));
  switch (frequency) {
    case "daily":
      return addDaysYmd(ymd, step);
    case "weekly":
      return addDaysYmd(ymd, step * 7);
    case "quarterly":
      return addMonthsYmd(ymd, step * 3);
    case "yearly":
      return addMonthsYmd(ymd, step * 12);
    case "monthly":
    default:
      return addMonthsYmd(ymd, step);
  }
}

function occurrencesWithin(
  startIso: string,
  frequency: string,
  intervalCount: number | null | undefined,
  endIso: string | null | undefined,
  fromDate: Ymd,
  horizonDate: Ymd,
): Ymd[] {
  const first = parseYmd(startIso);
  if (!first) return [];
  const hardEnd = parseYmd(endIso);
  const limit = hardEnd && compareYmd(hardEnd, horizonDate) < 0 ? hardEnd : horizonDate;

  const dates: Ymd[] = [];
  let cursor = first;
  for (let i = 0; i < MAX_OCCURRENCES && compareYmd(cursor, limit) <= 0; i += 1) {
    if (compareYmd(cursor, fromDate) >= 0) dates.push(cursor);
    const next = advance(cursor, frequency, intervalCount);
    if (compareYmd(next, cursor) <= 0) break;
    cursor = next;
  }
  return dates;
}

// ─── Plan de pagos (espejo de features/obligations/lib/payment-plan.ts) ──────

type AgreedPayment = { amount: number; dueDate?: string };
type PaymentPlan =
  | { mode: "equal"; count: number; firstDueDate?: string }
  | { mode: "custom"; agreed: AgreedPayment[]; tail: number | null; firstDueDate?: string };

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

function readAgreedPayment(raw: unknown): AgreedPayment | null {
  // Los planes guardados antes del 2026-08-31 traen `agreed` como lista de números sueltos.
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return { amount: raw };
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const dueDate = typeof row.dueDate === "string" ? row.dueDate : undefined;
  return dueDate ? { amount, dueDate } : { amount };
}

export function parsePaymentPlan(raw: unknown): PaymentPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const firstDueDate = typeof value.firstDueDate === "string" ? { firstDueDate: value.firstDueDate } : {};

  if (value.mode === "equal") {
    const count = Math.floor(Number(value.count));
    if (!Number.isFinite(count) || count <= 0) return null;
    return { mode: "equal", count, ...firstDueDate };
  }
  if (value.mode === "custom") {
    const agreed = Array.isArray(value.agreed)
      ? value.agreed.map(readAgreedPayment).filter((payment): payment is AgreedPayment => payment != null)
      : [];
    const tailRaw = Number(value.tail);
    const tail = Number.isFinite(tailRaw) && tailRaw > 0 ? tailRaw : null;
    if (agreed.length === 0 && tail == null) return null;
    return { mode: "custom", agreed, tail, ...firstDueDate };
  }
  return null;
}

function anchorFor(plan: PaymentPlan, startDate: Ymd): Ymd {
  const first = plan.firstDueDate ? parseYmd(plan.firstDueDate) : null;
  return first ?? addMonthsYmd(startDate, 1);
}

type ScheduledPayment = { dueDate: Ymd; amount: number };

export function expandPaymentPlan(plan: PaymentPlan, principal: number, startDate: Ymd): ScheduledPayment[] {
  const principalCents = toCents(principal);
  if (principalCents <= 0) return [];
  const anchor = anchorFor(plan, startDate);

  if (plan.mode === "equal") {
    const count = Math.floor(plan.count);
    if (count <= 0) return [];
    // El último pago absorbe la diferencia: la suma siempre cuadra con el monto.
    const share = Math.round(principalCents / count);
    const payments: ScheduledPayment[] = [];
    let assigned = 0;
    for (let i = 0; i < count; i += 1) {
      const cents = i === count - 1 ? principalCents - assigned : share;
      assigned += cents;
      payments.push({ dueDate: addMonthsYmd(anchor, i), amount: fromCents(cents) });
    }
    return payments;
  }

  const payments: ScheduledPayment[] = [];
  let remaining = principalCents;
  let previous: Ymd | null = null;

  /** El orden manda sobre la fecha escrita: un plan es una sucesión y nadie paga hacia atrás. */
  const placeAfterPrevious = (candidate: Ymd): Ymd => {
    if (previous && monthKeyOf(candidate) <= monthKeyOf(previous)) return addMonthsYmd(previous, 1);
    return candidate;
  };

  plan.agreed.forEach((agreed, index) => {
    const cents = toCents(agreed.amount);
    if (cents <= 0) return;
    const written = parseYmd(agreed.dueDate) ?? addMonthsYmd(anchor, index);
    const dueDate = placeAfterPrevious(written);
    previous = dueDate;
    payments.push({ dueDate, amount: fromCents(cents) });
    remaining -= cents;
  });

  const tailCents = plan.tail != null ? toCents(plan.tail) : 0;
  if (tailCents > 0) {
    while (remaining > 0 && payments.length < MAX_SCHEDULED) {
      const cents = Math.min(tailCents, remaining);
      const dueDate: Ymd = previous ? addMonthsYmd(previous, 1) : addMonthsYmd(anchor, payments.length);
      previous = dueDate;
      payments.push({ dueDate, amount: fromCents(cents) });
      remaining -= cents;
    }
  }

  return payments;
}

/** Espejo de `obligationViewerDirection`: una deuda compartida se lee al revés. */
function viewerCollects(obligation: ProjectionObligation): boolean {
  const isSharedViewer = "viewerMode" in (obligation as Record<string, unknown>);
  return obligation.direction === "receivable" ? !isSharedViewer : isSharedViewer;
}

function pendingInstallments(obligation: ProjectionObligation): ScheduledPayment[] {
  const plan = parsePaymentPlan(obligation.paymentPlan);
  const principal = obligation.principalCurrentAmount;
  const pending = obligation.pendingAmount;

  if (!plan || principal <= EPSILON) {
    if (obligation.installmentAmount && obligation.installmentAmount > EPSILON) {
      const start = parseYmd(obligation.dueDate ?? obligation.startDate);
      if (!start) return [];
      const rows: ScheduledPayment[] = [];
      let remaining = pending;
      for (let i = 0; i < MAX_OCCURRENCES && remaining > EPSILON; i += 1) {
        const amount = Math.min(obligation.installmentAmount, remaining);
        rows.push({ dueDate: addMonthsYmd(start, i), amount });
        remaining -= amount;
      }
      return rows;
    }
    const dueDate = parseYmd(obligation.dueDate);
    if (!dueDate || pending <= EPSILON) return [];
    return [{ dueDate, amount: pending }];
  }

  const startDate = parseYmd(obligation.startDate) ?? { y: 1970, m: 1, d: 1 };
  const schedule = expandPaymentPlan(plan, principal, startDate);
  let alreadyPaid = Math.max(0, principal - pending);

  const rows: ScheduledPayment[] = [];
  for (const payment of schedule) {
    if (alreadyPaid >= payment.amount - EPSILON) {
      alreadyPaid -= payment.amount;
      continue;
    }
    const remainingOnThis = payment.amount - alreadyPaid;
    alreadyPaid = 0;
    if (remainingOnThis > EPSILON) rows.push({ dueDate: payment.dueDate, amount: remainingOnThis });
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
  const fromDate = parseYmd(input.fromDate);
  const monthCount = Math.max(1, Math.floor(input.months));
  if (!fromDate) {
    return { months: [], endingBalance: input.startingBalance, overallScheduledShare: 0, unconvertedCount: 0 };
  }

  const lastMonth = addMonthsYmd({ ...fromDate, d: 1 }, monthCount - 1);
  const horizonDate: Ymd = { y: lastMonth.y, m: lastMonth.m, d: daysInMonth(lastMonth.y, lastMonth.m) };

  const buckets = new Map<string, MonthBucket>();
  const orderedKeys: string[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const key = monthKeyOf(addMonthsYmd({ ...fromDate, d: 1 }, i));
    orderedKeys.push(key);
    buckets.set(key, { monthKey: key, inflows: [], outflows: [], unconvertedCount: 0 });
  }

  const push = (date: Ymd, line: ProjectionLine, into: "inflows" | "outflows", converted: number | null) => {
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
    const collects = viewerCollects(obligation);
    for (const installment of pendingInstallments(obligation)) {
      if (compareYmd(installment.dueDate, fromDate) < 0 || compareYmd(installment.dueDate, horizonDate) > 0) continue;
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
    const date = parseYmd(planned.occurredAt);
    if (!date || compareYmd(date, fromDate) < 0 || compareYmd(date, horizonDate) > 0) continue;
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

    if (input.typicalDiscretionarySpend > EPSILON) {
      const monthDate = addMonthsYmd({ ...fromDate, d: 1 }, index);
      const total = daysInMonth(monthDate.y, monthDate.m);
      const share = isPartial ? Math.max(0, total - fromDate.d + 1) / total : 1;
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

/** Solo para el test de paridad y para depurar: la fecha de una ocurrencia como ISO. */
export const __internals = { parseYmd, addMonthsYmd, toIso, daysInMonth };
