import { addDays, differenceInDays, endOfDay, endOfMonth, format, getDay, startOfDay, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../lib/format-currency";
import {
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../../lib/movement-amounts";
import { buildCategorySuggestionCandidates } from "../../../services/analytics/category-suggestions";
import { detectMovementAnomalies } from "../../../services/analytics/anomaly-detection";
import { simulateMonthEndCashflow } from "../../../services/analytics/cashflow-forecast";
import { normalizeAnalyticsText } from "../../../services/analytics/movement-features";
import type { DashboardAnalyticsBundle, DashboardMovementRow } from "./dashboard-row";

import {
  expenseAmt,
  inRange,
  incomeAmt,
  isCategorizedCashflow,
  isExpense,
} from "./aggregations";
import { buildFutureFlowWindows } from "./dashboard-builders";
import type {
  DashboardAnomalyFinding,
  DashboardCategorySuggestion,
  DashboardProjectionModel,
} from "./advanced-types";
import type { ConversionCtx } from "./types";

export function buildCategorySuggestions(
  movements: DashboardMovementRow[],
  categories: Array<{ id: number; name: string }>,
  ctx: ConversionCtx,
): DashboardCategorySuggestion[] {
  return buildCategorySuggestionCandidates<DashboardMovementRow>({
    movements,
    categories,
    isCashflow: isCategorizedCashflow,
    isIncomeLike: movementActsAsIncome,
    getAmount: (movement) =>
      movementActsAsIncome(movement) ? incomeAmt(movement, ctx) : expenseAmt(movement, ctx),
    limit: 4,
    targetLimit: 10,
  });
}

function textSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeAnalyticsText(left).split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeAnalyticsText(right).split(" ").filter((token) => token.length >= 3));
  const allTokens = new Set([...leftTokens, ...rightTokens]);
  if (allTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of allTokens) {
    if (leftTokens.has(token) && rightTokens.has(token)) overlap += 1;
  }
  return overlap / allTokens.size;
}

export function buildLearningFeedbackCategorySuggestions(
  movements: DashboardMovementRow[],
  feedback: NonNullable<DashboardAnalyticsBundle["learningFeedback"]>,
  categoryMap: Map<number, string>,
  ctx: ConversionCtx,
): DashboardCategorySuggestion[] {
  const accepted = feedback.filter(
    (item) =>
      item.acceptedCategoryId != null &&
      (item.feedbackKind === "accepted_category_suggestion" || item.feedbackKind === "manual_category_change"),
  );
  if (accepted.length === 0) return [];

  return movements
    .filter((movement) => movement.status === "posted" && isCategorizedCashflow(movement) && movement.categoryId == null)
    .map((movement): DashboardCategorySuggestion | null => {
      const normalized = normalizeAnalyticsText(movement.description);
      if (!normalized) return null;
      const matches = accepted
        .map((item) => {
          const learnedText = item.normalizedDescription ?? "";
          const similarity = learnedText === normalized ? 1 : textSimilarity(normalized, learnedText);
          return { item, similarity };
        })
        .filter(({ similarity }) => similarity >= 0.58)
        .sort(
          (a, b) =>
            b.similarity - a.similarity ||
            new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime(),
        );
      const best = matches[0];
      if (!best?.item.acceptedCategoryId) return null;
      const confidence = Math.max(
        0.62,
        Math.min(0.98, 0.56 + best.similarity * 0.26 + Math.min(matches.length, 4) * 0.035),
      );
      const amount = movementActsAsIncome(movement) ? incomeAmt(movement, ctx) : expenseAmt(movement, ctx);
      return {
        movementId: movement.id,
        description: movement.description.trim() || "Movimiento sin descripción",
        occurredAt: movement.occurredAt,
        amount,
        suggestedCategoryId: best.item.acceptedCategoryId,
        suggestedCategoryName: categoryMap.get(best.item.acceptedCategoryId) ?? "Categoría sugerida",
        confidence,
        matchedSamples: matches.length,
        reasons: [
          "aprendido de una corrección tuya",
          best.similarity >= 0.92 ? "texto casi igual" : "texto parecido",
          `${matches.length} respuesta${matches.length === 1 ? "" : "s"} usada${matches.length === 1 ? "" : "s"}`,
        ],
      };
    })
    .filter((item): item is DashboardCategorySuggestion => Boolean(item))
    .sort((a, b) => b.confidence - a.confidence || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 4);
}

