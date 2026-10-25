import type { CounterpartyOverview, ObligationSummary } from "../../../types/domain";

/**
 * Resumen financiero de cada contacto calculado en el teléfono (modo sin conexión, beta).
 *
 * El servidor lo da en `v_counterparty_summary`: lo que entró y salió en los movimientos del contacto y lo que se le debe o
 * él debe en sus créditos y deudas. Sin internet, un gasto o un pago registrado aquí no lo movía hasta que volvía la
 * conexión. Estas funciones repiten el MISMO cálculo de la vista (mismos tipos de movimiento, mismos montos de respaldo),
 * en centavos para no arrastrar errores de coma flotante. Puras, sin React Native: se prueban solas.
 */

type Row = Record<string, unknown>;

const INFLOW_TYPES = new Set(["income", "refund"]);
const OUTFLOW_TYPES = new Set(["expense", "subscription_payment", "obligation_payment"]);

const cents = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const firstPresent = (...values: unknown[]) => values.find((value) => value !== null && value !== undefined && value !== "");

export type MovementRollup = { movementCount: number; inflowCents: number; outflowCents: number; lastMovementAt: string | null };
export type ObligationRollup = {
  receivableCount: number; receivablePrincipalCents: number; receivablePendingCents: number;
  payableCount: number; payablePrincipalCents: number; payablePendingCents: number;
  lastObligationActivityAt: string | null;
};

const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

/** `movement_rollup` de la vista: solo movimientos aplicados cuentan y suman. */
export function rollupMovementsByCounterparty(movements: readonly Row[]): Map<number, MovementRollup> {
  const out = new Map<number, MovementRollup>();
  for (const row of movements) {
    if (row.counterparty_id === null || row.counterparty_id === undefined) continue;
    const id = Number(row.counterparty_id);
    const acc = out.get(id) ?? { movementCount: 0, inflowCents: 0, outflowCents: 0, lastMovementAt: null };
    out.set(id, acc);
    if (row.status !== "posted") continue;
    acc.movementCount += 1;
    const type = String(row.movement_type);
    if (INFLOW_TYPES.has(type)) acc.inflowCents += cents(firstPresent(row.destination_amount, row.source_amount));
    if (OUTFLOW_TYPES.has(type)) acc.outflowCents += cents(firstPresent(row.source_amount, row.destination_amount));
    acc.lastMovementAt = later(acc.lastMovementAt, row.occurred_at == null ? null : String(row.occurred_at));
  }
  return out;
}

/** `obligation_rollup` de la vista, sobre las obligaciones que ya muestra la app (las del servidor más lo registrado aquí). */
export function rollupObligationsByCounterparty(
  obligations: readonly Pick<ObligationSummary, "counterpartyId" | "direction" | "principalAmount" | "currentPrincipalAmount" | "pendingAmount" | "lastPaymentDate" | "events">[],
): Map<number, ObligationRollup> {
  const out = new Map<number, ObligationRollup>();
  for (const obligation of obligations) {
    if (obligation.counterpartyId == null) continue;
    const acc = out.get(obligation.counterpartyId) ?? {
      receivableCount: 0, receivablePrincipalCents: 0, receivablePendingCents: 0,
      payableCount: 0, payablePrincipalCents: 0, payablePendingCents: 0, lastObligationActivityAt: null,
    };
    out.set(obligation.counterpartyId, acc);
    const principal = cents(obligation.currentPrincipalAmount ?? obligation.principalAmount);
    const pending = cents(obligation.pendingAmount);
    if (obligation.direction === "receivable") {
      acc.receivableCount += 1; acc.receivablePrincipalCents += principal; acc.receivablePendingCents += pending;
    } else if (obligation.direction === "payable") {
      acc.payableCount += 1; acc.payablePrincipalCents += principal; acc.payablePendingCents += pending;
    }
    const lastEvent = (obligation.events ?? []).reduce<string | null>((max, event) => later(max, event.eventDate ?? null), obligation.lastPaymentDate ?? null);
    acc.lastObligationActivityAt = later(acc.lastObligationActivityAt, lastEvent);
  }
  return out;
}

/**
 * Aplica las partes recalculadas sobre el resumen que ya tenía el contacto. Una parte que no se recalcula (`undefined`) se
 * conserva tal cual; un contacto sin movimientos o sin deudas queda en cero en esa parte, como en la vista. La última
 * actividad nunca retrocede (lo registrado aquí solo puede sumarle).
 */
export function withLocalFinancials(
  counterparty: CounterpartyOverview,
  parts: { movements?: Map<number, MovementRollup>; obligations?: Map<number, ObligationRollup> },
): CounterpartyOverview {
  const next = { ...counterparty };
  let lastActivity = counterparty.lastActivityAt ?? null;
  if (parts.movements) {
    const m = parts.movements.get(counterparty.id);
    next.movementCount = m?.movementCount ?? 0;
    next.inflowTotal = (m?.inflowCents ?? 0) / 100;
    next.outflowTotal = (m?.outflowCents ?? 0) / 100;
    next.netFlowAmount = ((m?.inflowCents ?? 0) - (m?.outflowCents ?? 0)) / 100;
    lastActivity = later(lastActivity, m?.lastMovementAt ?? null);
  }
  if (parts.obligations) {
    const o = parts.obligations.get(counterparty.id);
    next.receivableCount = o?.receivableCount ?? 0;
    next.receivablePrincipalTotal = (o?.receivablePrincipalCents ?? 0) / 100;
    next.receivablePendingTotal = (o?.receivablePendingCents ?? 0) / 100;
    next.payableCount = o?.payableCount ?? 0;
    next.payablePrincipalTotal = (o?.payablePrincipalCents ?? 0) / 100;
    next.payablePendingTotal = (o?.payablePendingCents ?? 0) / 100;
    next.netPendingAmount = ((o?.receivablePendingCents ?? 0) - (o?.payablePendingCents ?? 0)) / 100;
    lastActivity = later(lastActivity, o?.lastObligationActivityAt ?? null);
  }
  next.lastActivityAt = lastActivity;
  return next;
}
