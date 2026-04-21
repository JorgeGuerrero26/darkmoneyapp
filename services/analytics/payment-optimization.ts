export type PaymentOptimizationObligation = {
  id: number;
  title: string;
  direction: string;
  amount: number;
  dueDate: string | null;
  status: string;
  counterparty?: string | null;
};

export type PaymentOptimizationRecommendation = {
  id: number;
  title: string;
  subtitle: string;
  actionLabel: string;
  amount: number;
  direction: "payable" | "receivable";
  score: number;
  daysUntilDue: number | null;
  reason: string;
};

type BuildPaymentOptimizationPlanInput = {
  obligations: PaymentOptimizationObligation[];
  currentBalance: number;
  weekExpectedInflow: number;
  weekExpectedOutflow: number;
  pressureProbability: number;
  today?: Date;
};

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(date: Date, today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(99, Math.round(value)));
}

export function buildPaymentOptimizationPlan({
  obligations,
  currentBalance,
  weekExpectedInflow,
  weekExpectedOutflow,
  pressureProbability,
  today = new Date(),
}: BuildPaymentOptimizationPlanInput): PaymentOptimizationRecommendation[] {
  const weekDeficit = Math.max(0, weekExpectedOutflow - weekExpectedInflow);
  const active = obligations.filter((obligation) => obligation.status !== "paid" && obligation.amount > 0.009);

  const recommendations = active
    .map((obligation): PaymentOptimizationRecommendation | null => {
      const dueDate = parseDate(obligation.dueDate);
      const daysUntilDue = dueDate ? diffDays(dueDate, today) : null;
      const dueUrgency = daysUntilDue == null
        ? 28
        : daysUntilDue < 0
          ? 96
          : daysUntilDue === 0
            ? 92
            : daysUntilDue <= 7
              ? 82 - daysUntilDue * 4
              : daysUntilDue <= 30
                ? 44 - Math.min(20, (daysUntilDue - 7) * 0.8)
                : 18;
      const amountPressure = Math.min(92, (obligation.amount / Math.max(Math.abs(currentBalance), weekExpectedOutflow, 1)) * 100);
      const pressureBoost = pressureProbability >= 45 ? 12 : pressureProbability >= 25 ? 6 : 0;

      if (obligation.direction === "receivable") {
        const coversDeficit = weekDeficit > 0 ? Math.min(26, (obligation.amount / weekDeficit) * 22) : 0;
        const score = clampScore(dueUrgency * 0.42 + amountPressure * 0.22 + coversDeficit + pressureBoost + 18);
        if (score < 42) return null;
        return {
          id: obligation.id,
          title: obligation.title,
          subtitle: obligation.counterparty ? `Cobrar a ${obligation.counterparty}` : "Cobro pendiente",
          actionLabel: daysUntilDue != null && daysUntilDue < 0 ? "Cobrar vencido" : "Priorizar cobro",
          amount: obligation.amount,
          direction: "receivable",
          score,
          daysUntilDue,
          reason: weekDeficit > 0
            ? "Este cobro puede cubrir parte de la presión de la semana."
            : "Cobrarlo mejora caja disponible y reduce incertidumbre.",
        };
      }

      if (obligation.direction === "payable") {
        const balanceShare = Math.min(24, (obligation.amount / Math.max(Math.abs(currentBalance), 1)) * 18);
        const score = clampScore(dueUrgency * 0.5 + amountPressure * 0.2 + balanceShare + pressureBoost);
        if (score < 38) return null;
        return {
          id: obligation.id,
          title: obligation.title,
          subtitle: obligation.counterparty ? `Pago a ${obligation.counterparty}` : "Pago pendiente",
          actionLabel: daysUntilDue != null && daysUntilDue < 0 ? "Resolver vencido" : "Separar caja",
          amount: obligation.amount,
          direction: "payable",
          score,
          daysUntilDue,
          reason: daysUntilDue != null && daysUntilDue <= 7
            ? "Este pago cae pronto; separarlo evita que el flujo semanal te sorprenda."
            : "Conviene tenerlo visible para no consumir caja que ya está comprometida.",
        };
      }

      return null;
    })
    .filter((item): item is PaymentOptimizationRecommendation => Boolean(item))
    .sort((a, b) => b.score - a.score || a.amount - b.amount);

  return recommendations.slice(0, 4);
}
