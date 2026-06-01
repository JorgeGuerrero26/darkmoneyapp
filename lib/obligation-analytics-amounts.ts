import type {
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

export type AnalyticsAmounts = {
  currentPrincipal: number;
  paidAmount: number;
};

/**
 * Compute the principal and paid amount shown in the analytics modal.
 *
 * Why this is tricky (and why the auditoría flagged it as A3):
 *
 *  - Shared obligations from the edge function sometimes arrive with
 *    `principalAmount` / `currentPrincipalAmount` == 0 even though
 *    `pendingAmount` and `progressPercent` are correct.
 *  - The progress % can be rounded or computed differently from the sum of
 *    events. When we have any payments, we prefer
 *    **pending + sum(payments)** so the cards align with the chart and
 *    history.
 *
 * Until the SQL view stops mixing these, this client-side reconciliation
 * lives here. The auditoría's long-term plan is to move it server-side.
 */
export function computeAnalyticsAmounts(
  obligation: ObligationSummary | SharedObligationSummary | null,
  paymentEvents: ObligationEventSummary[],
): AnalyticsAmounts {
  if (!obligation) return { currentPrincipal: 0, paidAmount: 0 };

  const pendingRaw = Number(obligation.pendingAmount);
  const safePending = Number.isFinite(pendingRaw) ? Math.max(0, pendingRaw) : 0;
  const pctRaw = Number(obligation.progressPercent);
  const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;

  const cp = obligation.currentPrincipalAmount;
  const p0 = obligation.principalAmount;
  const principalFromFields =
    cp != null && cp > 0 ? cp : p0 != null && p0 > 0 ? p0 : 0;

  let currentPrincipal = principalFromFields;

  if (currentPrincipal <= 0 && safePending > 0 && pct > 0 && pct < 100) {
    currentPrincipal = safePending / (1 - pct / 100);
  } else if (currentPrincipal <= 0 && safePending > 0) {
    currentPrincipal = safePending;
  }

  let paidAmount = currentPrincipal - safePending;

  const paidFromEvents = paymentEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (paidFromEvents > 0.004) {
    const paidFromBalance = Number.isFinite(paidAmount) ? paidAmount : 0;
    const noPrincipalFromApi = principalFromFields <= 0;
    const balanceVsEventsMismatch = Math.abs(paidFromBalance - paidFromEvents) > 0.05;
    if (noPrincipalFromApi || balanceVsEventsMismatch) {
      paidAmount = paidFromEvents;
      currentPrincipal = safePending + paidFromEvents;
    }
  }

  return {
    currentPrincipal: Number.isFinite(currentPrincipal) ? currentPrincipal : 0,
    paidAmount: Number.isFinite(paidAmount) ? Math.max(0, paidAmount) : 0,
  };
}
