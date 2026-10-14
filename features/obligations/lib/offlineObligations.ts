import type { ObligationSummary } from "../../../types/domain";

type Row = Record<string, unknown>;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/**
 * Obligación recién creada sin conexión, todavía sin eventos: lo que el servidor calcularía para una
 * obligación sin pagos (pendiente = principal, avance 0). Se reemplaza por la vista real al sincronizar.
 */
export function buildOfflineObligationSummary(row: Row, counterpartyNames: Map<number, string>): ObligationSummary {
  const principal = num(row.principal_amount);
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
    currentPrincipalAmount: principal,
    currentPrincipalAmountInBaseCurrency: principal,
    pendingAmount: principal,
    pendingAmountInBaseCurrency: principal,
    progressPercent: 0,
    startDate: String(row.start_date ?? ""),
    dueDate: (row.due_date as string | null | undefined) ?? null,
    installmentAmount: row.installment_amount ? num(row.installment_amount) : null,
    installmentCount: (row.installment_count as number | null | undefined) ?? null,
    paymentPlan: row.payment_plan ?? null,
    interestRate: row.interest_rate ? num(row.interest_rate) : null,
    description: (row.description as string | null | undefined) ?? null,
    notes: (row.notes as string | null | undefined) ?? null,
    paymentCount: 0,
    lastPaymentDate: null,
    installmentLabel: "",
    events: [],
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
): ObligationSummary[] {
  if (pendingIds.size === 0) return serverSummaries;
  const byId = new Map(serverSummaries.map((summary) => [summary.id, summary]));
  const merged = serverSummaries.map((summary) => {
    if (!pendingIds.has(summary.id)) return summary;
    const row = localRows.find((item) => Number(item.id) === summary.id);
    return row ? overlayOfflineObligationDefinition(summary, row, counterpartyNames) : summary;
  });
  for (const row of localRows) {
    const id = Number(row.id);
    if (pendingIds.has(id) && !byId.has(id)) merged.push(buildOfflineObligationSummary(row, counterpartyNames));
  }
  return merged;
}