export function buildMonthProjectionModel(
  movements: DashboardMovementRow[],
  obligations: Array<{
    direction: string;
    pendingAmount: number;
    installmentAmount?: number | null;
    currencyCode: string;
    dueDate: string | null;
    status: string;
  }>,
  subscriptions: Array<{
    amount: number;
    currencyCode: string;
    nextDueDate: string;
    status: string;
  }>,
  recurringIncome: Array<{
    amount: number;
    currencyCode: string;
    nextExpectedDate: string;
    status: string;
  }>,
  currentVisibleBalance: number,
  ctx: ConversionCtx,
  now: Date = new Date(),
): DashboardProjectionModel {
  const today = now;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const remainingDays = Math.max(0, differenceInDays(monthEnd, today));
  const daysElapsed = Math.max(1, differenceInDays(today, monthStart) + 1);
  const futureWindows = buildFutureFlowWindows(
    obligations,
    subscriptions,
    recurringIncome,
    ctx.displayCurrency,
    ctx.exchangeRateMap,
    currentVisibleBalance,
    ctx.baseCurrency,
    now,
  );
  const monthWindow = futureWindows[2];

  const variableIncomeObserved = movements
    .filter((movement) => inRange(movement, monthStart, today))
    .filter((movement) => movement.status === "posted")
    .filter((movement) => movement.movementType === "income" || movement.movementType === "refund")
    .reduce((sum, movement) => sum + incomeAmt(movement, ctx), 0);

  const variableExpenseObserved = movements
    .filter((movement) => inRange(movement, monthStart, today))
    .filter((movement) => movement.status === "posted")
    .filter((movement) => movement.movementType === "expense")
    .reduce((sum, movement) => sum + expenseAmt(movement, ctx), 0);

  const lastThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const day = subDays(today, 29 - index);
    const start = startOfDay(day);
    const end = endOfDay(day);
    const income = movements
      .filter((movement) => inRange(movement, start, end))
      .filter((movement) => movement.status === "posted")
      .filter((movement) => movement.movementType === "income" || movement.movementType === "refund")
      .reduce((sum, movement) => sum + incomeAmt(movement, ctx), 0);
    const expense = movements
      .filter((movement) => inRange(movement, start, end))
      .filter((movement) => movement.status === "posted")
      .filter((movement) => movement.movementType === "expense")
      .reduce((sum, movement) => sum + expenseAmt(movement, ctx), 0);
    return { income, expense };
  });

  const incomeDailyAvg = variableIncomeObserved / daysElapsed;
  const expenseDailyAvg = variableExpenseObserved / daysElapsed;
  const incomeVarianceBase =
    lastThirtyDays.reduce((sum, day) => sum + Math.pow(day.income - incomeDailyAvg, 2), 0) /
    Math.max(lastThirtyDays.length, 1);
  const expenseVarianceBase =
    lastThirtyDays.reduce((sum, day) => sum + Math.pow(day.expense - expenseDailyAvg, 2), 0) /
    Math.max(lastThirtyDays.length, 1);
  const incomeVolatility =
    incomeDailyAvg > 0.009 ? Math.min(0.35, Math.sqrt(incomeVarianceBase) / Math.max(incomeDailyAvg, 1)) : 0.28;
  const expenseVolatility =
    expenseDailyAvg > 0.009 ? Math.min(0.35, Math.sqrt(expenseVarianceBase) / Math.max(expenseDailyAvg, 1)) : 0.18;

  const variableIncomeProjection = incomeDailyAvg * remainingDays;

  const weeklyExpenseTotals = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const movement of movements.filter((m) => m.status === "posted" && m.movementType === "expense")) {
    const d = getDay(new Date(movement.occurredAt));
    const idx = d === 0 ? 6 : d - 1;
    weeklyExpenseTotals[idx].sum += expenseAmt(movement, ctx);
    weeklyExpenseTotals[idx].count += 1;
  }
  const weeksOfHistory = Math.floor(daysElapsed / 7);
  let variableExpenseProjection = expenseDailyAvg * remainingDays;
  if (weeksOfHistory >= 3 && expenseDailyAvg > 0.009) {
    const avgByDay = weeklyExpenseTotals.map((d) => (d.count > 0 ? d.sum / d.count : expenseDailyAvg));
    const meanDayAvg = avgByDay.reduce((s, v) => s + v, 0) / 7;
    if (meanDayAvg > 0.009) {
      const weights = avgByDay.map((v) => v / meanDayAvg);
      let remainingWeightedDays = 0;
      for (let i = 0; i < remainingDays; i++) {
        const d = addDays(today, i + 1);
        const dow = getDay(d);
        const idx = dow === 0 ? 6 : dow - 1;
        remainingWeightedDays += weights[idx];
      }
      variableExpenseProjection = expenseDailyAvg * remainingWeightedDays;
    }
  }

  const expectedBalance =
    currentVisibleBalance +
    monthWindow.expectedInflow -
    monthWindow.expectedOutflow +
    variableIncomeProjection -
    variableExpenseProjection;
  const conservativeBalance =
    currentVisibleBalance +
    monthWindow.expectedInflow * 0.9 -
    monthWindow.expectedOutflow * 1.03 +
    variableIncomeProjection * Math.max(0.45, 0.78 - incomeVolatility) -
    variableExpenseProjection * (1.04 + expenseVolatility);
  const optimisticBalance =
    currentVisibleBalance +
    monthWindow.expectedInflow * 1.02 -
    monthWindow.expectedOutflow +
    variableIncomeProjection * (1.05 + incomeVolatility * 0.35) -
    variableExpenseProjection * Math.max(0.72, 0.92 - expenseVolatility * 0.25);
  const monteCarlo = simulateMonthEndCashflow({
    currentBalance: currentVisibleBalance,
    committedInflow: monthWindow.expectedInflow,
    committedOutflow: monthWindow.expectedOutflow,
    dailySamples: lastThirtyDays,
    incomeDailyAverage: incomeDailyAvg,
    expenseDailyAverage: expenseDailyAvg,
    remainingDays,
  });

  const activeDays = lastThirtyDays.filter((day) => day.income > 0.009 || day.expense > 0.009).length;
  const confidence = Math.round(
    Math.min(
      92,
      Math.max(
        34,
        Math.min(1, activeDays / 18) * 40 +
          Math.min(1, daysElapsed / 12) * 20 +
          Math.min(1, (30 - (incomeVolatility + expenseVolatility) * 32) / 30) * 32,
      ),
    ),
  );
  const confidenceLabel = confidence >= 78 ? "Alta" : confidence >= 60 ? "Media" : "Base corta";

  return {
    expectedBalance,
    conservativeBalance,
    optimisticBalance,
    monteCarloLowBalance: monteCarlo.lowBalance,
    monteCarloMedianBalance: monteCarlo.medianBalance,
    monteCarloHighBalance: monteCarlo.highBalance,
    pressureThreshold: monteCarlo.pressureThreshold,
    pressureProbability: monteCarlo.pressureProbability,
    committedInflow: monthWindow.expectedInflow,
    committedOutflow: monthWindow.expectedOutflow,
    variableIncomeProjection,
    variableExpenseProjection,
    confidence,
    confidenceLabel,
    remainingDays,
  };
}

