import { useMemo } from "react";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS } from "../../../constants/theme";
import type { WorkspaceSnapshot } from "../../../services/queries/workspace-data";
import type {
  CounterpartyOverview,
  RecurringIncomeSummary,
  SubscriptionSummary,
} from "../../../types/domain";

type Args = {
  contact: CounterpartyOverview | null;
  snapshot: WorkspaceSnapshot | undefined;
  baseCurrency: string;
};

export type ContactAnalytics = {
  receivableCount: number;
  payableCount: number;
  receivablePendingTotal: number;
  payablePendingTotal: number;
  receivablePrincipalTotal: number;
  payablePrincipalTotal: number;
  inflowTotal: number;
  outflowTotal: number;
  netPendingAmount: number;
  netFlowAmount: number;
  lastActivityAt: string | null;
  relatedSubscriptions: SubscriptionSummary[];
  relatedRecurringIncome: RecurringIncomeSummary[];
  scheduledExpenseTotal: number;
  scheduledIncomeTotal: number;
  averageOpenExposure: number;
  flowBalancePercent: number;
  collectionProgressPercent: number;
  paymentProgressPercent: number;
  relationshipHeadline: string;
  relationshipTone: string;
  insightLines: string[];
};

export function useContactAnalytics({
  contact,
  snapshot,
  baseCurrency,
}: Args): ContactAnalytics | null {
  return useMemo(() => {
    if (!contact || !snapshot) return null;

    const contactObligations = (snapshot.obligations ?? []).filter(
      (obligation) => obligation.counterpartyId === contact.id && obligation.status !== "cancelled",
    );
    const relatedSubscriptions = (snapshot.subscriptions ?? []).filter(
      (subscription) => subscription.vendorPartyId === contact.id,
    );
    const relatedRecurringIncome = (snapshot.recurringIncome ?? []).filter(
      (income) => income.payerPartyId === contact.id,
    );

    const inflowTotal = contact.inflowTotal ?? 0;
    const outflowTotal = contact.outflowTotal ?? 0;
    let receivableCount = 0;
    let payableCount = 0;
    let receivablePendingTotal = 0;
    let payablePendingTotal = 0;
    let receivablePrincipalTotal = 0;
    let payablePrincipalTotal = 0;
    let latestObligationAt: string | null = null;

    for (const obligation of contactObligations) {
      const currentPrincipal = obligation.currentPrincipalAmount ?? obligation.principalAmount;
      if (obligation.direction === "receivable") {
        receivableCount += 1;
        receivablePendingTotal += obligation.pendingAmount;
        receivablePrincipalTotal += currentPrincipal;
      } else {
        payableCount += 1;
        payablePendingTotal += obligation.pendingAmount;
        payablePrincipalTotal += currentPrincipal;
      }
      const activityCandidate = obligation.lastPaymentDate ?? obligation.dueDate ?? obligation.startDate;
      if (activityCandidate && (!latestObligationAt || activityCandidate > latestObligationAt)) {
        latestObligationAt = activityCandidate;
      }
    }

    const netPendingAmount = receivablePendingTotal - payablePendingTotal;
    const netFlowAmount = inflowTotal - outflowTotal;
    const scheduledExpenseTotal = relatedSubscriptions
      .filter((subscription) => subscription.status === "active")
      .reduce(
        (sum, subscription) => sum + (subscription.amountInBaseCurrency ?? subscription.amount),
        0,
      );
    const scheduledIncomeTotal = relatedRecurringIncome
      .filter((income) => income.status === "active")
      .reduce((sum, income) => sum + (income.amountInBaseCurrency ?? income.amount), 0);
    const lastActivityAt =
      [
        contact.lastActivityAt,
        latestObligationAt,
        ...relatedSubscriptions.map((subscription) => subscription.nextDueDate),
        ...relatedRecurringIncome.map((income) => income.nextExpectedDate),
      ]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    const averageOpenExposure =
      contactObligations.length > 0
        ? (receivablePendingTotal + payablePendingTotal) / contactObligations.length
        : 0;
    const totalFlow = inflowTotal + outflowTotal;
    const flowBalancePercent =
      totalFlow > 0 ? Math.round((Math.max(inflowTotal, outflowTotal) / totalFlow) * 100) : 0;
    const collectionProgressPercent =
      receivablePrincipalTotal > 0
        ? Math.round(
            ((receivablePrincipalTotal - receivablePendingTotal) / receivablePrincipalTotal) * 100,
          )
        : 0;
    const paymentProgressPercent =
      payablePrincipalTotal > 0
        ? Math.round(((payablePrincipalTotal - payablePendingTotal) / payablePrincipalTotal) * 100)
        : 0;

    let relationshipHeadline = "Sin relación financiera activa";
    let relationshipTone = COLORS.storm;
    if (netPendingAmount > 0) {
      relationshipHeadline = `Te debe ${formatCurrency(netPendingAmount, baseCurrency)}`;
      relationshipTone = COLORS.income;
    } else if (netPendingAmount < 0) {
      relationshipHeadline = `Le debes ${formatCurrency(Math.abs(netPendingAmount), baseCurrency)}`;
      relationshipTone = COLORS.expense;
    } else if (scheduledIncomeTotal > 0 || scheduledExpenseTotal > 0) {
      relationshipHeadline = "Relación activa programada";
      relationshipTone = scheduledIncomeTotal >= scheduledExpenseTotal ? COLORS.income : COLORS.expense;
    } else if (totalFlow > 0) {
      relationshipHeadline = netFlowAmount >= 0
        ? "Relación con flujo favorable"
        : "Relación con flujo saliente";
      relationshipTone = netFlowAmount >= 0 ? COLORS.income : COLORS.expense;
    }

    const insightLines: string[] = [];
    if (receivableCount > 0 || payableCount > 0) {
      insightLines.push(
        receivableCount > payableCount
          ? "La relación se inclina más hacia montos por cobrar."
          : payableCount > receivableCount
            ? "La relación se inclina más hacia montos por pagar."
            : "La relación está repartida entre cobros y pagos.",
      );
    }
    if (inflowTotal > 0 || outflowTotal > 0) {
      insightLines.push(
        netFlowAmount >= 0
          ? `El flujo histórico con este contacto termina a tu favor en la moneda base (${baseCurrency}).`
          : `El flujo histórico con este contacto termina más del lado de egresos en la moneda base (${baseCurrency}).`,
      );
    }
    if (relatedSubscriptions.length > 0) {
      insightLines.push(
        `${relatedSubscriptions.length} suscripción${relatedSubscriptions.length === 1 ? "" : "es"} usa${relatedSubscriptions.length === 1 ? "" : "n"} este contacto como proveedor.`,
      );
    }
    if (relatedRecurringIncome.length > 0) {
      insightLines.push(
        `${relatedRecurringIncome.length} ingreso${relatedRecurringIncome.length === 1 ? "" : "s"} fijo${relatedRecurringIncome.length === 1 ? "" : "s"} usa${relatedRecurringIncome.length === 1 ? "" : "n"} este contacto como pagador.`,
      );
    }

    return {
      receivableCount,
      payableCount,
      receivablePendingTotal,
      payablePendingTotal,
      receivablePrincipalTotal,
      payablePrincipalTotal,
      inflowTotal,
      outflowTotal,
      netPendingAmount,
      netFlowAmount,
      lastActivityAt,
      relatedSubscriptions,
      relatedRecurringIncome,
      scheduledExpenseTotal,
      scheduledIncomeTotal,
      averageOpenExposure,
      flowBalancePercent,
      collectionProgressPercent,
      paymentProgressPercent,
      relationshipHeadline,
      relationshipTone,
      insightLines,
    };
  }, [contact, snapshot, baseCurrency]);
}
