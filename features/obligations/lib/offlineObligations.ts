import type { ObligationEventSummary, ObligationSummary } from "../../../types/domain";

type Row = Record<string, unknown>;

/** Un evento creado en el teléfono y todavía sin enviar (interés pactado, pago, cobro). */
export type PendingObligationEvent = { id: number; obligationId: number; eventType: string; amount: number; eventDate: string | null };

const cents = (value: unknown): number => Math.round(num(value) * 100);

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/**
 * Obligación recién creada sin conexión: lo que el servidor calcularía con sus eventos todavía sin enviar (el interés pactado
 * sube el monto; los pagos o cobros bajan lo pendiente). Sin eventos: pendiente = principal, avance 0. Se reemplaza por la
 * vista real al sincronizar. Montos en centavos para no arrastrar errores de coma flotante.
 */
export function buildOfflineObligationSummary(
  row: Row,
  counterpartyNames: Map<number, string>,
  pendingEvents: readonly PendingObligationEvent[] = [],
): ObligationSummary {
  const events = pendingEvents.filter((event) => event.obligationId === Number(row.id));
  const signed = (type: string) => events.filter((event) => event.eventType === type).reduce((sum, event) => sum + cents(event.amount), 0);
  const principalCents = cents(row.principal_amount);
  const currentCents = principalCents + signed("principal_increase") - signed("principal_decrease");
  const paidCents = signed("payment");
  const principal = principalCents / 100;
  const current = currentCents / 100;
  const pending = Math.max(currentCents - paidCents, 0) / 100;
  const payments = events.filter((event) => event.eventType === "payment");
  const lastPaymentDate = payments.reduce<string | null>((max, event) => (event.eventDate && (!max || event.eventDate > max) ? event.eventDate : max), null);
  const counterpartyId = row.counterparty_id == null ? null : Number(row.counterparty_id);
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    title: String(row.title ?? ""),
    direction: row.direction as ObligationSummary["direction"],
    originType: row.origin_type as ObligationSummary["originType"],
    counterparty: counterpartyId != null ? counterpartyNames.get(counterpartyId) ?? "" : "",
    counterpartyId,
    settlementAccountId: row.settlement_account_id == null ? null : Number(row.settlement_account_id),
    settlementAccountName: null,
    status: (row.status ?? "active") as ObligationSummary["status"],
    currencyCode: String(row.currency_code ?? ""),
    principalAmount: principal,
    principalAmountInBaseCurrency: principal,
    currentPrincipalAmount: current,
    currentPrincipalAmountInBaseCurrency: current,
    pendingAmount: pending,
    pendingAmountInBaseCurrency: pending,
    progressPercent: currentCents > 0 ? Math.min(100, Math.round((paidCents / currentCents) * 100)) : 0,
    startDate: String(row.start_date ?? ""),
    dueDate: (row.due_date as string | null | undefined) ?? null,
    installmentAmount: row.installment_amount ? num(row.installment_amount) : null,
    installmentCount: (row.installment_count as number | null | undefined) ?? null,
    paymentPlan: row.payment_plan ?? null,
    interestRate: row.interest_rate ? num(row.interest_rate) : null,
    description: (row.description as string | null | undefined) ?? null,
    notes: (row.notes as string | null | undefined) ?? null,
    paymentCount: payments.length,
    lastPaymentDate,
    installmentLabel: "",
    events: events.map((event): ObligationEventSummary => ({
      id: event.id,
      eventType: event.eventType as ObligationEventSummary["eventType"],
      eventDate: event.eventDate ?? String(row.start_date ?? ""),
      amount: num(event.amount),
      reason: event.eventType === "principal_increase" ? "Interés pactado" : null,
    })),
  };
}

/**
 * Pone encima de una obligación conocida los campos de DEFINICIÓN que se cambiaron sin conexión.
 * Nunca toca lo que calcula el servidor (pendiente, pagado, eventos, avance): eso no cambia por editar
 * un título, una fecha o archivar.
 */
export function overlayOfflineObligationDefinition(
  summary: ObligationSummary,
  row: Row,
  counterpartyNames: Map<number, string>,
): ObligationSummary {
  const counterpartyId = row.counterparty_id == null ? summary.counterpartyId : Number(row.counterparty_id);
  return {
    ...summary,
    title: String(row.title ?? summary.title),
    counterpartyId,
    counterparty: counterpartyId != null ? counterpartyNames.get(counterpartyId) ?? summary.counterparty : summary.counterparty,
    settlementAccountId: row.settlement_account_id === undefined ? summary.settlementAccountId : (orNull(row.settlement_account_id as number | null | undefined)),
    status: (row.status ?? summary.status) as ObligationSummary["status"],
    dueDate: row.due_date === undefined ? summary.dueDate : ((row.due_date as string | null) ?? null),
    installmentAmount: row.installment_amount === undefined ? summary.installmentAmount : row.installment_amount ? num(row.installment_amount) : null,
    installmentCount: row.installment_count === undefined ? summary.installmentCount : ((row.installment_count as number | null) ?? null),
    paymentPlan: row.payment_plan === undefined ? summary.paymentPlan : row.payment_plan,
    interestRate: row.interest_rate === undefined ? summary.interestRate : row.interest_rate ? num(row.interest_rate) : null,
    description: row.description === undefined ? summary.description : ((row.description as string | null) ?? null),
    notes: row.notes === undefined ? summary.notes : ((row.notes as string | null) ?? null),
  };
}

/**
 * Lista de obligaciones tal como la dio el servidor + lo que quedó sin enviar en este teléfono:
 * las nuevas se agregan y las editadas muestran sus cambios. Solo se toca lo que tiene operaciones
 * pendientes; lo demás es del servidor.
 */
export function mergePendingObligations(
  serverSummaries: ObligationSummary[],
  localRows: Row[],
  pendingIds: ReadonlySet<number>,
  counterpartyNames: Map<number, string>,
  pendingEvents: readonly PendingObligationEvent[] = [],
): ObligationSummary[] {
  if (pendingIds.size === 0) return serverSummaries;
  const byId = new Map(serverSummaries.map((summary) => [summary.id, summary]));
  const localIds = new Set(localRows.map((row) => Number(row.id)));
  // Una obligación con cambios pendientes que ya no está en la copia local se borró aquí (creada y eliminada sin enviar).
  const merged = serverSummaries
    .filter((summary) => !(pendingIds.has(summary.id) && !localIds.has(summary.id)))
    .map((summary) => {
    if (!pendingIds.has(summary.id)) return summary;
    const row = localRows.find((item) => Number(item.id) === summary.id);
    return row ? overlayOfflineObligationDefinition(summary, row, counterpartyNames) : summary;
  });
  for (const row of localRows) {
    const id = Number(row.id);
    if (pendingIds.has(id) && !byId.has(id)) merged.push(buildOfflineObligationSummary(row, counterpartyNames, pendingEvents));
  }
  return merged;
}