export function buildAnomalyFindings(
  movements: DashboardMovementRow[],
  ctx: ConversionCtx,
  categoryMap: Map<number, string>,
  accountMap: Map<number, string>,
): DashboardAnomalyFinding[] {
  const movementMap = new Map(movements.map((movement) => [movement.id, movement]));
  return detectMovementAnomalies<DashboardMovementRow>({
    movements: movements.filter(isExpense),
    getAmount: (movement) => expenseAmt(movement, ctx),
    limit: 4,
  }).map((finding) => {
    const movement = movementMap.get(finding.movementId);
    const amount = movement ? expenseAmt(movement, ctx) : finding.amount;
    const categoryLabel =
      movement?.categoryId != null ? categoryMap.get(movement.categoryId) ?? "Categoría" : "Sin categoría";
    const accountLabel = movement ? accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta" : "Cuenta";
    const title =
      movement?.description.trim() || (finding.kind === "probable_duplicate" ? "Posible duplicado" : "Movimiento");
    const baseline = finding.baselineAmount != null ? formatCurrency(finding.baselineAmount, ctx.displayCurrency) : null;
    const amountLabel = formatCurrency(amount, ctx.displayCurrency);
    const body =
      finding.kind === "description_spike"
        ? `Este gasto está bastante por encima de lo normal para esta misma descripción. Antes solía rondar ${baseline ?? "menos"}.`
        : finding.kind === "category_spike"
          ? `Este gasto está bastante por encima de lo habitual dentro de ${categoryLabel}. Antes esa referencia rondaba ${baseline ?? "menos"}.`
          : finding.kind === "peer_spike"
            ? `Este gasto se ve raro frente a movimientos parecidos por texto, cuenta, categoría o contraparte. La referencia rondaba ${baseline ?? "menos"}.`
            : `${finding.sampleCount} movimientos parecen repetidos por fecha cercana, monto parecido y texto similar.`;

    return {
      key: finding.key,
      movementId: finding.movementId,
      title,
      body,
      meta: `${finding.kind === "description_spike" ? accountLabel : categoryLabel} · ${amountLabel} · ${
        movement ? format(new Date(movement.occurredAt), "d MMM", { locale: es }) : "fecha reciente"
      }`,
      level: finding.level,
      score: finding.score,
      reasons: finding.reasons,
    };
  });
}
