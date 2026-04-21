export type FocusCandidateKey =
  | "uncategorized"
  | "overdue"
  | "liquidity"
  | "subscriptions"
  | "cash"
  | "spending"
  | "projection-risk"
  | "stable";

export type FocusActionCandidate = {
  key: FocusCandidateKey;
  title: string;
  body: string;
  detail: string;
  tag: string;
  route: string;
  score: number;
  reason: string;
  quickFilter?: "uncategorized";
  scoreLabel: "Alta" | "Media" | "Baja";
  scorePill: string;
  alternatives: FocusActionCandidate[];
};

type RawFocusActionCandidate = Omit<FocusActionCandidate, "scoreLabel" | "scorePill" | "alternatives">;

type BuildFocusActionRankingInput = {
  uncategorizedCount: number;
  overdueObligationsCount: number;
  subscriptionsAttentionCount: number;
  learningReadinessScore: number;
  weekExpectedInflow: number;
  weekExpectedOutflow: number;
  monthExpense: number;
  cashCushionDays: number;
  cashDailyBurn: number;
  spendingTrendPct: number;
  pressureProbability: number;
  pressureThresholdLabel: string;
  formatAmount: (amount: number) => string;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function priorityScore(parts: {
  urgency: number;
  moneyImpact: number;
  confidenceImpact: number;
  fixability: number;
}) {
  return clampScore(
    parts.urgency * 0.34 +
      parts.moneyImpact * 0.28 +
      parts.confidenceImpact * 0.22 +
      parts.fixability * 0.16,
  );
}

function finishRanking(candidates: RawFocusActionCandidate[]): FocusActionCandidate {
  const rankedBase = candidates.sort((a, b) => b.score - a.score);
  const ranked: FocusActionCandidate[] = rankedBase.map((candidate) => ({
    ...candidate,
    scoreLabel: candidate.score >= 80 ? "Alta" : candidate.score >= 55 ? "Media" : "Baja",
    scorePill: candidate.key === "stable" ? "Sin urgencia" : `${candidate.score}/100`,
    alternatives: [],
  }));

  return {
    ...ranked[0],
    alternatives: ranked.slice(1, 4),
  };
}

export function buildFocusActionRanking(input: BuildFocusActionRankingInput): FocusActionCandidate {
  const weekNet = input.weekExpectedInflow - input.weekExpectedOutflow;
  const weeklyDeficit = Math.max(0, -weekNet);
  const expenseBase = Math.max(input.monthExpense, input.cashDailyBurn * 30, 1);
  const candidates: RawFocusActionCandidate[] = [];

  if (input.uncategorizedCount > 0) {
    candidates.push({
      key: "uncategorized",
      title: "Ordenar categorías",
      body: `${input.uncategorizedCount} movimientos siguen sin categoría.`,
      detail: "Más categoría significa comparativos, alertas y proyecciones mucho más finas.",
      tag: "Orden fino",
      route: "/movements",
      quickFilter: "uncategorized",
      score: priorityScore({
        urgency: Math.min(88, 42 + input.uncategorizedCount * 6),
        moneyImpact: Math.min(78, 36 + input.uncategorizedCount * 4),
        confidenceImpact: Math.min(96, 48 + (100 - input.learningReadinessScore) * 0.5),
        fixability: 90,
      }),
      reason: "Hay movimientos sin etiqueta. Es como tener ventas anotadas sin saber de qué producto salieron; ordenar eso mejora casi todas las lecturas.",
    });
  }

  if (input.overdueObligationsCount > 0) {
    candidates.push({
      key: "overdue",
      title: "Resolver vencimientos",
      body: `${input.overdueObligationsCount} cobros o pagos ya se quedaron fuera de fecha.`,
      detail: "Limpiar esto primero evita que la cartera siga arrastrando lectura falsa.",
      tag: "Cartera",
      route: "/obligations",
      score: priorityScore({
        urgency: Math.min(99, 76 + input.overdueObligationsCount * 7),
        moneyImpact: 82,
        confidenceImpact: 58,
        fixability: 70,
      }),
      reason: "Hay compromisos vencidos. El score los sube porque pueden cambiar tu caja real y confundir la lectura de deudas o cobros.",
    });
  }

  if (weeklyDeficit > 0) {
    candidates.push({
      key: "liquidity",
      title: "Cuidar liquidez",
      body: `La próxima semana faltan ${input.formatAmount(weeklyDeficit)} para cubrir lo programado.`,
      detail: "Revisa compromisos cercanos antes de que la presión se sienta tarde.",
      tag: "Liquidez",
      route: "/dashboard",
      score: priorityScore({
        urgency: 92,
        moneyImpact: Math.min(96, 48 + Math.min(weeklyDeficit / expenseBase, 1) * 45),
        confidenceImpact: 42,
        fixability: 58,
      }),
      reason: "En los próximos 7 días sale más dinero del que entra. El score mira esa ventana como la caja de esta semana.",
    });
  }

  if (input.subscriptionsAttentionCount > 0) {
    candidates.push({
      key: "subscriptions",
      title: "Revisar suscripciones",
      body: `${input.subscriptionsAttentionCount} cargos fijos necesitan cuenta o fecha más clara.`,
      detail: "Ordenar esa base mejora la proyección de corto plazo.",
      tag: "Liquidez",
      route: "/subscriptions",
      score: priorityScore({
        urgency: Math.min(82, 42 + input.subscriptionsAttentionCount * 8),
        moneyImpact: 56,
        confidenceImpact: 68,
        fixability: 78,
      }),
      reason: "Los cargos fijos se repiten. Si están incompletos, la proyección puede quedar corta todos los meses.",
    });
  }

  if (input.cashCushionDays < 30) {
    candidates.push({
      key: "cash",
      title: "Proteger caja",
      body: `Tu caja libre cubre aproximadamente ${input.cashCushionDays} días.`,
      detail: "Conviene bajar gastos variables o revisar pagos próximos para no llegar ajustado.",
      tag: "Caja",
      route: "/dashboard",
      score: priorityScore({
        urgency: Math.min(94, 84 - input.cashCushionDays),
        moneyImpact: 76,
        confidenceImpact: 38,
        fixability: 52,
      }),
      reason: "La app compara tu saldo con tu ritmo de gasto. Si la reserva dura poco, la alerta sube.",
    });
  }

  if (input.spendingTrendPct > 5) {
    candidates.push({
      key: "spending",
      title: "Frenar gasto variable",
      body: `El gasto reciente viene subiendo ${input.spendingTrendPct.toFixed(0)}%.`,
      detail: "Revisa qué cambió esta semana antes de que se vuelva costumbre.",
      tag: "Ritmo",
      route: "/dashboard",
      score: priorityScore({
        urgency: Math.min(82, 44 + input.spendingTrendPct),
        moneyImpact: Math.min(88, 38 + input.spendingTrendPct * 1.4),
        confidenceImpact: 34,
        fixability: 62,
      }),
      reason: "La app le da más peso al gasto reciente, igual que revisar si esta semana la caja se movió más de lo normal.",
    });
  }

  if (input.pressureProbability >= 45) {
    candidates.push({
      key: "projection-risk",
      title: "Bajar riesgo de cierre",
      body: `Hay ${input.pressureProbability}% de probabilidad de cerrar bajo ${input.pressureThresholdLabel}.`,
      detail: "El riesgo viene de simular muchos cierres posibles con tu ritmo reciente.",
      tag: "Proyección",
      route: "/dashboard",
      score: priorityScore({
        urgency: Math.min(90, 36 + input.pressureProbability * 0.75),
        moneyImpact: Math.min(86, 42 + input.pressureProbability * 0.55),
        confidenceImpact: 46,
        fixability: 48,
      }),
      reason: "Monte Carlo marca presión de cierre: no es una certeza, pero sí una señal para revisar gastos variables y compromisos.",
    });
  }

  candidates.push({
    key: "stable",
    title: "Mantener el ritmo",
    body: "No vemos una fricción fuerte inmediata en tu sistema.",
    detail: "Buen momento para consolidar hábitos, metas y calidad del dato.",
    tag: "Estable",
    route: "/dashboard",
    score: 28,
    reason: "Las señales principales se ven manejables: datos, semana y cierre de mes no muestran una urgencia fuerte.",
  });

  return finishRanking(candidates);
}
