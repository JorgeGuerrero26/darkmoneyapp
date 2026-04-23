import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  InteractionManager,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  addDays,
  getDay,
  differenceInDays,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, AlertCircle, Clock, Tag, ArrowRight, Bell, Banknote,
  Brain, Lock, Sparkles, Target, TrendingUp, X,
  type LucideIcon,
} from "lucide-react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDashboardMovementsQuery,
  useDashboardAnalyticsQuery,
  usePersistDashboardAnalyticsMutation,
  usePersistLearningFeedbackMutation,
  useUpdateMovementMutation,
  useSharedObligationsQuery,
  useNotificationsQuery,
  useUserEntitlementQuery,
  useDashboardAiSummaryMutation,
  mergeWorkspaceAndSharedObligations,
  type DashboardMovementRow,
  type DashboardAnalyticsBundle,
} from "../../services/queries/workspace-data";
import type { ExchangeRateSummary } from "../../types/domain";
import { useUiStore } from "../../store/ui-store";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { WorkspaceSelector } from "../../components/layout/WorkspaceSelector";
import { GestureDetector } from "react-native-gesture-handler";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { FAB } from "../../components/ui/FAB";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useSwipeTab } from "../../hooks/useSwipeTab";
import { DayMovementsSheet, type DaySheetMode } from "../../components/dashboard/DayMovementsSheet";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../lib/movement-display";
import { getAccountIcon } from "../../lib/account-icons";
import { parseDisplayDate } from "../../lib/date";
import { RingChart, type RingSegment } from "../../components/ui/RingChart";
import { SparkLine } from "../../components/ui/SparkLine";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useToast } from "../../hooks/useToast";
import { buildCategorySuggestionCandidates } from "../../services/analytics/category-suggestions";
import { detectMovementAnomalies } from "../../services/analytics/anomaly-detection";
import { simulateMonthEndCashflow } from "../../services/analytics/cashflow-forecast";
import { findProbableDuplicateGroups } from "../../services/analytics/duplicate-detection";
import { buildFinancialGraphRank, type FinancialGraphRankNode } from "../../services/analytics/financial-graph";
import { buildFocusActionRanking } from "../../services/analytics/focus-scoring";
import { buildHistoryFactorAnalysis } from "../../services/analytics/history-factor-analysis";
import { detectHistoryChangePoint } from "../../services/analytics/history-change-points";
import { clusterHistoryMonths } from "../../services/analytics/month-clustering";
import { buildPaymentOptimizationPlan, type PaymentOptimizationRecommendation } from "../../services/analytics/payment-optimization";
import { buildPatternClusters } from "../../services/analytics/pattern-clustering";
import { normalizeAnalyticsText } from "../../services/analytics/movement-features";
import { useBcrpMacroIndicatorsQuery } from "../../services/queries/bcrp-data";

// --- Constants ----------------------------------------------------------------

const UPCOMING_DAYS = 30;
const ADVANCED_DASHBOARD_GIFT_EMAIL = "nicol.solano15@gmail.com";

type Period = "today" | "week" | "month" | "last_30";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  last_30: "30 días",
};

// --- Helpers ------------------------------------------------------------------

function pctChange(current: number, prev: number) {
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function isIncome(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsIncome(m);
}

function isExpense(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsExpense(m);
}

function isTransfer(m: DashboardMovementRow) {
  return m.status === "posted" && m.movementType === "transfer";
}

function isCategorizedCashflow(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  return (
    m.movementType === "income" ||
    m.movementType === "refund" ||
    m.movementType === "expense" ||
    m.movementType === "subscription_payment" ||
    m.movementType === "obligation_payment"
  );
}

function inRange(m: DashboardMovementRow, start: Date, end: Date) {
  const d = new Date(m.occurredAt);
  return d >= start && d <= end;
}

function sortMovementsRecentFirst(movements: DashboardMovementRow[]) {
  return [...movements].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id - a.id);
}

function movementPreviewActionLabel(movement: DashboardMovementRow) {
  if (movement.status === "pending" || movement.status === "planned") return "Aplicar";
  if (isCategorizedCashflow(movement) && movement.categoryId == null) return "Categorizar";
  return "Editar";
}

function getPeriodBounds(period: Period, now: Date): { curStart: Date; curEnd: Date; prevStart: Date; prevEnd: Date } {
  if (period === "today") {
    const curStart = startOfDay(now);
    const curEnd = now;
    const yesterday = subDays(now, 1);
    const prevStart = startOfDay(yesterday);
    const prevEnd = yesterday;
    return { curStart, curEnd, prevStart, prevEnd };
  }
  if (period === "week") {
    const curStart = startOfWeek(now, { weekStartsOn: 1 });
    const curEnd = now;
    const daysSinceStart = differenceInDays(now, curStart);
    const prevStart = subDays(curStart, 7);
    const prevEnd = subDays(now, 7);
    void daysSinceStart;
    return { curStart, curEnd, prevStart, prevEnd };
  }
  if (period === "month") {
    const curStart = startOfMonth(now);
    const curEnd = now;
    const prevMonthDate = subMonths(now, 1);
    const prevStart = startOfMonth(prevMonthDate);
    const dayOfMonth = now.getDate();
    const prevEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), dayOfMonth, now.getHours(), now.getMinutes(), now.getSeconds());
    return { curStart, curEnd, prevStart, prevEnd };
  }
  // last_30
  const curStart = subDays(now, 29);
  const curEnd = now;
  const prevStart = subDays(now, 59);
  const prevEnd = subDays(now, 30);
  return { curStart, curEnd, prevStart, prevEnd };
}

// --- Exchange rate helpers -----------------------------------------------------

const DASHBOARD_CURRENCY_KEY = "darkmoney.dashboard.displayCurrency";

function buildExchangeRateMap(rates: ExchangeRateSummary[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.fromCurrencyCode.toUpperCase()}:${r.toCurrencyCode.toUpperCase()}`;
    if (!map.has(key) && r.rate > 0) map.set(key, r.rate);
  }
  return map;
}

function resolveRate(map: Map<string, number>, from: string, to: string): number {
  if (from === to) return 1;
  const direct = map.get(`${from}:${to}`);
  if (direct) return direct;
  const inverse = map.get(`${to}:${from}`);
  if (inverse) return 1 / inverse;
  return 1; // no rate found -> keep original
}

function convertAmt(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string,
  map: Map<string, number>,
): number {
  if (!fromCurrency) return amount;
  return amount * resolveRate(map, fromCurrency.toUpperCase(), toCurrency.toUpperCase());
}

// --- Stats --------------------------------------------------------------------

type ConversionCtx = {
  accountCurrencyMap: Map<number, string>;
  exchangeRateMap: Map<string, number>;
  displayCurrency: string;
};

function incomeAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

function expenseAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

function transferAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap);
}

type DashboardChartDay = {
  label: string;
  dateKey: string;
  dayStart: Date;
  dayEnd: Date;
  income: number;
  expense: number;
  transferTotal: number;
};

function useDashboardStats(movements: DashboardMovementRow[], period: Period, ctx: ConversionCtx) {
  return useMemo(() => {
    const now = new Date();
    const { curStart, curEnd, prevStart, prevEnd } = getPeriodBounds(period, now);

    const cur = movements.filter((m) => inRange(m, curStart, curEnd));
    const prev = movements.filter((m) => inRange(m, prevStart, prevEnd));

    const income = cur.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0);
    const expense = cur.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0);
    const net = income - expense;

    const prevIncome = prev.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0);
    const prevExpense = prev.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0);

    // Daily chart - last 7 days (con metadatos para detalle al tocar)
    const chartDays: DashboardChartDay[] = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const ds = startOfDay(d);
      const de = endOfDay(d);
      const dayMvs = movements.filter((m) => inRange(m, ds, de));
      return {
        label: format(d, "dd/M"),
        dateKey: format(d, "yyyy-MM-dd"),
        dayStart: ds,
        dayEnd: de,
        income: dayMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0),
        expense: dayMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0),
        transferTotal: dayMvs.filter(isTransfer).reduce((s, m) => s + transferAmt(m, ctx), 0),
      };
    });

    // Monthly pulse - last 6 months
    const monthlyPulse = Array.from({ length: 6 }, (_, i) => {
      const mDate = subMonths(now, 5 - i);
      const mStart = startOfMonth(mDate);
      const mEnd = i === 5 ? now : endOfMonth(mDate);
      const mMvs = movements.filter((m) => inRange(m, mStart, mEnd));
      return {
        label: format(mDate, "MMM", { locale: es }),
        income: mMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0),
        expense: mMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0),
      };
    });

    // Category breakdown - current period, expenses only
    const catTotals = new Map<number | null, number>();
    for (const m of cur.filter(isExpense)) {
      const k = m.categoryId;
      catTotals.set(k, (catTotals.get(k) ?? 0) + expenseAmt(m, ctx));
    }

    // Previous period category totals
    const prevCatTotals = new Map<number | null, number>();
    for (const m of prev.filter(isExpense)) {
      const k = m.categoryId;
      prevCatTotals.set(k, (prevCatTotals.get(k) ?? 0) + expenseAmt(m, ctx));
    }

    return {
      curStart, curEnd, income, expense, net,
      prevIncome, prevExpense,
      chartDays, monthlyPulse, catTotals, prevCatTotals,
    };
  }, [movements, period, ctx]);
}

type DashboardReviewInbox = {
  uncategorizedCount: number;
  pendingMovementsCount: number;
  duplicateExpenseGroups: number;
  subscriptionsAttentionCount: number;
  obligationsWithoutPlanCount: number;
  staleObligationsCount: number;
  overdueObligationsCount: number;
  totalIssues: number;
};

function buildReviewInboxSnapshot(
  movements: DashboardMovementRow[],
  subscriptions: Array<{ accountId?: number | null; nextDueDate: string; status: string }>,
  obligations: Array<{
    pendingAmount: number;
    dueDate: string | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    lastPaymentDate?: string | null;
    startDate?: string | null;
    status: string;
  }>,
): DashboardReviewInbox {
  const today = new Date();
  const uncategorizedCount = movements.filter(
    (movement) =>
      movement.status === "posted" &&
      isCategorizedCashflow(movement) &&
      movement.categoryId == null,
  ).length;

  const pendingMovementsCount = movements.filter((movement) => movement.status === "pending").length;

  const duplicateExpenseGroups = findProbableDuplicateGroups({
    movements: movements.filter(isExpense),
    getAmount: movementDisplayAmount,
  }).length;

  const subscriptionsAttentionCount = subscriptions.filter((subscription) => {
    if (subscription.status !== "active") return false;
    const dueDate = parseDisplayDate(subscription.nextDueDate);
    return !subscription.accountId || dueDate < today;
  }).length;

  const activeObligations = obligations.filter(
    (obligation) => obligation.pendingAmount > 0.009 && obligation.status !== "paid",
  );

  const obligationsWithoutPlanCount = activeObligations.filter(
    (obligation) =>
      !obligation.dueDate &&
      !(obligation.installmentCount && obligation.installmentCount > 0) &&
      !(obligation.installmentAmount && obligation.installmentAmount > 0),
  ).length;

  const staleObligationsCount = activeObligations.filter((obligation) => {
    const referenceDate = obligation.lastPaymentDate ?? obligation.startDate;
    if (!referenceDate) return true;
    return differenceInDays(today, parseDisplayDate(referenceDate)) > 50;
  }).length;

  const overdueObligationsCount = activeObligations.filter(
    (obligation) => obligation.dueDate && parseDisplayDate(obligation.dueDate) < today,
  ).length;

  const totalIssues =
    uncategorizedCount +
    pendingMovementsCount +
    duplicateExpenseGroups +
    subscriptionsAttentionCount +
    obligationsWithoutPlanCount +
    staleObligationsCount +
    overdueObligationsCount;

  return {
    duplicateExpenseGroups,
    obligationsWithoutPlanCount,
    overdueObligationsCount,
    pendingMovementsCount,
    staleObligationsCount,
    subscriptionsAttentionCount,
    totalIssues,
    uncategorizedCount,
  };
}

type FutureFlowWindow = {
  days: number;
  expectedInflow: number;
  expectedOutflow: number;
  estimatedBalance: number;
  scheduledCount: number;
  receivableCount: number;
  payableCount: number;
};

function convertDashboardCurrency(
  amount: number,
  fromCurrency: string,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
) {
  return convertAmt(amount, fromCurrency, displayCurrency, exchangeRateMap);
}

function buildFutureFlowWindows(
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
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  currentVisibleBalance: number,
): FutureFlowWindow[] {
  const today = new Date();

  function obligationDueAmount(obligation: {
    pendingAmount: number;
    installmentAmount?: number | null;
  }) {
    if (obligation.installmentAmount && obligation.installmentAmount > 0) {
      return Math.min(obligation.pendingAmount, obligation.installmentAmount);
    }
    return obligation.pendingAmount;
  }

  return [7, 15, 30].map((days) => {
    const horizon = addDays(today, days);
    let expectedInflow = 0;
    let expectedOutflow = 0;
    let receivableCount = 0;
    let payableCount = 0;
    let scheduledCount = 0;

    for (const obligation of obligations) {
      if (!obligation.dueDate || obligation.pendingAmount <= 0.009 || obligation.status === "paid") continue;
      const dueDate = parseDisplayDate(obligation.dueDate);
      if (dueDate < today || dueDate > horizon) continue;
      const convertedAmount = convertDashboardCurrency(
        obligationDueAmount(obligation),
        obligation.currencyCode,
        displayCurrency,
        exchangeRateMap,
      );
      scheduledCount += 1;
      if (obligation.direction === "receivable") {
        receivableCount += 1;
        expectedInflow += convertedAmount;
      } else {
        payableCount += 1;
        expectedOutflow += convertedAmount;
      }
    }

    for (const subscription of subscriptions) {
      if (subscription.status !== "active") continue;
      const dueDate = parseDisplayDate(subscription.nextDueDate);
      if (dueDate < today || dueDate > horizon) continue;
      scheduledCount += 1;
      expectedOutflow += convertDashboardCurrency(
        subscription.amount,
        subscription.currencyCode,
        displayCurrency,
        exchangeRateMap,
      );
    }

    for (const income of recurringIncome) {
      if (income.status !== "active") continue;
      const expectedDate = parseDisplayDate(income.nextExpectedDate);
      if (expectedDate < today || expectedDate > horizon) continue;
      scheduledCount += 1;
      expectedInflow += convertDashboardCurrency(
        income.amount,
        income.currencyCode,
        displayCurrency,
        exchangeRateMap,
      );
    }

    return {
      days,
      estimatedBalance: currentVisibleBalance + expectedInflow - expectedOutflow,
      expectedInflow,
      expectedOutflow,
      payableCount,
      receivableCount,
      scheduledCount,
    };
  });
}

type DashboardCategorySuggestion = {
  movementId: number;
  description: string;
  occurredAt: string;
  amount: number;
  suggestedCategoryId: number;
  suggestedCategoryName: string;
  confidence: number;
  matchedSamples: number;
  reasons: string[];
};

type DashboardProjectionModel = {
  expectedBalance: number;
  conservativeBalance: number;
  optimisticBalance: number;
  monteCarloLowBalance: number;
  monteCarloMedianBalance: number;
  monteCarloHighBalance: number;
  pressureThreshold: number;
  pressureProbability: number;
  committedInflow: number;
  committedOutflow: number;
  variableIncomeProjection: number;
  variableExpenseProjection: number;
  confidence: number;
  confidenceLabel: string;
  remainingDays: number;
};

type DashboardAnomalyFinding = {
  key: string;
  movementId: number;
  title: string;
  body: string;
  meta: string;
  level: "strong" | "review";
  score: number;
  reasons: string[];
};

type MovementPreviewSheetState = {
  title: string;
  subtitle: string;
  scopeLabel: string;
  emptyTitle?: string;
  emptyBody?: string;
  movements: DashboardMovementRow[];
  suggestion?: {
    movementId: number;
    description: string;
    categoryId: number;
    categoryName: string;
    confidencePct: number;
  };
};

function buildCategorySuggestions(
  movements: DashboardMovementRow[],
  categories: Array<{ id: number; name: string }>,
  ctx: ConversionCtx,
): DashboardCategorySuggestion[] {
  return buildCategorySuggestionCandidates<DashboardMovementRow>({
    movements,
    categories,
    isCashflow: isCategorizedCashflow,
    isIncomeLike: movementActsAsIncome,
    getAmount: (movement) => movementActsAsIncome(movement)
      ? incomeAmt(movement, ctx)
      : expenseAmt(movement, ctx),
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

function buildLearningFeedbackCategorySuggestions(
  movements: DashboardMovementRow[],
  feedback: NonNullable<DashboardAnalyticsBundle["learningFeedback"]>,
  categoryMap: Map<number, string>,
  ctx: ConversionCtx,
): DashboardCategorySuggestion[] {
  const accepted = feedback.filter((item) =>
    item.acceptedCategoryId != null &&
    (item.feedbackKind === "accepted_category_suggestion" || item.feedbackKind === "manual_category_change")
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
        .sort((a, b) => b.similarity - a.similarity || new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime());
      const best = matches[0];
      if (!best?.item.acceptedCategoryId) return null;
      const confidence = Math.max(0.62, Math.min(0.98, 0.56 + best.similarity * 0.26 + Math.min(matches.length, 4) * 0.035));
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

function buildMonthProjectionModel(
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
): DashboardProjectionModel {
  const today = new Date();
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
  const incomeVarianceBase = lastThirtyDays.reduce((sum, day) => sum + Math.pow(day.income - incomeDailyAvg, 2), 0) / Math.max(lastThirtyDays.length, 1);
  const expenseVarianceBase = lastThirtyDays.reduce((sum, day) => sum + Math.pow(day.expense - expenseDailyAvg, 2), 0) / Math.max(lastThirtyDays.length, 1);
  const incomeVolatility = incomeDailyAvg > 0.009 ? Math.min(0.35, Math.sqrt(incomeVarianceBase) / Math.max(incomeDailyAvg, 1)) : 0.28;
  const expenseVolatility = expenseDailyAvg > 0.009 ? Math.min(0.35, Math.sqrt(expenseVarianceBase) / Math.max(expenseDailyAvg, 1)) : 0.18;

  const variableIncomeProjection = incomeDailyAvg * remainingDays;

  // A4: corrección de patrón semanal - solo si hay >=3 semanas de historia
  const weeklyExpenseTotals = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const movement of movements.filter((m) => m.status === "posted" && m.movementType === "expense")) {
    const d = getDay(new Date(movement.occurredAt));
    const idx = d === 0 ? 6 : d - 1;
    weeklyExpenseTotals[idx].sum += expenseAmt(movement, ctx);
    weeklyExpenseTotals[idx].count += 1;
  }
  const weeksOfHistory = Math.floor(daysElapsed / 7);
  let patternWeightsApplied = false;
  let variableExpenseProjection = expenseDailyAvg * remainingDays;
  if (weeksOfHistory >= 3 && expenseDailyAvg > 0.009) {
    const avgByDay = weeklyExpenseTotals.map((d) => d.count > 0 ? d.sum / d.count : expenseDailyAvg);
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
      patternWeightsApplied = true;
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

function buildAnomalyFindings(
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
    const categoryLabel = movement?.categoryId != null ? categoryMap.get(movement.categoryId) ?? "Categoría" : "Sin categoría";
    const accountLabel = movement ? accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta" : "Cuenta";
    const title = movement?.description.trim() || (finding.kind === "probable_duplicate" ? "Posible duplicado" : "Movimiento");
    const baseline = finding.baselineAmount != null ? formatCurrency(finding.baselineAmount, ctx.displayCurrency) : null;
    const amountLabel = formatCurrency(amount, ctx.displayCurrency);
    const body = finding.kind === "description_spike"
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
      meta: `${finding.kind === "description_spike" ? accountLabel : categoryLabel} · ${amountLabel} · ${movement ? format(new Date(movement.occurredAt), "d MMM", { locale: es }) : "fecha reciente"}`,
      level: finding.level,
      score: finding.score,
      reasons: finding.reasons,
    };
  });
}

// --- Sub-components -----------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return <Text style={subStyles.sectionTitle}>{children}</Text>;
}

function formatPercentValue(value: number | null) {
  if (value === null) return "Sin dato";
  return `${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function MacroContextCard() {
  const { data, isLoading, error } = useBcrpMacroIndicatorsQuery();
  const inflation = data?.inflation12m;
  const referenceRate = data?.referenceRate;
  const period = inflation?.period || referenceRate?.period || "Último dato";

  return (
    <View style={subStyles.macroCard}>
      <View style={subStyles.macroHeader}>
        <View>
          <Text style={subStyles.macroEyebrow}>Contexto BCRP</Text>
          <Text style={subStyles.macroTitle}>{period}</Text>
        </View>
        <View style={subStyles.macroBadge}>
          <Text style={subStyles.macroBadgeText}>BCRPData</Text>
        </View>
      </View>

      <View style={subStyles.macroGrid}>
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Inflación 12m</Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(inflation?.value ?? null)}
          </Text>
        </View>
        <View style={subStyles.macroDivider} />
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Tasa ref.</Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(referenceRate?.value ?? null)}
          </Text>
        </View>
      </View>

      <Text style={subStyles.macroHint}>
        {error
          ? "No se pudo cargar el contexto macroeconómico."
          : "Indicadores oficiales usados como contexto; no modifican tus cálculos."}
      </Text>
    </View>
  );
}

// Mode toggle
function ModeToggle({
  mode, setMode, isPro,
}: { mode: string; setMode: (m: "simple" | "advanced") => void; isPro: boolean }) {
  return (
    <View style={subStyles.toggleRow}>
      <TouchableOpacity
        style={[subStyles.toggleBtn, mode === "simple" && subStyles.toggleBtnActive]}
        onPress={() => setMode("simple")}
      >
        <Text style={[subStyles.toggleText, mode === "simple" && subStyles.toggleTextActive]}>
          Simple
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[subStyles.toggleBtn, mode === "advanced" && subStyles.toggleBtnActive]}
        onPress={() => setMode("advanced")}
      >
        <Text style={[subStyles.toggleText, mode === "advanced" && subStyles.toggleTextActive]}>
          Avanzado
        </Text>
        {!isPro && <Text style={subStyles.proBadge}> PRO</Text>}
      </TouchableOpacity>
    </View>
  );
}

// Hero balance card (prominent net worth + period income/expense)
function HeroCard({
  netWorth, income, expense, currency, period, setPeriod,
  currencyOptions, onCurrencyChange,
}: {
  netWorth: number; income: number; expense: number; currency: string;
  period: Period; setPeriod: (p: Period) => void;
  currencyOptions: string[]; onCurrencyChange: (c: string) => void;
}) {
  const net = income - expense;
  const allPeriods: Period[] = ["today", "week", "month", "last_30"];
  return (
    <View style={subStyles.heroCard}>
      {/* Top row: period pills + currency pills */}
      <View style={subStyles.heroTopRow}>
        <View style={subStyles.heroPeriodRow}>
          {allPeriods.map((p) => (
            <TouchableOpacity
              key={p}
              style={[subStyles.heroPeriodBtn, period === p && subStyles.heroPeriodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[subStyles.heroPeriodText, period === p && subStyles.heroPeriodTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {currencyOptions.length > 1 && (
          <View style={subStyles.heroCurrencyRow}>
            {currencyOptions.map((c) => (
              <TouchableOpacity
                key={c}
                style={[subStyles.heroCurrencyBtn, currency === c && subStyles.heroCurrencyBtnActive]}
                onPress={() => onCurrencyChange(c)}
              >
                <Text style={[subStyles.heroCurrencyText, currency === c && subStyles.heroCurrencyTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Text style={subStyles.heroLabel}>Patrimonio neto</Text>
      <Text style={subStyles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(netWorth, currency)}
      </Text>

      {/* Net flow pill */}
      <View style={[subStyles.heroNetPill, { backgroundColor: net >= 0 ? COLORS.pine + "22" : COLORS.rosewood + "22" }]}>
        <Text style={[subStyles.heroNetText, { color: net >= 0 ? COLORS.pine : COLORS.rosewood }]}>
          {net >= 0 ? "+" : ""}{formatCurrency(net, currency)} neto
        </Text>
      </View>

      {/* Income / Expense row */}
      <View style={subStyles.heroFlow}>
        <View style={[subStyles.heroFlowItem, { borderRightWidth: 0.5, borderRightColor: GLASS.separator, paddingRight: SPACING.lg }]}>
          <View style={[subStyles.heroFlowIconWrap, { backgroundColor: COLORS.pine + "22" }]}>
            <View style={[subStyles.heroFlowDot, { backgroundColor: COLORS.pine }]} />
          </View>
          <Text style={subStyles.heroFlowLabel}>Ingresos</Text>
          <Text style={[subStyles.heroFlowAmt, { color: COLORS.pine }]}>
            {formatCurrency(income, currency)}
          </Text>
        </View>
        <View style={[subStyles.heroFlowItem, { paddingLeft: SPACING.lg }]}>
          <View style={[subStyles.heroFlowIconWrap, { backgroundColor: COLORS.rosewood + "22" }]}>
            <View style={[subStyles.heroFlowDot, { backgroundColor: COLORS.rosewood }]} />
          </View>
          <Text style={subStyles.heroFlowLabel}>Gastos</Text>
          <Text style={[subStyles.heroFlowAmt, { color: COLORS.rosewood }]}>
            {formatCurrency(expense, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// KPI row - 3 compact cards (income %, expense %, net)
function FlowRow({
  income, expense, net, currency, prevIncome, prevExpense,
}: {
  income: number; expense: number; net: number;
  currency: string; prevIncome: number; prevExpense: number;
}) {
  const incomePct = pctChange(income, prevIncome);
  const expPct = pctChange(expense, prevExpense);

  return (
    <View style={subStyles.kpiRow}>
      <FlowCard label="Ingresos" value={income} currency={currency} change={incomePct} higherIsGood accent={COLORS.pine} />
      <FlowCard label="Gastos" value={expense} currency={currency} change={expPct} higherIsGood={false} accent={COLORS.rosewood} />
      <FlowCard label="Neto" value={net} currency={currency} accent={net >= 0 ? COLORS.pine : COLORS.rosewood} />
    </View>
  );
}

function FlowCard({
  label, value, currency, change, higherIsGood, accent,
}: {
  label: string; value: number; currency: string;
  change?: number | null; higherIsGood?: boolean; accent: string;
}) {
  const isGood = change !== null && change !== undefined
    ? (higherIsGood ? change >= 0 : change <= 0)
    : null;
  const changeColor = isGood === null ? COLORS.storm : isGood ? COLORS.pine : COLORS.rosewood;
  const arrow = change == null ? null : change >= 0 ? "^" : "v";

  return (
    <View style={subStyles.kpiCard}>
      <View style={[subStyles.kpiAccent, { backgroundColor: accent + "14" }]} />
      <Text style={subStyles.kpiLabel}>{label}</Text>
      <Text style={[subStyles.kpiValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(value, currency)}
      </Text>
      {change !== null && change !== undefined ? (
        <Text style={[subStyles.kpiChange, { color: changeColor }]}>
          {arrow} {Math.abs(change).toFixed(1)}%
        </Text>
      ) : (
        <Text style={subStyles.kpiChangePlaceholder}> </Text>
      )}
    </View>
  );
}

// Mini bar chart (7 days) - toque abre detalle con ahorro del día y movimientos
function MiniBarChart({
  data,
  onSelectDay,
}: {
  data: DashboardChartDay[];
  onSelectDay: (day: DashboardChartDay) => void;
}) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const BAR_HEIGHT = 56;

  return (
    <Card>
      <SectionTitle>Últimos 7 días - flujo diario</SectionTitle>
      <Text style={subStyles.chronoHint}>
        Toca un día: verás ingresos, gastos, ahorro del día (neto) y cada movimiento que lo explica.
      </Text>
      <View style={subStyles.chartRow}>
        {data.map((d) => (
          <TouchableOpacity
            key={d.dateKey}
            style={subStyles.chartCol}
            onPress={() => onSelectDay(d)}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`${d.label}, ver detalle del día`}
          >
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT }]}>
              <View
                style={[
                  subStyles.chartBar,
                  { height: Math.max((d.income / maxVal) * BAR_HEIGHT, d.income > 0 ? 3 : 0), backgroundColor: COLORS.income },
                ]}
              />
              <View
                style={[
                  subStyles.chartBar,
                  { height: Math.max((d.expense / maxVal) * BAR_HEIGHT, d.expense > 0 ? 3 : 0), backgroundColor: COLORS.expense },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={subStyles.chartLegend}>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.income }]} />
          <Text style={subStyles.legendText}>Ingresos</Text>
        </View>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.expense }]} />
          <Text style={subStyles.legendText}>Gastos</Text>
        </View>
      </View>
    </Card>
  );
}

/** Una sola barra por día (gastos, ingresos o transferencias) con detalle al tocar */
function ChronologyStrip({
  title,
  hint,
  mode,
  data,
  barColor,
  currency,
  getValue,
  onSelectDay,
}: {
  title: string;
  hint: string;
  mode: DaySheetMode;
  data: DashboardChartDay[];
  barColor: string;
  currency: string;
  getValue: (d: DashboardChartDay) => number;
  onSelectDay: (day: DashboardChartDay, sheetMode: DaySheetMode) => void;
}) {
  const vals = data.map(getValue);
  const maxVal = Math.max(...vals, 1);
  const total = vals.reduce((a, b) => a + b, 0);
  const BAR_HEIGHT = 56;

  return (
    <Card>
      <View style={subStyles.chronoHeader}>
        <SectionTitle>{title}</SectionTitle>
        {total > 0 ? (
          <Text style={[subStyles.chronoTotal, { color: barColor }]}>
            {formatCurrency(total, currency)}
          </Text>
        ) : null}
      </View>
      <Text style={subStyles.chronoHint}>{hint}</Text>
      <View style={subStyles.chartRow}>
        {data.map((d) => {
          const v = getValue(d);
          return (
            <TouchableOpacity
              key={d.dateKey}
              style={subStyles.chartCol}
              onPress={() => onSelectDay(d, mode)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}, ${title}`}
            >
              <View style={[subStyles.chartBars, { height: BAR_HEIGHT, justifyContent: "flex-end" }]}>
                <View
                  style={{
                    width: "100%",
                    height: Math.max((v / maxVal) * BAR_HEIGHT, v > 0 ? 3 : 0),
                    backgroundColor: barColor,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                  }}
                />
              </View>
              <Text style={subStyles.chartLabel}>{d.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

function AccountsScroll({ accounts, onPress }: {
    accounts: { id: number; name: string; type: string; icon: string; currentBalance: number; currencyCode: string; color: string }[];
    onPress: (id: number) => void;
  }) {
  if (accounts.length === 0) return null;
  return (
    <View>
      <SectionTitle>Cuentas</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={subStyles.accountsRow}>
            {accounts.map((a) => {
              const Icon = getAccountIcon(a.icon, a.type);
              return (
              <TouchableOpacity
                key={a.id}
                style={subStyles.accountChip}
                onPress={() => onPress(a.id)}
                activeOpacity={0.75}
              >
                <View style={[subStyles.accountChipIcon, { backgroundColor: a.color + "33" }]}>
                  <Icon size={14} color={a.color} />
                </View>
                <Text style={subStyles.accountChipName} numberOfLines={1}>{a.name}</Text>
                <Text style={[subStyles.accountChipBalance, a.currentBalance < 0 && { color: COLORS.expense }]}>
                  {formatCurrency(a.currentBalance, a.currencyCode)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// Upcoming section (obligations + subscriptions, next 30 days)
function UpcomingSection({
  obligations, subscriptions, recurringIncome, router,
}: {
  obligations: { id: number; title: string; direction?: string; dueDate: string | null; pendingAmount: number; currencyCode: string }[];
  subscriptions: { id: number; name: string; nextDueDate: string; amount: number; currencyCode: string }[];
  recurringIncome: { id: number; name: string; nextExpectedDate: string; amount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const now = new Date();
  const limit = addDays(now, UPCOMING_DAYS);

  type UpcomingItem = {
    key: string;
    label: string;
    amount: number;
    currency: string;
    date: Date;
    kind: "obligation" | "subscription" | "income";
    flow: "in" | "out";
    badge: string;
    onPress: () => void;
  };
  const items: UpcomingItem[] = [];

  for (const ob of obligations) {
    if (!ob.dueDate) continue;
    const d = new Date(ob.dueDate);
    if (d >= now && d <= limit) {
      items.push({
        key: `ob-${ob.id}`, label: ob.title, amount: ob.pendingAmount,
        currency: ob.currencyCode, date: d, kind: "obligation",
        flow: ob.direction === "receivable" ? "in" : "out",
        badge: ob.direction === "receivable" ? "Cobro" : "Deuda",
        onPress: () => router.push(`/obligation/${ob.id}`),
      });
    }
  }
  for (const sub of subscriptions) {
    const d = new Date(sub.nextDueDate);
    if (d >= now && d <= limit) {
      items.push({
        key: `sub-${sub.id}`, label: sub.name, amount: sub.amount,
        currency: sub.currencyCode, date: d, kind: "subscription",
        flow: "out",
        badge: "Suscripción",
        onPress: () => router.push(`/subscription/${sub.id}`),
      });
    }
  }
  for (const income of recurringIncome) {
    const d = new Date(income.nextExpectedDate);
    if (d >= now && d <= limit) {
      items.push({
        key: `ri-${income.id}`, label: `Ingreso fijo · ${income.name}`, amount: income.amount,
        currency: income.currencyCode, date: d, kind: "income",
        flow: "in",
        badge: "Ingreso",
        onPress: () => router.push("/recurring-income"),
      });
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  const visible = items.slice(0, 5);
  const inflowCount = visible.filter((item) => item.flow === "in").length;
  const outflowCount = visible.filter((item) => item.flow === "out").length;

  if (visible.length === 0) return null;
  return (
    <Card>
      <Text style={subStyles.upcomingKicker}>Agenda próxima</Text>
      <SectionTitle>Compromisos y cobros esperados</SectionTitle>
      <Text style={subStyles.upcomingIntro}>
        Lo que ya tiene fecha en los próximos {UPCOMING_DAYS} días. Sirve para revisar agenda, no para analizar el historial.
      </Text>
      <View style={subStyles.upcomingSummaryRow}>
        <View style={subStyles.upcomingSummaryCard}>
          <Text style={subStyles.upcomingSummaryLabel}>Entra</Text>
          <Text style={[subStyles.upcomingSummaryValue, { color: COLORS.income }]}>{inflowCount}</Text>
        </View>
        <View style={subStyles.upcomingSummaryCard}>
          <Text style={subStyles.upcomingSummaryLabel}>Sale</Text>
          <Text style={[subStyles.upcomingSummaryValue, { color: COLORS.expense }]}>{outflowCount}</Text>
        </View>
      </View>
      <View style={subStyles.upcomingList}>
        {visible.map((item) => (
          <TouchableOpacity key={item.key} style={subStyles.upcomingRow} onPress={item.onPress} activeOpacity={0.75}>
            <View style={subStyles.upcomingRowTop}>
              <View style={subStyles.upcomingLeft}>
                <View style={[
                  subStyles.upcomingBadge,
                  item.flow === "in" ? subStyles.upcomingBadgeIncome : item.kind === "subscription" ? subStyles.upcomingBadgeSubscription : subStyles.upcomingBadgeObligation,
                ]}>
                  <Text style={[
                    subStyles.upcomingBadgeText,
                    item.flow === "in" ? subStyles.upcomingBadgeTextIncome : item.kind === "subscription" ? subStyles.upcomingBadgeTextSubscription : subStyles.upcomingBadgeTextObligation,
                  ]}>
                    {item.badge}
                  </Text>
                </View>
                <Text style={subStyles.upcomingLabel} numberOfLines={2}>{item.label}</Text>
              </View>
              <View style={[
                subStyles.upcomingAmountPill,
                item.flow === "in" ? subStyles.upcomingAmountPillIncome : subStyles.upcomingAmountPillOut,
              ]}>
                <Text style={[
                  subStyles.upcomingAmount,
                  item.flow === "in" ? subStyles.upcomingAmountIncome : subStyles.upcomingAmountOut,
                ]}>
                  {item.flow === "in" ? "+" : "-"}
                  {formatCurrency(item.amount, item.currency)}
                </Text>
              </View>
            </View>
            <View style={subStyles.upcomingMetaRow}>
              <Text style={subStyles.upcomingDate}>{format(item.date, "d MMM", { locale: es })}</Text>
              <Text style={subStyles.upcomingDate}>En {Math.max(0, differenceInDays(item.date, now))} días</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

// Budget alerts section
function BudgetsSection({
  budgets, router,
}: {
  budgets: { id: number; name: string; usedPercent: number; alertPercent: number; spentAmount: number; limitAmount: number; currencyCode: string; isOverLimit: boolean; isNearLimit: boolean; periodStart: string; periodEnd: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const today = new Date();

  // Tier 3: proyección de burn rate - presupuestos que aún no alertaron pero van a exceder
  const burnRateTier = budgets.filter((b) => {
    if (b.isOverLimit || b.isNearLimit) return false;
    const periodEnd = parseDisplayDate(b.periodEnd);
    const periodStart = parseDisplayDate(b.periodStart);
    const daysLeft = Math.max(1, differenceInDays(periodEnd, today));
    const daysTotal = Math.max(1, differenceInDays(periodEnd, periodStart));
    const daysElapsed = Math.max(1, daysTotal - daysLeft);
    const dailyBurn = b.spentAmount / daysElapsed;
    const projectedSpend = b.spentAmount + dailyBurn * daysLeft;
    return projectedSpend / b.limitAmount > 0.95;
  });

  const alert = budgets.filter((b) => b.isOverLimit || b.isNearLimit);
  const visible = [...alert, ...burnRateTier.filter((b) => !alert.find((a) => a.id === b.id))];
  if (visible.length === 0) return null;

  return (
    <View>
      <SectionTitle>Presupuestos con alerta</SectionTitle>
      {visible.map((b) => {
        const isBurnTier = !b.isOverLimit && !b.isNearLimit;
        const periodEnd = parseDisplayDate(b.periodEnd);
        const periodStart = parseDisplayDate(b.periodStart);
        const daysLeft = Math.max(1, differenceInDays(periodEnd, today));
        const daysTotal = Math.max(1, differenceInDays(periodEnd, periodStart));
        const daysElapsed = Math.max(1, daysTotal - daysLeft);
        const dailyBurn = b.spentAmount / daysElapsed;
        const projectedPercent = Math.min(140, ((b.spentAmount + dailyBurn * daysLeft) / b.limitAmount) * 100);
        const daysUntilLimit = dailyBurn > 0 ? Math.max(0, Math.round((b.limitAmount / dailyBurn) - daysElapsed)) : 999;

        return (
          <TouchableOpacity
            key={b.id}
            style={subStyles.budgetRow}
            onPress={() => router.push("/(app)/budgets?from=dashboard")}
            activeOpacity={0.8}
          >
            <View style={subStyles.budgetHeader}>
              <Text style={subStyles.budgetName} numberOfLines={1}>{b.name}</Text>
              <Text style={[subStyles.budgetPct, b.isOverLimit ? { color: COLORS.expense } : isBurnTier ? { color: COLORS.gold } : { color: COLORS.warning }]}>
                {Math.round(b.usedPercent)}%
              </Text>
            </View>
            <View style={{ position: "relative" }}>
              <ProgressBar percent={b.usedPercent} alertPercent={b.alertPercent} height={6} />
              {isBurnTier && projectedPercent > b.usedPercent ? (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: `${Math.min(b.usedPercent, 98)}%` as unknown as number,
                    width: `${Math.min(projectedPercent - b.usedPercent, 100 - b.usedPercent)}%` as unknown as number,
                    height: 6,
                    backgroundColor: COLORS.gold + "66",
                    borderRadius: 3,
                  }}
                />
              ) : null}
            </View>
            <Text style={subStyles.budgetMeta}>
              {isBurnTier
                ? `A este ritmo: excede en ${daysUntilLimit}d · ${formatCurrency(b.spentAmount, b.currencyCode)} de ${formatCurrency(b.limitAmount, b.currencyCode)}`
                : `${formatCurrency(b.spentAmount, b.currencyCode)} de ${formatCurrency(b.limitAmount, b.currencyCode)}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// --- Simple widgets: ReceivableLeaders + PayableLeaders -----------------------

function ReceivableLeaders({
  obligations, router,
}: {
  obligations: { id: number; title: string; direction: string; status: string; counterparty: string; pendingAmount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const items = obligations
    .filter((o) => o.direction === "receivable" && o.status === "active")
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 3);
  if (items.length === 0) return null;

  return (
    <View style={[subStyles.leadersCard, { borderColor: COLORS.pine + "33" }]}>
      <Text style={[subStyles.leadersTitle, { color: COLORS.pine }]}>Por cobrar</Text>
      {items.map((o, i) => (
        <TouchableOpacity
          key={o.id}
          style={[subStyles.leadersRow, i < items.length - 1 && subStyles.leadersSep]}
          onPress={() => router.push(`/obligation/${o.id}`)}
          activeOpacity={0.75}
        >
          <Text style={subStyles.leadersName} numberOfLines={1}>{o.counterparty}</Text>
          <Text style={[subStyles.leadersAmt, { color: COLORS.pine }]}>
            {formatCurrency(o.pendingAmount, o.currencyCode)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PayableLeaders({
  obligations, router,
}: {
  obligations: { id: number; title: string; direction: string; status: string; counterparty: string; pendingAmount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const items = obligations
    .filter((o) => o.direction === "payable" && o.status === "active")
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 3);
  if (items.length === 0) return null;

  return (
    <View style={[subStyles.leadersCard, { borderColor: COLORS.rosewood + "33" }]}>
      <Text style={[subStyles.leadersTitle, { color: COLORS.rosewood }]}>Por pagar</Text>
      {items.map((o, i) => (
        <TouchableOpacity
          key={o.id}
          style={[subStyles.leadersRow, i < items.length - 1 && subStyles.leadersSep]}
          onPress={() => router.push(`/obligation/${o.id}`)}
          activeOpacity={0.75}
        >
          <Text style={subStyles.leadersName} numberOfLines={1}>{o.counterparty}</Text>
          <Text style={[subStyles.leadersAmt, { color: COLORS.rosewood }]}>
            {formatCurrency(o.pendingAmount, o.currencyCode)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function LeadersRow({
  obligations, router,
}: {
  obligations: { id: number; title: string; direction: string; status: string; counterparty: string; pendingAmount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const hasReceivable = obligations.some((o) => o.direction === "receivable" && o.status === "active");
  const hasPayable = obligations.some((o) => o.direction === "payable" && o.status === "active");
  if (!hasReceivable && !hasPayable) return null;

  return (
    <View style={subStyles.leadersRowContainer}>
      <ReceivableLeaders obligations={obligations} router={router} />
      <PayableLeaders obligations={obligations} router={router} />
    </View>
  );
}

// Category comparison (current vs prev period) - Simple widget
function CategoryComparison({
  catTotals, prevCatTotals, categories, currency,
}: {
  catTotals: Map<number | null, number>;
  prevCatTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  currency: string;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  // Collect all category keys that appear in either period
  const allKeys = new Set<number | null>([...catTotals.keys(), ...prevCatTotals.keys()]);
  const entries = Array.from(allKeys)
    .map((id) => ({
      name: catMap.get(id ?? -1) ?? "Sin categoría",
      current: catTotals.get(id) ?? 0,
      prev: prevCatTotals.get(id) ?? 0,
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5);

  if (entries.length === 0) return null;
  const maxVal = Math.max(...entries.flatMap((e) => [e.current, e.prev]), 1);

  return (
    <Card>
      <SectionTitle>Comparación de gastos por categoría</SectionTitle>
      <View style={subStyles.catCompLegend}>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.rosewood }]} />
          <Text style={subStyles.legendText}>Actual</Text>
        </View>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.storm }]} />
          <Text style={subStyles.legendText}>Anterior</Text>
        </View>
      </View>
      {entries.map((e, i) => (
        <View key={i} style={subStyles.catCompRow}>
          <Text style={subStyles.catCompName} numberOfLines={1}>{e.name}</Text>
          <View style={subStyles.catCompBars}>
            <View style={subStyles.catCompBarTrack}>
              <View style={[subStyles.catCompBarFill, { width: `${(e.current / maxVal) * 100}%`, backgroundColor: COLORS.rosewood + "99" }]} />
            </View>
            <View style={subStyles.catCompBarTrack}>
              <View style={[subStyles.catCompBarFill, { width: `${(e.prev / maxVal) * 100}%`, backgroundColor: COLORS.storm + "66" }]} />
            </View>
          </View>
          <Text style={subStyles.catCompAmt}>{formatCurrency(e.current, currency)}</Text>
        </View>
      ))}
    </Card>
  );
}

// --- New visual widgets -------------------------------------------------------

function AccountsBreakdown({
  accounts,
  displayCurrency,
  baseCurrency,
  exchangeRateMap,
}: {
  accounts: { id: number; name: string; color: string; currentBalance: number; currentBalanceInBaseCurrency?: number | null; isArchived: boolean; includeInNetWorth: boolean }[];
  displayCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
}) {
  const eligible = accounts.filter((a) => !a.isArchived && a.includeInNetWorth);
  if (eligible.length === 0) return null;

  const withBalances = eligible.map((a) => {
    const raw = a.currentBalanceInBaseCurrency ?? a.currentBalance;
    const converted = Math.max(convertAmt(raw, baseCurrency, displayCurrency, exchangeRateMap), 0);
    return { ...a, converted };
  });

  const total = withBalances.reduce((s, a) => s + a.converted, 0);
  if (total <= 0) return null;

  const sorted = [...withBalances].sort((a, b) => b.converted - a.converted);
  const top5 = sorted.slice(0, 5).filter((a) => a.converted > 0);
  const otherTotal = sorted.slice(5).reduce((s, a) => s + a.converted, 0);

  const segments: RingSegment[] = top5.map((a) => ({
    key: String(a.id),
    value: a.converted,
    color: a.color,
  }));
  if (otherTotal > 0) {
    segments.push({ key: "other", value: otherTotal, color: COLORS.storm + "66" });
  }

  return (
    <Card>
      <SectionTitle>Distribución por cuenta</SectionTitle>
      <View style={subStyles.breakdownWrap}>
        <RingChart segments={segments} size={108} thickness={20} />
        <View style={subStyles.breakdownLegend}>
          {top5.map((a) => (
            <View key={a.id} style={subStyles.breakdownItem}>
              <View style={[subStyles.breakdownDot, { backgroundColor: a.color }]} />
              <Text style={subStyles.breakdownName} numberOfLines={1}>{a.name}</Text>
              <Text style={[subStyles.breakdownPct, { color: a.color }]}>
                {((a.converted / total) * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
          {otherTotal > 0 && (
            <View style={subStyles.breakdownItem}>
              <View style={[subStyles.breakdownDot, { backgroundColor: COLORS.storm }]} />
              <Text style={subStyles.breakdownName}>Otros</Text>
              <Text style={[subStyles.breakdownPct, { color: COLORS.storm }]}>
                {((otherTotal / total) * 100).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}

function SavingsTrendCard({
  monthlyPulse,
  currency,
}: {
  monthlyPulse: { label: string; income: number; expense: number }[];
  currency: string;
}) {
  const netValues = monthlyPulse.map((m) => m.income - m.expense);
  if (netValues.every((v) => v === 0)) return null;

  const lastNet = netValues[netValues.length - 1];
  const firstNet = netValues[0];
  const trendUp = lastNet >= firstNet;

  return (
    <Card>
      <View style={subStyles.trendHeader}>
        <SectionTitle>Ahorro mensual (6 meses)</SectionTitle>
        <Text style={[subStyles.trendBadge, { color: trendUp ? COLORS.pine : COLORS.rosewood }]}>
          {trendUp ? "^" : "v"} tendencia
        </Text>
      </View>
      <View style={subStyles.trendBody}>
        <SparkLine
          values={netValues}
          width={156}
          height={64}
          positiveColor={COLORS.pine}
          negativeColor={COLORS.rosewood}
        />
        <View style={subStyles.trendLegend}>
          {monthlyPulse.map((m, i) => {
            const net = m.income - m.expense;
            return (
              <View key={i} style={subStyles.trendRow}>
                <Text style={subStyles.trendLabel}>{m.label}</Text>
                <Text style={[subStyles.trendNet, { color: net >= 0 ? COLORS.pine : COLORS.rosewood }]}>
                  {net >= 0 ? "+" : ""}{formatCurrency(net, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

// --- Advanced widgets ---------------------------------------------------------

function ReviewInbox({
  movements,
  subscriptions,
  obligations,
  router,
  onOpenMovementIssue,
}: {
  movements: DashboardMovementRow[];
  subscriptions: Array<{ id: number; name: string; accountId?: number | null; nextDueDate: string; status: string }>;
  obligations: Array<{
    id: number;
    title: string;
    pendingAmount: number;
    dueDate: string | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    lastPaymentDate?: string | null;
    startDate?: string;
    status: string;
  }>;
  router: ReturnType<typeof useRouter>;
  onOpenMovementIssue?: (key: "uncategorized" | "pending" | "duplicates") => void;
}) {
  const review = useMemo(
    () => buildReviewInboxSnapshot(movements, subscriptions, obligations),
    [movements, obligations, subscriptions],
  );

  const items = [
    { key: "uncategorized", count: review.uncategorizedCount, title: "Sin categoria", detail: "Movimientos aplicados que aun no clasificas.", route: "/movements", icon: Tag, tone: COLORS.warning },
    { key: "pending", count: review.pendingMovementsCount, title: "Pendientes de aplicar", detail: "Todavia no impactan el saldo real.", route: "/movements", icon: Clock, tone: COLORS.warning },
    { key: "duplicates", count: review.duplicateExpenseGroups, title: "Posibles duplicados", detail: "Fecha cercana, monto parecido y texto similar.", route: "/movements", icon: AlertTriangle, tone: COLORS.warning },
    { key: "subscriptions", count: review.subscriptionsAttentionCount, title: "Suscripciones por revisar", detail: "Sin cuenta ligada o con vencimiento pasado.", route: "/subscriptions", icon: Bell, tone: COLORS.secondary },
    { key: "without-plan", count: review.obligationsWithoutPlanCount, title: "Cartera sin plan claro", detail: "Saldo vivo sin cuota ni fecha concreta.", route: "/obligations", icon: Banknote, tone: COLORS.warning },
    { key: "stale", count: review.staleObligationsCount, title: "Cartera sin actividad reciente", detail: "Mas de 50 dias sin eventos nuevos.", route: "/obligations", icon: AlertCircle, tone: COLORS.storm },
    { key: "overdue", count: review.overdueObligationsCount, title: "Cobros o pagos vencidos", detail: "Compromisos con fecha pasada y saldo pendiente.", route: "/obligations", icon: AlertTriangle, tone: COLORS.expense },
  ].filter((item) => item.count > 0);

  return (
    <Card>
      <SectionTitle>Por revisar</SectionTitle>
      {items.length === 0 ? (
        <View style={subStyles.richEmptyState}>
          <Sparkles size={18} color={COLORS.income} />
          <Text style={subStyles.richEmptyTitle}>Bandeja al dia</Text>
          <Text style={subStyles.richEmptyBody}>No vemos pendientes fuertes en categorias, duplicados, suscripciones ni cartera.</Text>
        </View>
      ) : (
        <View style={subStyles.reviewList}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={subStyles.reviewItem}
              onPress={() => {
                if ((item.key === "uncategorized" || item.key === "pending" || item.key === "duplicates") && onOpenMovementIssue) {
                  onOpenMovementIssue(item.key);
                  return;
                }
                router.push(item.route as never);
              }}
              activeOpacity={0.82}
            >
              <View style={[subStyles.reviewItemIconWrap, { backgroundColor: item.tone + "16" }]}>
                <item.icon size={15} color={item.tone} />
              </View>
              <View style={subStyles.reviewItemCopy}>
                <Text style={subStyles.reviewItemTitle}>{item.title}</Text>
                <Text style={subStyles.reviewItemBody}>{item.detail}</Text>
              </View>
              <View style={subStyles.reviewItemRight}>
                <Text style={subStyles.reviewItemCount}>{item.count}</Text>
                <ArrowRight size={14} color={COLORS.storm} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Card>
  );
}

function FutureFlowPreview({
  obligations,
  subscriptions,
  recurringIncome,
  displayCurrency,
  exchangeRateMap,
  currentVisibleBalance,
}: {
  obligations: Array<{ direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string }>;
  subscriptions: Array<{ amount: number; currencyCode: string; nextDueDate: string; status: string }>;
  recurringIncome: Array<{ amount: number; currencyCode: string; nextExpectedDate: string; status: string }>;
  displayCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
}) {
  const windows = useMemo(
    () => buildFutureFlowWindows(obligations, subscriptions, recurringIncome, displayCurrency, exchangeRateMap, currentVisibleBalance),
    [currentVisibleBalance, displayCurrency, exchangeRateMap, obligations, recurringIncome, subscriptions],
  );

  return (
    <Card>
      <SectionTitle>Flujo futuro</SectionTitle>
      <View style={subStyles.futureWindowList}>
        {windows.map((window) => (
          <View key={window.days} style={subStyles.futureWindowCard}>
            <View style={subStyles.futureWindowTop}>
              <Text style={subStyles.futureWindowLabel}>Proximos {window.days} dias</Text>
              <Text style={[subStyles.futureWindowNet, { color: window.expectedInflow >= window.expectedOutflow ? COLORS.income : COLORS.expense }]}>
                {formatCurrency(window.expectedInflow - window.expectedOutflow, displayCurrency)}
              </Text>
            </View>
            <View style={subStyles.futureWindowStats}>
              <Text style={subStyles.futureWindowMeta}>Entra {formatCurrency(window.expectedInflow, displayCurrency)}</Text>
              <Text style={subStyles.futureWindowMeta}>Sale {formatCurrency(window.expectedOutflow, displayCurrency)}</Text>
            </View>
            <Text style={subStyles.futureWindowBalance}>Caja estimada: {formatCurrency(window.estimatedBalance, displayCurrency)}</Text>
            <Text style={subStyles.futureWindowHint}>{window.receivableCount} por recibir · {window.payableCount} por pagar · {window.scheduledCount} compromisos</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ProjectionFormulaBreakdown({
  activeCurrency,
  currentVisibleBalance,
  visibleBalanceLabel,
  visibleAccountSummary,
  committedNet,
  variableNet,
  expectedBalance,
}: {
  activeCurrency: string;
  currentVisibleBalance: number;
  visibleBalanceLabel: string;
  visibleAccountSummary: string;
  committedNet: number;
  variableNet: number;
  expectedBalance: number;
}) {
  const rows = [
    { label: "Saldo visible", detail: visibleBalanceLabel, amount: currentVisibleBalance, tone: "base" as const },
    { label: "Agenda comprometida", detail: "Ingresos fijos, obligaciones y suscripciones", amount: committedNet, tone: committedNet >= 0 ? "positive" as const : "negative" as const },
    { label: "Ritmo variable", detail: "Proyección desde tu ritmo reciente", amount: variableNet, tone: variableNet >= 0 ? "positive" as const : "negative" as const },
  ];

  return (
    <View style={subStyles.projectionFormulaBox}>
      <View style={subStyles.projectionFormulaHeader}>
        <Text style={subStyles.projectionFormulaKicker}>Fórmula del cierre</Text>
        <Text style={subStyles.projectionFormulaTotal}>{formatCurrency(expectedBalance, activeCurrency)}</Text>
      </View>
      <Text style={subStyles.projectionFormulaSummary}>{visibleAccountSummary}</Text>
      <View style={subStyles.projectionFormulaRows}>
        {rows.map((row) => (
          <View key={row.label} style={subStyles.projectionFormulaRow}>
            <View style={subStyles.projectionFormulaCopy}>
              <Text style={subStyles.projectionFormulaLabel}>{row.label}</Text>
              <Text style={subStyles.projectionFormulaDetail}>{row.detail}</Text>
            </View>
            <Text
              style={[
                subStyles.projectionFormulaAmount,
                row.tone === "positive" && subStyles.projectionFormulaAmountPositive,
                row.tone === "negative" && subStyles.projectionFormulaAmountNegative,
              ]}
            >
              {row.amount >= 0 && row.tone !== "base" ? "+" : ""}{formatCurrency(row.amount, activeCurrency)}
            </Text>
          </View>
        ))}
      </View>
      <View style={subStyles.projectionFormulaEquals}>
        <Text style={subStyles.projectionFormulaEqualsText}>Resultado esperado</Text>
        <Text style={subStyles.projectionFormulaEqualsAmount}>{formatCurrency(expectedBalance, activeCurrency)}</Text>
      </View>
    </View>
  );
}

type ExplanationTone = "positive" | "warning" | "danger";

function explanationToneLabel(tone: ExplanationTone) {
  if (tone === "positive") return "Lectura favorable";
  if (tone === "danger") return "Lectura en presión";
  return "Lectura para vigilar";
}

function ExplanationIntro({ kicker, summary }: { kicker: string; summary: string }) {
  return (
    <View style={subStyles.explanationIntroCard}>
      <Text style={subStyles.explanationKicker}>{kicker}</Text>
      <Text style={subStyles.explanationSummary}>{summary}</Text>
    </View>
  );
}

function ExplanationVisualSummary({
  tone,
  actionsCount,
  detailCount,
}: {
  tone: ExplanationTone;
  actionsCount: number;
  detailCount: number;
}) {
  const urgency = tone === "danger" ? 92 : tone === "warning" ? 66 : 34;
  const clarity = Math.min(100, Math.max(28, detailCount * 16));
  const actionStrength = Math.min(100, Math.max(actionsCount > 0 ? 42 : 18, actionsCount * 44));
  const toneColor = tone === "positive" ? COLORS.primary : tone === "danger" ? "#FF9DBA" : COLORS.gold;
  const items = [
    { label: "Lectura", value: urgency, caption: explanationToneLabel(tone), color: toneColor },
    { label: "Claridad", value: clarity, caption: `${detailCount} puntos`, color: COLORS.secondary },
    { label: "Acción", value: actionStrength, caption: actionsCount > 0 ? `${actionsCount} CTA` : "solo lectura", color: COLORS.primary },
  ];

  return (
    <View style={subStyles.explanationVisualCard}>
      <View style={subStyles.explanationVisualHeader}>
        <Sparkles size={16} color={toneColor} />
        <View style={{ flex: 1 }}>
          <Text style={subStyles.explanationVisualTitle}>Lectura rápida</Text>
          <Text style={subStyles.explanationVisualHint}>Toca las tarjetas de abajo para abrir solo el detalle que necesitas.</Text>
        </View>
      </View>
      <View style={subStyles.explanationVisualGrid}>
        {items.map((item) => (
          <View key={item.label} style={subStyles.explanationVisualMetric}>
            <Text style={subStyles.explanationVisualMetricLabel}>{item.label}</Text>
            <Text style={[subStyles.explanationVisualMetricValue, { color: item.color }]}>{item.caption}</Text>
            <View style={subStyles.explanationVisualTrack}>
              <View style={[subStyles.explanationVisualFill, { width: `${item.value}%` as any, backgroundColor: item.color }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ExplanationSection({
  index,
  title,
  items,
}: {
  index: string;
  title: string;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={[subStyles.explanationSectionCard, !expanded && subStyles.explanationSectionCardCollapsed]}
      onPress={() => setExpanded((value) => !value)}
      activeOpacity={0.86}
    >
      <View style={subStyles.explanationSectionHeader}>
        <View style={subStyles.explanationStepBadge}>
          <Text style={subStyles.explanationStepBadgeText}>{index}</Text>
        </View>
        <Text style={subStyles.explanationSectionTitle}>{title}</Text>
        <View style={[subStyles.explanationChevron, expanded && subStyles.explanationChevronOpen]}>
          <ArrowRight size={15} color={COLORS.storm} />
        </View>
      </View>
      {expanded ? (
        <View style={subStyles.explanationBulletList}>
          {items.map((item) => (
            <View key={item} style={subStyles.explanationBulletRow}>
              <View style={subStyles.explanationBulletDot} />
              <Text style={subStyles.explanationBulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={subStyles.explanationCollapsedHint}>{items[0]}</Text>
      )}
    </TouchableOpacity>
  );
}

function ExplanationResult({
  tone,
  items,
}: {
  tone: ExplanationTone;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={subStyles.explanationResultSection}>
      <TouchableOpacity style={subStyles.explanationSectionHeader} onPress={() => setExpanded((value) => !value)} activeOpacity={0.86}>
        <View style={subStyles.explanationStepBadge}>
          <Text style={subStyles.explanationStepBadgeText}>03</Text>
        </View>
        <Text style={subStyles.explanationSectionTitle}>Qué significa este resultado</Text>
        <View style={[subStyles.explanationChevron, expanded && subStyles.explanationChevronOpen]}>
          <ArrowRight size={15} color={COLORS.storm} />
        </View>
      </TouchableOpacity>
      <View
        style={[
          subStyles.resultMeaningCard,
          tone === "positive"
            ? subStyles.resultMeaningCardPositive
            : tone === "danger"
              ? subStyles.resultMeaningCardDanger
              : subStyles.resultMeaningCardWarning,
        ]}
      >
        <View style={subStyles.resultMeaningHeader}>
          <View
            style={[
              subStyles.resultMeaningIndicator,
              tone === "positive"
                ? subStyles.resultMeaningIndicatorPositive
                : tone === "danger"
                  ? subStyles.resultMeaningIndicatorDanger
                  : subStyles.resultMeaningIndicatorWarning,
            ]}
          />
          <Text
            style={[
              subStyles.resultMeaningTone,
              tone === "positive"
                ? subStyles.resultMeaningTonePositive
                : tone === "danger"
                  ? subStyles.resultMeaningToneDanger
                  : subStyles.resultMeaningToneWarning,
            ]}
          >
            {explanationToneLabel(tone)}
          </Text>
        </View>
        {expanded ? (
          <View style={subStyles.explanationBulletList}>
            {items.map((item) => (
              <View key={item} style={subStyles.explanationBulletRow}>
                <View style={subStyles.explanationBulletDotMuted} />
                <Text style={subStyles.explanationBulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={subStyles.explanationCollapsedHint}>{items[0]}</Text>
        )}
      </View>
    </View>
  );
}

function ExplanationActions({
  actions,
}: {
  actions: Array<{ label: string; onPress: () => void }>;
}) {
  if (actions.length === 0) return null;
  return (
    <View style={subStyles.explanationActionsSection}>
      <Text style={subStyles.explanationActionsTitle}>Qué puedes hacer ahora</Text>
      <View style={subStyles.executiveActionList}>
        {actions.map((action) => (
          <TouchableOpacity key={action.label} style={subStyles.executiveActionBtn} onPress={action.onPress} activeOpacity={0.84}>
            <Text style={subStyles.executiveActionBtnText}>{action.label}</Text>
            <ArrowRight size={15} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function LearningPanel({
  movements,
  projectionModel,
  activeCurrency,
  weeklyPatternInsight,
  categoryConcentration,
  categorySuggestionsCount,
  anomalySignalsCount,
  acceptedFeedbackCount,
  cashCushionDays,
  cashCushionLabel,
}: {
  movements: DashboardMovementRow[];
  projectionModel: DashboardProjectionModel;
  activeCurrency: string;
  weeklyPatternInsight: { dayLabel: string; share: number } | null;
  categoryConcentration: { label: string; topCategory: string | null; topShare: number | null };
  categorySuggestionsCount: number;
  anomalySignalsCount: number;
  acceptedFeedbackCount: number;
  cashCushionDays: number;
  cashCushionLabel: string;
}) {
  const learning = useMemo(() => {
    const posted = movements.filter((movement) => movement.status === "posted");
    const useful = posted.filter((movement) => movement.movementType !== "obligation_opening");
    const categorizedBase = useful.filter(isCategorizedCashflow);
    const categorizedCount = categorizedBase.filter((movement) => movement.categoryId != null).length;
    const categorizedRate = categorizedBase.length > 0 ? categorizedCount / categorizedBase.length : 0;
    const oldest = useful[useful.length - 1];
    const historyDays = oldest ? Math.max(1, differenceInDays(new Date(), new Date(oldest.occurredAt))) : 0;
    const readinessScore = Math.round(Math.min(1, useful.length / 120) * 40 + Math.min(1, historyDays / 120) * 25 + categorizedRate * 35);
    const phases = [
      { step: 1, title: "Base", description: "La app ya puede leer totales y ritmos simples.", progress: Math.min(1, useful.length / 10) },
      { step: 2, title: "Patrones", description: "Empieza a distinguir hábitos y semanas raras.", progress: Math.min(1, Math.min(useful.length / 30, historyDays / 30)) },
      { step: 3, title: "Proyecciones", description: "Ya puede estimar presión futura con más confianza.", progress: Math.min(1, Math.min(useful.length / 70, historyDays / 60, categorizedRate / 0.6)) },
      { step: 4, title: "Alertas finas", description: "Lista para señales más finas y anomalías.", progress: Math.min(1, Math.min(useful.length / 120, historyDays / 120, categorizedRate / 0.82)) },
    ];
    const descriptionGroups = new Map<string, { label: string; count: number }>();
    for (const movement of useful) {
      const normalized = normalizeAnalyticsText(movement.description ?? "");
      if (normalized.length < 3) continue;
      const current = descriptionGroups.get(normalized);
      descriptionGroups.set(normalized, {
        label: movement.description?.trim() || "Movimiento repetido",
        count: (current?.count ?? 0) + 1,
      });
    }
    const repeatedDescription = Array.from(descriptionGroups.values())
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count)[0] ?? null;

    const insights: string[] = [];
    if (categorizedRate < 0.55) insights.push("Tus categorías aún necesitan trabajo para que las comparaciones sean más confiables.");
    if (useful.length < 25) insights.push("Todavía falta un poco de historia para detectar hábitos más estables.");
    if (acceptedFeedbackCount > 0) insights.push(`${acceptedFeedbackCount} corrección${acceptedFeedbackCount === 1 ? "" : "es"} tuya ya alimenta${acceptedFeedbackCount === 1 ? "" : "n"} el aprendizaje de categorías.`);
    if (historyDays >= 45 && categorizedRate >= 0.6) insights.push("Ya hay una base decente para empezar a notar patrones y presión futura.");
    if (insights.length === 0) insights.push("La base del workspace ya está suficientemente sana para lecturas más finas.");
    return { categorizedRate, historyDays, insights, phases, readinessScore, repeatedDescription, usefulCount: useful.length };
  }, [acceptedFeedbackCount, movements]);

  const learningSignals = useMemo(() => {
    const projectionDelta = Math.abs(projectionModel.expectedBalance - projectionModel.conservativeBalance);
    return [
      {
        icon: Clock,
        color: COLORS.primary,
        label: "Patrón semanal",
        title: weeklyPatternInsight
          ? `${weeklyPatternInsight.dayLabel} concentra ${weeklyPatternInsight.share}% del gasto`
          : "Todavía no hay un día dominante",
        body: weeklyPatternInsight
          ? "Úsalo para decidir si ese día necesita un límite, alerta o revisión de hábitos."
          : "La app necesita más movimientos por día para separar hábito real de semanas aisladas.",
      },
      {
        icon: Tag,
        color: COLORS.warning,
        label: "Categorías",
        title: categoryConcentration.topCategory
          ? `${categoryConcentration.topCategory} pesa ${categoryConcentration.topShare ?? 0}%`
          : "Sin categoría dominante clara",
        body: categoryConcentration.topCategory
          ? `La lectura aparece ${categoryConcentration.label.toLowerCase()}; si esa categoría sube, mueve fuerte tu mes.`
          : "Cuando haya más gastos categorizados, aquí verás qué parte del mes está mandando.",
      },
      {
        icon: Sparkles,
        color: COLORS.gold,
        label: "Repeticiones",
        title: learning.repeatedDescription
          ? `${learning.repeatedDescription.label} aparece ${learning.repeatedDescription.count} veces`
          : "Aún no hay comercios repetidos fuertes",
        body: learning.repeatedDescription
          ? "Esto ayuda a sugerir categorías y detectar suscripciones o pagos que se repiten."
          : "Cuando detecte textos parecidos, podrá anticipar categorías y posibles recurrentes.",
      },
      {
        icon: TrendingUp,
        color: COLORS.income,
        label: "Proyección",
        title: `${projectionModel.confidence}% de confianza · ${projectionModel.confidenceLabel}`,
        body: `La banda actual tiene ${formatCurrency(projectionDelta, activeCurrency)} entre piso y esperado. Caja libre: ${cashCushionDays}d (${cashCushionLabel}).`,
      },
      {
        icon: AlertTriangle,
        color: categorySuggestionsCount > 0 || anomalySignalsCount > 0 ? COLORS.gold : COLORS.primary,
        label: "Acciones útiles",
        title: categorySuggestionsCount > 0 || anomalySignalsCount > 0
          ? `${categorySuggestionsCount} sugerencia${categorySuggestionsCount === 1 ? "" : "s"} · ${anomalySignalsCount} alerta${anomalySignalsCount === 1 ? "" : "s"}`
          : acceptedFeedbackCount > 0
            ? `${acceptedFeedbackCount} aprendizaje${acceptedFeedbackCount === 1 ? "" : "s"} aplicado${acceptedFeedbackCount === 1 ? "" : "s"}`
          : "Sin acciones críticas de aprendizaje",
        body: categorySuggestionsCount > 0 || anomalySignalsCount > 0
          ? "Primero atiende estas señales: mejoran categorización, anomalías y confianza de forecast."
          : acceptedFeedbackCount > 0
            ? "La app ya está usando respuestas tuyas para reconocer mejor movimientos parecidos."
          : "Puedes usar esta capa como monitoreo, no como lista urgente.",
      },
    ];
  }, [
    acceptedFeedbackCount,
    activeCurrency,
    anomalySignalsCount,
    cashCushionDays,
    cashCushionLabel,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    categoryConcentration.topShare,
    categorySuggestionsCount,
    learning.repeatedDescription,
    projectionModel.confidence,
    projectionModel.confidenceLabel,
    projectionModel.conservativeBalance,
    projectionModel.expectedBalance,
    weeklyPatternInsight,
  ]);

  return (
    <Card>
      <SectionTitle>Aprendiendo de ti</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Esta capa no es solo un porcentaje: te muestra dónde la app ya ve patrones y qué decisiones puede ayudarte a tomar con esa base.
      </Text>
      <View style={subStyles.learningTopGrid}>
        <View style={subStyles.learningMetricCard}><Brain size={16} color={COLORS.primary} /><Text style={subStyles.learningMetricValue}>{learning.usefulCount}</Text><Text style={subStyles.learningMetricLabel}>Movimientos útiles</Text></View>
        <View style={subStyles.learningMetricCard}><Clock size={16} color={COLORS.secondary} /><Text style={subStyles.learningMetricValue}>{learning.historyDays} d</Text><Text style={subStyles.learningMetricLabel}>Historia observada</Text></View>
        <View style={subStyles.learningMetricCard}><Tag size={16} color={COLORS.warning} /><Text style={subStyles.learningMetricValue}>{Math.round(learning.categorizedRate * 100)}%</Text><Text style={subStyles.learningMetricLabel}>Categorías útiles</Text></View>
        <View style={subStyles.learningMetricCard}><Sparkles size={16} color={COLORS.income} /><Text style={subStyles.learningMetricValue}>{learning.readinessScore}%</Text><Text style={subStyles.learningMetricLabel}>Confianza actual</Text></View>
        <View style={subStyles.learningMetricCard}><Brain size={16} color={COLORS.gold} /><Text style={subStyles.learningMetricValue}>{acceptedFeedbackCount}</Text><Text style={subStyles.learningMetricLabel}>Respuestas usadas</Text></View>
      </View>
      <Text style={subStyles.learningGroupTitle}>Dónde ya ve señales</Text>
      <View style={subStyles.learningSignalList}>
        {learningSignals.map((signal, index) => {
          const Icon = signal.icon;
          return (
            <View key={signal.label} style={[subStyles.learningSignalCard, index === 0 && subStyles.learningSignalCardWide]}>
              <View style={subStyles.learningSignalHeader}>
                <View style={[subStyles.learningSignalIcon, { backgroundColor: signal.color + "18" }]}>
                  <Icon size={15} color={signal.color} />
                </View>
                <Text style={[subStyles.learningSignalKicker, { color: signal.color }]}>{signal.label}</Text>
              </View>
              <Text style={subStyles.learningSignalTitle}>{signal.title}</Text>
              <Text style={subStyles.learningSignalBody}>{signal.body}</Text>
            </View>
          );
        })}
      </View>
      <Text style={subStyles.learningGroupTitle}>Madurez del análisis</Text>
      <View style={subStyles.phaseList}>
        {learning.phases.map((phase) => (
          <View key={phase.step} style={subStyles.phaseCard}>
            <View style={subStyles.phaseHeader}>
              <Text style={subStyles.phaseTitle}>Fase {phase.step} · {phase.title}</Text>
              <Text style={subStyles.phasePct}>{Math.round(phase.progress * 100)}%</Text>
            </View>
            <Text style={subStyles.phaseBody}>{phase.description}</Text>
            <View style={subStyles.phaseTrack}>
              <View style={[subStyles.phaseFill, { width: `${Math.max(6, phase.progress * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={subStyles.learningInsightList}>
        {learning.insights.map((insight) => (
          <View key={insight} style={subStyles.learningInsightRow}>
            <Sparkles size={14} color={COLORS.gold} />
            <Text style={subStyles.learningInsightText}>{insight}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ProCommandCenter({
  movements,
  obligations,
  subscriptions,
  recurringIncome,
  displayCurrency,
  exchangeRateMap,
  currentVisibleBalance,
  router,
  accountCurrencyMap,
}: {
  movements: DashboardMovementRow[];
  obligations: Array<{ id: number; title: string; direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string; lastPaymentDate?: string | null; startDate?: string }>;
  subscriptions: Array<{ id: number; name: string; amount: number; currencyCode: string; nextDueDate: string; accountId?: number | null; status: string; frequency: string; intervalCount: number }>;
  recurringIncome: Array<{ id: number; name: string; amount: number; currencyCode: string; nextExpectedDate: string; status: string }>;
  displayCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
  router: ReturnType<typeof useRouter>;
  accountCurrencyMap: Map<number, string>;
}) {
  const review = useMemo(() => buildReviewInboxSnapshot(movements, subscriptions, obligations), [movements, obligations, subscriptions]);
  const windows = useMemo(
    () => buildFutureFlowWindows(obligations, subscriptions, recurringIncome, displayCurrency, exchangeRateMap, currentVisibleBalance),
    [currentVisibleBalance, displayCurrency, exchangeRateMap, obligations, recurringIncome, subscriptions],
  );
  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements.filter((movement) => inRange(movement, start, now) && isIncome(movement)).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    const expense = movements.filter((movement) => inRange(movement, start, now) && isExpense(movement)).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    return { net: income - expense, daysElapsed: Math.max(1, differenceInDays(now, start) + 1) };
  }, [accountCurrencyMap, displayCurrency, exchangeRateMap, movements]);
  const monthRecurringIncomeProjection = useMemo(() => {
    const now = new Date();
    const monthEnd = endOfMonth(now);
    return recurringIncome
      .filter((income) => income.status === "active")
      .reduce((sum, income) => {
        const expectedDate = parseDisplayDate(income.nextExpectedDate);
        if (expectedDate < now || expectedDate > monthEnd) return sum;
        return sum + convertDashboardCurrency(income.amount, income.currencyCode, displayCurrency, exchangeRateMap);
      }, 0);
  }, [displayCurrency, exchangeRateMap, recurringIncome]);
  const daysInMonth = differenceInDays(endOfMonth(new Date()), startOfMonth(new Date())) + 1;
  const monthEndEstimate =
    currentVisibleBalance +
    (monthToDate.net / monthToDate.daysElapsed) * (daysInMonth - monthToDate.daysElapsed) +
    monthRecurringIncomeProjection;
  const weekWindow = windows[0];
  const actions = [
    review.overdueObligationsCount > 0 ? { key: "overdue", title: "Resolver vencimientos", detail: `${review.overdueObligationsCount} cobros o pagos ya estan fuera de fecha.`, route: "/obligations" } : null,
    review.pendingMovementsCount > 0 ? { key: "pending", title: "Aplicar cola pendiente", detail: `${review.pendingMovementsCount} movimientos aun no impactan tus saldos.`, route: "/movements" } : null,
    review.uncategorizedCount > 0 ? { key: "uncategorized", title: "Categorizar gastos e ingresos", detail: `${review.uncategorizedCount} movimientos siguen sin categoria.`, route: "/movements" } : null,
    review.subscriptionsAttentionCount > 0 ? { key: "subscriptions", title: "Confirmar suscripciones", detail: `${review.subscriptionsAttentionCount} cargos fijos necesitan cuenta o fecha revisada.`, route: "/subscriptions" } : null,
  ].filter(Boolean) as Array<{ key: string; title: string; detail: string; route: string }>;
  const recommendation = review.overdueObligationsCount > 0 ? "Tu prioridad más rentable hoy es limpiar vencimientos de cartera antes de que se arrastre más el desfase." : weekWindow.expectedOutflow > weekWindow.expectedInflow ? "La próxima semana sale más dinero del que entra: revisa compromisos y mueve foco a liquidez." : review.uncategorizedCount > 0 ? "Con unas cuantas categorías más, el dashboard puede darte comparativos y señales mucho más finas." : "No vemos fricción fuerte: aprovecha para ordenar metas, presupuestos o suscripciones.";

  return (
    <Card>
      <SectionTitle>Acciones y foco</SectionTitle>
      {actions.length === 0 ? (
        <View style={subStyles.richEmptyState}>
          <Target size={18} color={COLORS.income} />
          <Text style={subStyles.richEmptyTitle}>Sin urgencias fuertes</Text>
          <Text style={subStyles.richEmptyBody}>Buen momento para afinar metas, presupuestos o limpiar detalles pequenos del workspace.</Text>
        </View>
      ) : (
        <View style={subStyles.commandActions}>
          {actions.slice(0, 3).map((action) => (
            <TouchableOpacity key={action.key} style={subStyles.commandActionRow} onPress={() => router.push(action.route as never)} activeOpacity={0.82}>
              <View style={subStyles.commandActionCopy}>
                <Text style={subStyles.commandActionTitle}>{action.title}</Text>
                <Text style={subStyles.commandActionBody}>{action.detail}</Text>
              </View>
              <ArrowRight size={15} color={COLORS.storm} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={subStyles.commandMetricGrid}>
        <View style={subStyles.commandMetricCard}>
          <Text style={subStyles.commandMetricLabel}>Presion 7 dias</Text>
          <Text style={subStyles.commandMetricValue}>{formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, displayCurrency)}</Text>
          <Text style={subStyles.commandMetricHint}>Entra {formatCurrency(weekWindow.expectedInflow, displayCurrency)} · sale {formatCurrency(weekWindow.expectedOutflow, displayCurrency)}</Text>
        </View>
        <View style={subStyles.commandMetricCard}>
          <Text style={subStyles.commandMetricLabel}>Caja estimada fin de mes</Text>
          <Text style={subStyles.commandMetricValue}>{formatCurrency(monthEndEstimate, displayCurrency)}</Text>
          <Text style={subStyles.commandMetricHint}>
            {monthRecurringIncomeProjection > 0
              ? `Incluye ${formatCurrency(monthRecurringIncomeProjection, displayCurrency)} de ingresos fijos por entrar este mes.`
              : "Extrapola el neto diario del mes en curso."}
          </Text>
        </View>
      </View>
      <View style={subStyles.commandRecommendation}>
        <TrendingUp size={16} color={COLORS.gold} />
        <Text style={subStyles.commandRecommendationText}>{recommendation}</Text>
      </View>
    </Card>
  );
}

function ObligationsSection({
  obligations, router,
}: {
  obligations: { id: number; title: string; direction: string; pendingAmount: number; currencyCode: string; counterparty: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const receivable = obligations.filter((o) => o.direction === "receivable").slice(0, 3);
  const payable = obligations.filter((o) => o.direction === "payable").slice(0, 3);
  if (receivable.length === 0 && payable.length === 0) return null;

  function renderGroup(title: string, items: typeof obligations, color: string) {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: SPACING.sm }}>
        <Text style={[subStyles.obGroupTitle, { color }]}>{title}</Text>
        {items.map((o) => (
          <TouchableOpacity
            key={o.id}
            style={subStyles.obRow}
            onPress={() => router.push(`/obligation/${o.id}`)}
            activeOpacity={0.75}
          >
            <View style={subStyles.obLeft}>
              <Text style={subStyles.obTitle} numberOfLines={1}>{o.title}</Text>
              <Text style={subStyles.obCounterparty} numberOfLines={1}>{o.counterparty}</Text>
            </View>
            <Text style={[subStyles.obAmount, { color }]}>
              {formatCurrency(o.pendingAmount, o.currencyCode)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <Card>
      <SectionTitle>Créditos y deudas</SectionTitle>
      {renderGroup("Por cobrar", receivable, COLORS.income)}
      {renderGroup("Por pagar", payable, COLORS.expense)}
    </Card>
  );
}

function CategoryBreakdown({
  catTotals, categories, currency,
}: {
  catTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  currency: string;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const entries = Array.from(catTotals.entries())
    .map(([id, total]) => ({ name: catMap.get(id ?? -1) ?? "Sin categoría", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  if (entries.length === 0) return null;
  const maxTotal = entries[0].total;

  return (
    <Card>
      <SectionTitle>Gastos por categoría</SectionTitle>
      {entries.map((e, i) => (
        <View key={i} style={subStyles.catRow}>
          <View style={subStyles.catLabelRow}>
            <Text style={subStyles.catName} numberOfLines={1}>{e.name}</Text>
            <Text style={subStyles.catAmount}>{formatCurrency(e.total, currency)}</Text>
          </View>
          <View style={subStyles.catTrack}>
            <View style={[subStyles.catFill, { width: `${(e.total / maxTotal) * 100}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function MonthlyPulse({ data, currency, onOpenMonth }: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  onOpenMonth?: (dateFrom: string, dateTo: string) => void;
}) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const BAR_HEIGHT = 64;
  return (
    <Card>
      <SectionTitle>Pulso mensual (6 meses)</SectionTitle>
      <View style={subStyles.chartRow}>
        {data.map((d, i) => {
          const monthDate = subMonths(new Date(), data.length - 1 - i);
          const dateFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
          const dateTo = format(i === data.length - 1 ? new Date() : endOfMonth(monthDate), "yyyy-MM-dd");
          return (
          <TouchableOpacity
            key={i}
            style={subStyles.chartCol}
            onPress={onOpenMonth ? () => onOpenMonth(dateFrom, dateTo) : undefined}
            activeOpacity={onOpenMonth ? 0.84 : 1}
          >
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT }]}>
              <View style={[subStyles.chartBar, { height: Math.max((d.income / maxVal) * BAR_HEIGHT, d.income > 0 ? 3 : 0), backgroundColor: COLORS.income + "cc" }]} />
              <View style={[subStyles.chartBar, { height: Math.max((d.expense / maxVal) * BAR_HEIGHT, d.expense > 0 ? 3 : 0), backgroundColor: COLORS.expense + "cc" }]} />
            </View>
            <Text style={subStyles.chartLabel}>{d.label}</Text>
          </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

function SubscriptionsSummary({
  subscriptions, currency,
}: {
  subscriptions: { id: number; name: string; amount: number; currencyCode: string; frequency: string; intervalCount: number }[];
  currency: string;
}) {
  const active = subscriptions.filter((s) => true).slice(0, 4);
  if (active.length === 0) return null;

  function toMonthly(amount: number, freq: string, interval: number): number {
    if (freq === "monthly") return amount / interval;
    if (freq === "yearly") return amount / (12 * interval);
    if (freq === "weekly") return (amount * 4.345) / interval;
    if (freq === "quarterly") return amount / (3 * interval);
    if (freq === "daily") return (amount * 30) / interval;
    return amount;
  }

  const totalMonthly = subscriptions.reduce(
    (sum, s) => sum + toMonthly(s.amount, s.frequency, s.intervalCount), 0,
  );

  return (
    <Card>
      <View style={subStyles.subHeader}>
        <SectionTitle>Suscripciones activas</SectionTitle>
        <Text style={subStyles.subTotal}>{formatCurrency(totalMonthly, currency)}/mes</Text>
      </View>
      {active.map((s) => (
        <View key={s.id} style={subStyles.subRow}>
          <Text style={subStyles.subName} numberOfLines={1}>{s.name}</Text>
          <Text style={subStyles.subAmt}>{formatCurrency(toMonthly(s.amount, s.frequency, s.intervalCount), s.currencyCode)}/mes</Text>
        </View>
      ))}
    </Card>
  );
}

function HealthScore({
  netWorth, income, expense, obligations, netWorthThreeMonthExpense,
}: {
  netWorth: number; income: number; expense: number;
  obligations: { direction: string; pendingAmount: number; dueDate: string | null; status: string }[];
  netWorthThreeMonthExpense: number;
}) {
  const now = new Date();
  const totalPayable = obligations
    .filter((o) => o.direction === "payable" && o.status === "active")
    .reduce((s, o) => s + o.pendingAmount, 0);
  const overdueCount = obligations.filter(
    (o) => o.direction === "payable" && o.status === "active" && o.dueDate && new Date(o.dueDate) < now,
  ).length;

  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const coverageMonths = expense > 0 ? netWorth / expense : 12;
  const debtToIncome = income > 0 ? totalPayable / income : 0;

  function scoreFor(value: number, thresholds: [number, number, number]): number {
    if (value >= thresholds[0]) return 100;
    if (value >= thresholds[1]) return 75;
    if (value >= thresholds[2]) return 50;
    return 25;
  }

  const s1 = scoreFor(savingsRate, [0.2, 0.1, 0]);
  const s2 = scoreFor(coverageMonths, [6, 3, 1]);
  const s3 = scoreFor(1 - Math.min(debtToIncome, 1.5) / 1.5, [0.8, 0.5, 0.2]);
  const s4 = overdueCount === 0 ? 100 : overdueCount === 1 ? 75 : overdueCount === 2 ? 50 : 25;
  const score = Math.round((s1 + s2 + s3 + s4) / 4);

  const scoreColor =
    score >= 80 ? COLORS.income : score >= 60 ? COLORS.warning : COLORS.expense;

  const indicators = [
    {
      label: "Tasa de ahorro", value: s1, desc: `${(savingsRate * 100).toFixed(1)}% del ingreso`,
      interpret: s1 >= 75 ? "Buen margen — ahorras más del 20% del ingreso."
        : s1 >= 50 ? "Ahorro por debajo del 10% — margen ajustado."
        : savingsRate < 0 ? "Gastos superan los ingresos este mes."
        : "Ahorrando poco — sin margen para imprevistos.",
    },
    {
      label: "Meses de cobertura", value: s2, desc: `${coverageMonths.toFixed(1)} meses`,
      interpret: s2 >= 75 ? "Cobertura sólida — más de 6 meses de reserva."
        : s2 >= 50 ? "Cobertura suficiente, pero ajustada (3–6 meses)."
        : "Menos de 3 meses de reserva — zona de precaución.",
    },
    {
      label: "Relación deuda/ingreso", value: s3, desc: `${(debtToIncome * 100).toFixed(1)}%`,
      interpret: s3 >= 75 ? "Deuda manejable respecto al ingreso mensual."
        : s3 >= 50 ? "Obligaciones moderadas — monitorear de cerca."
        : "Obligaciones elevadas vs ingresos — prioriza resolver.",
    },
    {
      label: "Obligaciones al día", value: s4, desc: overdueCount === 0 ? "Sin vencidas" : `${overdueCount} vencidas`,
      interpret: overdueCount === 0 ? "Todo al día — sin compromisos vencidos."
        : overdueCount === 1 ? "Hay 1 obligación vencida — actúa pronto."
        : `${overdueCount} obligaciones vencidas — requieren atención urgente.`,
    },
  ];

  return (
    <Card>
      <View style={subStyles.healthHeader}>
        <View style={{ gap: 2 }}>
          <SectionTitle>Salud financiera</SectionTitle>
          <Text style={subStyles.healthScoreInterpret}>
            {score >= 80 ? "Finanzas en buen estado — sin señales de alerta."
              : score >= 60 ? "Estado aceptable — hay áreas que mejorar."
              : "Varias señales de alerta — revisa los indicadores en rojo."}
          </Text>
        </View>
        <View style={[subStyles.healthScore, { borderColor: scoreColor + "55" }]}>
          <Text style={[subStyles.healthScoreNum, { color: scoreColor }]}>{score}</Text>
          <Text style={subStyles.healthScoreOf}>/100</Text>
        </View>
      </View>
      {indicators.map((ind) => (
        <View key={ind.label} style={subStyles.healthRow}>
          <View style={subStyles.healthLabelRow}>
            <Text style={subStyles.healthLabel}>{ind.label}</Text>
            <Text style={subStyles.healthDesc}>{ind.desc}</Text>
          </View>
          <View style={subStyles.healthTrack}>
            <View style={[subStyles.healthFill, { width: `${ind.value}%`, backgroundColor: ind.value >= 75 ? COLORS.income : ind.value >= 50 ? COLORS.warning : COLORS.expense }]} />
          </View>
          <Text style={[subStyles.healthInterpret, { color: ind.value >= 75 ? COLORS.income : ind.value >= 50 ? COLORS.gold : COLORS.expense }]}>
            {ind.interpret}
          </Text>
        </View>
      ))}
    </Card>
  );
}

// Alert center - anomalies detection
type AlertItem = {
  key: string;
  icon: LucideIcon;
  color: string;
  message: string;
};

function AlertCenter({
  budgets, obligations, subscriptions, movements,
}: {
  budgets: { id: number; name: string; isOverLimit: boolean }[];
  obligations: { id: number; title: string; dueDate: string | null; status: string }[];
  subscriptions: { id: number; name: string; nextDueDate: string }[];
  movements: DashboardMovementRow[];
}) {
  const now = new Date();
  const in3Days = addDays(now, 3);

  const alerts: AlertItem[] = [];

  // Budgets over limit
  for (const b of budgets.filter((b) => b.isOverLimit)) {
    alerts.push({
      key: `budget-${b.id}`,
      icon: AlertCircle,
      color: COLORS.rosewood,
      message: `Presupuesto "${b.name}" excedido`,
    });
  }

  // Overdue obligations
  for (const o of obligations) {
    if (o.status === "active" && o.dueDate && new Date(o.dueDate) < now) {
      alerts.push({
        key: `ob-overdue-${o.id}`,
        icon: AlertTriangle,
        color: COLORS.rosewood,
        message: `Obligación vencida: "${o.title}"`,
      });
    }
  }

  // Subscriptions due in next 3 days
  for (const s of subscriptions) {
    const d = new Date(s.nextDueDate);
    if (d >= now && d <= in3Days) {
      alerts.push({
        key: `sub-due-${s.id}`,
        icon: Clock,
        color: COLORS.gold,
        message: `Suscripción próxima: "${s.name}" el ${format(d, "d MMM", { locale: es })}`,
      });
    }
  }

  // Movements without category (expense/income type)
  const noCatCount = movements.filter(
    (m) => m.categoryId === null && isCategorizedCashflow(m),
  ).length;
  if (noCatCount > 0) {
    alerts.push({
      key: "no-cat",
      icon: Tag,
      color: COLORS.gold,
      message: `${noCatCount} movimiento${noCatCount !== 1 ? "s" : ""} sin categoría`,
    });
  }

  return (
    <Card>
      <SectionTitle>Centro de alertas</SectionTitle>
      {alerts.length === 0 ? (
        <Text style={subStyles.alertEmpty}>Sin alertas activas</Text>
      ) : (
        alerts.map((a) => {
          const Icon = a.icon;
          return (
            <View key={a.key} style={subStyles.alertRow}>
              <Icon size={14} color={a.color} />
              <Text style={[subStyles.alertText, { color: a.color }]}>{a.message}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

// Obligation watch - full list with aging
function ObligationWatch({
  obligations, router,
}: {
  obligations: { id: number; title: string; direction: string; status: string; counterparty: string; pendingAmount: number; currencyCode: string; dueDate: string | null }[];
  router: ReturnType<typeof useRouter>;
}) {
  const now = new Date();
  const active = obligations.filter((o) => o.status === "active");
  if (active.length === 0) return null;

  const receivable = active.filter((o) => o.direction === "receivable");
  const payable = active.filter((o) => o.direction === "payable");

  function agingText(dueDate: string | null): { text: string; color: string } {
    if (!dueDate) return { text: "Sin fecha", color: COLORS.storm };
    const d = new Date(dueDate);
    const days = differenceInDays(d, now);
    if (days < 0) return { text: `${Math.abs(days)}d vencida`, color: COLORS.rosewood };
    if (days === 0) return { text: "Hoy", color: COLORS.gold };
    return { text: `en ${days}d`, color: COLORS.storm };
  }

  function renderGroup(title: string, items: typeof active, color: string) {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: SPACING.sm }}>
        <Text style={[subStyles.obGroupTitle, { color }]}>{title}</Text>
        {items.map((o) => {
          const aging = agingText(o.dueDate);
          return (
            <TouchableOpacity
              key={o.id}
              style={subStyles.obRow}
              onPress={() => router.push(`/obligation/${o.id}`)}
              activeOpacity={0.75}
            >
              <View style={subStyles.obLeft}>
                <Text style={subStyles.obTitle} numberOfLines={1}>{o.title}</Text>
                <Text style={subStyles.obCounterparty} numberOfLines={1}>{o.counterparty}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={[subStyles.obAmount, { color }]}>
                  {formatCurrency(o.pendingAmount, o.currencyCode)}
                </Text>
                <Text style={[subStyles.obCounterparty, { color: aging.color }]}>{aging.text}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <Card>
      <SectionTitle>Seguimiento de obligaciones</SectionTitle>
      {renderGroup("Por cobrar", receivable, COLORS.pine)}
      {renderGroup("Por pagar", payable, COLORS.rosewood)}
    </Card>
  );
}

function PaymentOptimizationCard({
  recommendations,
  currency,
  router,
}: {
  recommendations: PaymentOptimizationRecommendation[];
  currency: string;
  router: ReturnType<typeof useRouter>;
}) {
  if (recommendations.length === 0) return null;

  function dueLabel(daysUntilDue: number | null) {
    if (daysUntilDue == null) return "sin fecha";
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d vencido`;
    if (daysUntilDue === 0) return "vence hoy";
    return `en ${daysUntilDue}d`;
  }

  return (
    <Card>
      <SectionTitle>Optimización de pagos</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Ordena cobros y pagos por lo que más puede bajar presión de caja. No mueve dinero solo; te dice qué revisar primero.
      </Text>
      <View style={subStyles.commandActions}>
        {recommendations.map((item) => (
          <TouchableOpacity
            key={`${item.direction}-${item.id}`}
            style={subStyles.commandActionRow}
            onPress={() => router.push(`/obligation/${item.id}`)}
            activeOpacity={0.82}
          >
            <View style={subStyles.commandActionCopy}>
              <View style={subStyles.suggestionRowTop}>
                <Text style={subStyles.commandActionTitle} numberOfLines={1}>{item.actionLabel}: {item.title}</Text>
                <View style={subStyles.miniChip}>
                  <Text style={subStyles.miniChipText}>{item.score}/100</Text>
                </View>
              </View>
              <Text style={subStyles.commandActionBody}>
                {formatCurrency(item.amount, currency)} · {dueLabel(item.daysUntilDue)} · {item.subtitle}
              </Text>
              <Text style={subStyles.commandActionBody}>{item.reason}</Text>
            </View>
            <ArrowRight size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

function AdvancedGiftCard() {
  return (
    <View style={subStyles.advancedGiftCard}>
      <View style={subStyles.advancedGiftHeartsRow}>
        <Text style={subStyles.advancedGiftHeart}>♥</Text>
        <Text style={subStyles.advancedGiftHeartSmall}>♥</Text>
        <Text style={subStyles.advancedGiftHeart}>♥</Text>
      </View>
      <Text style={subStyles.advancedGiftKicker}>Un regalo especial</Text>
      <Text style={subStyles.advancedGiftTitle}>
        Esto te lo muestro aunque seas free porque te quiero.
      </Text>
      <Text style={subStyles.advancedGiftBody}>
        Este dashboard avanzado queda abierto para ti: para que veas tus patrones, tu flujo y tu salud financiera con más cariño, más claridad y sin perderte entre números.
      </Text>
      <View style={subStyles.advancedGiftPill}>
        <Text style={subStyles.advancedGiftPillText}>Acceso avanzado activado solo para ti</Text>
      </View>
    </View>
  );
}

function FinancialGraphCard({
  nodes,
  currency,
  onOpenNode,
}: {
  nodes: FinancialGraphRankNode[];
  currency: string;
  onOpenNode: (node: FinancialGraphRankNode) => void;
}) {
  if (nodes.length === 0) return null;

  function kindLabel(node: FinancialGraphRankNode) {
    if (node.kind === "account") return "Cuenta";
    if (node.kind === "category") return "Categoría";
    if (node.kind === "counterparty") return "Contacto";
    return "Flujo";
  }

  return (
    <Card>
      <SectionTitle>Nodos que más mueven tu sistema</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Une cuenta, categoría, contacto y tipo de movimiento. Si algo aparece arriba, está muy conectado con tu dinero reciente.
      </Text>
      <Text style={subStyles.scopeHint}>
        Alcance: movimientos confirmados de los últimos 90 días cargados por el dashboard.
      </Text>
      <View style={subStyles.commandActions}>
        {nodes.map((node) => (
          <TouchableOpacity
            key={node.id}
            style={subStyles.commandActionRow}
            onPress={() => onOpenNode(node)}
            activeOpacity={0.82}
          >
            <View style={subStyles.commandActionCopy}>
              <View style={subStyles.suggestionRowTop}>
                <Text style={subStyles.commandActionTitle} numberOfLines={1}>{node.label}</Text>
                <View style={subStyles.miniChip}>
                  <Text style={subStyles.miniChipText}>{node.score}/100</Text>
                </View>
              </View>
              <Text style={subStyles.commandActionBody}>
                {kindLabel(node)} · {node.movementCount} movimiento{node.movementCount === 1 ? "" : "s"} · {formatCurrency(node.amount, currency)}
              </Text>
              <Text style={subStyles.commandActionBody}>{node.reason}</Text>
            </View>
            <ArrowRight size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

function AlgorithmReadinessCard({
  title,
  body,
  checks,
}: {
  title: string;
  body: string;
  checks: Array<{
    label: string;
    current: number;
    required: number;
    detail: string;
  }>;
}) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <Text style={subStyles.executiveIntro}>{body}</Text>
      <View style={subStyles.readinessList}>
        {checks.map((check) => {
          const ready = check.current >= check.required;
          const pct = Math.max(0, Math.min(100, Math.round((check.current / Math.max(check.required, 1)) * 100)));
          return (
            <View key={check.label} style={subStyles.readinessRow}>
              <View style={subStyles.readinessTop}>
                <Text style={subStyles.readinessLabel}>{check.label}</Text>
                <Text style={[subStyles.readinessStatus, { color: ready ? COLORS.income : COLORS.gold }]}>
                  {ready ? "Listo" : `${check.current}/${check.required}`}
                </Text>
              </View>
              <View style={subStyles.readinessTrack}>
                <View style={[subStyles.readinessFill, { width: `${pct}%` as any, backgroundColor: ready ? COLORS.income : COLORS.gold }]} />
              </View>
              <Text style={subStyles.readinessDetail}>{check.detail}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// Weekly pattern - average expense per day of week
function WeeklyPattern({
  movements,
  ctx,
  onOpenDay,
}: {
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  onOpenDay?: (day: {
    shortLabel: string;
    fullLabel: string;
    total: number;
    average: number;
    count: number;
    weekCount: number;
    movements: DashboardMovementRow[];
  }) => void;
}) {
  const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
  const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

  // getDay returns 0=Sun..6=Sat. We want Mon=0..Sun=6
  const byDay = Array.from({ length: 7 }, () => ({ total: 0, count: 0, movements: [] as DashboardMovementRow[] }));
  const weekSet = new Set<string>();

  for (const m of movements.filter(isExpense)) {
    const d = new Date(m.occurredAt);
    const jsDay = getDay(d); // 0=Sun
    const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
    byDay[idx].total += expenseAmt(m, ctx);
    byDay[idx].count += 1;
    byDay[idx].movements.push(m);
    // track unique weeks for averaging
    const weekKey = `${d.getFullYear()}-${format(startOfWeek(d, { weekStartsOn: 1 }), "MM-dd")}`;
    weekSet.add(weekKey);
  }

  const weekCount = Math.max(weekSet.size, 1);
  const averages = byDay.map((d) => d.total / weekCount);
  const maxAvg = Math.max(...averages, 1);
  const totalExpense = byDay.reduce((sum, day) => sum + day.total, 0);
  const totalCount = byDay.reduce((sum, day) => sum + day.count, 0);
  const topIndex = byDay.reduce((best, day, index) => day.total > byDay[best].total ? index : best, 0);
  const BAR_HEIGHT = 56;

  if (averages.every((a) => a === 0)) return null;

  return (
    <Card>
      <SectionTitle>Patrón semanal de gastos</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Agrupa tus gastos por día de la semana para ver cuándo suele salir más dinero.
      </Text>
      <View style={subStyles.weeklyPatternSummary}>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Día más pesado</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{DAY_NAMES[topIndex]}</Text>
        </View>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Gastos vistos</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{totalCount} mov.</Text>
        </View>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Total</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{formatCurrency(totalExpense, ctx.displayCurrency)}</Text>
        </View>
      </View>
      <View style={subStyles.chartRow}>
        {averages.map((avg, i) => {
          const day = byDay[i];
          const disabled = day.count === 0;
          return (
          <TouchableOpacity
            key={DAY_LABELS[i]}
            style={[subStyles.chartCol, subStyles.weeklyDayButton, disabled && subStyles.weeklyDayButtonDisabled]}
            disabled={disabled}
            onPress={() => onOpenDay?.({
              shortLabel: DAY_LABELS[i],
              fullLabel: DAY_NAMES[i],
              total: day.total,
              average: avg,
              count: day.count,
              weekCount,
              movements: sortMovementsRecentFirst(day.movements),
            })}
            activeOpacity={0.84}
          >
            <Text style={subStyles.weeklyDayAmount} numberOfLines={1}>{formatCurrency(avg, ctx.displayCurrency)}</Text>
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT, justifyContent: "flex-end" }]}>
              <View
                style={[
                  subStyles.weeklyBar,
                  { height: Math.max((avg / maxAvg) * BAR_HEIGHT, avg > 0 ? 3 : 0) },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{DAY_LABELS[i]}</Text>
            <Text style={subStyles.weeklyDayCount}>{day.count} mov.</Text>
          </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

// Transfer snapshot - top 3 transfer routes
function TransferSnapshot({
  movements, accounts, ctx, onOpenRoute,
}: {
  movements: DashboardMovementRow[];
  accounts: { id: number; name: string }[];
  ctx: ConversionCtx;
  onOpenRoute?: (route: { srcName: string; dstName: string; total: number; count: number; movementIds: number[] }) => void;
}) {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Group by (sourceAccountId, destinationAccountId)
  const routeMap = new Map<string, { srcId: number; dstId: number; total: number; count: number; movementIds: number[] }>();
  for (const m of movements.filter((m) => m.movementType === "transfer" && m.status === "posted")) {
    if (!m.sourceAccountId || !m.destinationAccountId) continue;
    const key = `${m.sourceAccountId}-${m.destinationAccountId}`;
    const existing = routeMap.get(key);
    if (existing) {
      existing.total += transferAmt(m, ctx);
      existing.count++;
      existing.movementIds.push(m.id);
    } else {
      routeMap.set(key, { srcId: m.sourceAccountId, dstId: m.destinationAccountId, total: transferAmt(m, ctx), count: 1, movementIds: [m.id] });
    }
  }

  const routes = Array.from(routeMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  if (routes.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Rutas de transferencia</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Toca una ruta para ver las transferencias exactas entre esas cuentas.
      </Text>
      {routes.map((r, i) => {
        const srcName = accMap.get(r.srcId) ?? `Cuenta ${r.srcId}`;
        const dstName = accMap.get(r.dstId) ?? `Cuenta ${r.dstId}`;
        return (
          <TouchableOpacity
            key={i}
            style={[subStyles.transferRow, i < routes.length - 1 && subStyles.leadersSep]}
            onPress={() => onOpenRoute?.({ ...r, srcName, dstName })}
            activeOpacity={0.82}
          >
            <View style={subStyles.transferRoute}>
              <Text style={subStyles.transferAcct} numberOfLines={1}>{srcName}</Text>
              <ArrowRight size={12} color={COLORS.storm} />
              <Text style={subStyles.transferAcct} numberOfLines={1}>{dstName}</Text>
            </View>
            <View style={subStyles.transferRight}>
              <Text style={subStyles.transferAmt}>{formatCurrency(r.total, ctx.displayCurrency)}</Text>
              <Text style={subStyles.transferCount}>{r.count} mov.</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </Card>
  );
}

// Data quality widget
function DataQuality({
  movements,
  onOpenNoCategory,
  onOpenNoCounterparty,
}: {
  movements: DashboardMovementRow[];
  onOpenNoCategory?: () => void;
  onOpenNoCounterparty?: () => void;
}) {
  const relevant = movements.filter(
    (m) => isCategorizedCashflow(m),
  );
  const noCat = relevant.filter((m) => m.categoryId == null).length;
  const noCounterparty = relevant.filter((m) => m.counterpartyId == null).length;

  if (noCat === 0 && noCounterparty === 0) return null;

  return (
    <Card>
      <SectionTitle>Calidad de datos</SectionTitle>
      {noCat > 0 && (
        <TouchableOpacity style={subStyles.dqRow} onPress={onOpenNoCategory} activeOpacity={0.82}>
          <Tag size={13} color={COLORS.gold} />
          <Text style={subStyles.dqText}>{noCat} movimiento{noCat !== 1 ? "s" : ""} sin categoría</Text>
          <ArrowRight size={14} color={COLORS.storm} />
        </TouchableOpacity>
      )}
      {noCounterparty > 0 && (
        <TouchableOpacity style={subStyles.dqRow} onPress={onOpenNoCounterparty} activeOpacity={0.82}>
          <AlertCircle size={13} color={COLORS.storm} />
          <Text style={subStyles.dqText}>{noCounterparty} movimiento{noCounterparty !== 1 ? "s" : ""} sin contraparte</Text>
          <ArrowRight size={14} color={COLORS.storm} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

// Currency exposure widget
function CurrencyExposure({
  accounts,
}: {
  accounts: { id: number; name: string; currencyCode: string; currentBalance: number; isArchived: boolean }[];
}) {
  const active = accounts.filter((a) => !a.isArchived && a.currentBalance > 0);
  if (active.length === 0) return null;

  const byCode = new Map<string, number>();
  for (const a of active) {
    byCode.set(a.currencyCode, (byCode.get(a.currencyCode) ?? 0) + a.currentBalance);
  }

  const total = Array.from(byCode.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const TINTS = [COLORS.pine, COLORS.ember, COLORS.gold, COLORS.rosewood, COLORS.storm];
  const entries = Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <SectionTitle>Exposición por moneda</SectionTitle>
      {entries.map(([code, amount], i) => {
        const pct = (amount / total) * 100;
        const color = TINTS[i % TINTS.length];
        return (
          <View key={code} style={subStyles.currencyRow}>
            <View style={subStyles.currencyLabel}>
              <View style={[subStyles.currencyDot, { backgroundColor: color }]} />
              <Text style={subStyles.currencyCode}>{code}</Text>
              <Text style={subStyles.currencyPct}>{pct.toFixed(1)}%</Text>
            </View>
            <View style={subStyles.currencyTrack}>
              <View style={[subStyles.currencyFill, { width: `${pct}%`, backgroundColor: color + "99" }]} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

// Period radar - 5 compact readings
function PeriodRadar({
  income, expense, catTotals, categories, curStart, curEnd, movements,
}: {
  income: number;
  expense: number;
  catTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  curStart: Date;
  curEnd: Date;
  movements: DashboardMovementRow[];
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

  // Top expense category
  let topCatName = "-";
  let topCatAmt = 0;
  for (const [id, total] of catTotals.entries()) {
    if (total > topCatAmt) {
      topCatAmt = total;
      topCatName = catMap.get(id ?? -1) ?? "Sin categoría";
    }
  }

  // Days in period
  const daysInPeriod = Math.max(differenceInDays(curEnd, curStart), 1);

  // Days with no expense
  const expenseDays = new Set<string>();
  for (const m of movements.filter(isExpense)) {
    if (inRange(m, curStart, curEnd)) {
      expenseDays.add(format(new Date(m.occurredAt), "yyyy-MM-dd"));
    }
  }
  const daysWithoutExpense = daysInPeriod - expenseDays.size;

  // Average daily expense
  const avgDaily = expense / daysInPeriod;

  // Movements without category
  const noCatCount = movements.filter(
    (m) => inRange(m, curStart, curEnd) && m.categoryId === null && isExpense(m),
  ).length;

  const items = [
    { label: "Tasa de ahorro", value: `${savingsRate.toFixed(1)}%` },
    { label: "Mayor gasto", value: topCatAmt > 0 ? `${topCatName}` : "-" },
    { label: "Días sin gastar", value: `${Math.max(daysWithoutExpense, 0)}` },
    { label: "Promedio diario", value: formatCurrency(avgDaily, "") },
    { label: "Mov. sin categoría", value: `${noCatCount}` },
  ];

  return (
    <Card>
      <SectionTitle>Resumen del período</SectionTitle>
      <View style={subStyles.radarGrid}>
        {items.map((item, i) => (
          <View key={i} style={subStyles.radarItem}>
            <Text style={subStyles.radarLabel}>{item.label}</Text>
            <Text style={subStyles.radarValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// Activity timeline
function ActivityTimeline({ snapshot }: { snapshot: any }) {
  const log: any[] = snapshot?.activityLog ?? [];
  if (log.length === 0) return null;

  const items = log.slice(0, 12);

  function iconFor(entityType: string): LucideIcon {
    if (entityType === "movement") return Banknote;
    if (entityType === "obligation") return AlertCircle;
    if (entityType === "subscription") return Clock;
    return Tag;
  }

  return (
    <Card>
      <SectionTitle>Actividad reciente</SectionTitle>
      {items.map((entry: any, i: number) => {
        const Icon = iconFor(entry.entity_type ?? "");
        const d = entry.created_at ? new Date(entry.created_at) : null;
        return (
          <View key={i} style={[subStyles.timelineRow, i < items.length - 1 && subStyles.leadersSep]}>
            <Icon size={14} color={COLORS.storm} />
            <View style={subStyles.timelineContent}>
              <Text style={subStyles.timelineDesc} numberOfLines={2}>
                {entry.description ?? `${entry.action ?? ""} ${entry.entity_type ?? ""}`}
              </Text>
              {d && (
                <Text style={subStyles.timelineDate}>
                  {format(d, "d MMM HH:mm", { locale: es })}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function AnomalyWatch({
  movements,
  ctx,
  categoryMap,
  accountMap,
  onExplainPress,
  onOpenMovement,
  onOpenAll,
  router,
}: {
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  categoryMap: Map<number, string>;
  accountMap: Map<number, string>;
  onExplainPress?: () => void;
  onOpenMovement?: (movementId: number) => void;
  onOpenAll?: (movementIds: number[]) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const anomalies = useMemo(
    () => buildAnomalyFindings(movements, ctx, categoryMap, accountMap),
    [accountMap, categoryMap, ctx, movements],
  );

  if (anomalies.length === 0) return null;

  return (
    <Card>
      <View style={subStyles.cardHeaderWithAction}>
        <SectionTitle>Movimientos para revisar</SectionTitle>
        {onExplainPress ? (
          <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={onExplainPress} activeOpacity={0.82}>
            <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={subStyles.anomalyList}>
        {anomalies.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[subStyles.anomalyCard, item.level === "strong" ? subStyles.anomalyCardStrong : subStyles.anomalyCardReview]}
            onPress={() => {
              if (onOpenMovement) {
                onOpenMovement(item.movementId);
                return;
              }
              router.push(`/movement/${item.movementId}?from=dashboard`);
            }}
            activeOpacity={0.84}
          >
            <View style={subStyles.anomalyTop}>
              <Text style={subStyles.anomalyTitle}>{item.title}</Text>
              <View style={[subStyles.anomalyBadge, item.level === "strong" ? subStyles.anomalyBadgeStrong : subStyles.anomalyBadgeReview]}>
                <Text style={[subStyles.anomalyBadgeText, item.level === "strong" ? subStyles.anomalyBadgeTextStrong : subStyles.anomalyBadgeTextReview]}>
                  {item.level === "strong" ? "Fuerte" : "Revisar"}
                </Text>
              </View>
            </View>
            <Text style={subStyles.anomalyBody}>{item.body}</Text>
            <View style={subStyles.anomalyBottom}>
              <Text style={subStyles.anomalyMeta}>{item.meta}</Text>
              <ArrowRight size={15} color={COLORS.storm} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={subStyles.secondaryOutlineBtn}
        onPress={() => {
          if (onOpenAll) {
            onOpenAll(anomalies.map((item) => item.movementId));
            return;
          }
          router.push("/movements" as never);
        }}
        activeOpacity={0.82}
      >
        <Text style={subStyles.secondaryOutlineBtnText}>Abrir movimientos para revisar</Text>
      </TouchableOpacity>
    </Card>
  );
}

function DashboardLayerHeader({ kicker, title, bullets }: { kicker: string; title: string; bullets: string[] }) {
  return (
    <View style={subStyles.layerSection}>
      <Text style={subStyles.layerSectionKicker}>{kicker}</Text>
      <Text style={subStyles.layerSectionTitle}>{title}</Text>
      <View style={subStyles.layerBulletList}>
        {bullets.map((b) => (
          <View key={b} style={subStyles.layerBulletRow}>
            <Text style={subStyles.layerBulletDot}>·</Text>
            <Text style={subStyles.layerSectionBody}>{b}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProjectionBridgeChart({
  currentVisibleBalance,
  committedNet,
  variableNet,
  expectedBalance,
  currency,
  onOpenAccounts,
  onExplainProjection,
  onOpenMonthMovements,
}: {
  currentVisibleBalance: number;
  committedNet: number;
  variableNet: number;
  expectedBalance: number;
  currency: string;
  onOpenAccounts: () => void;
  onExplainProjection: () => void;
  onOpenMonthMovements: () => void;
}) {
  const rows = [
    { label: "Saldo visible hoy", detail: "Lo que suman tus cuentas visibles", amount: currentVisibleBalance, tone: "base" as const, action: "Abrir cuentas", onPress: onOpenAccounts },
    { label: "Agenda comprometida", detail: "Ingresos fijos menos pagos esperados", amount: committedNet, tone: committedNet >= 0 ? "positive" as const : "negative" as const, action: "Entender agenda", onPress: onExplainProjection },
    { label: "Ritmo variable", detail: "Proyección de gastos e ingresos no fijos", amount: variableNet, tone: variableNet >= 0 ? "positive" as const : "negative" as const, action: "Ver movimientos", onPress: onOpenMonthMovements },
    { label: "Cierre esperado", detail: "Resultado estimado de fin de mes", amount: expectedBalance, tone: expectedBalance >= currentVisibleBalance ? "positive" as const : "warning" as const, action: "Ver cálculo", onPress: onExplainProjection },
  ];
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.amount)), 1);

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Proyección</Text>
      <SectionTitle>Puente de cierre de mes</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Te muestra qué empuja la caja estimada: saldo actual, agenda fija y ritmo variable. Si una barra va a la izquierda, resta.
      </Text>
      <View style={subStyles.bridgeChartStack}>
        {rows.map((row) => {
          const width = Math.max(3, Math.min(50, (Math.abs(row.amount) / maxAbs) * 50));
          const isNegative = row.amount < 0;
          const color = row.tone === "positive" ? COLORS.income : row.tone === "negative" ? COLORS.expense : row.tone === "warning" ? COLORS.gold : COLORS.primary;
          return (
            <TouchableOpacity key={row.label} style={subStyles.bridgeRow} onPress={row.onPress} activeOpacity={0.84}>
              <View style={subStyles.bridgeRowHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={subStyles.bridgeLabel}>{row.label}</Text>
                  <Text style={subStyles.bridgeDetail}>{row.detail}</Text>
                </View>
                <Text style={[subStyles.bridgeAmount, { color }]}>
                  {row.amount > 0 && row.tone !== "base" ? "+" : ""}{formatCurrency(row.amount, currency)}
                </Text>
              </View>
              <View style={subStyles.bridgeTrack}>
                <View style={subStyles.bridgeAxis} />
                <View
                  style={[
                    subStyles.bridgeFill,
                    {
                      width: `${width}%` as any,
                      backgroundColor: color,
                      left: isNegative ? `${50 - width}%` as any : "50%",
                    },
                  ]}
                />
              </View>
              <Text style={subStyles.visualChartAction}>{row.action}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

function SavingsMomentumChart({
  data,
  currency,
  onOpenMonth,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  onOpenMonth: (dateFrom: string, dateTo: string) => void;
}) {
  const netValues = data.map((item) => item.income - item.expense);
  const hasData = data.some((item) => item.income > 0 || item.expense > 0);
  if (!hasData) return null;

  let running = 0;
  const cumulative = netValues.map((value) => {
    running += value;
    return running;
  });
  const lastNet = netValues[netValues.length - 1] ?? 0;
  const bestNet = Math.max(...netValues);
  const worstNet = Math.min(...netValues);
  const maxAbs = Math.max(...netValues.map((value) => Math.abs(value)), 1);
  const trendText = cumulative[cumulative.length - 1] >= cumulative[0] ? "subiendo" : "bajando";
  const trendColor = cumulative[cumulative.length - 1] >= cumulative[0] ? COLORS.income : COLORS.expense;

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Evolución</Text>
      <SectionTitle>Ahorro neto acumulado</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Resume si tus meses recientes vienen dejando margen o consumiendo caja. Verde suma ahorro, rojo lo reduce.
      </Text>
      <View style={subStyles.savingsSparkWrap}>
        <SparkLine values={cumulative} width={260} height={86} positiveColor={COLORS.income} negativeColor={COLORS.expense} />
      </View>
      <View style={subStyles.savingsStatsRow}>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Último mes</Text>
          <Text style={[subStyles.savingsStatValue, { color: lastNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {lastNet >= 0 ? "+" : ""}{formatCurrency(lastNet, currency)}
          </Text>
        </View>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Mejor</Text>
          <Text style={[subStyles.savingsStatValue, { color: bestNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {bestNet >= 0 ? "+" : ""}{formatCurrency(bestNet, currency)}
          </Text>
        </View>
        <View style={subStyles.savingsStatCard}>
          <Text style={subStyles.savingsStatLabel}>Tendencia</Text>
          <Text style={[subStyles.savingsStatValue, { color: trendColor }]}>{trendText}</Text>
        </View>
      </View>
      <View style={subStyles.netBarsRow}>
        {data.map((item, index) => {
          const net = netValues[index] ?? 0;
          const height = Math.max(4, (Math.abs(net) / maxAbs) * 34);
          const isPositive = net >= 0;
          const monthDate = subMonths(new Date(), data.length - 1 - index);
          const dateFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
          const dateTo = format(index === data.length - 1 ? new Date() : endOfMonth(monthDate), "yyyy-MM-dd");
          return (
            <TouchableOpacity key={item.label} style={subStyles.netBarsCol} onPress={() => onOpenMonth(dateFrom, dateTo)} activeOpacity={0.84}>
              <View style={subStyles.netBarsBox}>
                <View style={subStyles.netBarsAxis} />
                <View
                  style={[
                    subStyles.netBar,
                    isPositive ? subStyles.netBarPositive : subStyles.netBarNegative,
                    {
                      height,
                      bottom: isPositive ? 34 : undefined,
                      top: isPositive ? undefined : 34,
                    },
                  ]}
                />
              </View>
              <Text style={subStyles.chartLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={subStyles.visualChartFootnote}>Peor mes observado: {formatCurrency(worstNet, currency)}.</Text>
    </Card>
  );
}

function CategoryDonutChart({
  catTotals,
  categories,
  currency,
  onOpenCategory,
}: {
  catTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  currency: string;
  onOpenCategory: (categoryId: number | null) => void;
}) {
  const catMap = new Map(categories.map((category) => [category.id, category.name]));
  const allEntries = Array.from(catTotals.entries())
    .map(([id, total]) => ({ id, key: `${id ?? "none"}`, name: catMap.get(id ?? -1) ?? "Sin categoría", total }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
  const total = allEntries.reduce((sum, entry) => sum + entry.total, 0);
  if (total <= 0) return null;

  const palette = [COLORS.expense, COLORS.gold, COLORS.primary, COLORS.secondary, "#9EB7FF"];
  const topEntries = allEntries.slice(0, 5);
  const rest = allEntries.slice(5).reduce((sum, entry) => sum + entry.total, 0);
  const visibleEntries = rest > 0 ? [...topEntries, { id: undefined, key: "rest", name: "Otros", total: rest }] : topEntries;
  const segments: RingSegment[] = visibleEntries.map((entry, index) => ({
    key: entry.key,
    value: entry.total,
    color: palette[index % palette.length] + "dd",
  }));
  const leader = visibleEntries[0];
  const leaderPct = Math.round((leader.total / total) * 100);

  return (
    <Card>
      <Text style={subStyles.visualChartKicker}>Distribución</Text>
      <SectionTitle>Mapa de gasto por categoría</SectionTitle>
      <Text style={subStyles.visualChartIntro}>
        Sirve para detectar si el mes está concentrado en una sola categoría o repartido en varios hábitos.
      </Text>
      <View style={subStyles.donutChartBody}>
        <TouchableOpacity style={subStyles.donutWrap} onPress={() => onOpenCategory(leader.id ?? null)} activeOpacity={0.84}>
          <RingChart segments={segments} size={132} thickness={22} />
          <View style={subStyles.donutCenter}>
            <Text style={subStyles.donutCenterValue}>{leaderPct}%</Text>
            <Text style={subStyles.donutCenterLabel} numberOfLines={1}>{leader.name}</Text>
          </View>
        </TouchableOpacity>
        <View style={subStyles.donutLegend}>
          {visibleEntries.map((entry, index) => (
            <TouchableOpacity
              key={entry.key}
              style={subStyles.donutLegendRow}
              onPress={entry.id === undefined ? undefined : () => onOpenCategory(entry.id ?? null)}
              activeOpacity={entry.id === undefined ? 1 : 0.84}
            >
              <View style={[subStyles.donutLegendDot, { backgroundColor: palette[index % palette.length] }]} />
              <View style={{ flex: 1 }}>
                <Text style={subStyles.donutLegendName} numberOfLines={1}>{entry.name}</Text>
                <Text style={subStyles.donutLegendPct}>{Math.round((entry.total / total) * 100)}% del gasto</Text>
              </View>
              <Text style={subStyles.donutLegendAmount}>{formatCurrency(entry.total, currency)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Card>
  );
}

type AnnualHistoryMonth = {
  label: string;
  income: number;
  expense: number;
  net: number;
  cumulativeNet: number;
  dateFrom: string;
  dateTo: string;
  isFuture: boolean;
};

function AnnualHistoryPanel({
  years,
  selectedYear,
  onSelectYear,
  data,
  currency,
  onSelectMonth,
}: {
  years: number[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
  data: AnnualHistoryMonth[];
  currency: string;
  onSelectMonth: (month: AnnualHistoryMonth) => void;
}) {
  const observed = data.filter((month) => !month.isFuture);
  const yearIncome = observed.reduce((sum, month) => sum + month.income, 0);
  const yearExpense = observed.reduce((sum, month) => sum + month.expense, 0);
  const yearNet = yearIncome - yearExpense;
  const savingsRate = yearIncome > 0 ? (yearNet / yearIncome) * 100 : null;
  const maxFlow = Math.max(...data.flatMap((month) => [month.income, month.expense]), 1);
  const maxNetAbs = Math.max(...observed.map((month) => Math.abs(month.net)), 1);
  const bestMonth = observed.reduce<AnnualHistoryMonth | null>((best, month) => (!best || month.net > best.net ? month : best), null);
  const worstMonth = observed.reduce<AnnualHistoryMonth | null>((worst, month) => (!worst || month.net < worst.net ? month : worst), null);

  if (observed.length === 0) return null;

  return (
    <Card>
      <View style={subStyles.annualHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={subStyles.visualChartKicker}>Historial anual</Text>
          <SectionTitle>Ingresos, gastos y ahorro</SectionTitle>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={subStyles.annualYearList}>
          {years.map((year) => (
            <TouchableOpacity
              key={year}
              style={[subStyles.annualYearPill, selectedYear === year && subStyles.annualYearPillActive]}
              onPress={() => onSelectYear(year)}
              activeOpacity={0.84}
            >
              <Text style={[subStyles.annualYearText, selectedYear === year && subStyles.annualYearTextActive]}>{year}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <Text style={subStyles.visualChartIntro}>
        Esta lectura compara cada mes del año y muestra si el neto acumulado está construyendo margen o consumiéndolo.
      </Text>

      <View style={subStyles.annualSummaryGrid}>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Ingresos</Text>
          <Text style={[subStyles.annualSummaryValue, { color: COLORS.income }]}>{formatCurrency(yearIncome, currency)}</Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Gastos</Text>
          <Text style={[subStyles.annualSummaryValue, { color: COLORS.expense }]}>{formatCurrency(yearExpense, currency)}</Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Neto</Text>
          <Text style={[subStyles.annualSummaryValue, { color: yearNet >= 0 ? COLORS.income : COLORS.expense }]}>
            {yearNet >= 0 ? "+" : ""}{formatCurrency(yearNet, currency)}
          </Text>
        </View>
        <View style={subStyles.annualSummaryCard}>
          <Text style={subStyles.savingsStatLabel}>Ahorro</Text>
          <Text style={[subStyles.annualSummaryValue, { color: savingsRate == null ? COLORS.storm : savingsRate >= 0 ? COLORS.gold : COLORS.expense }]}>
            {savingsRate == null ? "-" : `${savingsRate.toFixed(1)}%`}
          </Text>
        </View>
      </View>

      <View style={subStyles.annualFlowChart}>
        {data.map((month) => (
          <TouchableOpacity
            key={month.label}
            style={[subStyles.annualMonthCol, month.isFuture && subStyles.annualMonthColMuted]}
            onPress={month.isFuture ? undefined : () => onSelectMonth(month)}
            activeOpacity={month.isFuture ? 1 : 0.84}
          >
            <View style={subStyles.annualBarsBox}>
              <View
                style={[
                  subStyles.annualFlowBar,
                  { height: Math.max((month.income / maxFlow) * 70, month.income > 0 ? 3 : 0), backgroundColor: COLORS.income + "cc" },
                ]}
              />
              <View
                style={[
                  subStyles.annualFlowBar,
                  { height: Math.max((month.expense / maxFlow) * 70, month.expense > 0 ? 3 : 0), backgroundColor: COLORS.expense + "cc" },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{month.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={subStyles.chartLegend}>
        <View style={subStyles.legendItem}><View style={[subStyles.legendDot, { backgroundColor: COLORS.income }]} /><Text style={subStyles.legendText}>Ingresos</Text></View>
        <View style={subStyles.legendItem}><View style={[subStyles.legendDot, { backgroundColor: COLORS.expense }]} /><Text style={subStyles.legendText}>Gastos</Text></View>
      </View>

      <View style={subStyles.annualNetList}>
        {observed.map((month) => {
          const width = Math.max(8, (Math.abs(month.net) / maxNetAbs) * 100);
          const positive = month.net >= 0;
          return (
            <TouchableOpacity key={month.label} style={subStyles.annualNetRow} onPress={() => onSelectMonth(month)} activeOpacity={0.84}>
              <Text style={subStyles.annualNetMonth}>{month.label}</Text>
              <View style={subStyles.annualNetTrack}>
                <View style={[subStyles.annualNetFill, { width: `${width}%` as any, backgroundColor: positive ? COLORS.income : COLORS.expense }]} />
              </View>
              <Text style={[subStyles.annualNetAmount, { color: positive ? COLORS.income : COLORS.expense }]}>
                {positive ? "+" : ""}{formatCurrency(month.net, currency)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={subStyles.visualChartFootnote}>
        Mejor mes: {bestMonth ? `${bestMonth.label} (${formatCurrency(bestMonth.net, currency)})` : "-"} · Peor mes: {worstMonth ? `${worstMonth.label} (${formatCurrency(worstMonth.net, currency)})` : "-"}.
      </Text>
    </Card>
  );
}

type AdvancedTab = 'Resumen' | 'Patrones' | 'Flujo' | 'Historial' | 'Salud';

const ADVANCED_TABS: { id: AdvancedTab; label: string }[] = [
  { id: 'Resumen',   label: 'Resumen' },
  { id: 'Patrones',  label: 'Patrones' },
  { id: 'Flujo',     label: 'Flujo' },
  { id: 'Historial', label: 'Historial' },
  { id: 'Salud',     label: 'Salud' },
];

type TabIndicator = { tab: AdvancedTab; count?: number; dot?: string };

function DashboardTabBar({
  activeTab,
  onTabChange,
  indicators = [],
}: {
  activeTab: AdvancedTab;
  onTabChange: (tab: AdvancedTab) => void;
  indicators?: TabIndicator[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabBarStyles.row}
      style={tabBarStyles.container}
    >
      {ADVANCED_TABS.map((tab) => {
        const ind = indicators.find((i) => i.tab === tab.id);
        return (
        <Pressable
          key={tab.id}
          onPress={() => onTabChange(tab.id)}
          style={[tabBarStyles.chip, activeTab === tab.id && tabBarStyles.chipActive]}
        >
          <Text style={[tabBarStyles.chipText, activeTab === tab.id && tabBarStyles.chipTextActive]}>
            {tab.label}
          </Text>
          {ind?.count != null && ind.count > 0 ? (
            <View style={tabBarStyles.badge}>
              <Text style={tabBarStyles.badgeText}>{ind.count > 99 ? "99+" : ind.count}</Text>
            </View>
          ) : ind?.dot ? (
            <View style={[tabBarStyles.dot, { backgroundColor: ind.dot }]} />
          ) : null}
        </Pressable>
        );
      })}
    </ScrollView>
  );
}

const tabBarStyles = StyleSheet.create({
  container: { marginBottom: 4 },
  row: { paddingHorizontal: SPACING.md, gap: 8, paddingVertical: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    position: "relative",
  },
  chipActive: {
    backgroundColor: 'rgba(107,228,197,0.14)',
    borderColor: 'rgba(107,228,197,0.45)',
  },
  chipText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 13,
    color: COLORS.storm,
  },
  chipTextActive: {
    color: '#6BE4C5',
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: "#090D12",
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});

function AdvancedDashboard({
  movements,
  obligations,
  subscriptions,
  recurringIncome,
  snapshot,
  activeAccounts,
  activeCurrency,
  baseCurrency,
  exchangeRateMap,
  currentVisibleBalance,
  workspaceId,
  userId,
  showAdvancedGift,
  analytics,
  router,
  accountCurrencyMap,
  onRequestPrecisionFocus,
  onScrollToTop,
}: {
  movements: DashboardMovementRow[];
  obligations: Array<{ id: number; title: string; direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string; lastPaymentDate?: string | null; startDate?: string; counterparty: string }>;
  subscriptions: Array<{ id: number; name: string; amount: number; currencyCode: string; nextDueDate: string; accountId?: number | null; status: string; frequency: string; intervalCount: number }>;
  recurringIncome: Array<{ id: number; name: string; amount: number; currencyCode: string; nextExpectedDate: string; status: string }>;
  snapshot: any;
  activeAccounts: { id: number; name: string; currentBalance: number; currentBalanceInBaseCurrency?: number | null; currencyCode: string; includeInNetWorth: boolean; isArchived: boolean }[];
  activeCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
  workspaceId: number | null;
  userId?: string | null;
  showAdvancedGift?: boolean;
  analytics: DashboardAnalyticsBundle | null | undefined;
  router: ReturnType<typeof useRouter>;
  accountCurrencyMap: Map<number, string>;
  onRequestPrecisionFocus?: () => void;
  onScrollToTop?: () => void;
}) {
  const advancedStats = useDashboardStats(movements, "month", {
    accountCurrencyMap,
    exchangeRateMap,
    displayCurrency: activeCurrency,
  });
  const historyYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const movement of movements) {
      const year = new Date(movement.occurredAt).getFullYear();
      if (Number.isFinite(year)) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [movements]);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(new Date().getFullYear());
  const [selectedAnnualMonth, setSelectedAnnualMonth] = useState<AnnualHistoryMonth | null>(null);
  useEffect(() => {
    if (!historyYears.includes(selectedHistoryYear) && historyYears.length > 0) {
      setSelectedHistoryYear(historyYears[0]);
    }
  }, [historyYears, selectedHistoryYear]);
  const annualHistory = useMemo<AnnualHistoryMonth[]>(() => {
    const now = new Date();
    let cumulativeNet = 0;
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(selectedHistoryYear, monthIndex, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const cappedEnd = selectedHistoryYear === now.getFullYear() && monthIndex === now.getMonth() ? now : monthEnd;
      const isFuture = monthStart > now;
      const monthMovements = isFuture ? [] : movements.filter((movement) => inRange(movement, monthStart, cappedEnd));
      const income = monthMovements.filter(isIncome).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
      const expense = monthMovements.filter(isExpense).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
      const net = income - expense;
      if (!isFuture) cumulativeNet += net;
      return {
        label: format(monthDate, "MMM", { locale: es }),
        income,
        expense,
        net,
        cumulativeNet,
        dateFrom: format(monthStart, "yyyy-MM-dd"),
        dateTo: format(cappedEnd, "yyyy-MM-dd"),
        isFuture,
      };
    });
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements, selectedHistoryYear]);
  const historyChangePoint = useMemo(
    () => detectHistoryChangePoint(annualHistory),
    [annualHistory],
  );
  const monthClusters = useMemo(
    () => clusterHistoryMonths(annualHistory),
    [annualHistory],
  );
  const review = useMemo(() => buildReviewInboxSnapshot(movements, subscriptions, obligations), [movements, obligations, subscriptions]);
  const windows = useMemo(
    () => buildFutureFlowWindows(obligations, subscriptions, recurringIncome, activeCurrency, exchangeRateMap, currentVisibleBalance),
    [activeCurrency, currentVisibleBalance, exchangeRateMap, obligations, recurringIncome, subscriptions],
  );
  const weekWindow = windows[0];

  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements.filter((movement) => inRange(movement, start, now) && isIncome(movement)).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    const expense = movements.filter((movement) => inRange(movement, start, now) && isExpense(movement)).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    return { income, expense, net: income - expense, daysElapsed: Math.max(1, differenceInDays(now, start) + 1) };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

  const monthRecurringIncomeProjection = useMemo(() => {
    const now = new Date();
    const monthEnd = endOfMonth(now);
    return recurringIncome
      .filter((income) => income.status === "active")
      .reduce((sum, income) => {
        const expectedDate = parseDisplayDate(income.nextExpectedDate);
        if (expectedDate < now || expectedDate > monthEnd) return sum;
        return sum + convertDashboardCurrency(income.amount, income.currencyCode, activeCurrency, exchangeRateMap);
      }, 0);
  }, [activeCurrency, exchangeRateMap, recurringIncome]);

  // A3: Cash Cushion — días de caja libre al ritmo actual
  const cashCushion = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 29);
    const totalExpenses30d = movements
      .filter((m) => isExpense(m) && inRange(m, thirtyDaysAgo, now))
      .reduce((sum, m) => sum + expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    const dailyBurn = totalExpenses30d / 30;
    const days = Math.round(currentVisibleBalance / Math.max(dailyBurn, 1));
    const adjustedDailyBurn = dailyBurn + (windows[2]?.expectedOutflow ?? 0) / 30;
    const daysWithCommitments = Math.round(currentVisibleBalance / Math.max(adjustedDailyBurn, 1));
    const label = days >= 90 ? "Sólido" : days >= 30 ? "Adecuado" : "Corto";
    const color = days >= 90 ? COLORS.income : days >= 30 ? COLORS.gold : COLORS.expense;
    return { days, daysWithCommitments, dailyBurn, label, color };
  }, [accountCurrencyMap, activeCurrency, currentVisibleBalance, exchangeRateMap, movements, windows]);

  // A2: EMA de tendencia de gasto semanal (alpha=0.35, últimas 12 semanas)
  const spendingTrend = useMemo(() => {
    const now = new Date();
    const weekBuckets: number[] = Array.from({ length: 12 }, () => 0);
    for (const m of movements.filter(isExpense)) {
      const weeksAgo = Math.floor(differenceInDays(now, new Date(m.occurredAt)) / 7);
      if (weeksAgo >= 0 && weeksAgo < 12) {
        weekBuckets[11 - weeksAgo] += expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
      }
    }
    const alpha = 0.35;
    let ema = weekBuckets[0];
    let prevEma = ema;
    for (let i = 1; i < weekBuckets.length; i++) {
      prevEma = ema;
      ema = alpha * weekBuckets[i] + (1 - alpha) * ema;
    }
    const trendPct = prevEma > 0 ? ((ema - prevEma) / prevEma) * 100 : 0;
    const label = trendPct > 5 ? "^ acelerando" : trendPct < -5 ? "v desacelerando" : "-> estable";
    const color = trendPct > 5 ? COLORS.expense : trendPct < -5 ? COLORS.income : COLORS.storm;
    return { expenseTrendPct: trendPct, expenseTrendLabel: label, expenseTrendColor: color };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

  // N1: Tasa de ahorro mensual - (ingreso - gasto) / ingreso para cada uno de los últimos 6 meses
  const categoryMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const category of snapshot?.categories ?? []) map.set(category.id, category.name);
    return map;
  }, [snapshot?.categories]);

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const account of snapshot?.accounts ?? []) map.set(account.id, account.name);
    return map;
  }, [snapshot?.accounts]);

  const counterpartyMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const counterparty of snapshot?.counterparties ?? []) map.set(counterparty.id, counterparty.name);
    return map;
  }, [snapshot?.counterparties]);

  const historyFactorAnalysis = useMemo(() => {
    const now = new Date();
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency };
    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(selectedHistoryYear, monthIndex, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const cappedEnd = selectedHistoryYear === now.getFullYear() && monthIndex === now.getMonth() ? now : monthEnd;
      const isFuture = monthStart > now;
      const totals = new Map<number | null, number>();
      if (!isFuture) {
        for (const movement of movements.filter((item) => isExpense(item) && inRange(item, monthStart, cappedEnd))) {
          const key = movement.categoryId ?? null;
          totals.set(key, (totals.get(key) ?? 0) + expenseAmt(movement, ctx));
        }
      }
      return {
        label: format(monthDate, "MMM", { locale: es }),
        dateFrom: format(monthStart, "yyyy-MM-dd"),
        dateTo: format(cappedEnd, "yyyy-MM-dd"),
        isFuture,
        categories: Array.from(totals.entries()).map(([categoryId, amount]) => ({
          categoryId,
          name: categoryId == null ? "Sin categoría" : categoryMap.get(categoryId) ?? "Categoría",
          amount,
        })),
      };
    });
    return buildHistoryFactorAnalysis({ months });
  }, [accountCurrencyMap, activeCurrency, categoryMap, exchangeRateMap, movements, selectedHistoryYear]);

  const historyReadiness = useMemo(() => {
    const observedMonths = annualHistory.filter((month) => !month.isFuture && (month.income > 0.009 || month.expense > 0.009)).length;
    const yearStart = startOfDay(new Date(selectedHistoryYear, 0, 1));
    const yearEnd = endOfDay(new Date(selectedHistoryYear, 11, 31));
    const yearMovements = movements.filter((movement) => movement.status === "posted" && inRange(movement, yearStart, yearEnd));
    const expenseCategoryIds = new Set(
      yearMovements
        .filter(isExpense)
        .filter((movement) => expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }) > 0.009)
        .map((movement) => movement.categoryId ?? null),
    );
    return {
      observedMonths,
      movementCount: yearMovements.length,
      expenseCategoryCount: expenseCategoryIds.size,
      allReady: observedMonths >= 6 && expenseCategoryIds.size >= 2 && yearMovements.length >= 8,
    };
  }, [accountCurrencyMap, activeCurrency, annualHistory, exchangeRateMap, movements, selectedHistoryYear]);

  const selectedAnnualMonthDetail = useMemo(() => {
    if (!selectedAnnualMonth) return null;
    const from = startOfDay(parseDisplayDate(selectedAnnualMonth.dateFrom));
    const to = endOfDay(parseDisplayDate(selectedAnnualMonth.dateTo));
    const monthMovements = movements.filter((movement) => inRange(movement, from, to));
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency };
    const categoryTotals = new Map<number | null, number>();

    for (const movement of monthMovements.filter(isExpense)) {
      const key = movement.categoryId ?? null;
      categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + expenseAmt(movement, ctx));
    }

    let topCategoryId: number | null = null;
    let topCategoryAmount = 0;
    for (const [categoryId, amount] of categoryTotals.entries()) {
      if (amount > topCategoryAmount) {
        topCategoryId = categoryId;
        topCategoryAmount = amount;
      }
    }

    const relevantMovements = monthMovements
      .filter((movement) => isIncome(movement) || isExpense(movement))
      .map((movement) => {
        const income = isIncome(movement);
        const amount = income ? incomeAmt(movement, ctx) : expenseAmt(movement, ctx);
        return {
          id: movement.id,
          title: movement.description.trim() || (income ? "Ingreso" : "Gasto"),
          amount,
          income,
          date: format(new Date(movement.occurredAt), "d MMM", { locale: es }),
          accountName: accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta",
          categoryName: movement.categoryId != null ? (categoryMap.get(movement.categoryId) ?? "Categoría") : "Sin categoría",
        };
      })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 4);

    const savingsRate = selectedAnnualMonth.income > 0 ? (selectedAnnualMonth.net / selectedAnnualMonth.income) * 100 : null;
    const monthIndex = annualHistory.findIndex((m) => m.dateFrom === selectedAnnualMonth.dateFrom);
    const prevMonth = monthIndex > 0 ? annualHistory[monthIndex - 1] : null;
    return {
      month: selectedAnnualMonth,
      incomeCount: monthMovements.filter(isIncome).length,
      expenseCount: monthMovements.filter(isExpense).length,
      topCategoryId,
      topCategoryName: topCategoryAmount > 0 ? (topCategoryId != null ? (categoryMap.get(topCategoryId) ?? "Categoría") : "Sin categoría") : "Sin gasto categorizado",
      topCategoryAmount,
      largestMovements: relevantMovements,
      savingsRate,
      prevMonth,
    };
  }, [accountCurrencyMap, accountMap, activeCurrency, annualHistory, categoryMap, exchangeRateMap, movements, selectedAnnualMonth]);

  const monthlySavingsRate = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const mDate = subMonths(now, 5 - i);
      const mStart = startOfMonth(mDate);
      const mEnd = i === 5 ? now : endOfMonth(mDate);
      const mMvs = movements.filter((m) => inRange(m, mStart, mEnd));
      const inc = mMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
      const exp = mMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
      const rate = inc > 0 ? ((inc - exp) / inc) * 100 : null;
      return { label: format(mDate, "MMM", { locale: es }), income: inc, expense: exp, rate };
    });
    const validRates = months.map((m) => m.rate).filter((r): r is number => r !== null);
    const avgRate = validRates.length > 0 ? validRates.reduce((s, r) => s + r, 0) / validRates.length : null;
    const lastRate = months[5].rate;
    const trend = validRates.length >= 3
      ? (validRates[validRates.length - 1] - validRates[0]) > 3 ? "mejorando"
        : (validRates[validRates.length - 1] - validRates[0]) < -3 ? "empeorando"
        : "estable"
      : "insuficiente";
    const color = lastRate == null ? COLORS.storm : lastRate >= 20 ? COLORS.income : lastRate >= 0 ? COLORS.gold : COLORS.expense;
    return { months, avgRate, lastRate, trend, color };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

  // N2: Score de estabilidad de ingresos - coeficiente de variación sobre 6 meses (bajo CV = estable)
  const incomeStabilityScore = useMemo(() => {
    const incomes = advancedStats.monthlyPulse.map((m) => m.income).filter((v) => v > 0);
    if (incomes.length < 3) return { score: null, cvPct: null, label: "Historial insuficiente", color: COLORS.storm };
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const variance = incomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / incomes.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 1;
    const score = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));
    const cvPct = Math.round(cv * 100);
    const label = score >= 75 ? "Muy estable" : score >= 50 ? "Moderado" : "Variable";
    const color = score >= 75 ? COLORS.income : score >= 50 ? COLORS.gold : COLORS.expense;
    return { score, cvPct, label, color };
  }, [advancedStats.monthlyPulse]);

  // N3: Índice de concentración de gasto Herfindahl-Hirschman (HHI) - diversificación entre categorías
  const categoryConcentration = useMemo(() => {
    const catTotals = advancedStats.catTotals;
    const total = Array.from(catTotals.values()).reduce((s, v) => s + v, 0);
    if (total <= 0) return { hhi: null, label: "Sin datos", color: COLORS.storm, topCategory: null, topCategoryId: null, topShare: null };
    const hhi = Array.from(catTotals.values()).reduce((s, v) => s + Math.pow(v / total, 2), 0);
    const label = hhi > 0.25 ? "Concentrado" : hhi > 0.15 ? "Moderado" : "Diversificado";
    const color = hhi > 0.25 ? COLORS.expense : hhi > 0.15 ? COLORS.gold : COLORS.income;
    let topCatId: number | null = null;
    let topVal = 0;
    for (const [catId, val] of catTotals) {
      if (val > topVal) { topVal = val; topCatId = catId as number | null; }
    }
    const topShare = topVal > 0 ? Math.round((topVal / total) * 100) : null;
    const topCategory = topCatId != null ? (categoryMap.get(topCatId) ?? "Sin categoría") : "Sin categoría";
    return { hhi: Math.round(hhi * 1000) / 1000, label, color, topCategory, topCategoryId: topCatId, topShare };
  }, [advancedStats.catTotals, categoryMap]);

  // N4: Eficiencia de cobranza - porcentaje de obligaciones a cobrar resueltas en los últimos 30 días
  const collectionEfficiency = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const receivable = obligations.filter((ob) => ob.direction === "receivable");
    if (receivable.length === 0) return { rate: null, resolved: 0, total: 0, label: "Sin cobros", color: COLORS.storm };
    const dueInWindow = receivable.filter((ob) => {
      if (!ob.dueDate) return false;
      const d = new Date(ob.dueDate);
      return d >= thirtyDaysAgo && d <= now;
    });
    const total = dueInWindow.length;
    if (total === 0) return { rate: null, resolved: 0, total: 0, label: "Nada vencido", color: COLORS.income };
    const resolved = dueInWindow.filter((ob) => ob.status === "paid").length;
    const rate = Math.round((resolved / total) * 100);
    const label = rate >= 80 ? "Eficiente" : rate >= 50 ? "Parcial" : "Bajo";
    const color = rate >= 80 ? COLORS.income : rate >= 50 ? COLORS.gold : COLORS.expense;
    return { rate, resolved, total, label, color };
  }, [obligations]);

  // N5: Comparación estacional - mes actual vs mismo mes del año pasado
  const seasonalComparison = useMemo(() => {
    const now = new Date();
    const curStart = startOfMonth(now);
    const curEnd = now;
    const prevYearStart = startOfMonth(subMonths(now, 12));
    const prevYearEnd = endOfMonth(subMonths(now, 12));
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency };
    const curMvs = movements.filter((m) => inRange(m, curStart, curEnd));
    const prevMvs = movements.filter((m) => inRange(m, prevYearStart, prevYearEnd));
    const curIncome = curMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0);
    const curExpense = curMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0);
    const prevIncome = prevMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, ctx), 0);
    const prevExpense = prevMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, ctx), 0);
    const hasHistory = prevMvs.length >= 3;
    const expenseDelta = prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense) * 100 : null;
    const incomeDelta = prevIncome > 0 ? ((curIncome - prevIncome) / prevIncome) * 100 : null;
    const expenseLabel = expenseDelta == null ? "-"
      : expenseDelta > 10 ? `^ +${expenseDelta.toFixed(0)}% vs año pasado`
      : expenseDelta < -10 ? `v ${expenseDelta.toFixed(0)}% vs año pasado`
      : `-> similar al año pasado`;
    const expenseColor = expenseDelta == null ? COLORS.storm : expenseDelta > 10 ? COLORS.expense : expenseDelta < -10 ? COLORS.income : COLORS.storm;
    return { hasHistory, curIncome, curExpense, prevIncome, prevExpense, expenseDelta, incomeDelta, expenseLabel, expenseColor };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

  // U1: review de la semana anterior para mostrar delta en Executive Summary
  const priorWeekReview = useMemo(() => {
    const now = new Date();
    const weekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);
    const priorMoves = movements.filter((m) => inRange(m, twoWeeksAgo, weekAgo));
    return buildReviewInboxSnapshot(priorMoves, subscriptions, obligations);
  }, [movements, obligations, subscriptions]);

  const learning = useMemo(() => {
    const posted = movements.filter((movement) => movement.status === "posted");
    const useful = posted.filter((movement) => movement.movementType !== "obligation_opening");
    const categorizedBase = useful.filter(isCategorizedCashflow);
    const categorizedCount = categorizedBase.filter((movement) => movement.categoryId != null).length;
    const categorizedRate = categorizedBase.length > 0 ? categorizedCount / categorizedBase.length : 0;
    const oldest = useful[useful.length - 1];
    const historyDays = oldest ? Math.max(1, differenceInDays(new Date(), new Date(oldest.occurredAt))) : 0;
    const readinessScore = Math.round(Math.min(1, useful.length / 120) * 40 + Math.min(1, historyDays / 120) * 25 + categorizedRate * 35);
    return { categorizedRate, historyDays, readinessScore, usefulCount: useful.length };
  }, [movements]);

  const anomalySignals = useMemo(
    () => buildAnomalyFindings(
      movements,
      { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency },
      categoryMap,
      accountMap,
    ),
    [accountCurrencyMap, accountMap, activeCurrency, categoryMap, exchangeRateMap, movements],
  );

  const repeatedPatterns = useMemo(() => {
    const now = new Date();
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency };
    return buildPatternClusters<DashboardMovementRow>({
      movements,
      isCashflow: isCategorizedCashflow,
      isIncomeLike: movementActsAsIncome,
      getAmount: (movement) => movementActsAsIncome(movement)
        ? incomeAmt(movement, ctx)
        : expenseAmt(movement, ctx),
      categoryNames: categoryMap,
      now,
      sinceDays: 90,
      limit: 4,
    }).map((cluster) => ({
      ...cluster,
      lastLabel: format(new Date(cluster.lastAt), "d MMM", { locale: es }),
    }));
  }, [accountCurrencyMap, activeCurrency, categoryMap, exchangeRateMap, movements]);

  const risingCategoryPatterns = useMemo(() => {
    const now = new Date();
    const currentStart = subDays(now, 13);
    const previousStart = subDays(now, 27);
    const previousEnd = subDays(now, 14);
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency };
    const currentTotals = new Map<number | null, number>();
    const previousTotals = new Map<number | null, number>();
    const currentMovementIds = new Map<number | null, number[]>();

    for (const movement of movements.filter((item) => item.status === "posted" && isExpense(item))) {
      const key = movement.categoryId ?? null;
      const amount = expenseAmt(movement, ctx);
      if (inRange(movement, currentStart, now)) {
        currentTotals.set(key, (currentTotals.get(key) ?? 0) + amount);
        currentMovementIds.set(key, [...(currentMovementIds.get(key) ?? []), movement.id]);
      } else if (inRange(movement, previousStart, previousEnd)) {
        previousTotals.set(key, (previousTotals.get(key) ?? 0) + amount);
      }
    }

    return Array.from(currentTotals.entries())
      .map(([categoryId, current]) => {
        const previous = previousTotals.get(categoryId) ?? 0;
        const delta = current - previous;
        const pct = previous > 0 ? (delta / previous) * 100 : null;
        const name = categoryId != null ? (categoryMap.get(categoryId) ?? "Categoría") : "Sin categoría";
        return { categoryId, name, current, previous, delta, pct, movementIds: currentMovementIds.get(categoryId) ?? [] };
      })
      .filter((item) => item.delta > Math.max(10, item.previous * 0.18) && item.current >= 12)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 4);
  }, [accountCurrencyMap, activeCurrency, categoryMap, exchangeRateMap, movements]);

  const patternQuickRead = useMemo(() => {
    const topRepeat = repeatedPatterns[0] ?? null;
    const topRise = risingCategoryPatterns[0] ?? null;
    const topAnomaly = anomalySignals[0] ?? null;
    return {
      repeatTitle: topRepeat ? topRepeat.label : "Sin hábito repetido claro",
      repeatBody: topRepeat
        ? `${topRepeat.count} veces en 90 días · promedio ${formatCurrency(topRepeat.average, activeCurrency)}`
        : "Aún falta repetición para reconocer un hábito.",
      riseTitle: topRise ? topRise.name : "Sin subida fuerte",
      riseBody: topRise
        ? `${formatCurrency(topRise.delta, activeCurrency)} más que los 14 días anteriores`
        : "Las categorías recientes se ven parejas.",
      anomalyTitle: topAnomaly ? `${anomalySignals.length} por revisar` : "Sin gastos raros",
      anomalyBody: topAnomaly
        ? "Hay movimientos que se salen de lo normal para tu propio historial."
        : "No vemos picos claros contra tus hábitos recientes.",
    };
  }, [activeCurrency, anomalySignals, repeatedPatterns, risingCategoryPatterns]);

  const persistedCategorySuggestions = useMemo(() => {
    if (!analytics?.signals?.length) return [];
    const movementMap = new Map(movements.map((movement) => [movement.id, movement]));
    return analytics.signals
      .map((signal) => {
        const movement = movementMap.get(signal.movementId);
        if (!movement || movement.categoryId != null || movement.status !== "posted" || !isCategorizedCashflow(movement)) {
          return null;
        }
        if (!signal.suggestedCategoryId || !signal.suggestedCategoryConfidence) return null;
        const amount = movementActsAsIncome(movement)
          ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency })
          : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
        return {
          movementId: movement.id,
          description: movement.description.trim() || "Movimiento sin descripción",
          occurredAt: movement.occurredAt,
          amount,
          suggestedCategoryId: signal.suggestedCategoryId,
          suggestedCategoryName:
            categoryMap.get(signal.suggestedCategoryId) ?? "Categoría sugerida",
          confidence: signal.suggestedCategoryConfidence,
          matchedSamples: 0,
          reasons:
            signal.signalReasons.length > 0
              ? signal.signalReasons
              : ["señal analítica persistida"],
        } satisfies DashboardCategorySuggestion;
      })
      .filter((item): item is DashboardCategorySuggestion => Boolean(item))
      .sort((a, b) => b.confidence - a.confidence || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 4);
  }, [accountCurrencyMap, activeCurrency, analytics?.signals, categoryMap, exchangeRateMap, movements]);

  const learningFeedbackCategorySuggestions = useMemo(() => (
    buildLearningFeedbackCategorySuggestions(
      movements,
      analytics?.learningFeedback ?? [],
      categoryMap,
      { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency },
    )
  ), [accountCurrencyMap, activeCurrency, analytics?.learningFeedback, categoryMap, exchangeRateMap, movements]);

  const acceptedFeedbackCount = useMemo(() => {
    const dedicatedCount = analytics?.learningFeedback.filter((feedback) =>
      feedback.feedbackKind === "accepted_category_suggestion" ||
      feedback.feedbackKind === "manual_category_change"
    ).length ?? 0;
    if (dedicatedCount > 0) return dedicatedCount;
    return analytics?.signals.filter((signal) =>
      signal.analyticsVersion === "v2-feedback" ||
      signal.signalReasons.some((reason) => reason.toLowerCase().includes("usuario acept"))
    ).length ?? 0;
  }, [analytics?.learningFeedback, analytics?.signals]);

  type CoachChip = { icon: LucideIcon; color: string; label: string; weight: "high" | "medium" | "low" };
  const panelCoachChips = useMemo<CoachChip[]>(() => {
    const chips: CoachChip[] = [];
    if (review.uncategorizedCount > 0)
      chips.push({ icon: Tag, color: COLORS.warning, label: `${review.uncategorizedCount} sin categoría · comparativos imprecisos`, weight: "high" });
    if (review.overdueObligationsCount > 0)
      chips.push({ icon: AlertTriangle, color: COLORS.expense, label: `${review.overdueObligationsCount} vencimiento${review.overdueObligationsCount === 1 ? "" : "s"} · cartera desactualizada`, weight: "high" });
    if (weekWindow.expectedOutflow > weekWindow.expectedInflow)
      chips.push({ icon: TrendingUp, color: COLORS.gold, label: "Semana: más sale que entra", weight: "medium" });
    if (spendingTrend.expenseTrendPct > 5)
      chips.push({ icon: TrendingUp, color: COLORS.gold, label: `Gasto acelerando +${spendingTrend.expenseTrendPct.toFixed(0)}% esta semana`, weight: "medium" });
    if (cashCushion.days < 30)
      chips.push({ icon: AlertCircle, color: COLORS.expense, label: `Caja libre: ${cashCushion.days}d solamente`, weight: "high" });
    if (chips.length === 0)
      chips.push({ icon: Sparkles, color: COLORS.income, label: "Base sana · sin fricción fuerte hoy", weight: "low" });
    return chips.slice(0, 4);
  }, [cashCushion.days, review.overdueObligationsCount, review.uncategorizedCount, spendingTrend.expenseTrendPct, weekWindow.expectedInflow, weekWindow.expectedOutflow]);

  const qualityOpenInitial = review.totalIssues > 0 || learning.readinessScore < 75;
  const [qualityOpen, setQualityOpen] = useState(qualityOpenInitial);
  useEffect(() => {
    setQualityOpen(qualityOpenInitial);
  }, [qualityOpenInitial]);
  const [executiveDetail, setExecutiveDetail] = useState<"focus" | "risk" | "month" | null>(null);
  const [advancedDetail, setAdvancedDetail] = useState<"focusCenter" | "projection" | "review" | "advancedMetrics" | "quality" | "categoryConcentration" | "savingsRate" | "incomeStability" | "seasonalComparison" | "collectionEfficiency" | null>(null);
  const [projectionDetail, setProjectionDetail] = useState<"conservative" | "expected" | "included" | null>(null);
  const [movementPreview, setMovementPreview] = useState<MovementPreviewSheetState | null>(null);
  const [applyingSuggestionMovementId, setApplyingSuggestionMovementId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const updateMovementMutation = useUpdateMovementMutation(workspaceId);
  const persistDashboardAnalyticsMutation = usePersistDashboardAnalyticsMutation(workspaceId);
  const persistLearningFeedbackMutation = usePersistLearningFeedbackMutation(workspaceId, userId);

  const summaryUncategorizedMovements = useMemo(() => (
    movements
      .filter((movement) => movement.status === "posted")
      .filter(isCategorizedCashflow)
      .filter((movement) => movement.categoryId == null)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id - a.id)
  ), [movements]);

  const currentMonthMovements = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    return sortMovementsRecentFirst(movements.filter((movement) => inRange(movement, monthStart, now)));
  }, [movements]);

  const currentMonthVariableMovements = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    return sortMovementsRecentFirst(
      movements.filter((movement) =>
        movement.status === "posted" &&
        inRange(movement, monthStart, now) &&
        (movement.movementType === "income" || movement.movementType === "refund" || movement.movementType === "expense")
      ),
    );
  }, [movements]);

  const pendingReviewMovements = useMemo(() => (
    sortMovementsRecentFirst(movements.filter((movement) => movement.status === "pending"))
  ), [movements]);

  const duplicateExpenseReviewMovements = useMemo(() => {
    const groups = findProbableDuplicateGroups({
      movements: movements.filter(isExpense),
      getAmount: movementDisplayAmount,
    });
    const movementIds = new Set(groups.flatMap((group) => group.movementIds));
    return sortMovementsRecentFirst(
      movements.filter((movement) => movementIds.has(movement.id)),
    );
  }, [movements]);

  const noCounterpartyReviewMovements = useMemo(() => (
    sortMovementsRecentFirst(
      movements.filter((movement) =>
        movement.status === "posted" &&
        isCategorizedCashflow(movement) &&
        movement.counterpartyId == null
      ),
    )
  ), [movements]);

  const movementById = useMemo(() => new Map(movements.map((movement) => [movement.id, movement])), [movements]);

  const getMovementsByIds = useCallback((movementIds: number[]) => (
    sortMovementsRecentFirst(
      Array.from(new Set(movementIds))
        .map((movementId) => movementById.get(movementId))
        .filter((movement): movement is DashboardMovementRow => Boolean(movement)),
    )
  ), [movementById]);

  const openMovementPreview = useCallback((preview: MovementPreviewSheetState) => {
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setSelectedAnnualMonth(null);
    setMovementPreview(preview);
  }, []);

  const openSummaryUncategorizedPreview = useCallback(() => {
    openMovementPreview({
      title: "Movimientos sin categoría",
      subtitle: `${summaryUncategorizedMovements.length} movimiento${summaryUncategorizedMovements.length === 1 ? "" : "s"} confirmado${summaryUncategorizedMovements.length === 1 ? "" : "s"} todavía no tiene${summaryUncategorizedMovements.length === 1 ? "" : "n"} categoría. Al ordenarlos, el dashboard compara mejor tus gastos e ingresos.`,
      scopeLabel: "Alcance: todos los movimientos confirmados sin categoría cargados en el dashboard.",
      emptyTitle: "No quedan movimientos sin categoría",
      emptyBody: "La lectura de Resumen ya no tiene esta tarea pendiente.",
      movements: summaryUncategorizedMovements,
    });
  }, [openMovementPreview, summaryUncategorizedMovements]);

  const openCurrentMonthMovementsPreview = useCallback(() => {
    const monthLabel = format(new Date(), "MMMM yyyy", { locale: es });
    openMovementPreview({
      title: "Movimientos del mes",
      subtitle: `${currentMonthMovements.length} movimiento${currentMonthMovements.length === 1 ? "" : "s"} dentro de ${monthLabel}. Esta es la misma ventana que usa la proyección de cierre del mes.`,
      scopeLabel: "Alcance: desde el primer día del mes actual hasta hoy.",
      emptyTitle: "No hay movimientos este mes",
      emptyBody: "Cuando registres ingresos o gastos del mes, aparecerán aquí.",
      movements: currentMonthMovements,
    });
  }, [currentMonthMovements, openMovementPreview]);

  const openFlowVariableMovementsPreview = useCallback(() => {
    const income = currentMonthVariableMovements
      .filter((movement) => movementActsAsIncome(movement))
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    const expense = currentMonthVariableMovements
      .filter((movement) => movementActsAsExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    openMovementPreview({
      title: "Ritmo variable del mes",
      subtitle: `${currentMonthVariableMovements.length} movimiento${currentMonthVariableMovements.length === 1 ? "" : "s"} variable${currentMonthVariableMovements.length === 1 ? "" : "s"} ya registrado${currentMonthVariableMovements.length === 1 ? "" : "s"} este mes. Entran ${formatCurrency(income, activeCurrency)} y salen ${formatCurrency(expense, activeCurrency)}.`,
      scopeLabel: "Alcance: ingresos, devoluciones y gastos confirmados del mes actual. No incluye transferencias ni agenda fija.",
      emptyTitle: "No hay ritmo variable este mes",
      emptyBody: "Cuando registres ingresos o gastos variables confirmados, aparecerán aquí.",
      movements: currentMonthVariableMovements,
    });
  }, [
    accountCurrencyMap,
    activeCurrency,
    currentMonthVariableMovements,
    exchangeRateMap,
    openMovementPreview,
  ]);

  const openPatternHabitPreview = useCallback((pattern: { label: string; count: number; total: number; average: number; movementIds: number[] }) => {
    const patternMovements = getMovementsByIds(pattern.movementIds);
    openMovementPreview({
      title: pattern.label,
      subtitle: `${pattern.count} movimiento${pattern.count === 1 ? "" : "s"} parecido${pattern.count === 1 ? "" : "s"} en los últimos 90 días. En total suman ${formatCurrency(pattern.total, activeCurrency)} y el promedio es ${formatCurrency(pattern.average, activeCurrency)}.`,
      scopeLabel: "Alcance: selección exacta detectada como hábito repetido en los últimos 90 días.",
      emptyTitle: "No encontramos movimientos para este hábito",
      emptyBody: "Puede pasar si la lista se actualizó mientras veías el dashboard.",
      movements: patternMovements,
    });
  }, [activeCurrency, getMovementsByIds, openMovementPreview]);

  const openRisingCategoryPreview = useCallback((item: { name: string; current: number; previous: number; delta: number; movementIds: number[] }) => {
    const categoryMovements = getMovementsByIds(item.movementIds);
    openMovementPreview({
      title: `Subida en ${item.name}`,
      subtitle: `En los últimos 14 días esta categoría suma ${formatCurrency(item.current, activeCurrency)}. Antes sumaba ${formatCurrency(item.previous, activeCurrency)}; la diferencia es ${formatCurrency(item.delta, activeCurrency)}.`,
      scopeLabel: "Alcance: movimientos exactos de esta categoría en los últimos 14 días.",
      emptyTitle: "No encontramos movimientos para esta subida",
      emptyBody: "Puede pasar si los datos cambiaron después de calcular la tarjeta.",
      movements: categoryMovements,
    });
  }, [activeCurrency, getMovementsByIds, openMovementPreview]);

  const openAnomalyMovementsPreview = useCallback((movementIds: number[], title = "Gastos fuera de costumbre") => {
    const anomalyMovements = getMovementsByIds(movementIds);
    openMovementPreview({
      title,
      subtitle: `${anomalyMovements.length} movimiento${anomalyMovements.length === 1 ? "" : "s"} se sale${anomalyMovements.length === 1 ? "" : "n"} de tu comportamiento reciente. No siempre está mal; solo conviene revisarlo.`,
      scopeLabel: "Alcance: selección exacta marcada por comparación contra tu propio historial reciente.",
      emptyTitle: "No hay gastos fuera de costumbre",
      emptyBody: "No encontramos movimientos raros con la selección actual.",
      movements: anomalyMovements,
    });
  }, [getMovementsByIds, openMovementPreview]);

  const openCategoryPeriodPreview = useCallback((categoryId: number | null, label?: string) => {
    const categoryName = label ?? (categoryId != null ? categoryMap.get(categoryId) ?? "Categoría" : "Sin categoría");
    const categoryMovements = sortMovementsRecentFirst(
      movements.filter((movement) =>
        isExpense(movement) &&
        inRange(movement, advancedStats.curStart, advancedStats.curEnd) &&
        (categoryId == null ? movement.categoryId == null : movement.categoryId === categoryId)
      ),
    );
    const total = categoryMovements.reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    openMovementPreview({
      title: categoryName,
      subtitle: `${categoryMovements.length} gasto${categoryMovements.length === 1 ? "" : "s"} del mes suman ${formatCurrency(total, activeCurrency)} en esta categoría.`,
      scopeLabel: `Alcance: ${format(advancedStats.curStart, "d MMM", { locale: es })} - ${format(advancedStats.curEnd, "d MMM yyyy", { locale: es })}.`,
      emptyTitle: "No hay movimientos en esta categoría",
      emptyBody: "La distribución se actualizará cuando existan gastos para esta selección.",
      movements: categoryMovements,
    });
  }, [
    accountCurrencyMap,
    activeCurrency,
    advancedStats.curEnd,
    advancedStats.curStart,
    categoryMap,
    exchangeRateMap,
    movements,
    openMovementPreview,
  ]);

  const openFinancialGraphNodePreview = useCallback((node: FinancialGraphRankNode) => {
    const nodeMovements = sortMovementsRecentFirst(
      movements.filter((movement) => {
        if (movement.status !== "posted") return false;
        if (node.kind === "account") {
          return node.entityId != null && (movement.sourceAccountId === node.entityId || movement.destinationAccountId === node.entityId);
        }
        if (node.kind === "category") {
          if (!isCategorizedCashflow(movement)) return false;
          return node.entityId == null ? movement.categoryId == null : movement.categoryId === node.entityId;
        }
        if (node.kind === "counterparty") {
          return node.entityId != null && movement.counterpartyId === node.entityId;
        }
        if (node.kind === "flow") {
          if (node.flowKind === "transfer") return isTransfer(movement);
          if (node.flowKind === "income") return movementActsAsIncome(movement);
          return movementActsAsExpense(movement);
        }
        return false;
      }),
    );
    const total = nodeMovements.reduce((sum, movement) => {
      if (isTransfer(movement)) return sum + transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
      return sum + (movementActsAsIncome(movement)
        ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency })
        : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }));
    }, 0);

    const kindLabel =
      node.kind === "account" ? "cuenta" :
      node.kind === "category" ? "categoría" :
      node.kind === "counterparty" ? "contacto" :
      "tipo de movimiento";

    openMovementPreview({
      title: node.label,
      subtitle: `${nodeMovements.length} movimiento${nodeMovements.length === 1 ? "" : "s"} conectado${nodeMovements.length === 1 ? "" : "s"} a este ${kindLabel}. En valor absoluto suman ${formatCurrency(total, activeCurrency)}.`,
      scopeLabel: "Alcance: movimientos confirmados de los últimos 90 días cargados por el dashboard avanzado.",
      emptyTitle: "No encontramos movimientos para este nodo",
      emptyBody: "Puede pasar si la lista se actualizó después de calcular el grafo.",
      movements: nodeMovements,
    });
  }, [
    accountCurrencyMap,
    activeCurrency,
    exchangeRateMap,
    movements,
    openMovementPreview,
  ]);

  const openWeeklyDayPreview = useCallback((day: {
    fullLabel: string;
    total: number;
    average: number;
    count: number;
    weekCount: number;
    movements: DashboardMovementRow[];
  }) => {
    openMovementPreview({
      title: `Gastos de ${day.fullLabel}`,
      subtitle: `${day.count} movimiento${day.count === 1 ? "" : "s"} registrado${day.count === 1 ? "" : "s"} en ${day.fullLabel}. En total suman ${formatCurrency(day.total, activeCurrency)}; promedio semanal: ${formatCurrency(day.average, activeCurrency)}.`,
      scopeLabel: `Alcance: todos los ${day.fullLabel} cargados en el dashboard, promediados sobre ${day.weekCount} semana${day.weekCount === 1 ? "" : "s"} observada${day.weekCount === 1 ? "" : "s"}.`,
      emptyTitle: `Sin gastos de ${day.fullLabel}`,
      emptyBody: "No hay movimientos para este día de la semana.",
      movements: day.movements,
    });
  }, [activeCurrency, openMovementPreview]);

  const openTransferRoutePreview = useCallback((route: { srcName: string; dstName: string; total: number; count: number; movementIds: number[] }) => {
    const routeMovements = getMovementsByIds(route.movementIds);
    openMovementPreview({
      title: `${route.srcName} a ${route.dstName}`,
      subtitle: `${route.count} transferencia${route.count === 1 ? "" : "s"} entre estas cuentas suman ${formatCurrency(route.total, activeCurrency)}.`,
      scopeLabel: "Alcance: transferencias confirmadas cargadas en el dashboard para esta misma ruta.",
      emptyTitle: "No encontramos transferencias para esta ruta",
      emptyBody: "Puede pasar si la lista se actualizó mientras veías el dashboard.",
      movements: routeMovements,
    });
  }, [activeCurrency, getMovementsByIds, openMovementPreview]);

  const openHistoryRangePreview = useCallback((
    dateFrom: string,
    dateTo: string,
    options?: {
      title?: string;
      kind?: "all" | "income" | "expense";
      categoryId?: number | null;
    },
  ) => {
    const from = startOfDay(parseDisplayDate(dateFrom));
    const to = endOfDay(parseDisplayDate(dateTo));
    const kind = options?.kind ?? "all";
    const rangeMovements = sortMovementsRecentFirst(
      movements.filter((movement) => {
        if (!inRange(movement, from, to)) return false;
        if (kind === "income" && !isIncome(movement)) return false;
        if (kind === "expense" && !isExpense(movement)) return false;
        if (kind === "all" && movement.status !== "posted") return false;
        if (options?.categoryId !== undefined) {
          const categoryId = options.categoryId;
          if (categoryId == null) return movement.categoryId == null;
          return movement.categoryId === categoryId;
        }
        return true;
      }),
    );
    const income = rangeMovements
      .filter((movement) => movementActsAsIncome(movement))
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    const expense = rangeMovements
      .filter((movement) => movementActsAsExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }), 0);
    const rangeLabel = `${format(from, "d MMM", { locale: es })} - ${format(to, "d MMM yyyy", { locale: es })}`;
    const defaultTitle = kind === "income"
      ? "Ingresos del periodo"
      : kind === "expense"
        ? "Gastos del periodo"
        : "Movimientos del periodo";

    openMovementPreview({
      title: options?.title ?? defaultTitle,
      subtitle: `${rangeMovements.length} movimiento${rangeMovements.length === 1 ? "" : "s"} en el periodo. Ingresos: ${formatCurrency(income, activeCurrency)}. Gastos: ${formatCurrency(expense, activeCurrency)}.`,
      scopeLabel: `Alcance: ${rangeLabel}.`,
      emptyTitle: "No hay movimientos para esta selección",
      emptyBody: "El historial se actualizará cuando existan movimientos en este rango.",
      movements: rangeMovements,
    });
  }, [
    accountCurrencyMap,
    activeCurrency,
    exchangeRateMap,
    movements,
    openMovementPreview,
  ]);

  const openAnnualMonthPreview = useCallback((month: AnnualHistoryMonth, kind: "all" | "income" | "expense" = "all") => {
    const monthName = format(parseDisplayDate(month.dateFrom), "MMMM yyyy", { locale: es });
    openHistoryRangePreview(month.dateFrom, month.dateTo, {
      kind,
      title: kind === "income"
        ? `Ingresos de ${monthName}`
        : kind === "expense"
          ? `Gastos de ${monthName}`
          : `Movimientos de ${monthName}`,
    });
  }, [openHistoryRangePreview]);

  const openAnnualTopCategoryPreview = useCallback((detail: NonNullable<typeof selectedAnnualMonthDetail>) => {
    openHistoryRangePreview(detail.month.dateFrom, detail.month.dateTo, {
      kind: "expense",
      categoryId: detail.topCategoryId,
      title: `${detail.topCategoryName} en ${format(parseDisplayDate(detail.month.dateFrom), "MMMM yyyy", { locale: es })}`,
    });
  }, [openHistoryRangePreview]);

  const openSingleMovementPreview = useCallback((movementId: number, title = "Movimiento del historial") => {
    const movement = movementById.get(movementId);
    openMovementPreview({
      title,
      subtitle: movement
        ? "Este movimiento fue uno de los que más peso tuvo en la lectura del mes."
        : "No encontramos este movimiento en la lista actual del dashboard.",
      scopeLabel: "Alcance: selección exacta desde Historial.",
      emptyTitle: "Movimiento no disponible",
      emptyBody: "Puede pasar si los datos se actualizaron después de abrir el detalle.",
      movements: movement ? [movement] : [],
    });
  }, [movementById, openMovementPreview]);

  const openPendingReviewPreview = useCallback(() => {
    openMovementPreview({
      title: "Movimientos pendientes",
      subtitle: `${pendingReviewMovements.length} movimiento${pendingReviewMovements.length === 1 ? "" : "s"} todavía no impacta${pendingReviewMovements.length === 1 ? "" : "n"} el saldo real.`,
      scopeLabel: "Alcance: movimientos con estado pendiente cargados en el dashboard.",
      emptyTitle: "No hay movimientos pendientes",
      emptyBody: "La bandeja de Salud ya no tiene pendientes por aplicar.",
      movements: pendingReviewMovements,
    });
  }, [openMovementPreview, pendingReviewMovements]);

  const openDuplicateExpensesPreview = useCallback(() => {
    openMovementPreview({
      title: "Posibles duplicados",
      subtitle: `${duplicateExpenseReviewMovements.length} movimiento${duplicateExpenseReviewMovements.length === 1 ? "" : "s"} aparece${duplicateExpenseReviewMovements.length === 1 ? "" : "n"} en grupos con fecha cercana, monto parecido y texto similar.`,
      scopeLabel: "Alcance: gastos confirmados comparados por fecha, monto, texto, cuenta y contraparte.",
      emptyTitle: "No hay duplicados visibles",
      emptyBody: "No encontramos gastos repetidos con la selección actual.",
      movements: duplicateExpenseReviewMovements,
    });
  }, [duplicateExpenseReviewMovements, openMovementPreview]);

  const openNoCounterpartyPreview = useCallback(() => {
    openMovementPreview({
      title: "Movimientos sin contraparte",
      subtitle: `${noCounterpartyReviewMovements.length} movimiento${noCounterpartyReviewMovements.length === 1 ? "" : "s"} no tiene${noCounterpartyReviewMovements.length === 1 ? "" : "n"} persona, negocio o contacto asociado.`,
      scopeLabel: "Alcance: ingresos, gastos y pagos confirmados sin contraparte.",
      emptyTitle: "No hay movimientos sin contraparte",
      emptyBody: "La calidad de datos ya no tiene esta tarea pendiente.",
      movements: noCounterpartyReviewMovements,
    });
  }, [noCounterpartyReviewMovements, openMovementPreview]);

  const openHealthMovementIssuePreview = useCallback((key: "uncategorized" | "pending" | "duplicates") => {
    if (key === "uncategorized") {
      openSummaryUncategorizedPreview();
      return;
    }
    if (key === "pending") {
      openPendingReviewPreview();
      return;
    }
    openDuplicateExpensesPreview();
  }, [openDuplicateExpensesPreview, openPendingReviewPreview, openSummaryUncategorizedPreview]);

  const openCategorySuggestionPreview = useCallback((suggestion: DashboardCategorySuggestion) => {
    const movement = movementById.get(suggestion.movementId);
    const confidencePct = Math.round(suggestion.confidence * 100);
    openMovementPreview({
      title: "Sugerencia de categoría",
      subtitle: movement
        ? `La app sugiere "${suggestion.suggestedCategoryName}" para "${suggestion.description}" con ${confidencePct}% de confianza.`
        : "No encontramos este movimiento en la lista actual del dashboard.",
      scopeLabel: suggestion.reasons.length > 0
        ? `Motivo: ${suggestion.reasons.join(" · ")}.`
        : "Alcance: movimiento exacto sugerido por Salud.",
      emptyTitle: "Movimiento no disponible",
      emptyBody: "Puede pasar si los datos se actualizaron después de abrir la sugerencia.",
      movements: movement ? [movement] : [],
      suggestion: movement
        ? {
          movementId: suggestion.movementId,
          description: suggestion.description,
          categoryId: suggestion.suggestedCategoryId,
          categoryName: suggestion.suggestedCategoryName,
          confidencePct,
        }
        : undefined,
    });
  }, [movementById, openMovementPreview]);

  const applyCategorySuggestionFromPreview = useCallback(async () => {
    const suggestion = movementPreview?.suggestion;
    if (!suggestion) return;
    const currentMovement = movementPreview?.movements.find((movement) => movement.id === suggestion.movementId);
    setApplyingSuggestionMovementId(suggestion.movementId);
    try {
      await updateMovementMutation.mutateAsync({
        id: suggestion.movementId,
        input: { categoryId: suggestion.categoryId },
      });
      await persistDashboardAnalyticsMutation.mutateAsync({
        signals: [{
          movementId: suggestion.movementId,
          normalizedDescription: normalizeAnalyticsText(suggestion.description) || null,
          suggestedCategoryId: suggestion.categoryId,
          suggestedCategoryConfidence: 1,
          signalReasons: [
            "usuario aceptó sugerencia de categoría",
            `categoría aplicada: ${suggestion.categoryName}`,
          ],
          analyticsVersion: "v2-feedback",
        }],
      });
      await persistLearningFeedbackMutation.mutateAsync({
        movementId: suggestion.movementId,
        feedbackKind: "accepted_category_suggestion",
        normalizedDescription: normalizeAnalyticsText(suggestion.description) || null,
        previousCategoryId: currentMovement?.categoryId ?? null,
        acceptedCategoryId: suggestion.categoryId,
        confidence: suggestion.confidencePct / 100,
        source: "dashboard-salud",
        metadata: {
          categoryName: suggestion.categoryName,
          description: suggestion.description,
        },
      });
      setMovementPreview((current) => {
        if (!current) return current;
        return {
          ...current,
          subtitle: `Listo: "${suggestion.categoryName}" quedó aplicado a este movimiento.`,
          scopeLabel: "Categoría aplicada desde Salud. Puedes editar el movimiento si necesitas cambiar algo más.",
          movements: current.movements.map((movement) =>
            movement.id === suggestion.movementId
              ? { ...movement, categoryId: suggestion.categoryId }
              : movement,
          ),
          suggestion: undefined,
        };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["movement", suggestion.movementId] }),
      ]);
      showToast(`Categoría aplicada: ${suggestion.categoryName}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo aplicar la categoría.";
      showToast(message, "error");
    } finally {
      setApplyingSuggestionMovementId(null);
    }
  }, [movementPreview?.movements, movementPreview?.suggestion, persistDashboardAnalyticsMutation, persistLearningFeedbackMutation, queryClient, showToast, updateMovementMutation]);

  const openPrecisionLayer = useCallback(() => {
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setActiveTab('Salud');
    setQualityOpen(true);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => onRequestPrecisionFocus?.(), 300);
    });
  }, [onRequestPrecisionFocus]);

  const qualitySnapshot = useMemo(() => {
    const relevant = movements.filter((movement) => isCategorizedCashflow(movement));
    return {
      noCategoryCount: relevant.filter((movement) => movement.categoryId == null).length,
      noCounterpartyCount: relevant.filter((movement) => movement.counterpartyId == null).length,
    };
  }, [movements]);

  const categorySuggestions = useMemo(() => {
    const generated = buildCategorySuggestions(movements, snapshot?.categories ?? [], {
      accountCurrencyMap,
      exchangeRateMap,
      displayCurrency: activeCurrency,
    });
    const seen = new Set<number>();
    return [...learningFeedbackCategorySuggestions, ...persistedCategorySuggestions, ...generated]
      .filter((suggestion) => {
        if (seen.has(suggestion.movementId)) return false;
        seen.add(suggestion.movementId);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 4);
  }, [
    accountCurrencyMap,
    activeCurrency,
    exchangeRateMap,
    learningFeedbackCategorySuggestions,
    movements,
    persistedCategorySuggestions,
    snapshot?.categories,
  ]);

  const projectionModel = useMemo(() => {
    return buildMonthProjectionModel(
      movements,
      obligations,
      subscriptions,
      recurringIncome,
      currentVisibleBalance,
      {
        accountCurrencyMap,
        exchangeRateMap,
        displayCurrency: activeCurrency,
      },
    );
  }, [
    accountCurrencyMap,
    activeCurrency,
    currentVisibleBalance,
    exchangeRateMap,
    movements,
    obligations,
    recurringIncome,
    subscriptions,
  ]);

  const paymentOptimization = useMemo(() => (
    buildPaymentOptimizationPlan({
      obligations: obligations.map((obligation) => {
        const rawAmount = obligation.installmentAmount && obligation.installmentAmount > 0
          ? Math.min(obligation.pendingAmount, obligation.installmentAmount)
          : obligation.pendingAmount;
        return {
          id: obligation.id,
          title: obligation.title,
          direction: obligation.direction,
          amount: convertDashboardCurrency(rawAmount, obligation.currencyCode, activeCurrency, exchangeRateMap),
          dueDate: obligation.dueDate,
          status: obligation.status,
          counterparty: obligation.counterparty,
        };
      }),
      currentBalance: currentVisibleBalance,
      weekExpectedInflow: weekWindow.expectedInflow,
      weekExpectedOutflow: weekWindow.expectedOutflow,
      pressureProbability: projectionModel.pressureProbability,
    })
  ), [
    activeCurrency,
    currentVisibleBalance,
    exchangeRateMap,
    obligations,
    projectionModel.pressureProbability,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
  ]);

  const financialGraphRank = useMemo(() => (
    buildFinancialGraphRank<DashboardMovementRow>({
      movements: movements.filter((movement) => movement.status === "posted"),
      getAmount: (movement) => {
        if (isTransfer(movement)) return transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
        return movementActsAsIncome(movement)
          ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency })
          : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
      },
      getAccountIds: (movement) => [movement.sourceAccountId, movement.destinationAccountId],
      getCategoryId: (movement) => isCategorizedCashflow(movement) ? movement.categoryId ?? null : null,
      getCounterpartyId: (movement) => movement.counterpartyId ?? null,
      getFlowKind: (movement) => {
        if (isTransfer(movement)) return "transfer";
        return movementActsAsIncome(movement) ? "income" : "expense";
      },
      accountNames: accountMap,
      categoryNames: categoryMap,
      counterpartyNames: counterpartyMap,
      limit: 4,
    })
  ), [
    accountCurrencyMap,
    accountMap,
    activeCurrency,
    categoryMap,
    counterpartyMap,
    exchangeRateMap,
    movements,
  ]);

  const focusAction = useMemo(() => {
    return buildFocusActionRanking({
      uncategorizedCount: review.uncategorizedCount,
      overdueObligationsCount: review.overdueObligationsCount,
      subscriptionsAttentionCount: review.subscriptionsAttentionCount,
      learningReadinessScore: learning.readinessScore,
      weekExpectedInflow: weekWindow.expectedInflow,
      weekExpectedOutflow: weekWindow.expectedOutflow,
      monthExpense: monthToDate.expense,
      cashCushionDays: cashCushion.days,
      cashDailyBurn: cashCushion.dailyBurn,
      spendingTrendPct: spendingTrend.expenseTrendPct,
      pressureProbability: projectionModel.pressureProbability,
      pressureThresholdLabel: formatCurrency(projectionModel.pressureThreshold, activeCurrency),
      formatAmount: (amount) => formatCurrency(amount, activeCurrency),
    });
  }, [
    activeCurrency,
    cashCushion.dailyBurn,
    cashCushion.days,
    learning.readinessScore,
    monthToDate.expense,
    projectionModel.pressureProbability,
    projectionModel.pressureThreshold,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    spendingTrend.expenseTrendPct,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
  ]);

  const openFocusActionDestination = useCallback(() => {
    if (focusAction.quickFilter === "uncategorized") {
      openSummaryUncategorizedPreview();
      return;
    }
    setAdvancedDetail(null);
    if (focusAction.key === "liquidity" || focusAction.key === "cash" || focusAction.key === "spending" || focusAction.key === "projection-risk") {
      setActiveTab("Flujo");
      return;
    }
    if (focusAction.route === "/dashboard") return;
    router.push(focusAction.route as never);
  }, [focusAction.key, focusAction.quickFilter, focusAction.route, openSummaryUncategorizedPreview, router]);

  const lastPersistedAnalyticsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const periodKey = format(new Date(), "yyyy-MM");
    const persistKey = JSON.stringify({
      workspaceId,
      periodKey,
      suggestions: categorySuggestions.map((item) => [
        item.movementId,
        item.suggestedCategoryId,
        Math.round(item.confidence * 100),
      ]),
      projection: [
        Math.round(projectionModel.expectedBalance),
        Math.round(projectionModel.conservativeBalance),
        Math.round(projectionModel.optimisticBalance),
        projectionModel.confidence,
      ],
    });
    if (lastPersistedAnalyticsKeyRef.current === persistKey) return;
    lastPersistedAnalyticsKeyRef.current = persistKey;

    const signalMap = new Map<number, {
      movementId: number;
      normalizedDescription?: string | null;
      suggestedCategoryId?: number | null;
      suggestedCategoryConfidence?: number | null;
      anomalyScore?: number | null;
      signalReasons: string[];
    }>();

    for (const item of categorySuggestions) {
      signalMap.set(item.movementId, {
        movementId: item.movementId,
        normalizedDescription: normalizeAnalyticsText(item.description) || null,
        suggestedCategoryId: item.suggestedCategoryId,
        suggestedCategoryConfidence: item.confidence,
        signalReasons: item.reasons,
      });
    }

    for (const anomaly of anomalySignals) {
      const current = signalMap.get(anomaly.movementId);
      signalMap.set(anomaly.movementId, {
        movementId: anomaly.movementId,
        normalizedDescription: current?.normalizedDescription ?? null,
        suggestedCategoryId: current?.suggestedCategoryId ?? null,
        suggestedCategoryConfidence: current?.suggestedCategoryConfidence ?? null,
        anomalyScore: anomaly.score,
        signalReasons: Array.from(new Set([...(current?.signalReasons ?? []), ...anomaly.reasons])),
      });
    }

    persistDashboardAnalyticsMutation.mutate({
      signals: Array.from(signalMap.values()),
      snapshot: {
        snapshotKind: "month_projection",
        periodKey,
        expectedBalance: projectionModel.expectedBalance,
        conservativeBalance: projectionModel.conservativeBalance,
        optimisticBalance: projectionModel.optimisticBalance,
        committedInflow: projectionModel.committedInflow,
        committedOutflow: projectionModel.committedOutflow,
        variableIncomeProjection: projectionModel.variableIncomeProjection,
        variableExpenseProjection: projectionModel.variableExpenseProjection,
        confidence: projectionModel.confidence,
      },
    });
  }, [anomalySignals, categorySuggestions, persistDashboardAnalyticsMutation, projectionModel, workspaceId]);

  const weeklyPatternInsight = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => 0);
    for (const movement of movements.filter(isExpense)) {
      const day = getDay(new Date(movement.occurredAt));
      const normalized = day === 0 ? 6 : day - 1;
      totals[normalized] += expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
    }
    const totalSpent = totals.reduce((sum, value) => sum + value, 0);
    if (totalSpent <= 0) return null;
    const labels = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
    const maxIndex = totals.reduce((best, value, index, arr) => value > arr[best] ? index : best, 0);
    return { dayLabel: labels[maxIndex], share: Math.round((totals[maxIndex] / totalSpent) * 100) };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

  const monthEndReading = projectionModel.expectedBalance;
  const monthEndDelta = monthEndReading - currentVisibleBalance;
  const projectionExpectedDelta = projectionModel.expectedBalance - currentVisibleBalance;
  const projectionConservativeDelta = projectionModel.conservativeBalance - currentVisibleBalance;
  const projectionCommittedNet = projectionModel.committedInflow - projectionModel.committedOutflow;
  const projectionVariableNet = projectionModel.variableIncomeProjection - projectionModel.variableExpenseProjection;
  const projectionConservativeVariableNet = projectionModel.conservativeBalance - currentVisibleBalance - projectionCommittedNet;
  const pressureStatus = weekWindow.expectedOutflow > weekWindow.expectedInflow ? "Bajo presión" : weekWindow.scheduledCount > 0 ? "Controlado" : "Estable";
  const monthStatus: string = monthEndReading >= currentVisibleBalance ? "Cerrando mejor" : monthEndReading >= currentVisibleBalance * 0.92 ? "Ajustado" : "Bajo presión";
  const visibleBalanceLabel = useMemo(() => {
    if (activeAccounts.length === 0) return "tus cuentas visibles";
    if (activeAccounts.length === 1) return `tu cuenta visible ${activeAccounts[0].name}`;
    const names = activeAccounts.slice(0, 3).map((account) => account.name).join(", ");
    return activeAccounts.length <= 3
      ? `la suma de tus cuentas visibles (${names})`
      : `la suma de tus ${activeAccounts.length} cuentas visibles (${names} y otras)`;
  }, [activeAccounts]);
  const visibleAccountBreakdown = useMemo(() => (
    activeAccounts
      .map((account) => ({
        id: account.id,
        name: account.name,
        amount: convertDashboardCurrency(account.currentBalance, account.currencyCode, activeCurrency, exchangeRateMap),
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  ), [activeAccounts, activeCurrency, exchangeRateMap]);
  const visibleAccountSummary = useMemo(() => {
    if (visibleAccountBreakdown.length === 0) return "No hay cuentas visibles incluidas en esta lectura.";
    const preview = visibleAccountBreakdown
      .slice(0, 3)
      .map((account) => `${account.name}: ${formatCurrency(account.amount, activeCurrency)}`)
      .join(" · ");
    const remaining = visibleAccountBreakdown.length > 3 ? ` · +${visibleAccountBreakdown.length - 3} más` : "";
    return `${preview}${remaining}`;
  }, [activeCurrency, visibleAccountBreakdown]);
  const dashboardAiSummaryPayload = useMemo(() => ({
    workspaceName: "Workspace actual",
    currency: activeCurrency,
    visibleBalance: formatCurrency(currentVisibleBalance, activeCurrency),
    monthEndReading: formatCurrency(monthEndReading, activeCurrency),
    monthEndDelta: formatCurrency(monthEndDelta, activeCurrency),
    monthStatus,
    weekStatus: pressureStatus,
    weekNet: formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, activeCurrency),
    weekExpectedInflow: formatCurrency(weekWindow.expectedInflow, activeCurrency),
    weekExpectedOutflow: formatCurrency(weekWindow.expectedOutflow, activeCurrency),
    dataReadinessScore: learning.readinessScore,
    unresolvedIssues: review.totalIssues,
    cashCushionDays: cashCushion.days,
    cashCushionLabel: cashCushion.label,
    savingsRatePct: monthlySavingsRate.lastRate == null ? null : Number(monthlySavingsRate.lastRate.toFixed(1)),
    collectionEfficiencyPct: collectionEfficiency.rate,
    topFocusAction: {
      title: focusAction.title,
      body: focusAction.body,
      reason: focusAction.reason,
      detail: focusAction.detail,
    },
    visibleAccounts: visibleAccountSummary,
    activeAccountsCount: activeAccounts.length,
    uncategorizedMovements: review.uncategorizedCount,
    overdueObligations: review.overdueObligationsCount,
    upcomingSubscriptions: review.subscriptionsAttentionCount,
  }), [
    activeAccounts.length,
    activeCurrency,
    cashCushion.days,
    cashCushion.label,
    collectionEfficiency.rate,
    currentVisibleBalance,
    focusAction.body,
    focusAction.detail,
    focusAction.reason,
    focusAction.title,
    learning.readinessScore,
    monthEndDelta,
    monthEndReading,
    monthStatus,
    monthlySavingsRate.lastRate,
    pressureStatus,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.totalIssues,
    review.uncategorizedCount,
    visibleAccountSummary,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
  ]);

  const executiveDetails = useMemo(() => ({
    focus: {
      title: "Estado del sistema",
      summary: "Te dice qué tan confiable es la lectura general antes de tomar decisiones con el dashboard.",
      meaning: [
        "Esta tarjeta no te dice qué hacer ahora; solo mide si la base de datos permite confiar en los análisis.",
        "Sirve para saber si las demás lecturas salen de información suficientemente ordenada o si todavía hay ruido que puede distorsionar comparativos y proyecciones.",
      ],
      calculation: [
        "Usamos un resumen de señales: la app junta muchos movimientos y los convierte en pocos datos fáciles de leer, como separar una libreta de ventas en ventas, gastos, pendientes y errores.",
        `La confianza actual es ${learning.readinessScore}%. Se calcula con historia observada (${learning.historyDays} días), movimientos útiles (${learning.usefulCount}) y categorías útiles (${Math.round(learning.categorizedRate * 100)}%).`,
        `Además revisamos fricción operativa: ${review.uncategorizedCount} movimientos sin categoría, ${review.overdueObligationsCount} obligaciones vencidas, ${review.subscriptionsAttentionCount} suscripciones con atención y ${review.pendingMovementsCount} movimientos pendientes.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Abrir ${review.uncategorizedCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
        { label: qualityOpen ? "Ver capa de precisión" : "Abrir capa de precisión", onPress: openPrecisionLayer },
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    risk: {
      title: "Riesgo 7 días",
      summary: "Te ayuda a decidir si la próxima semana se ve tranquila o si conviene mover foco a liquidez antes de que falte caja.",
      meaning: [
        "Sirve para decisiones de corto plazo: si conviene pagar ya, esperar, reprogramar o revisar una cuenta antes de comprometerte.",
        "Cuando sale en rojo o muy ajustado, el problema no es el cierre del mes: es la próxima semana.",
      ],
      calculation: [
        "Usamos una ventana de tiempo: en vez de mezclar todo el mes, miramos solo lo que cae en los próximos 7 días, como revisar la caja necesaria para esta semana.",
        `Tomamos obligaciones con vencimiento dentro de 7 días, suscripciones activas por cobrar y los ingresos fijos esperados en ese mismo rango.`,
        `Con eso hoy vemos ${weekWindow.payableCount} pagos, ${weekWindow.receivableCount} cobros y ${weekWindow.scheduledCount} compromisos programados. Entran ${formatCurrency(weekWindow.expectedInflow, activeCurrency)} y salen ${formatCurrency(weekWindow.expectedOutflow, activeCurrency)}.`,
      ],
      actions: [
        weekWindow.payableCount > 0
          ? { label: "Ver obligaciones próximas", onPress: () => { setExecutiveDetail(null); router.push("/obligations" as never); } }
          : null,
        review.subscriptionsAttentionCount > 0
          ? { label: "Corregir suscripciones activas", onPress: () => { setExecutiveDetail(null); router.push("/subscriptions" as never); } }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    month: {
      title: "Fin de mes",
      summary: "Te ayuda a decidir si el mes cierra con margen, ajustado o bajo presión según lo ya comprometido y tu ritmo reciente.",
      meaning: [
        "No intenta adivinar exacto cuánto tendrás; te da una lectura operativa para saber si puedes sostener el ritmo actual o si conviene corregir ya.",
        "Es útil para decisiones de gasto, ahorro, compras no urgentes y limpieza de datos que afectan la proyección.",
      ],
      calculation: [
        `Partimos de ${visibleBalanceLabel}: ${visibleAccountSummary}. Esa base suma ${formatCurrency(currentVisibleBalance, activeCurrency)}.`,
        "Usamos una proyección por escenarios: no prometemos un número exacto; armamos un cierre esperado, uno defensivo y uno más favorable para que veas el rango posible.",
        `Después aplicamos la fórmula: saldo visible + comprometido neto (${formatCurrency(projectionCommittedNet, activeCurrency)}) + variable neto (${formatCurrency(projectionVariableNet, activeCurrency)}) = ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}.`,
        `El rango defensivo queda en ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)} y el escenario alto en ${formatCurrency(projectionModel.optimisticBalance, activeCurrency)}.`,
        `Además simulamos muchos cierres posibles con tu ritmo diario reciente. Hoy la probabilidad de cerrar por debajo de ${formatCurrency(projectionModel.pressureThreshold, activeCurrency)} es ${projectionModel.pressureProbability}%.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: "Limpiar movimientos sin categoría", onPress: openSummaryUncategorizedPreview }
          : null,
        monthRecurringIncomeProjection > 0
          ? { label: "Revisar ingresos fijos del mes", onPress: () => { setExecutiveDetail(null); router.push("/recurring-income" as never); } }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
  }), [
    activeCurrency,
    learning.categorizedRate,
    learning.historyDays,
    learning.readinessScore,
    learning.usefulCount,
    monthRecurringIncomeProjection,
    openPrecisionLayer,
    openSummaryUncategorizedPreview,
    projectionModel.conservativeBalance,
    projectionModel.committedInflow,
    projectionModel.committedOutflow,
    projectionModel.expectedBalance,
    projectionModel.optimisticBalance,
    projectionModel.pressureProbability,
    projectionModel.pressureThreshold,
    projectionModel.variableExpenseProjection,
    projectionModel.variableIncomeProjection,
    projectionCommittedNet,
    projectionVariableNet,
    review.overdueObligationsCount,
    review.pendingMovementsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    qualityOpen,
    router,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
    weekWindow.payableCount,
    weekWindow.receivableCount,
    weekWindow.scheduledCount,
    currentVisibleBalance,
    visibleAccountSummary,
    visibleBalanceLabel,
  ]);
  const activeExecutiveDetail = executiveDetail ? executiveDetails[executiveDetail] : null;
  const executiveResultMeaning = useMemo(() => ({
    focus: [
      learning.readinessScore >= 75
        ? "Este resultado significa que el dashboard ya tiene una base suficientemente confiable para lecturas avanzadas."
        : learning.readinessScore >= 45
          ? "Este resultado significa que el dashboard ya orienta, pero todavía hay ruido que puede afectar conclusiones finas."
          : "Este resultado significa que la lectura todavía es frágil y conviene limpiar datos antes de confiar demasiado en los análisis.",
      review.totalIssues > 0
        ? `Hoy hay ${review.totalIssues} punto${review.totalIssues === 1 ? "" : "s"} que pueden bajar precisión. La acción exacta queda en Centro de foco.`
        : "Hoy la base se ve ordenada; Centro de foco queda libre para recomendar la siguiente acción operativa.",
    ],
    risk: [
      weekWindow.expectedOutflow > weekWindow.expectedInflow
        ? "Este resultado significa que en la proxima semana tu agenda exige mas caja de la que hoy se ve entrar."
        : weekWindow.scheduledCount > 0
          ? "Este resultado significa que la semana se ve manejable, pero ya hay compromisos que vale la pena vigilar."
          : "Este resultado significa que no se ve una tension fuerte de liquidez en los proximos 7 dias.",
      `La lectura actual deja un neto de ${formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, activeCurrency)} para la ventana cercana.`,
    ],
    month: [
      monthStatus === "Bajo presión"
        ? "Este resultado significa que, si no cambias algo, el cierre del mes ya se ve apretado frente a tu saldo y ritmo actual."
        : monthStatus === "Ajustado"
          ? "Este resultado significa que el cierre todavia es viable, pero con poco margen para errores o gastos extra."
          : "Este resultado significa que hoy el mes se perfila mejor que tu saldo visible actual.",
      `La lectura esperada de cierre hoy es ${formatCurrency(monthEndReading, activeCurrency)}.`,
    ],
  }), [
    activeCurrency,
    learning.readinessScore,
    monthEndReading,
    monthStatus,
    review.totalIssues,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
    weekWindow.scheduledCount,
  ]);
  const activeExecutiveResultMeaning = executiveDetail ? executiveResultMeaning[executiveDetail] : [];
  const resolvedExecutiveResultMeaning = executiveDetail === "month"
    ? [
      monthStatus === "Cerrando mejor"
        ? "Este resultado significa que hoy el mes se perfila mejor que tu saldo visible actual."
        : monthStatus === "Ajustado"
          ? "Este resultado significa que el cierre todavia es viable, pero con poco margen para errores o gastos extra."
          : "Este resultado significa que, si no cambias algo, el cierre del mes ya se ve apretado frente a tu saldo y ritmo actual.",
      `Cuando aquí hablamos de saldo visible actual, nos referimos a ${visibleBalanceLabel} convertida a ${activeCurrency}: hoy eso suma ${formatCurrency(currentVisibleBalance, activeCurrency)}.`,
      `No es una cuenta puntual. Está compuesto por: ${visibleAccountSummary}.`,
      `La lectura esperada de cierre hoy es ${formatCurrency(monthEndReading, activeCurrency)}. Eso implica un cambio de ${formatCurrency(monthEndDelta, activeCurrency)} frente a lo que hoy ya tienes visible.`,
      `Fórmula usada: ${formatCurrency(currentVisibleBalance, activeCurrency)} + comprometido neto ${formatCurrency(projectionCommittedNet, activeCurrency)} + variable neto ${formatCurrency(projectionVariableNet, activeCurrency)}.`,
    ]
    : activeExecutiveResultMeaning;
  const executiveResultTone = useMemo(() => ({
    focus: learning.readinessScore >= 75 && review.totalIssues === 0 ? "positive" : learning.readinessScore >= 45 ? "warning" : "danger",
    risk: weekWindow.expectedOutflow > weekWindow.expectedInflow ? "danger" : weekWindow.scheduledCount > 0 ? "warning" : "positive",
    month: monthStatus === "Cerrando mejor" ? "positive" : monthStatus === "Ajustado" ? "warning" : "danger",
  } as const), [
    learning.readinessScore,
    monthStatus,
    review.totalIssues,
    weekWindow.expectedOutflow,
    weekWindow.expectedInflow,
    weekWindow.scheduledCount,
  ]);
  const activeExecutiveResultTone = executiveDetail ? executiveResultTone[executiveDetail] : "warning";
  const advancedDetails = useMemo(() => ({
    focusCenter: {
      title: "Centro de foco",
      summary: "Te explica por qué esta es la mejor acción inmediata y te deja saltar directo a la pantalla donde puedes resolverla.",
      meaning: [
        "La app no intenta mostrarte todo al mismo tiempo. Hace como una balanza: pone de un lado categorías pendientes, vencimientos, cargos fijos, caja disponible y presión de la semana.",
        "Después elige el punto que más puede mover tu dinero hoy. La idea es que sepas por dónde empezar sin revisar diez tarjetas.",
      ],
      calculation: [
        "Primero juntamos muchas señales en pocos grupos: datos por ordenar, vencimientos, suscripciones, caja libre, gasto reciente, riesgo de cierre y flujo de los próximos 7 días.",
        "Luego cada posible acción recibe una prioridad de 0 a 100 combinando urgencia, impacto en dinero, efecto sobre confianza y facilidad de resolver.",
        `Hoy ganó "${focusAction.title}" con ${focusAction.score}/100 (${focusAction.scoreLabel}).`,
        focusAction.reason,
        focusAction.alternatives.length > 0
          ? `También revisamos: ${focusAction.alternatives.map((item) => `${item.title} (${item.score}/100)`).join(", ")}.`
          : "No apareció otra alerta fuerte detrás de esta recomendación.",
      ],
      actions: [
        focusAction.quickFilter === "uncategorized"
          ? { label: `Abrir ${review.uncategorizedCount} sin categoria`, onPress: openSummaryUncategorizedPreview }
          : focusAction.key === "overdue"
            ? { label: "Abrir creditos y deudas", onPress: () => { setAdvancedDetail(null); router.push("/obligations" as never); } }
            : focusAction.key === "subscriptions"
              ? { label: "Abrir suscripciones", onPress: () => { setAdvancedDetail(null); router.push("/subscriptions" as never); } }
              : { label: "Aplicar esta accion", onPress: openFocusActionDestination },
        { label: "Entender la proyeccion del mes", onPress: () => setAdvancedDetail("projection") },
      ],
    },
    projection: {
      title: "Proyección refinada",
      summary: "Te ayuda a decidir si el cierre del mes ya se ve sano o si todavía depende demasiado de que el ritmo reciente no se deteriore.",
      meaning: [
        "No se limita a extrapolar un promedio. Separa flujo comprometido del mes y flujo variable reciente para darte una banda más realista.",
        "Sirve para decisiones de gasto, compras no urgentes, ahorro y para saber si conviene corregir datos antes de confiar en el cierre.",
      ],
      calculation: [
        `Lectura comprometida del mes: entran ${formatCurrency(projectionModel.committedInflow, activeCurrency)} y salen ${formatCurrency(projectionModel.committedOutflow, activeCurrency)} por obligaciones, suscripciones e ingresos fijos.`,
        `Luego se suma el ritmo variable reciente: entran ${formatCurrency(projectionModel.variableIncomeProjection, activeCurrency)} y salen ${formatCurrency(projectionModel.variableExpenseProjection, activeCurrency)}. Con eso el esperado es ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}, con piso conservador de ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)}.`,
        `Monte Carlo: probamos muchos cierres posibles tomando días parecidos de tu historial reciente. La banda simulada va de ${formatCurrency(projectionModel.monteCarloLowBalance, activeCurrency)} a ${formatCurrency(projectionModel.monteCarloHighBalance, activeCurrency)}, con mediana de ${formatCurrency(projectionModel.monteCarloMedianBalance, activeCurrency)}.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
        weekWindow.expectedOutflow > weekWindow.expectedInflow
          ? { label: "Revisar obligaciones próximas", onPress: () => { setAdvancedDetail(null); router.push("/obligations" as never); } }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    review: {
      title: "Movimientos para revisar",
      summary: "Te ayuda a detectar movimientos raros, duplicados o picos que pueden distorsionar lectura, presupuesto y flujo.",
      meaning: [
        "No necesariamente significa que el movimiento esté mal. Significa que se sale de tu patrón reciente y vale la pena confirmar.",
        "Es útil para evitar errores de captura, duplicados o gastos atípicos que te cambian por completo el mes.",
      ],
      calculation: [
        "Revisamos picos contra la misma descripción, picos contra la misma categoría y duplicados cercanos por monto y texto.",
        "Cuando sale como 'Fuerte', el desvío contra tu historial es más claro; cuando sale como 'Revisar', hay una señal razonable pero menos concluyente.",
      ],
      actions: [
        { label: "Abrir movimientos para revisar", onPress: () => openAnomalyMovementsPreview(anomalySignals.map((item) => item.movementId)) },
      ],
    },
    advancedMetrics: {
      title: "Metricas avanzadas",
      summary: "Te ayudan a entender si tus patrones ya son estables, donde esta la fragilidad del mes y que tan confiable es la lectura estadistica.",
      meaning: [
        "No son metricas para actuar en cinco minutos, sino para entender salud del sistema: ahorro, estabilidad, concentracion y cobranza.",
        "Sirven para validar si tus decisiones actuales son sostenibles o si alguna zona del sistema esta sesgando toda la lectura.",
      ],
      calculation: [
        `La tasa de ahorro va ${monthlySavingsRate.lastRate != null ? `en ${monthlySavingsRate.lastRate.toFixed(1)}% este mes y ${monthlySavingsRate.trend} frente al promedio reciente` : "en modo inicial por historial insuficiente"}.`,
        `La estabilidad de ingresos esta ${incomeStabilityScore.score != null ? `en ${incomeStabilityScore.score}/100 con variacion de ${incomeStabilityScore.cvPct}%` : "sin score todavia"}, la concentracion de gasto se ve ${categoryConcentration.label.toLowerCase()}${categoryConcentration.topCategory ? ` y la categoria dominante es ${categoryConcentration.topCategory}` : ""}, y la cobranza va ${collectionEfficiency.rate != null ? `en ${collectionEfficiency.rate}%` : "sin ventana suficiente para medir"}.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoria`, onPress: openSummaryUncategorizedPreview }
          : null,
        collectionEfficiency.total > 0
          ? { label: "Abrir creditos y deudas", onPress: () => { setAdvancedDetail(null); router.push("/obligations" as never); } }
          : null,
        { label: qualityOpen ? "Ver capa de calidad" : "Abrir capa de calidad", onPress: openPrecisionLayer },
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    quality: {
      title: "Calidad",
      summary: "Te dice cuánto puede confiar el dashboard en tus datos antes de darte comparativos, patrones y alertas finas.",
      meaning: [
        "Cuando esta capa está floja, el problema no es solo visual: casi todo el análisis pierde precisión.",
        "Mientras más limpio esté el workspace, más útiles serán foco, proyección, anomalías y comparativos.",
      ],
      calculation: [
        `Hoy vemos ${qualitySnapshot.noCategoryCount} movimientos sin categoría y ${qualitySnapshot.noCounterpartyCount} movimientos sin contraparte dentro del flujo relevante.`,
        `Además el aprendizaje usa cantidad de movimientos útiles, días de historia y porcentaje categorizado para estimar una confianza base de ${learning.readinessScore}%.`,
      ],
      actions: [
        qualitySnapshot.noCategoryCount > 0
          ? { label: `Abrir ${qualitySnapshot.noCategoryCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
        { label: qualityOpen ? "Ocultar capa de calidad" : "Abrir capa de calidad", onPress: qualityOpen ? () => { setAdvancedDetail(null); setQualityOpen(false); } : openPrecisionLayer },
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    categoryConcentration: {
      title: "Concentración de gasto",
      summary: "Mide qué tan dependiente es tu mes de una sola categoría. Si una categoría domina, cualquier pico ahí mueve todo el período.",
      meaning: [
        "HHI (Herfindahl–Hirschman Index) es un índice económico que mide concentración. Se calcula elevando al cuadrado la proporción de cada categoría y sumando los resultados.",
        "Valores cercanos a 0 = gasto muy distribuido. Por encima de 0.15 hay concentración moderada; por encima de 0.25 es concentrado y la categoría dominante tiene mucho peso sobre el mes.",
        "Sirve para detectar si una sola categoría puede distorsionar toda tu lectura del período. Un mes concentrado no es necesariamente malo, pero conviene saber qué categoría lo mueve.",
      ],
      calculation: [
        categoryConcentration.hhi != null
          ? `HHI actual: ${categoryConcentration.hhi.toFixed(3)} — se interpreta como ${categoryConcentration.label.toLowerCase()}.`
          : "Categoriza más movimientos para activar este indicador.",
        categoryConcentration.topCategory
          ? `La categoría con mayor peso es ${categoryConcentration.topCategory}, que representa el ${categoryConcentration.topShare ?? 0}% del gasto total del período.`
          : "Sin categoría dominante identificada todavía.",
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Categorizar ${review.uncategorizedCount} sin etiquetar`, onPress: openSummaryUncategorizedPreview }
          : null,
        categoryConcentration.topCategory
          ? { label: `Ver movimientos de ${categoryConcentration.topCategory}`, onPress: () => openCategoryPeriodPreview(categoryConcentration.topCategoryId, categoryConcentration.topCategory ?? undefined) }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    savingsRate: {
      title: "Tasa de ahorro mensual",
      summary: "Mide qué porcentaje de tu ingreso logras retener cada mes. El objetivo ideal en finanzas personales es ≥ 20%. Por debajo de 0% los gastos superan los ingresos.",
      meaning: [
        "Se calcula como (Ingresos − Gastos) / Ingresos × 100 para cada mes. Un mes con tasa positiva retiene caja; negativa la consume.",
        "La tendencia importa tanto como el número: una tasa bajando 3 meses seguidos es una señal aunque todavía sea positiva.",
        "Sirve para decidir si el ritmo actual es sostenible a largo plazo y si hay margen real para ahorro o inversión.",
      ],
      calculation: [
        monthlySavingsRate.lastRate != null
          ? `Este mes la tasa va en ${monthlySavingsRate.lastRate.toFixed(1)}%. El promedio de los últimos 6 meses es ${monthlySavingsRate.avgRate?.toFixed(1) ?? "–"}%.`
          : "Registra ingresos y gastos en al menos 2 meses para activar este indicador.",
        monthlySavingsRate.trend !== "insuficiente"
          ? `La tendencia de los últimos 6 meses es ${monthlySavingsRate.trend}: ${monthlySavingsRate.trend === "mejorando" ? "la tasa ha subido más de 3 puntos desde el mes más antiguo del período." : monthlySavingsRate.trend === "empeorando" ? "la tasa ha bajado más de 3 puntos desde el mes más antiguo del período." : "la variación entre el mes más antiguo y el actual es menor a 3 puntos."}`
          : "Se necesitan al menos 3 meses para calcular la tendencia.",
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    incomeStability: {
      title: "Estabilidad de ingresos",
      summary: "Mide qué tan predecibles son tus ingresos mes a mes. Ingresos estables hacen las proyecciones más fiables; ingresos muy variables las hacen más inciertas.",
      meaning: [
        "Usa el coeficiente de variación (CV): desviación estándar / media de los últimos 6 meses. Cuanto menor el CV, más estable el ingreso.",
        "Score 75–100 = ingreso predecible, las proyecciones son confiables. Score 45–74 = variación moderada, proyecciones son aproximadas. Menos de 45 = ingreso muy variable, las proyecciones son orientativas.",
        "Sirve para calibrar cuánta confianza depositar en el cierre estimado del mes y para saber si conviene construir un colchón mayor.",
      ],
      calculation: [
        incomeStabilityScore.score != null
          ? `Score actual: ${incomeStabilityScore.score}/100 — ${incomeStabilityScore.label}. Coeficiente de variación: ${incomeStabilityScore.cvPct}%.`
          : "Registra ingresos en al menos 2 meses para calcular este indicador.",
        incomeStabilityScore.score != null
          ? `Un CV del ${incomeStabilityScore.cvPct}% significa que tus ingresos típicamente varían ±${incomeStabilityScore.cvPct}% respecto a tu promedio mensual.`
          : "",
      ].filter(Boolean),
      actions: [],
    },
    seasonalComparison: {
      title: "Comparación estacional",
      summary: "Te muestra si este mes gastas más o menos que en el mismo mes del año pasado, ajustando por estacionalidad natural del calendario.",
      meaning: [
        "La comparación estacional elimina la distorsión de comparar meses distintos (enero vs diciembre). Compara como-a-como: este marzo vs el marzo anterior.",
        "Es útil para detectar si el crecimiento del gasto es real o simplemente refleja la estacionalidad esperada del año.",
        "Requiere al menos 12 meses de historia para activarse.",
      ],
      calculation: [
        seasonalComparison.hasHistory
          ? `Gasto este mes: ${formatCurrency(seasonalComparison.curExpense, activeCurrency)} vs ${formatCurrency(seasonalComparison.prevExpense, activeCurrency)} en el mismo mes del año pasado.`
          : "Se necesitan 12 meses de movimientos registrados para activar esta comparación.",
        seasonalComparison.hasHistory && seasonalComparison.expenseDelta != null
          ? `Variación de gasto: ${seasonalComparison.expenseDelta >= 0 ? "+" : ""}${seasonalComparison.expenseDelta.toFixed(1)}% vs el mismo mes del año anterior.`
          : "",
        seasonalComparison.hasHistory && seasonalComparison.incomeDelta != null
          ? `Variación de ingresos: ${seasonalComparison.incomeDelta >= 0 ? "+" : ""}${seasonalComparison.incomeDelta.toFixed(0)}% vs el mismo mes del año anterior.`
          : "",
      ].filter(Boolean),
      actions: [],
    },
    collectionEfficiency: {
      title: "Eficiencia de cobranza",
      summary: "Mide qué porcentaje de tus cobros pendientes (obligaciones receivable) se resolvieron en los últimos 30 días. Una cobranza alta mejora la lectura de liquidez.",
      meaning: [
        "Un cobro 'resuelto' es una obligación receivable que venció en los últimos 30 días y ya fue marcada como cobrada.",
        "80%+ es excelente. 50–79% indica que algunos cobros tardan más de lo esperado. Menos del 50% sugiere que hay dinero pendiente que no está volviendo al flujo.",
        "Cobros sin resolver distorsionan la proyección: el sistema puede esperar ingresos que aún no llegan.",
      ],
      calculation: [
        collectionEfficiency.rate != null
          ? `${collectionEfficiency.resolved} de ${collectionEfficiency.total} cobros vencidos en los últimos 30 días fueron resueltos (${collectionEfficiency.rate}%).`
          : "Sin obligaciones receivable con vencimiento en los últimos 30 días.",
      ],
      actions: [
        collectionEfficiency.total > 0
          ? { label: "Abrir créditos y deudas", onPress: () => { setAdvancedDetail(null); router.push("/obligations" as never); } }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
  }), [
    activeCurrency,
    anomalySignals,
    cashCushion.days,
    categoryConcentration.hhi,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    categoryConcentration.topCategoryId,
    categoryConcentration.topShare,
    collectionEfficiency.rate,
    collectionEfficiency.resolved,
    collectionEfficiency.total,
    focusAction.title,
    focusAction.score,
    focusAction.scoreLabel,
    focusAction.scorePill,
    focusAction.reason,
    focusAction.alternatives,
    focusAction.key,
    focusAction.quickFilter,
    incomeStabilityScore.cvPct,
    incomeStabilityScore.label,
    incomeStabilityScore.score,
    learning.readinessScore,
    monthlySavingsRate.avgRate,
    monthlySavingsRate.lastRate,
    monthlySavingsRate.trend,
    openAnomalyMovementsPreview,
    openCategoryPeriodPreview,
    openFocusActionDestination,
    openPrecisionLayer,
    openSummaryUncategorizedPreview,
    projectionModel.committedInflow,
    projectionModel.committedOutflow,
    projectionModel.conservativeBalance,
    projectionModel.expectedBalance,
    projectionModel.monteCarloHighBalance,
    projectionModel.monteCarloLowBalance,
    projectionModel.monteCarloMedianBalance,
    projectionModel.pressureProbability,
    projectionModel.pressureThreshold,
    projectionModel.variableExpenseProjection,
    projectionModel.variableIncomeProjection,
    qualityOpen,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    router,
    seasonalComparison.curExpense,
    seasonalComparison.expenseDelta,
    seasonalComparison.hasHistory,
    seasonalComparison.incomeDelta,
    seasonalComparison.prevExpense,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
  ]);
  const activeAdvancedDetail = advancedDetail ? advancedDetails[advancedDetail] : null;
  const advancedResultMeaning = useMemo(() => ({
    focusCenter: [
      `Que hoy el centro de foco marque "${focusAction.title}" significa que esta accion tendria mas impacto inmediato que revisar otras capas del dashboard.`,
      review.uncategorizedCount > 0
        ? "En este caso el sistema te esta diciendo que la calidad del dato pesa mas que cualquier lectura avanzada."
        : review.overdueObligationsCount > 0
          ? "En este caso el sistema te esta diciendo que la cartera vencida ya merece prioridad operativa."
          : review.subscriptionsAttentionCount > 0
            ? "En este caso el sistema te esta diciendo que tu agenda fija todavia necesita orden para proyectar mejor."
            : "En este caso el sistema no ve una friccion operativa dominante y te deja sostener el ritmo actual.",
    ],
    projection: [
      projectionModel.confidence >= 75
        ? "Este resultado significa que la proyeccion ya tiene una base relativamente confiable para tomar decisiones de corto plazo."
        : projectionModel.confidence >= 45
          ? "Este resultado significa que la lectura ya orienta, pero todavia depende bastante de que el ritmo reciente no cambie demasiado."
          : "Este resultado significa que la proyeccion todavia es fragil y conviene leerla con prudencia.",
      `Hoy la banda va desde ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)} hasta ${formatCurrency(projectionModel.optimisticBalance, activeCurrency)}.`,
    ],
    review: [
      anomalySignals.length > 0
        ? `Este resultado significa que hoy ya hay ${anomalySignals.length} senal${anomalySignals.length === 1 ? "" : "es"} que podria estar distorsionando tu lectura del periodo.`
        : "Este resultado significa que no se ven señales fuertes de movimientos raros o duplicados en la lectura actual.",
      anomalySignals.some((item) => item.level === "strong")
        ? "Como hay alertas fuertes, aqui conviene revisar primero antes de confiar totalmente en comparativos o presupuestos."
        : "Como no predominan alertas fuertes, esta capa hoy funciona mas como control fino que como urgencia.",
    ],
    advancedMetrics: [
      monthlySavingsRate.lastRate != null
        ? `Hoy esta capa te esta diciendo que tu ahorro del mes va en ${monthlySavingsRate.lastRate.toFixed(1)}%, con una lectura ${monthlySavingsRate.trend}.`
        : "Hoy esta capa te esta diciendo que aun falta historial util para sacar una lectura estadistica mas firme.",
      incomeStabilityScore.score != null
        ? `Ademas, tus ingresos se ven ${incomeStabilityScore.label.toLowerCase()} y la concentracion de gasto aparece ${categoryConcentration.label.toLowerCase()}.`
        : "Ademas, la estabilidad de ingresos todavia no tiene suficiente base para una senal fuerte.",
    ],
    quality: [
      qualitySnapshot.noCategoryCount > 0 || qualitySnapshot.noCounterpartyCount > 0
        ? "Este resultado significa que el dashboard ya puede orientarte, pero todavia no deberias pedirle lecturas demasiado finas sin limpiar primero esa base."
        : "Este resultado significa que la base de datos ya esta bastante sana para comparativos, patrones y alertas mas confiables.",
      `La confianza base de aprendizaje hoy esta en ${learning.readinessScore}%.`,
    ],
    categoryConcentration: [
      categoryConcentration.hhi != null
        ? categoryConcentration.hhi > 0.25
          ? `Un HHI de ${categoryConcentration.hhi.toFixed(3)} indica que tu gasto está muy concentrado. Esto no es malo en sí, pero significa que si ${categoryConcentration.topCategory ?? "la categoría dominante"} sube inesperadamente, mueve todo el mes.`
          : categoryConcentration.hhi > 0.15
            ? `Un HHI de ${categoryConcentration.hhi.toFixed(3)} indica concentración moderada. Hay una categoría dominante pero el resto del gasto tiene cierta diversidad.`
            : `Un HHI de ${categoryConcentration.hhi.toFixed(3)} indica que el gasto está bien distribuido entre categorías. Menos riesgo de que una sola partida distorsione el período.`
        : "Categoriza más movimientos para que este indicador pueda calcular la distribución real del gasto.",
    ],
    savingsRate: [
      monthlySavingsRate.lastRate != null
        ? monthlySavingsRate.lastRate >= 20
          ? `Una tasa de ${monthlySavingsRate.lastRate.toFixed(1)}% este mes es saludable — estás reteniendo más de 1 de cada 5 pesos que entra.`
          : monthlySavingsRate.lastRate >= 0
            ? `Una tasa de ${monthlySavingsRate.lastRate.toFixed(1)}% indica que estás reteniendo algo, pero hay margen para mejorar. El objetivo recomendado es ≥ 20%.`
            : `Una tasa de ${monthlySavingsRate.lastRate.toFixed(1)}% indica que este mes los gastos superaron los ingresos. Conviene revisar qué categorías empujaron ese resultado.`
        : "Registra al menos 2 meses de ingresos y gastos para activar este indicador.",
    ],
    incomeStability: [
      incomeStabilityScore.score != null
        ? incomeStabilityScore.score >= 75
          ? `Con un score de ${incomeStabilityScore.score}/100 tu ingreso es predecible. Las proyecciones de cierre de mes son más fiables en este contexto.`
          : incomeStabilityScore.score >= 45
            ? `Con un score de ${incomeStabilityScore.score}/100 hay variación moderada mes a mes. Las proyecciones son una buena guía pero pueden desviarse.`
            : `Con un score de ${incomeStabilityScore.score}/100 el ingreso varía significativamente entre meses. Conviene leer el estimado de fin de mes con cautela.`
        : "Registra ingresos en al menos 2 meses para activar este indicador.",
    ],
    seasonalComparison: [
      seasonalComparison.hasHistory && seasonalComparison.expenseDelta != null
        ? seasonalComparison.expenseDelta <= -5
          ? `Gastaste ${Math.abs(seasonalComparison.expenseDelta).toFixed(1)}% menos que en este mismo mes el año pasado. Buen control estacional.`
          : seasonalComparison.expenseDelta <= 5
            ? "El gasto está en línea con el mismo período del año pasado — patrón estable."
            : `Gastaste ${seasonalComparison.expenseDelta.toFixed(1)}% más que en este mismo mes el año pasado. Vale la pena revisar qué cambió respecto al año anterior.`
        : "Se necesitan 12 meses de movimientos registrados para activar esta comparación.",
    ],
    collectionEfficiency: [
      collectionEfficiency.rate != null
        ? collectionEfficiency.rate >= 80
          ? `Con ${collectionEfficiency.rate}% de eficiencia estás cobrando la gran mayoría de lo que se te debe a tiempo. El flujo proyectado es más confiable.`
          : collectionEfficiency.rate >= 50
            ? `Con ${collectionEfficiency.rate}% de eficiencia algunos cobros tardan más de lo esperado. Los ${collectionEfficiency.total - collectionEfficiency.resolved} cobros sin resolver pueden estar retrasando el flujo real.`
            : `Con ${collectionEfficiency.rate}% de eficiencia hay dinero pendiente que no está volviendo al flujo. Conviene revisar las obligaciones receivable vencidas.`
        : "Sin obligaciones receivable con vencimiento en los últimos 30 días para medir.",
    ],
  }), [
    activeCurrency,
    anomalySignals,
    categoryConcentration.hhi,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    collectionEfficiency.rate,
    collectionEfficiency.resolved,
    collectionEfficiency.total,
    focusAction.title,
    incomeStabilityScore.label,
    incomeStabilityScore.score,
    learning.readinessScore,
    monthlySavingsRate.lastRate,
    monthlySavingsRate.trend,
    projectionModel.confidence,
    projectionModel.conservativeBalance,
    projectionModel.optimisticBalance,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    seasonalComparison.expenseDelta,
    seasonalComparison.hasHistory,
  ]);
  const activeAdvancedResultMeaning = advancedDetail ? advancedResultMeaning[advancedDetail] : [];
  const resolvedAdvancedResultMeaning =
    advancedDetail === "focusCenter"
      ? [
        `Cuando aqui hablamos de caja libre, nos referimos a ${visibleBalanceLabel} convertida a ${activeCurrency}: hoy eso suma ${formatCurrency(currentVisibleBalance, activeCurrency)}.`,
        `Con ese saldo y tu ritmo reciente de gasto, el sistema estima ${cashCushion.days} dias de caja libre y ${cashCushion.daysWithCommitments} dias si ademas mete los compromisos ya programados.`,
        cashCushion.days >= 90
          ? "Eso significa que hoy tienes un colchon comodo para absorber variaciones sin que una sola semana te desordene."
          : cashCushion.days >= 30
            ? "Eso significa que hoy tienes aire, pero no tanto como para ignorar pagos cercanos o salidas grandes no planeadas."
            : "Eso significa que hoy tu colchon de caja es corto y conviene priorizar liquidez antes que decisiones secundarias.",
      ]
      : advancedDetail === "projection"
        ? [
          `Esta proyección parte de ${visibleBalanceLabel} convertida a ${activeCurrency}: hoy eso suma ${formatCurrency(currentVisibleBalance, activeCurrency)}.`,
          `Detalle de esa base: ${visibleAccountSummary}.`,
          `Luego suma la agenda comprometida del mes (${formatCurrency(projectionCommittedNet, activeCurrency)} neto) y tu ritmo variable reciente (${formatCurrency(projectionVariableNet, activeCurrency)} neto) para estimar un cierre esperado de ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}.`,
          `Frente a lo que hoy ya tienes visible, eso implica un cambio de ${formatCurrency(projectionModel.expectedBalance - currentVisibleBalance, activeCurrency)}. El piso conservador es ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)} y el escenario alto ${formatCurrency(projectionModel.optimisticBalance, activeCurrency)}.`,
          projectionModel.expectedBalance >= currentVisibleBalance
            ? "Eso significa que, si el ritmo actual se sostiene, el mes deberia cerrar con mas caja que la que hoy ves acumulada."
            : "Eso significa que, si el ritmo actual se sostiene, el mes cerraria con menos caja que la que hoy ya ves acumulada.",
        ]
        : advancedDetail === "advancedMetrics"
          ? [
            monthlySavingsRate.lastRate != null
              ? `La tasa de ahorro del mes va en ${monthlySavingsRate.lastRate.toFixed(1)}%: si es positiva, el periodo todavia retiene parte del ingreso; si es negativa, estas gastando por encima del ingreso observado.`
              : "Todavia no hay suficiente historial para confiar en la tasa de ahorro como lectura estadistica fuerte.",
            incomeStabilityScore.score != null
              ? `La estabilidad de ingresos va en ${incomeStabilityScore.score}/100: arriba de 75 suele ser buena señal, entre 45 y 74 pide vigilancia, y por debajo de eso la lectura se vuelve mas fragil.`
              : "Todavia no hay suficiente base para leer estabilidad de ingresos con confianza.",
            categoryConcentration.topCategory
              ? `La concentracion de gasto te dice cuanto depende tu mes de una sola categoria; hoy la mayor partida es ${categoryConcentration.topCategory}. Si esa categoria domina demasiado, cualquier pico ahi te mueve todo el periodo.`
              : "Todavia no hay una categoria dominante clara para interpretar concentracion de gasto.",
          ]
          : activeAdvancedResultMeaning;
  const advancedResultTone = useMemo(() => ({
    focusCenter: review.uncategorizedCount > 0 || review.overdueObligationsCount > 0 || review.subscriptionsAttentionCount > 0 ? "warning" : "positive",
    projection: projectionModel.confidence >= 75 ? "positive" : projectionModel.confidence >= 45 ? "warning" : "danger",
    review: anomalySignals.some((item) => item.level === "strong") ? "danger" : anomalySignals.length > 0 ? "warning" : "positive",
    advancedMetrics:
      incomeStabilityScore.score != null && incomeStabilityScore.score >= 75 && monthlySavingsRate.lastRate != null && monthlySavingsRate.lastRate >= 0
        ? "positive"
        : incomeStabilityScore.score != null && incomeStabilityScore.score >= 45
          ? "warning"
          : "danger",
    quality: qualitySnapshot.noCategoryCount > 0 || qualitySnapshot.noCounterpartyCount > 0 ? "warning" : "positive",
    categoryConcentration: categoryConcentration.hhi == null ? "warning" : categoryConcentration.hhi > 0.25 ? "warning" : categoryConcentration.hhi > 0.15 ? "warning" : "positive",
    savingsRate: monthlySavingsRate.lastRate == null ? "warning" : monthlySavingsRate.lastRate >= 20 ? "positive" : monthlySavingsRate.lastRate >= 0 ? "warning" : "danger",
    incomeStability: incomeStabilityScore.score == null ? "warning" : incomeStabilityScore.score >= 75 ? "positive" : incomeStabilityScore.score >= 45 ? "warning" : "danger",
    seasonalComparison: !seasonalComparison.hasHistory ? "warning" : seasonalComparison.expenseDelta == null ? "warning" : seasonalComparison.expenseDelta <= 5 ? "positive" : "warning",
    collectionEfficiency: collectionEfficiency.rate == null ? "warning" : collectionEfficiency.rate >= 80 ? "positive" : collectionEfficiency.rate >= 50 ? "warning" : "danger",
  } as const), [
    anomalySignals,
    categoryConcentration.hhi,
    collectionEfficiency.rate,
    incomeStabilityScore.score,
    monthlySavingsRate.lastRate,
    projectionModel.confidence,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    seasonalComparison.expenseDelta,
    seasonalComparison.hasHistory,
  ]);
  const activeAdvancedResultTone = advancedDetail ? advancedResultTone[advancedDetail] : "warning";
  const projectionExpectedTone: ExplanationTone =
    projectionModel.expectedBalance >= currentVisibleBalance
      ? "positive"
      : projectionModel.expectedBalance >= currentVisibleBalance * 0.92
        ? "warning"
        : "danger";
  const projectionConservativeTone: ExplanationTone =
    projectionModel.conservativeBalance >= currentVisibleBalance
      ? "positive"
      : projectionModel.conservativeBalance >= currentVisibleBalance * 0.9
        ? "warning"
        : "danger";
  const projectionDetails = {
    conservative: {
      title: "Conservador",
      summary: "Es el piso defensivo de cierre: una lectura prudente para decidir si el mes aguanta aunque el ritmo variable salga peor de lo esperado.",
      tone: projectionConservativeTone,
      meaning: [
        "No es una cuenta específica. Parte de la suma de tus cuentas visibles y la convierte a la moneda del dashboard.",
        "Sirve para responder: si este mes se pone más pesado, cuál sería mi margen mínimo razonable al cierre.",
        "Si el conservador baja mucho frente a tu saldo visible actual, no significa que ya perdiste ese dinero; significa que el escenario defensivo deja menos aire para gastos no urgentes.",
      ],
      calculation: [
        `Primero toma ${visibleBalanceLabel}: ${visibleAccountSummary}. Esa base suma ${formatCurrency(currentVisibleBalance, activeCurrency)}.`,
        `Luego agrega la agenda comprometida del mes: ${formatCurrency(projectionModel.committedInflow, activeCurrency)} por entrar menos ${formatCurrency(projectionModel.committedOutflow, activeCurrency)} por salir, neto ${formatCurrency(projectionCommittedNet, activeCurrency)}.`,
        `Finalmente usa un ritmo variable defensivo de ${formatCurrency(projectionConservativeVariableNet, activeCurrency)}. Fórmula: ${formatCurrency(currentVisibleBalance, activeCurrency)} + ${formatCurrency(projectionCommittedNet, activeCurrency)} + ${formatCurrency(projectionConservativeVariableNet, activeCurrency)} = ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)}.`,
      ],
      result: [
        `El piso conservador queda en ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)}.`,
        `Frente a lo que hoy ya tienes visible, cambia ${formatCurrency(projectionConservativeDelta, activeCurrency)}.`,
        projectionConservativeDelta >= 0
          ? "Eso significa que incluso en lectura defensiva el mes todavía podría cerrar con más caja visible que hoy."
          : "Eso significa que, en lectura defensiva, el mes podría cerrar con menos caja visible que hoy; conviene cuidar gastos variables o revisar compromisos próximos.",
      ],
      actions: [
        { label: "Ver cálculo completo", onPress: () => { setProjectionDetail(null); setAdvancedDetail("projection"); } },
        weekWindow.expectedOutflow > weekWindow.expectedInflow
          ? { label: "Revisar obligaciones próximas", onPress: () => { setProjectionDetail(null); router.push("/obligations" as never); } }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    expected: {
      title: "Esperado",
      summary: "Es el cierre central del mes si se mantiene lo que ya está programado y tu ritmo reciente de ingresos y gastos variables.",
      tone: projectionExpectedTone,
      meaning: [
        "No representa una sola cuenta; representa la caja visible total del workspace en la moneda del dashboard.",
        "Sirve para decidir si puedes sostener el ritmo actual, si conviene frenar gastos no urgentes o si el mes ya viene con margen.",
        "La confianza indica qué tan fuerte es la base: más historial y datos limpios hacen que esta lectura sea menos frágil.",
      ],
      calculation: [
        `Base inicial: ${formatCurrency(currentVisibleBalance, activeCurrency)} desde ${visibleBalanceLabel}.`,
        `Agenda comprometida neta: ${formatCurrency(projectionCommittedNet, activeCurrency)}. Ahí entran ingresos fijos esperados, obligaciones y suscripciones del mes.`,
        `Ritmo variable neto: ${formatCurrency(projectionVariableNet, activeCurrency)}. Ahí se estima lo que falta del mes con tu comportamiento reciente.`,
        `Fórmula: ${formatCurrency(currentVisibleBalance, activeCurrency)} + ${formatCurrency(projectionCommittedNet, activeCurrency)} + ${formatCurrency(projectionVariableNet, activeCurrency)} = ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}.`,
      ],
      result: [
        `El esperado queda en ${formatCurrency(projectionModel.expectedBalance, activeCurrency)} con ${projectionModel.confidence}% de confianza (${projectionModel.confidenceLabel}).`,
        `Frente a tu caja visible actual, la diferencia es ${formatCurrency(projectionExpectedDelta, activeCurrency)}.`,
        projectionExpectedDelta >= 0
          ? "Eso significa que el modelo espera cerrar con más caja total visible que la que tienes hoy, no que todas tus cuentas suban por igual."
          : "Eso significa que el modelo espera consumir parte de la caja visible actual antes de fin de mes.",
      ],
      actions: [
        { label: "Ver cálculo completo", onPress: () => { setProjectionDetail(null); setAdvancedDetail("projection"); } },
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
    included: {
      title: "Qué ya entra",
      summary: "Te muestra qué componentes ya fueron sumados en la proyección para que no los cuentes dos veces ni confundas saldo actual con saldo proyectado.",
      tone: projectionModel.confidence >= 60 ? "positive" as ExplanationTone : "warning" as ExplanationTone,
      meaning: [
        "Esta tarjeta responde qué está dentro del cálculo del cierre esperado.",
        "Sirve para saber si el número ya considera ingresos fijos, pagos programados y ritmo variable, o si falta registrar algo manualmente.",
        "Cuando algo ya entra en la lectura, no deberías sumarlo otra vez mentalmente encima del esperado.",
      ],
      calculation: [
        `Saldo visible: ${formatCurrency(currentVisibleBalance, activeCurrency)} desde ${visibleAccountSummary}.`,
        `Agenda comprometida: ingresos fijos, obligaciones y suscripciones. Neto actual: ${formatCurrency(projectionCommittedNet, activeCurrency)}.`,
        `Ritmo variable: ingresos y gastos no programados estimados por comportamiento reciente. Neto actual: ${formatCurrency(projectionVariableNet, activeCurrency)}.`,
        `Con esos componentes sale el esperado: ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}. La banda va de ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)} a ${formatCurrency(projectionModel.optimisticBalance, activeCurrency)}.`,
      ],
      result: [
        "El resultado esperado ya incluye lo comprometido y el ritmo reciente; por eso puede ser mayor o menor que tu saldo visible de hoy.",
        projectionCommittedNet >= 0
          ? `La agenda comprometida hoy suma a favor: ${formatCurrency(projectionCommittedNet, activeCurrency)} neto.`
          : `La agenda comprometida hoy presiona la caja: ${formatCurrency(projectionCommittedNet, activeCurrency)} neto.`,
        projectionVariableNet >= 0
          ? `El ritmo variable también suma a favor: ${formatCurrency(projectionVariableNet, activeCurrency)} neto.`
          : `El ritmo variable consume caja: ${formatCurrency(projectionVariableNet, activeCurrency)} neto.`,
      ],
      actions: [
        { label: "Ver ingresos fijos", onPress: () => { setProjectionDetail(null); router.push("/recurring-income" as never); } },
        { label: "Ver obligaciones", onPress: () => { setProjectionDetail(null); router.push("/obligations" as never); } },
        { label: "Ver movimientos del mes", onPress: openCurrentMonthMovementsPreview },
      ],
    },
  } satisfies Record<"conservative" | "expected" | "included", {
    title: string;
    summary: string;
    tone: ExplanationTone;
    meaning: string[];
    calculation: string[];
    result: string[];
    actions: Array<{ label: string; onPress: () => void }>;
  }>;
  const activeProjectionDetail = projectionDetail ? projectionDetails[projectionDetail] : null;
  const movementPreviewStats = useMemo(() => {
    if (!movementPreview) return null;
    const total = movementPreview.movements.reduce((sum, movement) => {
      if (movementActsAsIncome(movement)) {
        return sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
      }
      if (movementActsAsExpense(movement)) {
        return sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
      }
      return sum + transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
    }, 0);
    const pending = movementPreview.movements.filter((movement) => movement.status === "pending" || movement.status === "planned").length;
    const uncategorized = movementPreview.movements.filter((movement) => isCategorizedCashflow(movement) && movement.categoryId == null).length;
    return {
      total,
      pending,
      uncategorized,
      count: movementPreview.movements.length,
    };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movementPreview]);
  const dashboardAiSummaryMutation = useDashboardAiSummaryMutation();
  const [dashboardAiReply, setDashboardAiReply] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdvancedTab>('Resumen');
  const handleTabChange = useCallback((tab: AdvancedTab) => {
    setActiveTab(tab);
    onScrollToTop?.();
  }, [onScrollToTop]);
  const handleRequestDashboardAiSummary = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    try {
      const response = await dashboardAiSummaryMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiSummaryPayload,
      });
      setDashboardAiReply(response.reply);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA.", "error");
    }
  }, [dashboardAiSummaryMutation, dashboardAiSummaryPayload, showToast, workspaceId]);

  return (
    <>
      <DashboardTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        indicators={[
          ...(review.totalIssues > 0 ? [{ tab: 'Salud' as AdvancedTab, count: review.totalIssues }] : []),
          ...(anomalySignals.length > 0 ? [{ tab: 'Patrones' as AdvancedTab, dot: COLORS.gold }] : []),
          ...(cashCushion.days < 30 || pressureStatus === "Bajo presión"
            ? [{ tab: 'Flujo' as AdvancedTab, dot: COLORS.expense }]
            : []),
        ]}
      />

      {activeTab === 'Resumen' && <>
      <DashboardLayerHeader
        kicker="Resumen"
        title="Estado actual"
        bullets={[
          "Calidad de los datos: qué tan fiables son las cifras",
          "Presión de caja en los próximos 7 días",
          "Estimado de cómo cerrarás el mes",
        ]}
      />

      <View style={{ height: SPACING.sm }} />
      <Card>
        <SectionTitle>Resumen ejecutivo</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          Tres lecturas de estado para entender el panorama sin entrar todavía en la acción concreta.
        </Text>
        <View style={subStyles.executiveGrid}>
          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setExecutiveDetail("focus")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Estado del sistema</Text>
              <View style={subStyles.executiveTonePill}>
                <Text style={subStyles.executiveToneText} numberOfLines={1}>
                  {learning.readinessScore >= 75 ? "Confiable" : review.totalIssues > 0 ? "Por limpiar" : "Base media"}
                </Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{learning.readinessScore}%</Text>
            <Text style={subStyles.executiveCaption}>
              {review.totalIssues > 0 ? `${review.totalIssues} punto${review.totalIssues === 1 ? "" : "s"} sin resolver` : "Sin issues pendientes"}
            </Text>
            <Text style={[subStyles.executiveInterpret, { color: learning.readinessScore >= 75 ? COLORS.income : review.totalIssues > 0 ? COLORS.gold : COLORS.storm }]}>
              {learning.readinessScore >= 75
                ? "Los números son confiables para tomar decisiones."
                : review.totalIssues > 0
                ? "Conviene limpiar datos antes de confiar en las métricas."
                : "Base suficiente, aunque hay margen para mejorar."}
            </Text>
            {(() => {
              const delta = review.totalIssues - priorWeekReview.totalIssues;
              if (delta === 0) return null;
              const isImproving = delta < 0;
              return (
                <Text style={[subStyles.executiveDeltaChip, { color: isImproving ? COLORS.income : COLORS.expense }]}>
                  {isImproving ? `v ${Math.abs(delta)} resuelto${Math.abs(delta) === 1 ? "" : "s"}` : `^ ${delta} nuevo${delta === 1 ? "" : "s"}`}
                </Text>
              );
            })()}
          </TouchableOpacity>

          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setExecutiveDetail("risk")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Riesgo 7 días</Text>
              <View style={[subStyles.executiveTonePill, pressureStatus === "Bajo presión" && subStyles.executiveTonePillWarning]}>
                <Text style={[subStyles.executiveToneText, pressureStatus === "Bajo presión" && subStyles.executiveToneTextWarning]}>{pressureStatus}</Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, activeCurrency)}</Text>
            <Text style={subStyles.executiveCaption}>Entran {formatCurrency(weekWindow.expectedInflow, activeCurrency)} · salen {formatCurrency(weekWindow.expectedOutflow, activeCurrency)}</Text>
            <Text style={[subStyles.executiveInterpret, { color: weekWindow.expectedInflow >= weekWindow.expectedOutflow ? COLORS.income : COLORS.gold }]}>
              {weekWindow.expectedInflow >= weekWindow.expectedOutflow
                ? "Semana con margen positivo — sin presión inmediata."
                : "Más compromisos que ingresos esta semana — revisa el flujo."}
            </Text>
            <Text style={[subStyles.executiveDeltaChip, { color: cashCushion.color }]}>Caja libre: {cashCushion.days}d · {cashCushion.label}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[subStyles.executiveCard, subStyles.executiveCardWide]} activeOpacity={0.84} onPress={() => setExecutiveDetail("month")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Fin de mes</Text>
              <View style={[subStyles.executiveTonePill, monthStatus === "Bajo presión" && subStyles.executiveTonePillWarning]}>
                <Text style={[subStyles.executiveToneText, monthStatus === "Bajo presión" && subStyles.executiveToneTextWarning]}>{monthStatus}</Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{formatCurrency(monthEndReading, activeCurrency)}</Text>
            <Text style={subStyles.executiveCaption}>Hoy: {formatCurrency(currentVisibleBalance, activeCurrency)} · {activeAccounts.length} cuenta{activeAccounts.length === 1 ? "" : "s"}</Text>
            <Text style={[subStyles.executiveInterpret, { color: monthEndDelta >= 0 ? COLORS.income : COLORS.expense }]}>
              {monthEndDelta >= 0
                ? `Cerrarías el mes con ${formatCurrency(monthEndDelta, activeCurrency)} más que hoy.`
                : `Se proyecta consumir ${formatCurrency(Math.abs(monthEndDelta), activeCurrency)} del saldo actual.`}
            </Text>
            <Text style={[subStyles.executiveDeltaChip, { color: monthEndDelta >= 0 ? COLORS.income : COLORS.expense }]}>Vs hoy: {formatCurrency(monthEndDelta, activeCurrency)}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.aiSummaryHeader}>
          <View style={subStyles.aiSummaryHeaderText}>
            <Text style={subStyles.aiSummaryTitle}>Lectura con IA</Text>
            <Text style={subStyles.aiSummaryBody}>
              Envía solo este resumen estructurado del dashboard avanzado para recibir una interpretación humana de tu estado financiero actual.
            </Text>
          </View>
          <View style={subStyles.aiSummaryIconWrap}>
            <Brain size={18} color={COLORS.primary} />
          </View>
        </View>
        <Button
          label={dashboardAiSummaryMutation.isPending ? "Analizando..." : "Analizar mi estado actual"}
          onPress={() => void handleRequestDashboardAiSummary()}
          loading={dashboardAiSummaryMutation.isPending}
          style={subStyles.aiSummaryButton}
        />
        {dashboardAiReply ? (
          <View style={subStyles.aiSummaryResponseCard}>
            <Text style={subStyles.aiSummaryResponseLabel}>Respuesta</Text>
            <Text style={subStyles.aiSummaryResponseText}>{dashboardAiReply}</Text>
          </View>
        ) : (
          <Text style={subStyles.aiSummaryHint}>
            La respuesta se genera a partir del estado actual del resumen, no del detalle completo de todos tus movimientos.
          </Text>
        )}
      </Card>

      {financialGraphRank.length > 0 ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <FinancialGraphCard
            nodes={financialGraphRank}
            currency={activeCurrency}
            onOpenNode={openFinancialGraphNodePreview}
          />
        </>
      ) : null}

      </>}

      <BottomSheet
        visible={Boolean(activeExecutiveDetail)}
        onClose={() => setExecutiveDetail(null)}
        title={activeExecutiveDetail?.title}
        snapHeight={0.78}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {activeExecutiveDetail ? (
          <View style={subStyles.explanationSheetContent}>
            <ExplanationIntro kicker="Resumen ejecutivo" summary={activeExecutiveDetail.summary} />
            <ExplanationVisualSummary
              tone={activeExecutiveResultTone}
              actionsCount={activeExecutiveDetail.actions.length}
              detailCount={activeExecutiveDetail.meaning.length + activeExecutiveDetail.calculation.length + resolvedExecutiveResultMeaning.length}
            />
            <ExplanationSection index="01" title="Para qué te sirve" items={activeExecutiveDetail.meaning} />
            <ExplanationSection index="02" title="Cómo llegamos a este dato" items={activeExecutiveDetail.calculation} />
            <ExplanationResult tone={activeExecutiveResultTone} items={resolvedExecutiveResultMeaning} />
            <ExplanationActions actions={activeExecutiveDetail.actions} />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={Boolean(activeAdvancedDetail)}
        onClose={() => setAdvancedDetail(null)}
        title={activeAdvancedDetail?.title}
        snapHeight={0.8}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {activeAdvancedDetail ? (
          <View style={subStyles.explanationSheetContent}>
            <ExplanationIntro kicker="Dashboard avanzado" summary={activeAdvancedDetail.summary} />
            <ExplanationVisualSummary
              tone={activeAdvancedResultTone}
              actionsCount={activeAdvancedDetail.actions.length}
              detailCount={activeAdvancedDetail.meaning.length + activeAdvancedDetail.calculation.length + resolvedAdvancedResultMeaning.length}
            />
            <ExplanationSection index="01" title="Para qué te sirve" items={activeAdvancedDetail.meaning} />
            <ExplanationSection index="02" title="Cómo se construye" items={activeAdvancedDetail.calculation} />
            <ExplanationResult tone={activeAdvancedResultTone} items={resolvedAdvancedResultMeaning} />
            <ExplanationActions actions={activeAdvancedDetail.actions} />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={Boolean(activeProjectionDetail)}
        onClose={() => setProjectionDetail(null)}
        title={activeProjectionDetail?.title}
        snapHeight={0.78}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {activeProjectionDetail ? (
          <View style={subStyles.explanationSheetContent}>
            <ExplanationIntro kicker="Proyección refinada" summary={activeProjectionDetail.summary} />
            <ExplanationVisualSummary
              tone={activeProjectionDetail.tone}
              actionsCount={activeProjectionDetail.actions.length}
              detailCount={activeProjectionDetail.meaning.length + activeProjectionDetail.calculation.length + activeProjectionDetail.result.length}
            />
            <ExplanationSection index="01" title="Qué significa" items={activeProjectionDetail.meaning} />
            <ExplanationSection index="02" title="Cómo se calculó" items={activeProjectionDetail.calculation} />
            <ExplanationResult tone={activeProjectionDetail.tone} items={activeProjectionDetail.result} />
            <ExplanationActions actions={activeProjectionDetail.actions} />
          </View>
        ) : null}
      </BottomSheet>

      <Modal
        visible={Boolean(movementPreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setMovementPreview(null)}
      >
        <View style={subStyles.movementPreviewOverlay}>
          <Pressable style={subStyles.movementPreviewBackdrop} onPress={() => setMovementPreview(null)} />
          <View style={subStyles.movementPreviewCard}>
            <View style={subStyles.movementPreviewHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={subStyles.movementPreviewKicker}>Movimientos del dashboard</Text>
                <Text style={subStyles.movementPreviewTitle}>{movementPreview?.title}</Text>
              </View>
              <TouchableOpacity
                style={subStyles.movementPreviewClose}
                onPress={() => setMovementPreview(null)}
                activeOpacity={0.82}
              >
                <X size={18} color={COLORS.ink} />
              </TouchableOpacity>
            </View>

            <Text style={subStyles.movementPreviewSubtitle}>{movementPreview?.subtitle}</Text>
            <Text style={subStyles.movementPreviewScope}>{movementPreview?.scopeLabel}</Text>
            {movementPreview?.suggestion ? (
              <TouchableOpacity
                style={[
                  subStyles.movementPreviewSuggestionAction,
                  applyingSuggestionMovementId === movementPreview.suggestion.movementId && subStyles.movementPreviewSuggestionActionDisabled,
                ]}
                onPress={applyCategorySuggestionFromPreview}
                disabled={applyingSuggestionMovementId === movementPreview.suggestion.movementId}
                activeOpacity={0.84}
              >
                <Tag size={15} color={COLORS.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={subStyles.movementPreviewSuggestionTitle} numberOfLines={1}>
                    {applyingSuggestionMovementId === movementPreview.suggestion.movementId
                      ? "Aplicando sugerencia..."
                      : `Aplicar ${movementPreview.suggestion.categoryName}`}
                  </Text>
                  <Text style={subStyles.movementPreviewSuggestionBody} numberOfLines={1}>
                    Confianza {movementPreview.suggestion.confidencePct}% · no sales del dashboard.
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {movementPreviewStats && movementPreviewStats.count > 0 ? (
              <View style={subStyles.movementPreviewStatsRow}>
                <View style={subStyles.movementPreviewStatPill}>
                  <Text style={subStyles.movementPreviewStatLabel}>Movimientos</Text>
                  <Text style={subStyles.movementPreviewStatValue}>{movementPreviewStats.count}</Text>
                </View>
                <View style={subStyles.movementPreviewStatPill}>
                  <Text style={subStyles.movementPreviewStatLabel}>Total listado</Text>
                  <Text style={subStyles.movementPreviewStatValue}>{formatCurrency(movementPreviewStats.total, activeCurrency)}</Text>
                </View>
                {movementPreviewStats.uncategorized > 0 ? (
                  <View style={subStyles.movementPreviewStatPill}>
                    <Text style={subStyles.movementPreviewStatLabel}>Sin categoría</Text>
                    <Text style={subStyles.movementPreviewStatValue}>{movementPreviewStats.uncategorized}</Text>
                  </View>
                ) : null}
                {movementPreviewStats.pending > 0 ? (
                  <View style={subStyles.movementPreviewStatPill}>
                    <Text style={subStyles.movementPreviewStatLabel}>Pendientes</Text>
                    <Text style={subStyles.movementPreviewStatValue}>{movementPreviewStats.pending}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {movementPreview && movementPreview.movements.length > 0 ? (
              <ScrollView style={subStyles.movementPreviewList} contentContainerStyle={subStyles.movementPreviewListContent}>
                {movementPreview.movements.map((movement) => {
                  const incomeLike = movementActsAsIncome(movement);
                  const expenseLike = movementActsAsExpense(movement);
                  const amount = incomeLike
                    ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency })
                    : expenseLike
                      ? expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency })
                      : transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency });
                  const accountId = movementDisplayAccountId(movement);
                  const accountName = accountId ? accountMap.get(accountId) ?? "Cuenta" : "Sin cuenta";
                  const categoryName = movement.categoryId != null ? categoryMap.get(movement.categoryId) ?? "Categoría" : "Sin categoría";
                  const amountColor = incomeLike ? COLORS.income : expenseLike ? COLORS.expense : COLORS.storm;
                  const sign = incomeLike ? "+" : expenseLike ? "-" : "";

                  return (
                    <View key={movement.id} style={subStyles.movementPreviewRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={subStyles.movementPreviewRowTitle} numberOfLines={1}>
                          {movement.description.trim() || "Movimiento sin descripción"}
                        </Text>
                        <Text style={subStyles.movementPreviewRowMeta} numberOfLines={1}>
                          {format(new Date(movement.occurredAt), "d MMM yyyy", { locale: es })} · {categoryName} · {accountName}
                        </Text>
                        <Text style={subStyles.movementPreviewRowStatus} numberOfLines={1}>
                          {movement.status === "posted" ? "Confirmado" : movement.status === "pending" ? "Pendiente" : movement.status === "planned" ? "Planificado" : "Anulado"}
                        </Text>
                      </View>
                      <View style={subStyles.movementPreviewRowSide}>
                        <Text style={[subStyles.movementPreviewAmount, { color: amountColor }]} numberOfLines={1}>
                          {sign}{formatCurrency(amount, activeCurrency)}
                        </Text>
                        <TouchableOpacity
                          style={subStyles.movementPreviewEditBtn}
                          onPress={() => {
                            setMovementPreview(null);
                            router.push(`/movement/${movement.id}?from=dashboard&edit=1` as never);
                          }}
                          activeOpacity={0.84}
                        >
                          <Text style={subStyles.movementPreviewEditText}>{movementPreviewActionLabel(movement)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={subStyles.movementPreviewEmpty}>
                <Text style={subStyles.movementPreviewEmptyTitle}>
                  {movementPreview?.emptyTitle ?? "No hay movimientos para mostrar"}
                </Text>
                <Text style={subStyles.movementPreviewEmptyBody}>
                  {movementPreview?.emptyBody ?? "Cuando exista una selección para esta lectura, aparecerá aquí."}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <BottomSheet
        visible={Boolean(selectedAnnualMonthDetail)}
        onClose={() => setSelectedAnnualMonth(null)}
        title={selectedAnnualMonthDetail ? `Detalle de ${selectedAnnualMonthDetail.month.label} ${selectedHistoryYear}` : "Detalle mensual"}
        snapHeight={0.72}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {selectedAnnualMonthDetail ? (
          <View style={subStyles.annualDetailContent}>
            <View style={subStyles.annualDetailHero}>
              <Text style={subStyles.visualChartKicker}>Lectura del mes</Text>
              <Text style={subStyles.annualDetailTitle}>
                {selectedAnnualMonthDetail.month.net >= 0 ? "Este mes dejó margen" : "Este mes consumió caja"}
              </Text>
              <Text style={subStyles.visualChartIntro}>
                La lectura usa movimientos reales del rango {selectedAnnualMonthDetail.month.dateFrom} al {selectedAnnualMonthDetail.month.dateTo}.
              </Text>
            </View>

            <View style={subStyles.annualSummaryGrid}>
              <View style={subStyles.annualSummaryCard}>
                <Text style={subStyles.savingsStatLabel}>Ingresos</Text>
                <Text style={[subStyles.annualSummaryValue, { color: COLORS.income }]}>{formatCurrency(selectedAnnualMonthDetail.month.income, activeCurrency)}</Text>
                <Text style={subStyles.annualDetailMini}>{selectedAnnualMonthDetail.incomeCount} mov.</Text>
              </View>
              <View style={subStyles.annualSummaryCard}>
                <Text style={subStyles.savingsStatLabel}>Gastos</Text>
                <Text style={[subStyles.annualSummaryValue, { color: COLORS.expense }]}>{formatCurrency(selectedAnnualMonthDetail.month.expense, activeCurrency)}</Text>
                <Text style={subStyles.annualDetailMini}>{selectedAnnualMonthDetail.expenseCount} mov.</Text>
              </View>
              <View style={subStyles.annualSummaryCard}>
                <Text style={subStyles.savingsStatLabel}>Neto</Text>
                <Text style={[subStyles.annualSummaryValue, { color: selectedAnnualMonthDetail.month.net >= 0 ? COLORS.income : COLORS.expense }]}>
                  {selectedAnnualMonthDetail.month.net >= 0 ? "+" : ""}{formatCurrency(selectedAnnualMonthDetail.month.net, activeCurrency)}
                </Text>
              </View>
              <View style={subStyles.annualSummaryCard}>
                <Text style={subStyles.savingsStatLabel}>Ahorro</Text>
                <Text style={[subStyles.annualSummaryValue, { color: selectedAnnualMonthDetail.savingsRate == null ? COLORS.storm : selectedAnnualMonthDetail.savingsRate >= 0 ? COLORS.gold : COLORS.expense }]}>
                  {selectedAnnualMonthDetail.savingsRate == null ? "-" : `${selectedAnnualMonthDetail.savingsRate.toFixed(1)}%`}
                </Text>
              </View>
            </View>

            {selectedAnnualMonthDetail.prevMonth && !selectedAnnualMonthDetail.prevMonth.isFuture ? (
              <View style={subStyles.annualDetailSection}>
                <Text style={subStyles.annualDetailSectionTitle}>Vs mes anterior ({selectedAnnualMonthDetail.prevMonth.label})</Text>
                <View style={subStyles.annualSummaryGrid}>
                  <View style={subStyles.annualSummaryCard}>
                    <Text style={subStyles.savingsStatLabel}>Ingresos</Text>
                    {(() => {
                      const delta = selectedAnnualMonthDetail.month.income - selectedAnnualMonthDetail.prevMonth!.income;
                      return (
                        <Text style={[subStyles.annualSummaryValue, { color: delta >= 0 ? COLORS.income : COLORS.expense }]}>
                          {delta >= 0 ? "+" : ""}{formatCurrency(delta, activeCurrency)}
                        </Text>
                      );
                    })()}
                  </View>
                  <View style={subStyles.annualSummaryCard}>
                    <Text style={subStyles.savingsStatLabel}>Gastos</Text>
                    {(() => {
                      const delta = selectedAnnualMonthDetail.month.expense - selectedAnnualMonthDetail.prevMonth!.expense;
                      return (
                        <Text style={[subStyles.annualSummaryValue, { color: delta <= 0 ? COLORS.income : COLORS.expense }]}>
                          {delta >= 0 ? "+" : ""}{formatCurrency(delta, activeCurrency)}
                        </Text>
                      );
                    })()}
                  </View>
                  <View style={subStyles.annualSummaryCard}>
                    <Text style={subStyles.savingsStatLabel}>Neto</Text>
                    {(() => {
                      const delta = selectedAnnualMonthDetail.month.net - selectedAnnualMonthDetail.prevMonth!.net;
                      return (
                        <Text style={[subStyles.annualSummaryValue, { color: delta >= 0 ? COLORS.income : COLORS.expense }]}>
                          {delta >= 0 ? "+" : ""}{formatCurrency(delta, activeCurrency)}
                        </Text>
                      );
                    })()}
                  </View>
                  <View style={subStyles.annualSummaryCard}>
                    <Text style={subStyles.savingsStatLabel}>Ahorro</Text>
                    {(() => {
                      const prevRate = selectedAnnualMonthDetail.prevMonth!.income > 0
                        ? (selectedAnnualMonthDetail.prevMonth!.net / selectedAnnualMonthDetail.prevMonth!.income) * 100
                        : null;
                      const delta = selectedAnnualMonthDetail.savingsRate != null && prevRate != null
                        ? selectedAnnualMonthDetail.savingsRate - prevRate
                        : null;
                      return (
                        <Text style={[subStyles.annualSummaryValue, { color: delta == null ? COLORS.storm : delta >= 0 ? COLORS.income : COLORS.expense }]}>
                          {delta == null ? "-" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`}
                        </Text>
                      );
                    })()}
                  </View>
                </View>
              </View>
            ) : null}

            <View style={subStyles.annualDetailSection}>
              <Text style={subStyles.annualDetailSectionTitle}>Qué empujó el gasto</Text>
              <TouchableOpacity
                style={subStyles.annualDetailCategoryCard}
                onPress={() => {
                  if (!selectedAnnualMonthDetail) return;
                  openAnnualTopCategoryPreview(selectedAnnualMonthDetail);
                }}
                activeOpacity={0.84}
              >
                <View style={{ flex: 1 }}>
                  <Text style={subStyles.annualDetailCategoryName}>{selectedAnnualMonthDetail.topCategoryName}</Text>
                  <Text style={subStyles.annualDetailMini}>Toca para ver esos movimientos</Text>
                </View>
                <Text style={subStyles.annualDetailCategoryAmount}>{formatCurrency(selectedAnnualMonthDetail.topCategoryAmount, activeCurrency)}</Text>
              </TouchableOpacity>
            </View>

            {selectedAnnualMonthDetail.largestMovements.length > 0 ? (
              <View style={subStyles.annualDetailSection}>
                <Text style={subStyles.annualDetailSectionTitle}>Movimientos que más pesan</Text>
                {selectedAnnualMonthDetail.largestMovements.map((movement) => (
                  <TouchableOpacity
                    key={movement.id}
                    style={subStyles.annualMovementRow}
                    onPress={() => {
                      openSingleMovementPreview(movement.id, movement.title);
                    }}
                    activeOpacity={0.84}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={subStyles.annualMovementTitle} numberOfLines={1}>{movement.title}</Text>
                      <Text style={subStyles.annualMovementMeta} numberOfLines={1}>{movement.categoryName} · {movement.accountName} · {movement.date}</Text>
                    </View>
                    <Text style={[subStyles.annualMovementAmount, { color: movement.income ? COLORS.income : COLORS.expense }]}>
                      {movement.income ? "+" : "-"}{formatCurrency(movement.amount, activeCurrency)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={subStyles.annualDetailActions}>
              <TouchableOpacity
                style={subStyles.annualDetailPrimaryBtn}
                onPress={() => openAnnualMonthPreview(selectedAnnualMonthDetail.month)}
                activeOpacity={0.84}
              >
                <Text style={subStyles.annualDetailPrimaryBtnText}>Abrir movimientos del mes</Text>
              </TouchableOpacity>
              <View style={subStyles.annualDetailSplitActions}>
                <TouchableOpacity
                  style={subStyles.annualDetailSecondaryBtn}
                  onPress={() => openAnnualMonthPreview(selectedAnnualMonthDetail.month, "income")}
                  activeOpacity={0.84}
                >
                  <Text style={subStyles.annualDetailSecondaryBtnText}>Solo ingresos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={subStyles.annualDetailSecondaryBtn}
                  onPress={() => openAnnualMonthPreview(selectedAnnualMonthDetail.month, "expense")}
                  activeOpacity={0.84}
                >
                  <Text style={subStyles.annualDetailSecondaryBtnText}>Solo gastos</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </BottomSheet>

      {activeTab === 'Resumen' && <>
      {showAdvancedGift ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <AdvancedGiftCard />
        </>
      ) : null}
      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.cardHeaderWithAction}>
          <Text style={subStyles.layerKicker}>Centro de foco</Text>
          <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={() => setAdvancedDetail("focusCenter")} activeOpacity={0.82}>
            <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
          </TouchableOpacity>
        </View>
        <Text style={subStyles.layerHeroBody}>
          Aquí va lo que más importa ahora. La idea es que no tengas que interpretar diez tarjetas antes de decidir qué mirar.
        </Text>
        <TouchableOpacity style={subStyles.focusHeroCard} onPress={() => setAdvancedDetail("focusCenter")} activeOpacity={0.84}>
          <View style={subStyles.focusHeroTop}>
            <Text style={subStyles.focusHeroLabel}>Tu siguiente mejor acción</Text>
            <View style={subStyles.focusHeroPills}>
              <View style={subStyles.focusHeroTonePill}><Text style={subStyles.focusHeroToneText} numberOfLines={1}>{focusAction.tag}</Text></View>
              <View style={subStyles.focusHeroTonePillMuted}><Text style={subStyles.focusHeroToneTextMuted} numberOfLines={1}>{focusAction.scorePill}</Text></View>
            </View>
          </View>
          <View style={subStyles.focusHeroMiddle}>
            <View style={{ flex: 1, gap: SPACING.xs }}>
              <Text style={subStyles.focusHeroTitle}>{focusAction.title}</Text>
              <Text style={subStyles.focusHeroValue}>{focusAction.body}</Text>
              <Text style={subStyles.focusHeroBody}>{focusAction.detail}</Text>
              <Text style={subStyles.focusHeroReason}>{focusAction.reason}</Text>
            </View>
            <ArrowRight size={20} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        <View style={subStyles.coachChipList}>
          {panelCoachChips.map((chip, i) => (
            <View key={i} style={[subStyles.coachChip, { borderLeftColor: chip.color }]}>
              <chip.icon size={13} color={chip.color} strokeWidth={2} />
              <Text style={[subStyles.coachChipText, chip.weight === "high" && { color: COLORS.ink }]}>{chip.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      </>}

      {activeTab === 'Patrones' && <>
      <DashboardLayerHeader
        kicker="Patrones"
        title="Hábitos y tendencias"
        bullets={[
          "Hábitos que se repiten en los últimos 90 días",
          "Categorías que subieron frente a los 14 días anteriores",
          "Movimientos que se salen de lo normal para ti",
        ]}
      />
      <View style={{ height: SPACING.sm }} />
      <Card>
        <SectionTitle>Lectura rápida de patrones</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          La app busca costumbres, no términos técnicos: qué se repite, qué subió y qué gasto no parece normal para tu historial.
        </Text>
        <Text style={subStyles.scopeHint}>
          Alcance: hábitos y gastos raros usan últimos 90 días; subidas usa últimos 14 días contra los 14 días anteriores; categoría del mes usa el mes actual.
        </Text>
        <View style={subStyles.commandMetricGrid}>
          <TouchableOpacity
            style={subStyles.commandMetricCard}
            onPress={() => {
              const pattern = repeatedPatterns[0];
              if (!pattern) return;
              openPatternHabitPreview(pattern);
            }}
            disabled={!repeatedPatterns[0]}
            activeOpacity={0.82}
          >
            <Text style={subStyles.commandMetricLabel}>Hábito más repetido</Text>
            <Text style={subStyles.commandMetricValue} numberOfLines={1}>{patternQuickRead.repeatTitle}</Text>
            <Text style={subStyles.commandMetricHint}>{patternQuickRead.repeatBody}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={subStyles.commandMetricCard}
            onPress={() => {
              const item = risingCategoryPatterns[0];
              if (!item) return;
              openRisingCategoryPreview(item);
            }}
            disabled={!risingCategoryPatterns[0]}
            activeOpacity={0.82}
          >
            <Text style={subStyles.commandMetricLabel}>Mayor subida</Text>
            <Text style={subStyles.commandMetricValue} numberOfLines={1}>{patternQuickRead.riseTitle}</Text>
            <Text style={subStyles.commandMetricHint}>{patternQuickRead.riseBody}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[subStyles.commandMetricCard, subStyles.focusMetricCardWide]}
            onPress={() => {
              const ids = anomalySignals.map((item) => item.movementId);
              if (ids.length === 0) return;
              openAnomalyMovementsPreview(ids);
            }}
            disabled={anomalySignals.length === 0}
            activeOpacity={0.82}
          >
            <Text style={subStyles.commandMetricLabel}>Gastos fuera de costumbre</Text>
            <Text style={subStyles.commandMetricValue}>{patternQuickRead.anomalyTitle}</Text>
            <Text style={subStyles.commandMetricHint}>{patternQuickRead.anomalyBody}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <View style={{ height: SPACING.sm }} />
      <CategoryDonutChart
        catTotals={advancedStats.catTotals}
        categories={snapshot?.categories ?? []}
        currency={activeCurrency}
        onOpenCategory={(categoryId) => openCategoryPeriodPreview(categoryId)}
      />

      <View style={{ height: SPACING.sm }} />
      <Card>
        <TouchableOpacity style={subStyles.advMetricSection} onPress={() => setAdvancedDetail("categoryConcentration")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Concentración de gasto</Text>
            {categoryConcentration.hhi != null ? (
              <Text style={[subStyles.advMetricBadge, { color: categoryConcentration.color }]}>
                {categoryConcentration.label}
              </Text>
            ) : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {categoryConcentration.hhi != null
              ? `HHI: ${categoryConcentration.hhi.toFixed(3)}${categoryConcentration.topCategory ? ` · mayor partida: ${categoryConcentration.topCategory} (${categoryConcentration.topShare ?? 0}%)` : ""}`
              : "Categoriza movimientos para ver cómo se distribuye tu gasto entre categorías."}
          </Text>
          {categoryConcentration.hhi != null ? (
            <Text style={[subStyles.advMetricInterpret, { color: categoryConcentration.color }]}>
              {categoryConcentration.hhi > 0.25
                ? `Tu gasto está muy concentrado. Si ${categoryConcentration.topCategory} sube, mueve fuerte todo el mes.`
                : categoryConcentration.hhi > 0.15
                ? `Concentración moderada. Hay una categoría dominante pero con cierta diversidad.`
                : "Gasto bien distribuido entre categorías — menor riesgo de sorpresas por una sola partida."}
            </Text>
          ) : null}
        </TouchableOpacity>
      </Card>

      <View style={{ height: SPACING.sm }} />
      <WeeklyPattern
        movements={movements}
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }}
        onOpenDay={openWeeklyDayPreview}
      />

      <View style={{ height: SPACING.sm }} />
      <Card>
        <SectionTitle>Hábitos que se repiten</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          Agrupamos movimientos parecidos por nombre, categoría, contacto, monto y día. Es como juntar tickets similares para ver qué se volvió costumbre aunque no estén escritos igual.
        </Text>
        <Text style={subStyles.scopeHint}>Alcance: últimos 90 días. Al tocar, se abre la lista exacta dentro del dashboard.</Text>
        {repeatedPatterns.length === 0 ? (
          <View style={subStyles.richEmptyState}>
            <Sparkles size={18} color={COLORS.primary} />
            <Text style={subStyles.richEmptyTitle}>Sin repeticiones claras todavía</Text>
            <Text style={subStyles.richEmptyBody}>El motor de clustering ya está listo. Se activará cuando encuentre al menos 2 movimientos parecidos en los últimos 90 días.</Text>
          </View>
        ) : (
          <View style={subStyles.commandActions}>
            {repeatedPatterns.map((pattern) => (
              <TouchableOpacity
                key={`${pattern.type}-${pattern.label}-${pattern.movementIds.join("-")}`}
                style={subStyles.commandActionRow}
                onPress={() => openPatternHabitPreview(pattern)}
                activeOpacity={0.82}
              >
                <View style={subStyles.commandActionCopy}>
                  <View style={subStyles.suggestionRowTop}>
                    <Text style={subStyles.commandActionTitle} numberOfLines={1}>{pattern.label}</Text>
                    <View style={subStyles.miniChip}>
                      <Text style={subStyles.miniChipText}>{pattern.count}x</Text>
                    </View>
                  </View>
                  <Text style={subStyles.commandActionBody}>
                    {pattern.type} · {pattern.category} · promedio {formatCurrency(pattern.average, activeCurrency)} · confianza {pattern.confidence}%
                  </Text>
                  <Text style={subStyles.commandActionBody}>
                    Total observado {formatCurrency(pattern.total, activeCurrency)} · última vez {pattern.lastLabel} · {pattern.variantCount} nombre{pattern.variantCount === 1 ? "" : "s"}
                  </Text>
                  <Text style={subStyles.commandActionBody}>{pattern.reason}</Text>
                </View>
                <ArrowRight size={15} color={COLORS.storm} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>

      <View style={{ height: SPACING.sm }} />
      <Card>
        <SectionTitle>Categorías que subieron</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          Comparamos los últimos 14 días contra los 14 días anteriores. Si una categoría sube bastante, la marcamos para que sepas dónde se está moviendo la caja.
        </Text>
        <Text style={subStyles.scopeHint}>Alcance: últimos 14 días. Al tocar, se abre la lista exacta dentro del dashboard.</Text>
        {risingCategoryPatterns.length === 0 ? (
          <View style={subStyles.richEmptyState}>
            <TrendingUp size={18} color={COLORS.primary} />
            <Text style={subStyles.richEmptyTitle}>Sin subidas fuertes</Text>
            <Text style={subStyles.richEmptyBody}>El comparador ya revisa 14 días contra los 14 anteriores. Se mostrará cuando una categoría suba lo suficiente como para afectar tu lectura.</Text>
          </View>
        ) : (
          <View style={subStyles.commandActions}>
            {risingCategoryPatterns.map((item) => {
              const pctText = item.pct == null ? "nuevo gasto reciente" : `+${item.pct.toFixed(0)}%`;
              return (
                <TouchableOpacity
                  key={`${item.categoryId ?? "none"}-${item.name}`}
                  style={subStyles.commandActionRow}
                  onPress={() => openRisingCategoryPreview(item)}
                  activeOpacity={0.82}
                >
                  <View style={subStyles.commandActionCopy}>
                    <View style={subStyles.suggestionRowTop}>
                      <Text style={subStyles.commandActionTitle} numberOfLines={1}>{item.name}</Text>
                      <View style={subStyles.miniChip}>
                        <Text style={subStyles.miniChipText}>{pctText}</Text>
                      </View>
                    </View>
                    <Text style={subStyles.commandActionBody}>
                      Últimos 14 días: {formatCurrency(item.current, activeCurrency)} · antes: {formatCurrency(item.previous, activeCurrency)}
                    </Text>
                    <Text style={subStyles.commandActionBody}>
                      Subió {formatCurrency(item.delta, activeCurrency)}. Revísalo si no fue una compra planificada.
                    </Text>
                  </View>
                  <ArrowRight size={15} color={COLORS.storm} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Card>

      <View style={{ height: SPACING.sm }} />
      <AnomalyWatch
        movements={movements}
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }}
        categoryMap={categoryMap}
        accountMap={accountMap}
        onExplainPress={() => setAdvancedDetail("review")}
        onOpenMovement={(movementId) => openAnomalyMovementsPreview([movementId], "Movimiento fuera de costumbre")}
        onOpenAll={(movementIds) => openAnomalyMovementsPreview(movementIds)}
        router={router}
      />

      </>}

      {activeTab === 'Flujo' && <>
      <DashboardLayerHeader
        kicker="Flujo"
        title="Proyección y compromisos"
        bullets={[
          "Proyección de cierre del mes en 3 escenarios",
          "Flujo neto esperado esta semana y los próximos 30 días",
          "Salud de caja, suscripciones y obligaciones próximas",
        ]}
      />
      <View style={{ height: SPACING.sm }} />
      <ProjectionBridgeChart
        currentVisibleBalance={currentVisibleBalance}
        committedNet={projectionCommittedNet}
        variableNet={projectionVariableNet}
        expectedBalance={projectionModel.expectedBalance}
        currency={activeCurrency}
        onOpenAccounts={() => router.push("/accounts" as never)}
        onExplainProjection={() => setAdvancedDetail("projection")}
        onOpenMonthMovements={openFlowVariableMovementsPreview}
      />
      <View style={{ height: SPACING.sm }} />
      <FutureFlowPreview
        obligations={obligations}
        subscriptions={subscriptions}
        recurringIncome={recurringIncome}
        displayCurrency={activeCurrency}
        exchangeRateMap={exchangeRateMap}
        currentVisibleBalance={currentVisibleBalance}
      />
      <View style={{ height: SPACING.sm }} />
      <PaymentOptimizationCard
        recommendations={paymentOptimization}
        currency={activeCurrency}
        router={router}
      />
      {paymentOptimization.length > 0 ? <View style={{ height: SPACING.sm }} /> : null}
      <Card>
        <Text style={subStyles.layerKicker}>Salud de caja</Text>
        <Text style={subStyles.layerHeroBody}>
          Un score saludable es 70+. Por debajo de 50 suele indicar gastos cerca o por encima del ingreso, obligaciones sin cubrir, o caja insuficiente para 1 mes de gasto.
        </Text>
      </Card>
      <View style={{ height: SPACING.sm }} />
      <HealthScore
        netWorth={currentVisibleBalance}
        income={monthToDate.income}
        expense={monthToDate.expense}
        obligations={obligations}
        netWorthThreeMonthExpense={currentVisibleBalance / Math.max(monthToDate.expense, 1)}
      />
      <View style={{ height: SPACING.sm }} />
      <SubscriptionsSummary subscriptions={subscriptions} currency={activeCurrency} />
      <View style={{ height: SPACING.sm }} />
      <ObligationWatch obligations={obligations} router={router} />
      <View style={{ height: SPACING.sm }} />
      <TransferSnapshot
        movements={movements}
        accounts={activeAccounts}
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }}
        onOpenRoute={openTransferRoutePreview}
      />

      </>}

      {activeTab === 'Historial' && <>
      <DashboardLayerHeader
        kicker="Historial"
        title="Evolución en el tiempo"
        bullets={[
          "Neto mes a mes del año seleccionado — toca un mes para ver el detalle",
          "Tasa de ahorro y estabilidad de ingresos en los últimos 6 meses",
          "Comparación con el mismo mes del año pasado",
        ]}
      />
      <View style={{ height: SPACING.sm }} />
      <AnnualHistoryPanel
        years={historyYears}
        selectedYear={selectedHistoryYear}
        onSelectYear={setSelectedHistoryYear}
        data={annualHistory}
        currency={activeCurrency}
        onSelectMonth={setSelectedAnnualMonth}
      />
      {historyChangePoint ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <Card>
            <SectionTitle>Cambio detectado</SectionTitle>
            <Text style={subStyles.executiveIntro}>
              {historyChangePoint.body}
            </Text>
            <View style={subStyles.commandMetricGrid}>
              <View style={subStyles.commandMetricCard}>
                <Text style={subStyles.commandMetricLabel}>Señal principal</Text>
                <Text style={subStyles.commandMetricValue}>{historyChangePoint.title}</Text>
                <Text style={subStyles.commandMetricHint}>
                  Promedio reciente: {formatCurrency(historyChangePoint.recentAverage, activeCurrency)}
                </Text>
              </View>
              <View style={subStyles.commandMetricCard}>
                <Text style={subStyles.commandMetricLabel}>Referencia anterior</Text>
                <Text style={subStyles.commandMetricValue}>{formatCurrency(historyChangePoint.previousAverage, activeCurrency)}</Text>
                <Text style={subStyles.commandMetricHint}>
                  Esto ayuda a separar cambio real de un pico aislado.
                </Text>
              </View>
            </View>
          </Card>
        </>
      ) : null}
      {monthClusters.length > 0 ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <Card>
            <SectionTitle>Tipos de meses</SectionTitle>
            <Text style={subStyles.executiveIntro}>
              Agrupa meses parecidos para que no tengas que leer doce barras una por una. Toca un grupo para abrir un mes representativo.
            </Text>
            <View style={subStyles.commandActions}>
              {monthClusters.slice(0, 4).map((cluster) => (
                <TouchableOpacity
                  key={cluster.kind}
                  style={subStyles.commandActionRow}
                  onPress={() => openHistoryRangePreview(cluster.representativeMonth.dateFrom, cluster.representativeMonth.dateTo, { title: cluster.title })}
                  activeOpacity={0.82}
                >
                  <View style={subStyles.commandActionCopy}>
                    <View style={subStyles.suggestionRowTop}>
                      <Text style={subStyles.commandActionTitle} numberOfLines={1}>{cluster.title}</Text>
                      <View style={subStyles.miniChip}>
                        <Text style={subStyles.miniChipText}>{cluster.count} mes{cluster.count === 1 ? "" : "es"}</Text>
                      </View>
                    </View>
                    <Text style={subStyles.commandActionBody}>{cluster.description}</Text>
                    <Text style={subStyles.commandActionBody}>
                      {cluster.monthLabels.join(", ")} · neto promedio {formatCurrency(cluster.averageNet, activeCurrency)}
                    </Text>
                  </View>
                  <ArrowRight size={15} color={COLORS.storm} />
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </>
      ) : null}
      {historyFactorAnalysis ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <Card>
            <SectionTitle>Qué partidas explican el año</SectionTitle>
            <Text style={subStyles.executiveIntro}>
              {historyFactorAnalysis.body}
            </Text>
            <Text style={subStyles.scopeHint}>
              Alcance: gastos del año seleccionado. Es como revisar qué productos hacen que una tienda tenga meses tranquilos o meses pesados.
            </Text>
            <View style={subStyles.commandMetricGrid}>
              <View style={[subStyles.commandMetricCard, subStyles.focusMetricCardWide]}>
                <Text style={subStyles.commandMetricLabel}>Factor principal</Text>
                <Text style={subStyles.commandMetricValue}>{historyFactorAnalysis.title}</Text>
                <Text style={subStyles.commandMetricHint}>
                  Explica {historyFactorAnalysis.explainedVariancePct}% de los cambios entre meses.
                </Text>
              </View>
            </View>
            <View style={subStyles.commandActions}>
              {historyFactorAnalysis.topCategories.map((category) => (
                <TouchableOpacity
                  key={`${category.categoryId ?? "none"}-${category.name}`}
                  style={subStyles.commandActionRow}
                  onPress={() => openHistoryRangePreview(
                    `${selectedHistoryYear}-01-01`,
                    `${selectedHistoryYear}-12-31`,
                    { kind: "expense", categoryId: category.categoryId, title: `${category.name} en ${selectedHistoryYear}` },
                  )}
                  activeOpacity={0.82}
                >
                  <View style={subStyles.commandActionCopy}>
                    <View style={subStyles.suggestionRowTop}>
                      <Text style={subStyles.commandActionTitle} numberOfLines={1}>{category.name}</Text>
                      <View style={subStyles.miniChip}>
                        <Text style={subStyles.miniChipText}>{category.weight}%</Text>
                      </View>
                    </View>
                    <Text style={subStyles.commandActionBody}>
                      Total anual {formatCurrency(category.amount, activeCurrency)} · {category.direction === "sube_con_el_cambio" ? "sube cuando el factor pesa más" : "baja cuando el factor pesa más"}
                    </Text>
                  </View>
                  <ArrowRight size={15} color={COLORS.storm} />
                </TouchableOpacity>
              ))}
            </View>
            {historyFactorAnalysis.activeMonths.length > 0 ? (
              <View style={subStyles.commandActions}>
                {historyFactorAnalysis.activeMonths.map((month) => (
                  <TouchableOpacity
                    key={`${month.dateFrom}-${month.dateTo}`}
                    style={subStyles.commandActionRow}
                    onPress={() => openHistoryRangePreview(month.dateFrom, month.dateTo, { title: `Movimientos de ${month.label}` })}
                    activeOpacity={0.82}
                  >
                    <View style={subStyles.commandActionCopy}>
                      <Text style={subStyles.commandActionTitle} numberOfLines={1}>Mes donde más se nota: {month.label}</Text>
                      <Text style={subStyles.commandActionBody}>
                        Toca para ver qué movimientos hicieron que este mes se aleje del promedio.
                      </Text>
                    </View>
                    <ArrowRight size={15} color={COLORS.storm} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
      {!historyReadiness.allReady ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <AlgorithmReadinessCard
            title="Análisis histórico preparado"
            body="Estos cálculos ya están listos. Si todavía no aparecen arriba, no es porque falten funciones: el sistema está esperando más meses y categorías para no inventar conclusiones."
            checks={[
              {
                label: "Cambio de comportamiento",
                current: historyReadiness.observedMonths,
                required: 6,
                detail: "Necesita 6 meses con actividad para comparar 3 meses recientes contra 3 anteriores.",
              },
              {
                label: "Tipos de meses",
                current: historyReadiness.observedMonths,
                required: 3,
                detail: "Necesita al menos 3 meses con movimientos para separar meses normales, caros o ajustados.",
              },
              {
                label: "Partidas que explican el año",
                current: [
                  historyReadiness.observedMonths >= 3,
                  historyReadiness.expenseCategoryCount >= 2,
                  historyReadiness.movementCount >= 8,
                ].filter(Boolean).length,
                required: 3,
                detail: `${historyReadiness.observedMonths}/3 meses, ${historyReadiness.expenseCategoryCount}/2 categorías y ${historyReadiness.movementCount}/8 movimientos del año seleccionado.`,
              },
            ]}
          />
        </>
      ) : null}
      <View style={{ height: SPACING.sm }} />
      <MonthlyPulse
        data={advancedStats.monthlyPulse}
        currency={activeCurrency}
        onOpenMonth={(dateFrom, dateTo) => openHistoryRangePreview(dateFrom, dateTo, { title: "Pulso mensual" })}
      />

      {/* N1-N5: Métricas avanzadas - tasa de ahorro, estabilidad, concentración, cobranza, estacional */}
      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.cardHeaderWithAction}>
          <SectionTitle>Métricas avanzadas</SectionTitle>
          <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.82}>
            <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
          </TouchableOpacity>
        </View>
        <Text style={subStyles.executiveIntro}>
          Indicadores estadísticos sobre tus patrones: ahorro, estabilidad de ingresos, concentración de gasto, eficiencia de cobranza y comparación estacional.
        </Text>

        {/* N1: Tasa de ahorro mensual */}
        <TouchableOpacity style={subStyles.advMetricSection} onPress={() => setAdvancedDetail("savingsRate")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Tasa de ahorro mensual</Text>
            {monthlySavingsRate.lastRate != null ? (
              <Text style={[subStyles.advMetricBadge, { color: monthlySavingsRate.color }]}>
                {monthlySavingsRate.lastRate.toFixed(1)}% este mes
              </Text>
            ) : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {monthlySavingsRate.avgRate != null
              ? `Promedio 6 meses: ${monthlySavingsRate.avgRate.toFixed(1)}% · tendencia ${monthlySavingsRate.trend}`
              : "Registra al menos 2 meses de movimientos para ver tu promedio de ahorro."}
          </Text>
          {monthlySavingsRate.lastRate != null && monthlySavingsRate.avgRate != null ? (
            <Text style={[subStyles.advMetricInterpret, { color: monthlySavingsRate.lastRate >= monthlySavingsRate.avgRate ? COLORS.income : COLORS.gold }]}>
              {monthlySavingsRate.lastRate > monthlySavingsRate.avgRate + 1
                ? `Este mes ahorras ${(monthlySavingsRate.lastRate - monthlySavingsRate.avgRate).toFixed(1)}% más que tu promedio — por encima de lo habitual.`
                : monthlySavingsRate.lastRate < monthlySavingsRate.avgRate - 1
                ? `Este mes ahorras ${(monthlySavingsRate.avgRate - monthlySavingsRate.lastRate).toFixed(1)}% menos que tu promedio — mes de mayor gasto.`
                : "Este mes está en línea con tu promedio histórico."}
            </Text>
          ) : null}
          <View style={subStyles.advMetricBarRow}>
            {monthlySavingsRate.months.map((m, i) => {
              const pct = m.rate;
              const barH = pct == null ? 4 : Math.min(40, Math.max(4, Math.abs(pct) * 0.8));
              const barColor = pct == null ? COLORS.storm : pct >= 20 ? COLORS.income : pct >= 0 ? COLORS.gold : COLORS.expense;
              return (
                <View key={i} style={subStyles.advMetricBarItem}>
                  <View style={[subStyles.advMetricBar, { height: barH, backgroundColor: barColor }]} />
                  <Text style={subStyles.advMetricBarLabel}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </TouchableOpacity>

        {/* N2: Score de estabilidad de ingresos */}
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("incomeStability")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Estabilidad de ingresos</Text>
            {incomeStabilityScore.score != null ? (
              <Text style={[subStyles.advMetricBadge, { color: incomeStabilityScore.color }]}>
                {incomeStabilityScore.score}/100
              </Text>
            ) : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {incomeStabilityScore.score != null
              ? `${incomeStabilityScore.label} · variación del ${incomeStabilityScore.cvPct}% entre meses`
              : "Registra ingresos en al menos 2 meses para calcular la estabilidad."}
          </Text>
          {incomeStabilityScore.score != null ? (
            <View style={subStyles.advScoreBar}>
              <View style={[subStyles.advScoreFill, { width: `${incomeStabilityScore.score}%` as any, backgroundColor: incomeStabilityScore.color }]} />
            </View>
          ) : null}
          {incomeStabilityScore.score != null ? (
            <Text style={[subStyles.advMetricInterpret, { color: incomeStabilityScore.color }]}>
              {incomeStabilityScore.score >= 75
                ? "Ingreso predecible — las proyecciones de cierre son más fiables."
                : incomeStabilityScore.score >= 50
                ? "Cierta variación mes a mes — las proyecciones son aproximadas."
                : "Ingreso muy variable — toma el estimado de fin de mes con cautela."}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* N5: Comparación estacional */}
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("seasonalComparison")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Comparación estacional</Text>
            {seasonalComparison.hasHistory ? (
              <Text style={[subStyles.advMetricBadge, { color: seasonalComparison.expenseColor }]}>
                {seasonalComparison.expenseLabel}
              </Text>
            ) : null}
          </View>
          {seasonalComparison.hasHistory ? (
            <>
              <Text style={subStyles.advMetricBody}>
                Gasto: {formatCurrency(seasonalComparison.curExpense, activeCurrency)} este mes vs {formatCurrency(seasonalComparison.prevExpense, activeCurrency)} mismo mes año pasado.
              </Text>
              {seasonalComparison.incomeDelta != null ? (
                <Text style={subStyles.advMetricBody}>
                  Ingreso: {seasonalComparison.incomeDelta > 0 ? "+" : ""}{seasonalComparison.incomeDelta.toFixed(0)}% vs año pasado.
                </Text>
              ) : null}
              {seasonalComparison.expenseDelta != null ? (
                <Text style={[subStyles.advMetricInterpret, { color: seasonalComparison.expenseColor }]}>
                  {seasonalComparison.expenseDelta <= -5
                    ? `Gastaste ${Math.abs(seasonalComparison.expenseDelta).toFixed(0)}% menos que en este mes el año pasado — buen control.`
                    : seasonalComparison.expenseDelta <= 5
                    ? "Gasto similar al mismo mes del año pasado — patrón estable."
                    : `Gastaste ${seasonalComparison.expenseDelta.toFixed(0)}% más que en este mes el año pasado — revisa qué cambió.`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={subStyles.advMetricBody}>
              Necesitas 12 meses de movimientos registrados para activar esta comparación. Registra ingresos y gastos de meses anteriores para verla.
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
          onPress={() => setActiveTab('Flujo')}
          activeOpacity={0.84}
        >
          <View style={{ flex: 1 }}>
            <Text style={subStyles.advMetricTitle}>¿Cómo va este mes?</Text>
            <Text style={subStyles.advMetricBody}>Compara tu ritmo actual con este historial — ve a Flujo para ver la proyección de cierre.</Text>
          </View>
          <ArrowRight size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </Card>

      </>}

      {activeTab === 'Salud' && <>
      <DashboardLayerHeader
        kicker="Salud"
        title="Calidad financiera y limpieza"
        bullets={[
          "Tareas pendientes que reducen la precisión del dashboard",
          "Sugerencias de IA para categorizar movimientos sin etiquetar",
          "Eficiencia de cobros y calidad general del dato",
        ]}
      />

      <View style={{ height: SPACING.sm }} />
      <ReviewInbox
        movements={movements}
        subscriptions={subscriptions}
        obligations={obligations}
        router={router}
        onOpenMovementIssue={openHealthMovementIssuePreview}
      />

      <View style={{ height: SPACING.sm }} />
      <Card>
        <SectionTitle>Sugerencias de categoría</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          Aquí DarkMoney ya se apoya en tu historial: descripciones repetidas, contraparte y montos parecidos para adelantarte categorías con confianza.
        </Text>
        {categorySuggestions.length === 0 ? (
          <View style={subStyles.richEmptyState}>
            <Brain size={18} color={COLORS.primary} />
            <Text style={subStyles.richEmptyTitle}>Sin sugerencias por ahora</Text>
            <Text style={subStyles.richEmptyBody}>El motor ya está preparado. Se activará cuando haya movimientos sin categoría y ejemplos parecidos ya corregidos o categorizados en tu historial.</Text>
          </View>
        ) : (
          <View style={subStyles.commandActions}>
            {categorySuggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.movementId}
                style={subStyles.commandActionRow}
                onPress={() => openCategorySuggestionPreview(suggestion)}
                activeOpacity={0.82}
              >
                <View style={subStyles.commandActionCopy}>
                  <View style={subStyles.suggestionRowTop}>
                    <Text style={subStyles.commandActionTitle} numberOfLines={1}>{suggestion.description}</Text>
                    <View style={subStyles.miniChip}>
                      <Text style={subStyles.miniChipText}>{Math.round(suggestion.confidence * 100)}%</Text>
                    </View>
                  </View>
                  <Text style={subStyles.commandActionBody}>
                    {suggestion.suggestedCategoryName} · {formatCurrency(suggestion.amount, activeCurrency)} · {format(new Date(suggestion.occurredAt), "d MMM", { locale: es })}
                  </Text>
                  <Text style={subStyles.commandActionBody}>
                    {suggestion.reasons.join(" · ")}
                  </Text>
                </View>
                <ArrowRight size={15} color={COLORS.storm} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>

      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.cardHeaderWithAction}>
          <SectionTitle>Eficiencia de cobranza</SectionTitle>
        </View>
        <TouchableOpacity style={subStyles.advMetricSection} onPress={() => setAdvancedDetail("collectionEfficiency")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Cobros resueltos (últimos 30 días)</Text>
            {collectionEfficiency.rate != null ? (
              <Text style={[subStyles.advMetricBadge, { color: collectionEfficiency.color }]}>
                {collectionEfficiency.rate}% · {collectionEfficiency.label}
              </Text>
            ) : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {collectionEfficiency.rate != null
              ? `${collectionEfficiency.resolved} de ${collectionEfficiency.total} cobros resueltos`
              : "Sin cobros registrados en los últimos 30 días. Agrega obligaciones de tipo receivable para activar esta métrica."}
          </Text>
          {collectionEfficiency.rate != null ? (
            <View style={subStyles.advScoreBar}>
              <View style={[subStyles.advScoreFill, { width: `${collectionEfficiency.rate}%` as any, backgroundColor: collectionEfficiency.color }]} />
            </View>
          ) : null}
          {collectionEfficiency.rate != null ? (
            <Text style={[subStyles.advMetricInterpret, { color: collectionEfficiency.color }]}>
              {collectionEfficiency.rate >= 80
                ? "Excelente — cobras la mayoría de lo que se te debe a tiempo."
                : collectionEfficiency.rate >= 50
                ? "Cobros parciales — algunos receivables siguen sin resolverse."
                : "Baja eficiencia — hay dinero pendiente que no está volviendo."}
            </Text>
          ) : null}
        </TouchableOpacity>
      </Card>

      <View style={{ height: SPACING.sm }} />
      <CurrencyExposure accounts={snapshot?.accounts ?? []} />

      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.qualityHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={subStyles.qualityKicker}>Calidad</Text>
            <Text style={subStyles.qualityTitle}>Datos, aprendizaje y actividad</Text>
            <Text style={subStyles.qualityBody}>Aquí quedan las capas más técnicas: calidad del dato, exposición, aprendizaje del sistema y actividad reciente.</Text>
          </View>
          <View style={subStyles.qualityActions}>
            <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={() => setAdvancedDetail("quality")} activeOpacity={0.82}>
              <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
            </TouchableOpacity>
            <TouchableOpacity style={subStyles.qualityToggleBtn} onPress={() => setQualityOpen((value) => !value)} activeOpacity={0.85}>
              <Text style={subStyles.qualityToggleBtnText}>{qualityOpen ? "Ocultar" : "Abrir"}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={subStyles.annualSummaryGrid}>
          <View style={subStyles.annualSummaryCard}>
            <Text style={subStyles.savingsStatLabel}>Confianza sistema</Text>
            <Text style={[subStyles.annualSummaryValue, { color: learning.readinessScore >= 75 ? COLORS.income : learning.readinessScore >= 50 ? COLORS.gold : COLORS.expense }]}>
              {learning.readinessScore}%
            </Text>
            <Text style={subStyles.annualDetailMini}>{learning.readinessScore >= 75 ? "Fiable" : learning.readinessScore >= 50 ? "Suficiente" : "Baja"}</Text>
          </View>
          <View style={subStyles.annualSummaryCard}>
            <Text style={subStyles.savingsStatLabel}>Confianza proyección</Text>
            <Text style={[subStyles.annualSummaryValue, { color: projectionModel.confidence >= 70 ? COLORS.income : projectionModel.confidence >= 40 ? COLORS.gold : COLORS.expense }]}>
              {projectionModel.confidence}%
            </Text>
            <Text style={subStyles.annualDetailMini}>{projectionModel.confidenceLabel}</Text>
          </View>
          <View style={subStyles.annualSummaryCard}>
            <Text style={subStyles.savingsStatLabel}>Issues pendientes</Text>
            <Text style={[subStyles.annualSummaryValue, { color: review.totalIssues === 0 ? COLORS.income : review.totalIssues <= 3 ? COLORS.gold : COLORS.expense }]}>
              {review.totalIssues}
            </Text>
            <Text style={subStyles.annualDetailMini}>{review.totalIssues === 0 ? "Todo limpio" : "Por resolver"}</Text>
          </View>
          <View style={subStyles.annualSummaryCard}>
            <Text style={subStyles.savingsStatLabel}>Datos útiles</Text>
            <Text style={[subStyles.annualSummaryValue, { color: learning.historyDays >= 90 ? COLORS.income : learning.historyDays >= 30 ? COLORS.gold : COLORS.expense }]}>
              {learning.historyDays}d
            </Text>
            <Text style={subStyles.annualDetailMini}>{learning.historyDays >= 90 ? "Sólido" : learning.historyDays >= 30 ? "Suficiente" : "Poco historial"}</Text>
          </View>
        </View>
      </Card>

      {qualityOpen ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <DataQuality
            movements={movements}
            onOpenNoCategory={openSummaryUncategorizedPreview}
            onOpenNoCounterparty={openNoCounterpartyPreview}
          />
          {qualitySnapshot.noCategoryCount > 0 || qualitySnapshot.noCounterpartyCount > 0 ? (
            <View style={{ height: SPACING.sm }} />
          ) : null}
          <LearningPanel
            movements={movements}
            projectionModel={projectionModel}
            activeCurrency={activeCurrency}
            weeklyPatternInsight={weeklyPatternInsight}
            categoryConcentration={categoryConcentration}
            categorySuggestionsCount={categorySuggestions.length}
            anomalySignalsCount={anomalySignals.length}
            acceptedFeedbackCount={acceptedFeedbackCount}
            cashCushionDays={cashCushion.days}
            cashCushionLabel={cashCushion.label}
          />
          <Card>
            <SectionTitle>Proyección</SectionTitle>
            <View style={subStyles.projectionStack}>
              <View style={subStyles.projectionCard}>
                <View style={subStyles.projectionTop}>
                  <Text style={subStyles.projectionLabel}>Alertas y coach</Text>
                  <View style={subStyles.executiveTonePill}>
                    <Text style={subStyles.executiveToneText}>Activos</Text>
                  </View>
                </View>
                <Text style={subStyles.projectionTitle}>{learning.readinessScore}% de confianza actual</Text>
                <Text style={subStyles.projectionBody}>
                  Con esta base ya es más fácil separar ruido de señal: el sistema puede priorizar mejor liquidez, cartera y control.
                </Text>
              </View>
              <View style={subStyles.projectionCard}>
                <View style={subStyles.projectionTop}>
                  <Text style={subStyles.projectionLabel}>Proyección con bandas</Text>
                  <View style={subStyles.executiveTonePill}>
                    <Text style={subStyles.executiveToneText}>{projectionModel.confidenceLabel}</Text>
                  </View>
                </View>
                <Text style={subStyles.projectionTitle}>{projectionModel.confidence}% de confianza actual</Text>
                <ProjectionFormulaBreakdown
                  activeCurrency={activeCurrency}
                  currentVisibleBalance={currentVisibleBalance}
                  visibleBalanceLabel={visibleBalanceLabel}
                  visibleAccountSummary={visibleAccountSummary}
                  committedNet={projectionCommittedNet}
                  variableNet={projectionVariableNet}
                  expectedBalance={projectionModel.expectedBalance}
                />
              <View style={subStyles.projectionScenarioStrip}>
                <Text style={subStyles.projectionScenarioText}>Conservador: {formatCurrency(projectionModel.conservativeBalance, activeCurrency)}</Text>
                <Text style={subStyles.projectionScenarioText}>Alto: {formatCurrency(projectionModel.optimisticBalance, activeCurrency)}</Text>
              </View>
              <View style={subStyles.projectionScenarioStrip}>
                <Text style={subStyles.projectionScenarioText}>Simulado bajo: {formatCurrency(projectionModel.monteCarloLowBalance, activeCurrency)}</Text>
                <Text style={subStyles.projectionScenarioText}>Riesgo: {projectionModel.pressureProbability}% bajo {formatCurrency(projectionModel.pressureThreshold, activeCurrency)}</Text>
              </View>
            </View>
              <View style={subStyles.projectionCard}>
                <View style={subStyles.projectionTop}>
                  <Text style={subStyles.projectionLabel}>Que conviene limpiar o reforzar</Text>
                </View>
                <Text style={subStyles.projectionBody}>
                  Si mejoras estos puntos, el dashboard deja de adivinar y pasa a explicarte mejor por qué hoy estás estable, con margen o bajo presión.
                </Text>
                {review.uncategorizedCount > 0 ? (
                  <TouchableOpacity style={subStyles.actionPillRow} onPress={openSummaryUncategorizedPreview} activeOpacity={0.85}>
                    <AlertTriangle size={15} color={COLORS.gold} />
                    <Text style={subStyles.actionPillBody}>{review.uncategorizedCount} movimientos sin categoría siguen quitando precisión a las comparaciones.</Text>
                    <View style={subStyles.actionPill}><Text style={subStyles.actionPillText}>Ordenar</Text></View>
                  </TouchableOpacity>
                ) : null}
                {learning.historyDays < 30 ? (
                  <View style={subStyles.actionPillRow}>
                    <AlertTriangle size={15} color={COLORS.gold} />
                    <Text style={subStyles.actionPillBody}>Todavía falta un poco más de historia para separar hábitos reales de semanas aisladas.</Text>
                    <View style={subStyles.actionPill}><Text style={subStyles.actionPillText}>Registrar</Text></View>
                  </View>
                ) : null}
              </View>
              {weeklyPatternInsight ? (
                <View style={subStyles.projectionCard}>
                  <View style={subStyles.projectionTop}>
                    <Text style={subStyles.projectionLabel}>Patron semanal</Text>
                    <View style={subStyles.executiveTonePill}>
                      <Text style={subStyles.executiveToneText}>Visible</Text>
                    </View>
                  </View>
                  <Text style={subStyles.projectionTitle}>Ritmo de gasto</Text>
                  <Text style={subStyles.projectionBody}>
                    {weeklyPatternInsight.dayLabel} pesa {weeklyPatternInsight.share}% del gasto observado. Ya se nota una concentración de salida de dinero ese día.
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
          <ActivityTimeline snapshot={snapshot} />
        </>
      ) : null}
      </>}
    </>
  );
}

const PRO_GATE_FEATURES = [
  { icon: TrendingUp, label: "Flujo y salud financiera en profundidad" },
  { icon: Target,     label: "Radar de calidad y métricas avanzadas" },
  { icon: Brain,      label: "Aprendizaje inteligente de patrones" },
  { icon: Sparkles,   label: "Widgets personalizables y presets" },
];

function ProGate() {
  return (
    <View style={subStyles.proGate}>
      <View style={subStyles.proGateHeader}>
        <View style={subStyles.proGateIconWrapLg}>
          <Lock size={22} color={COLORS.gold} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <Text style={subStyles.proGateTitleLg}>Dashboard Avanzado</Text>
            <View style={subStyles.proGateBadge}>
              <Text style={subStyles.proGateBadgeText}>PRO</Text>
            </View>
          </View>
          <Text style={subStyles.proGateBody}>Análisis en profundidad disponible solo en el plan PRO</Text>
        </View>
      </View>
      <View style={subStyles.proGateFeatures}>
        {PRO_GATE_FEATURES.map(({ icon: Icon, label }) => (
          <View key={label} style={subStyles.proGateFeatureRow}>
            <Icon size={13} color={COLORS.gold} strokeWidth={2} />
            <Text style={subStyles.proGateFeatureText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- Main screen --------------------------------------------------------------

function ProGateLoading() {
  return (
    <View style={[subStyles.proGate, { flexDirection: "row", alignItems: "center" }]}>
      <View style={subStyles.proGateIconWrap}>
        <Lock size={16} color={COLORS.storm} strokeWidth={1.8} />
      </View>
      <View style={subStyles.proGateText}>
        <Text style={subStyles.proGateTitle}>Dashboard Avanzado</Text>
        <Text style={subStyles.proGateBody}>Verificando acceso...</Text>
      </View>
      <View style={[subStyles.proGateBadge, subStyles.proGateBadgeMuted]}>
        <Text style={[subStyles.proGateBadgeText, { color: COLORS.storm }]}>PRO</Text>
      </View>
    </View>
  );
}

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session, signOut } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setWorkspaces } = useWorkspace();

  const [signOutVisible, setSignOutVisible] = useState(false);

  function handleSignOut() {
    setSignOutVisible(true);
  }
  const { dashboardMode, setDashboardMode, dashboardScrollY, setDashboardScrollY } = useUiStore();
  const scrollRef = useRef<import("react-native").ScrollView>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedSectionY = useRef(0);

  // Restaurar posición de scroll cuando el dashboard recupera el foco
  useFocusEffect(
    useCallback(() => {
      if (dashboardScrollY > 0) {
        // Pequeño delay para que el layout esté listo
        const t = setTimeout(() => {
          scrollRef.current?.scrollTo({ y: dashboardScrollY, animated: false });
        }, 80);
        return () => clearTimeout(t);
      }
    }, [dashboardScrollY]),
  );

  const [period, setPeriod] = useState<Period>("month");
  const [formVisible, setFormVisible] = useState(false);
  const [daySheet, setDaySheet] = useState<{
    dayStart: Date;
    dayEnd: Date;
    mode: DaySheetMode;
  } | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const currencyLoadedRef = useRef(false);

  const entitlementQuery = useUserEntitlementQuery(session?.user?.id ?? profile?.id ?? null, profile?.email);
  const isPro = entitlementQuery.data?.proAccessEnabled ?? false;
  const hasAdvancedDashboardGift = profile?.email?.trim().toLowerCase() === ADVANCED_DASHBOARD_GIFT_EMAIL;
  const hasAdvancedDashboardAccess = isPro || hasAdvancedDashboardGift;

  const { data: snapshot, isLoading: snapLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: movements = [] } = useDashboardMovementsQuery(activeWorkspaceId, profile?.id);
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
  const { data: sharedObligations = [] } = useSharedObligationsQuery(session?.user?.id ?? null);

  const obligationsMerged = useMemo(
    () => mergeWorkspaceAndSharedObligations(snapshot?.obligations ?? [], sharedObligations),
    [snapshot?.obligations, sharedObligations],
  );

  useEffect(() => {
    if (snapshot?.workspaces?.length) setWorkspaces(snapshot.workspaces);
  }, [snapshot?.workspaces, setWorkspaces]);

  const snapshotActiveWorkspace = useMemo(
    () => snapshot?.workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [snapshot?.workspaces, activeWorkspaceId],
  );

  const resolvedActiveWorkspace = activeWorkspace ?? snapshotActiveWorkspace;
  const baseCurrency = resolvedActiveWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";
  const workspaceDisplayName = resolvedActiveWorkspace?.name ?? "Tu workspace";

  // Build exchange rate map from snapshot
  const exchangeRateMap = useMemo(
    () => buildExchangeRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );

  // Map accountId -> currencyCode for movement conversion
  const accountCurrencyMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of snapshot?.accounts ?? []) map.set(a.id, a.currencyCode);
    return map;
  }, [snapshot?.accounts]);

  // Currency options: all currencies present in workspace that have exchange rates
  const currencyOptions = useMemo(() => {
    const all = new Set<string>();
    all.add(baseCurrency);
    for (const a of snapshot?.accounts ?? []) all.add(a.currencyCode.toUpperCase());
    for (const o of obligationsMerged) all.add(o.currencyCode.toUpperCase());
    for (const s of snapshot?.subscriptions ?? []) all.add(s.currencyCode.toUpperCase());
    return Array.from(all).filter((c) =>
      c === baseCurrency.toUpperCase() ||
      resolveRate(exchangeRateMap, baseCurrency.toUpperCase(), c) !== 1 ||
      c === baseCurrency.toUpperCase(),
    );
  }, [baseCurrency, exchangeRateMap, snapshot, obligationsMerged]);

  // Load persisted currency once
  useEffect(() => {
    if (currencyLoadedRef.current) return;
    currencyLoadedRef.current = true;
    void AsyncStorage.getItem(DASHBOARD_CURRENCY_KEY).then((stored) => {
      if (stored && currencyOptions.includes(stored)) setDisplayCurrency(stored);
      else setDisplayCurrency(baseCurrency);
    });
  }, [baseCurrency, currencyOptions]);

  // Persist currency selection
  const handleCurrencyChange = useCallback((c: string) => {
    setDisplayCurrency(c);
    void AsyncStorage.setItem(DASHBOARD_CURRENCY_KEY, c);
  }, []);

  const activeCurrency = displayCurrency ?? baseCurrency;

  // Conversion context passed to all amount functions
  const conversionCtx = useMemo<ConversionCtx>(
    () => ({ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }),
    [accountCurrencyMap, exchangeRateMap, activeCurrency],
  );

  // Net worth: sum balances converted to display currency
  const netWorth = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.accounts
      .filter((a) => a.includeInNetWorth && !a.isArchived)
      .reduce((sum, a) => {
        const amt = a.currentBalanceInBaseCurrency ?? a.currentBalance;
        return sum + convertAmt(amt, baseCurrency, activeCurrency, exchangeRateMap);
      }, 0);
  }, [snapshot, baseCurrency, activeCurrency, exchangeRateMap]);

  const stats = useDashboardStats(movements, period, conversionCtx);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["shared-obligations"] }),
    ]).finally(() => setIsRefreshing(false));
  }, [queryClient]);

  const swipeGesture = useSwipeTab();

  const activeAccounts = useMemo(
    () => (snapshot?.accounts ?? []).filter((a) => !a.isArchived),
    [snapshot],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of snapshot?.categories ?? []) m.set(c.id, c.name);
    return m;
  }, [snapshot?.categories]);

  const accountMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of snapshot?.accounts ?? []) m.set(a.id, a.name);
    return m;
  }, [snapshot?.accounts]);

  const isAdvanced = dashboardMode === "advanced";
  const isCheckingAdvancedAccess = isAdvanced && !hasAdvancedDashboardGift && entitlementQuery.isLoading && !entitlementQuery.data;
  const shouldShowAdvancedProGate = isAdvanced && !isCheckingAdvancedAccess && !hasAdvancedDashboardAccess;

  if (snapLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={`Hola, ${profile?.fullName?.split(" ")[0] ?? "usuario"}`}
          subtitle={`${workspaceDisplayName} · ${format(new Date(), "d MMM yyyy", { locale: es })}`}
          showPlanBadge
        />
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={`Hola, ${profile?.fullName?.split(" ")[0] ?? "usuario"}`}
        subtitle={`${workspaceDisplayName} · ${format(new Date(), "d MMM yyyy", { locale: es })}`}
        rightAction={<DashboardHeaderRight onSignOut={handleSignOut} />}
        showPlanBadge
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
          scrollSaveTimer.current = setTimeout(() => setDashboardScrollY(y), 200);
        }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.pine} />
        }
      >
        {/* 1. Mode toggle */}
        <ModeToggle mode={dashboardMode} setMode={setDashboardMode} isPro={hasAdvancedDashboardAccess} />
        {isCheckingAdvancedAccess ? <ProGateLoading /> : shouldShowAdvancedProGate ? (
          <>
            <ProGate />
          </>
        ) : (
          <>

        {!isAdvanced ? (
          <>
        {/* 2. Hero balance (period + currency selector inside) */}
        <HeroCard
          netWorth={netWorth}
          income={stats.income}
          expense={stats.expense}
          currency={activeCurrency}
          period={period}
          setPeriod={setPeriod}
          currencyOptions={currencyOptions}
          onCurrencyChange={handleCurrencyChange}
        />
        <MacroContextCard />

        {/* 3. Flow KPI row */}
        <FlowRow
          income={stats.income}
          expense={stats.expense}
          net={stats.net}
          currency={activeCurrency}
          prevIncome={stats.prevIncome}
          prevExpense={stats.prevExpense}
        />

        {/* 4. Mini chart + detalle por día */}
        <MiniBarChart
          data={stats.chartDays}
          onSelectDay={(d) => setDaySheet({ dayStart: d.dayStart, dayEnd: d.dayEnd, mode: "all" })}
        />
        <ChronologyStrip
          title="Cronología de gastos"
          hint="Últimos 7 días · toca un día para ver cada gasto de esa fecha"
          mode="expense"
          data={stats.chartDays}
          barColor={COLORS.expense}
          currency={activeCurrency}
          getValue={(d) => d.expense}
          onSelectDay={(d, mode) => setDaySheet({ dayStart: d.dayStart, dayEnd: d.dayEnd, mode })}
        />
        <ChronologyStrip
          title="Cronología de ingresos"
          hint="Últimos 7 días · toca un día para ver cada ingreso"
          mode="income"
          data={stats.chartDays}
          barColor={COLORS.income}
          currency={activeCurrency}
          getValue={(d) => d.income}
          onSelectDay={(d, mode) => setDaySheet({ dayStart: d.dayStart, dayEnd: d.dayEnd, mode })}
        />
        <ChronologyStrip
          title="Cronología de transferencias"
          hint="Últimos 7 días · toca un día para ver transferencias entre cuentas"
          mode="transfer"
          data={stats.chartDays}
          barColor={COLORS.secondary}
          currency={activeCurrency}
          getValue={(d) => d.transferTotal}
          onSelectDay={(d, mode) => setDaySheet({ dayStart: d.dayStart, dayEnd: d.dayEnd, mode })}
        />

        {/* 5. Accounts */}
        <AccountsScroll
          accounts={activeAccounts}
          onPress={(id) => router.push(`/account/${id}?from=dashboard`)}
        />

        {/* 5b. Accounts distribution ring chart */}
        <AccountsBreakdown
          accounts={snapshot?.accounts ?? []}
          displayCurrency={activeCurrency}
          baseCurrency={baseCurrency}
          exchangeRateMap={exchangeRateMap}
        />

        {/* 6. Receivable + Payable leaders */}
        <LeadersRow obligations={obligationsMerged} router={router} />

        {/* 7. Upcoming */}
        <UpcomingSection
          obligations={obligationsMerged}
          subscriptions={snapshot?.subscriptions ?? []}
          recurringIncome={snapshot?.recurringIncome ?? []}
          router={router}
        />

        {/* 8. Budget alerts */}
        <BudgetsSection budgets={snapshot?.budgets ?? []} router={router} />

        {/* 9. Category comparison (simple) */}
        <CategoryComparison
          catTotals={stats.catTotals}
          prevCatTotals={stats.prevCatTotals}
          categories={snapshot?.categories ?? []}
          currency={activeCurrency}
        />

        {/* 10. Savings trend sparkline */}
        <SavingsTrendCard monthlyPulse={stats.monthlyPulse} currency={activeCurrency} />
          </>
        ) : null}

        {/* -- Advanced section -- */}
        {isAdvanced && hasAdvancedDashboardAccess && (
          <View onLayout={(e) => { advancedSectionY.current = e.nativeEvent.layout.y; }}>
          <AdvancedDashboard
            movements={movements}
            obligations={obligationsMerged}
            subscriptions={snapshot?.subscriptions ?? []}
            recurringIncome={snapshot?.recurringIncome ?? []}
            snapshot={snapshot}
            activeAccounts={activeAccounts}
            activeCurrency={activeCurrency}
            baseCurrency={baseCurrency}
            exchangeRateMap={exchangeRateMap}
            currentVisibleBalance={netWorth}
            workspaceId={activeWorkspaceId}
            userId={profile?.id ?? null}
            showAdvancedGift={hasAdvancedDashboardGift}
            analytics={dashboardAnalytics}
            router={router}
            accountCurrencyMap={accountCurrencyMap}
            onRequestPrecisionFocus={() => {
              scrollRef.current?.scrollTo({ y: advancedSectionY.current, animated: true });
            }}
            onScrollToTop={() => {
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          />
          </View>
        )}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          InteractionManager.runAfterInteractions(() => {
            void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
          });
        }}
      />

      {daySheet ? (
        <DayMovementsSheet
          visible
          onClose={() => setDaySheet(null)}
          dayStart={daySheet.dayStart}
          dayEnd={daySheet.dayEnd}
          mode={daySheet.mode}
          movements={movements}
          ctx={conversionCtx}
          categoryMap={categoryMap}
          accountMap={accountMap}
          workspaceId={activeWorkspaceId}
          onMovementPress={(id) => {
            setDaySheet(null);
            router.push(`/movement/${id}?from=dashboard`);
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={signOutVisible}
        title="Cerrar sesión"
        body="¿Estás seguro que deseas salir de tu cuenta?"
        confirmLabel="Salir"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setSignOutVisible(false)}
        onConfirm={() => { setSignOutVisible(false); void signOut(); }}
      />
    </View>
    </GestureDetector>
  );
}

// --- Styles -------------------------------------------------------------------

const subStyles = StyleSheet.create({
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  macroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  macroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  macroEyebrow: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  macroTitle: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  macroBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.secondary + "18",
    borderWidth: 1,
    borderColor: COLORS.secondary + "3D",
  },
  macroBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.secondary,
  },
  macroGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  macroMetric: {
    flex: 1,
    gap: 2,
  },
  macroMetricLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  macroMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  macroDivider: {
    width: 1,
    height: 40,
    backgroundColor: GLASS.separator,
    marginHorizontal: SPACING.md,
  },
  macroHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },

  // Mode toggle
  toggleRow: {
    flexDirection: "row",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 3,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 7,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: GLASS.cardActive,
    borderWidth: 0.5,
    borderColor: "rgba(107,228,197,0.15)",
  },
  toggleText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  toggleTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  proBadge: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs - 1, color: COLORS.gold },

  // Hero card - most prominent, gets the full premium glass treatment
  heroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.xs,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(107,228,197,0.22)",
    borderLeftColor: "rgba(255,255,255,0.14)",
    borderRightColor: "rgba(255,255,255,0.10)",
    borderBottomColor: "rgba(255,255,255,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.52,
    shadowRadius: 24,
    elevation: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  heroPeriodRow: {
    flexDirection: "row",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RADIUS.full,
    padding: 3,
    alignSelf: "flex-start",
  },
  heroPeriodBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "transparent",
  },
  heroPeriodBtnActive: {
    backgroundColor: COLORS.pine,
  },
  heroPeriodText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  heroPeriodTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.textInverse },
  heroCurrencyRow: {
    flexDirection: "row",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RADIUS.full,
    padding: 3,
  },
  heroCurrencyBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "transparent",
  },
  heroCurrencyBtnActive: {
    backgroundColor: COLORS.ember,
  },
  heroCurrencyText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  heroCurrencyTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.textInverse },
  heroLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    letterSpacing: 0.3,
  },
  heroValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 38,
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroNetPill: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
  },
  heroNetText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  heroFlow: {
    flexDirection: "row",
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 0.5,
    borderTopColor: GLASS.separator,
  },
  heroFlowItem: { flex: 1, gap: 4 },
  heroFlowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroFlowDot: { width: 8, height: 8, borderRadius: 4 },
  heroFlowLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  heroFlowAmt: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  heroSep: { width: 0.5, height: 44, backgroundColor: GLASS.separator, marginHorizontal: SPACING.lg },

  // KPI row
  kpiRow: { flexDirection: "row", gap: SPACING.sm },
  kpiCard: {
    flex: 1,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    gap: 3,
    overflow: "hidden",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  kpiAccent: {
    ...StyleSheet.absoluteFillObject,
  },
  kpiLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: 10, color: COLORS.storm, letterSpacing: 0.2 },
  kpiValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm },
  kpiChange: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: 9 },
  kpiChangePlaceholder: { fontFamily: FONT_FAMILY.body, fontSize: 9 },

  // Chart
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  chartCol: { flex: 1, alignItems: "center", gap: 4 },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 1, width: "100%" },
  chartBar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 0 },
  chartLabel: { fontFamily: FONT_FAMILY.body, fontSize: 9, color: COLORS.storm, textAlign: "center" },
  chronoHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  chronoTotal: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
  },
  chronoHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
    marginBottom: SPACING.xs,
  },
  chartLegend: { flexDirection: "row", gap: SPACING.lg, marginTop: SPACING.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Accounts
  accountsRow: { flexDirection: "row", gap: SPACING.sm, paddingVertical: SPACING.xs },
  accountChip: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    alignItems: "center",
    gap: SPACING.xs,
    minWidth: 100,
    maxWidth: 130,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 7,
  },
  accountChipIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  accountChipName: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, textAlign: "center" },
  accountChipBalance: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink, textAlign: "center" },

  // Upcoming
  upcomingKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  upcomingIntro: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  upcomingSummaryRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  upcomingSummaryCard: {
    flex: 1,
    minHeight: 70,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 6,
    justifyContent: "space-between",
  },
  upcomingSummaryLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
  },
  upcomingSummaryValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 22,
  },
  upcomingList: {
    gap: SPACING.md,
  },
  upcomingRow: {
    gap: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  upcomingRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.lg,
  },
  upcomingLeft: { flex: 1, minWidth: 0, gap: SPACING.sm },
  upcomingBadge: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  upcomingBadgeIncome: {
    backgroundColor: "rgba(41, 204, 126, 0.11)",
    borderColor: "rgba(41, 204, 126, 0.28)",
  },
  upcomingBadgeSubscription: {
    backgroundColor: "rgba(111, 120, 255, 0.11)",
    borderColor: "rgba(111, 120, 255, 0.24)",
  },
  upcomingBadgeObligation: {
    backgroundColor: "rgba(255, 95, 95, 0.10)",
    borderColor: "rgba(255, 95, 95, 0.25)",
  },
  upcomingBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 11,
  },
  upcomingBadgeTextIncome: { color: COLORS.income },
  upcomingBadgeTextSubscription: { color: COLORS.secondary },
  upcomingBadgeTextObligation: { color: COLORS.expense },
  upcomingLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 20,
  },
  upcomingMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  upcomingDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  upcomingAmountPill: {
    flexShrink: 0,
    maxWidth: 136,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderWidth: 1,
  },
  upcomingAmountPillIncome: {
    backgroundColor: "rgba(41, 204, 126, 0.10)",
    borderColor: "rgba(41, 204, 126, 0.24)",
  },
  upcomingAmountPillOut: {
    backgroundColor: "rgba(255, 95, 95, 0.09)",
    borderColor: "rgba(255, 95, 95, 0.22)",
  },
  upcomingAmount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    textAlign: "right",
  },
  upcomingAmountIncome: { color: COLORS.income },
  upcomingAmountOut: { color: COLORS.rosewood },

  // Budgets
  budgetRow: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  budgetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  budgetName: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  budgetPct: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm },
  budgetMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Leaders (receivable/payable top 3)
  leadersRowContainer: { flexDirection: "row", gap: SPACING.sm },
  leadersCard: {
    flex: 1,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.xs,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  leadersTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  leadersRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.xs },
  leadersSep: { borderBottomWidth: 0.5, borderBottomColor: GLASS.separator },
  leadersName: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink, paddingRight: 4 },
  leadersAmt: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },

  // Obligations advanced
  obGroupTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, letterSpacing: 0.2, marginBottom: SPACING.xs },
  obRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.separator,
    gap: SPACING.sm,
  },
  obLeft: { flex: 1, gap: 2 },
  obTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  obCounterparty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  obAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md },

  // Category breakdown
  catRow: { gap: SPACING.xs, marginBottom: SPACING.sm },
  catLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  catName: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink, flex: 1 },
  catAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.rosewood },
  catTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: RADIUS.full, overflow: "hidden" },
  catFill: { height: 6, backgroundColor: COLORS.rosewood + "88", borderRadius: RADIUS.full },

  // Category comparison
  catCompLegend: { flexDirection: "row", gap: SPACING.lg, marginBottom: SPACING.sm },
  catCompRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
  catCompName: { width: 80, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink },
  catCompBars: { flex: 1, gap: 3 },
  catCompBarTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: RADIUS.full, overflow: "hidden" },
  catCompBarFill: { height: 6, borderRadius: RADIUS.full },
  catCompAmt: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: 10, color: COLORS.rosewood, width: 60, textAlign: "right" },

  // Subscriptions summary
  subHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  subTotal: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.rosewood },
  subRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.separator,
  },
  subName: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  subAmt: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },

  // Health score
  healthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  healthScore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  healthScoreNum: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, lineHeight: FONT_SIZE.lg + 2 },
  healthScoreOf: { fontFamily: FONT_FAMILY.body, fontSize: 9, color: COLORS.storm, lineHeight: 11 },
  healthRow: { gap: 4, marginBottom: SPACING.sm },
  healthLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  healthLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink },
  healthDesc: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  healthTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: RADIUS.full, overflow: "hidden" },
  healthFill: { height: 5, borderRadius: RADIUS.full },

  // Alert center
  alertEmpty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  alertRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xs },
  alertText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, flex: 1 },

  // Weekly pattern
  weeklyPatternSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  weeklyPatternPill: {
    flexGrow: 1,
    minWidth: 92,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 3,
  },
  weeklyPatternPillLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  weeklyPatternPillValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  weeklyDayButton: {
    paddingHorizontal: 2,
    paddingTop: 2,
    borderRadius: RADIUS.sm,
  },
  weeklyDayButtonDisabled: {
    opacity: 0.45,
  },
  weeklyDayAmount: {
    maxWidth: "100%",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: COLORS.ink,
    textAlign: "center",
  },
  weeklyBar: {
    flex: 1,
    backgroundColor: COLORS.rosewood + "99",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  weeklyDayCount: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: COLORS.storm,
    textAlign: "center",
  },

  // Transfer snapshot
  transferRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm },
  transferRoute: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  transferAcct: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink, flexShrink: 1 },
  transferRight: { alignItems: "flex-end", gap: 2, marginLeft: SPACING.sm },
  transferAmt: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  transferCount: { fontFamily: FONT_FAMILY.body, fontSize: 9, color: COLORS.textMuted },

  // Data quality
  dqRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xs },
  dqText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },

  // Currency exposure
  currencyRow: { gap: SPACING.xs, marginBottom: SPACING.sm },
  currencyLabel: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  currencyDot: { width: 8, height: 8, borderRadius: 4 },
  currencyCode: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.ink },
  currencyPct: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginLeft: "auto" },
  currencyTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: RADIUS.full, overflow: "hidden" },
  currencyFill: { height: 6, borderRadius: RADIUS.full },

  // Period radar
  radarGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  radarItem: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    gap: 3,
  },
  radarLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  radarValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },

  // Activity timeline
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, paddingVertical: SPACING.sm },
  timelineContent: { flex: 1, gap: 2 },
  timelineDesc: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  timelineDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Review inbox + command center + learning
  richEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.lg,
  },
  richEmptyTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  richEmptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
  reviewList: {
    gap: SPACING.sm,
  },
  reviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  reviewItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewItemCopy: {
    flex: 1,
    gap: 2,
  },
  reviewItemTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  reviewItemBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  reviewItemRight: {
    alignItems: "center",
    gap: 4,
  },
  reviewItemCount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  futureWindowList: {
    gap: SPACING.sm,
  },
  futureWindowCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.xs,
  },
  futureWindowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  futureWindowLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  futureWindowNet: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
  },
  futureWindowStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  futureWindowMeta: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  futureWindowBalance: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  futureWindowHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  learningTopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  learningMetricCard: {
    flex: 1,
    minWidth: "45%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: 4,
  },
  learningMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  learningMetricLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  phaseList: {
    gap: SPACING.sm,
  },
  phaseCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: SPACING.xs,
  },
  phaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  phaseTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  phasePct: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  phaseBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  phaseTrack: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  phaseFill: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  learningInsightList: {
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  learningGroupTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  learningSignalList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  learningSignalCard: {
    flex: 1,
    minWidth: "46%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(9,22,27,0.78)",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
    gap: SPACING.xs,
  },
  learningSignalCardWide: {
    minWidth: "100%",
    backgroundColor: "rgba(8,31,36,0.88)",
  },
  learningSignalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  learningSignalIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  learningSignalKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  learningSignalTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  learningSignalBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  learningInsightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
  },
  learningInsightText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 20,
  },
  commandActions: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  commandActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  commandActionCopy: {
    flex: 1,
    gap: 2,
  },
  suggestionRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  commandActionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  commandActionBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  commandMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  commandMetricCard: {
    flex: 1,
    minWidth: "45%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },
  commandMetricLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  commandMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  commandMetricHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  readinessList: {
    gap: SPACING.sm,
  },
  readinessRow: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  readinessTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  readinessLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  readinessStatus: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  readinessTrack: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  readinessFill: {
    height: 6,
    borderRadius: RADIUS.full,
  },
  readinessDetail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  commandRecommendation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.gold + "12",
    borderWidth: 1,
    borderColor: COLORS.gold + "22",
  },
  commandRecommendationText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 20,
  },
  // Coach chips (U3)
  coachChipList: {
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  coachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    borderLeftWidth: 2,
    paddingLeft: SPACING.sm,
    paddingVertical: 5,
  },
  coachChipText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 18,
  },
  // Executive Summary delta chip (U1)
  executiveDeltaChip: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    marginTop: 3,
  },
  // Focus metric wide card (A3)
  focusMetricCardWide: {
    width: "100%",
  },
  // Preset situational subtitle (U4)
  presetSituationalText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  // Advanced metrics section (N1-N5)
  advMetricSection: {
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  advMetricSectionBorder: {
    borderTopWidth: 0.5,
    borderTopColor: GLASS.cardBorder,
    marginTop: SPACING.xs,
  },
  advMetricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advMetricTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  advMetricBadge: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  advMetricBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 16,
  },
  advMetricBarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    height: 48,
  },
  advMetricBarItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    justifyContent: "flex-end",
  },
  advMetricBar: {
    width: "100%",
    borderRadius: 3,
    minHeight: 4,
  },
  advMetricBarLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  advScoreBar: {
    height: 5,
    backgroundColor: GLASS.card,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: SPACING.xs,
  },
  advScoreFill: {
    height: "100%",
    borderRadius: 3,
  },
  layerKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  layerHeroTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  layerHeroBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
    lineHeight: 28,
  },
  executiveIntro: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
    marginBottom: SPACING.md,
  },
  executiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  executiveCard: {
    flex: 1,
    minWidth: "46%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(12,18,31,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SPACING.xs,
  },
  executiveCardWide: {
    minWidth: "100%",
  },
  executiveTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  executiveLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  executiveTonePill: {
    flexShrink: 1,
    maxWidth: "58%",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
  },
  executiveTonePillWarning: {
    backgroundColor: COLORS.gold + "18",
  },
  executiveToneText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    flexShrink: 1,
  },
  executiveToneTextWarning: {
    color: COLORS.gold,
  },
  executiveValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
    color: COLORS.ink,
  },
  executiveCaption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
  },
  aiSummaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  aiSummaryHeaderText: {
    flex: 1,
    gap: SPACING.xs,
  },
  aiSummaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "16",
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
  },
  aiSummaryTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  aiSummaryBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
  },
  aiSummaryButton: {
    marginTop: SPACING.md,
  },
  aiSummaryHint: {
    marginTop: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 19,
  },
  aiSummaryResponseCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(12,18,31,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: SPACING.xs,
  },
  aiSummaryResponseLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
  },
  aiSummaryResponseText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 22,
  },
  executiveModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(5,8,18,0.82)",
    padding: SPACING.md,
  },
  executiveModalCard: {
    borderRadius: RADIUS.xl,
    backgroundColor: "#0B1020",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  executiveModalHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  executiveModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  executiveModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  executiveModalTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 20,
    color: COLORS.ink,
  },
  executiveModalSummary: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  movementPreviewOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(5,8,18,0.72)",
    padding: SPACING.md,
  },
  movementPreviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  movementPreviewCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "82%",
    borderRadius: RADIUS.xl,
    backgroundColor: "#0B1020",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  movementPreviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  movementPreviewKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  movementPreviewTitle: {
    marginTop: 3,
    fontFamily: FONT_FAMILY.heading,
    fontSize: 20,
    color: COLORS.ink,
  },
  movementPreviewClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  movementPreviewSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 22,
  },
  movementPreviewScope: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  movementPreviewSuggestionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + "18",
    borderWidth: 1,
    borderColor: COLORS.primary + "38",
  },
  movementPreviewSuggestionActionDisabled: {
    opacity: 0.64,
  },
  movementPreviewSuggestionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  movementPreviewSuggestionBody: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  movementPreviewStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  movementPreviewStatPill: {
    minWidth: 104,
    flexGrow: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 9,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  movementPreviewStatLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  movementPreviewStatValue: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  movementPreviewList: {
    marginTop: SPACING.xs,
  },
  movementPreviewListContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  movementPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  movementPreviewRowTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  movementPreviewRowMeta: {
    marginTop: 3,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  movementPreviewRowStatus: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  movementPreviewRowSide: {
    width: 118,
    alignItems: "flex-end",
    gap: SPACING.xs,
  },
  movementPreviewAmount: {
    maxWidth: 118,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  movementPreviewEditBtn: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "24",
    borderWidth: 1,
    borderColor: COLORS.primary + "42",
  },
  movementPreviewEditText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  movementPreviewEmpty: {
    paddingVertical: SPACING.xl,
    gap: SPACING.xs,
  },
  movementPreviewEmptyTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    textAlign: "center",
  },
  movementPreviewEmptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
    textAlign: "center",
  },
  explanationSheetContent: {
    gap: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  explanationIntroCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: SPACING.xs,
  },
  explanationKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  explanationSummary: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 23,
  },
  explanationVisualCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(9,22,27,0.82)",
    borderWidth: 1,
    borderColor: COLORS.primary + "1F",
    gap: SPACING.md,
  },
  explanationVisualHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  explanationVisualTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  explanationVisualHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    marginTop: 2,
  },
  explanationVisualGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  explanationVisualMetric: {
    flex: 1,
    gap: 5,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  explanationVisualMetricLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  explanationVisualMetricValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  explanationVisualTrack: {
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  explanationVisualFill: {
    height: 5,
    borderRadius: RADIUS.full,
  },
  explanationSectionCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(8,13,24,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
    gap: SPACING.md,
  },
  explanationSectionCardCollapsed: {
    backgroundColor: "rgba(8,13,24,0.48)",
  },
  explanationSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  explanationStepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "16",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
  },
  explanationStepBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  explanationSectionTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  explanationChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    transform: [{ rotate: "0deg" }],
  },
  explanationChevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  explanationBulletList: {
    gap: SPACING.sm,
  },
  explanationBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  explanationBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: COLORS.primary,
  },
  explanationBulletDotMuted: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  explanationBulletText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  explanationCollapsedHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
  },
  explanationResultSection: {
    gap: SPACING.md,
  },
  explanationActionsSection: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
    gap: SPACING.md,
  },
  explanationActionsTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  executiveModalSection: {
    gap: SPACING.xs,
  },
  executiveModalSectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  executiveModalBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  resultMeaningCard: {
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
  },
  resultMeaningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  resultMeaningIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  resultMeaningIndicatorPositive: {
    backgroundColor: COLORS.primary,
  },
  resultMeaningIndicatorWarning: {
    backgroundColor: COLORS.gold,
  },
  resultMeaningIndicatorDanger: {
    backgroundColor: "#FF9DBA",
  },
  resultMeaningCardPositive: {
    backgroundColor: "rgba(18,48,40,0.92)",
    borderColor: "rgba(107,228,197,0.18)",
  },
  resultMeaningCardWarning: {
    backgroundColor: "rgba(44,34,20,0.94)",
    borderColor: "rgba(215,190,123,0.22)",
  },
  resultMeaningCardDanger: {
    backgroundColor: "rgba(52,22,33,0.94)",
    borderColor: "rgba(218,122,154,0.22)",
  },
  resultMeaningTone: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  resultMeaningTonePositive: {
    color: COLORS.primary,
  },
  resultMeaningToneWarning: {
    color: COLORS.gold,
  },
  resultMeaningToneDanger: {
    color: "#FF9DBA",
  },
  executiveActionList: {
    gap: SPACING.sm,
  },
  executiveActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(59,166,142,0.24)",
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.26)",
  },
  executiveActionBtnText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  panelKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  panelTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  panelBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  panelCoachCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(31,27,18,0.94)",
    borderWidth: 1,
    borderColor: "rgba(215,190,123,0.24)",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  panelCoachTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  panelCoachIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(215,190,123,0.14)",
  },
  panelCoachCopy: { flex: 1, gap: 2 },
  panelCoachLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  panelCoachTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  panelCoachPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.12)",
  },
  panelCoachPillText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
  },
  panelCoachBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 24,
  },
  miniChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  miniChipText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  panelCoachFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  panelCoachFooterText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  panelApplyBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.24)",
  },
  panelApplyBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.gold,
  },
  presetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: "wrap",
  },
  presetTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  presetCard: {
    width: "48%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(12,18,31,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SPACING.xs,
  },
  presetCardActive: {
    borderColor: COLORS.primary + "88",
    backgroundColor: COLORS.primary + "10",
  },
  presetCardWide: {
    width: "100%",
  },
  presetCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.xs,
  },
  presetCardTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    flex: 1,
    flexShrink: 1,
  },
  presetBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gold + "18",
    flexShrink: 0,
  },
  presetBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
  },
  presetCardBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  widgetPanelCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(12,18,31,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SPACING.sm,
  },
  widgetPanelTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  widgetPanelBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  widgetPanelHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  widgetChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  widgetChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  widgetChipText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  howList: { gap: SPACING.md, marginTop: SPACING.md },
  howItem: { gap: 4 },
  howTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  howBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 22 },
  focusHeroCard: {
    marginTop: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(16,34,31,0.94)",
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.22)",
    gap: SPACING.md,
  },
  focusHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  focusHeroLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  focusHeroPills: {
    flexShrink: 1,
    maxWidth: "48%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
  },
  focusHeroTonePill: {
    maxWidth: "100%",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "14",
  },
  focusHeroToneText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: "#9EB7FF" },
  focusHeroTonePillMuted: {
    maxWidth: "100%",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  focusHeroToneTextMuted: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  focusHeroMiddle: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  focusHeroTitle: { fontFamily: FONT_FAMILY.heading, fontSize: 18, color: COLORS.ink },
  focusHeroValue: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: 18, color: COLORS.ink, lineHeight: 28 },
  focusHeroBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm, lineHeight: 26 },
  focusHeroReason: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    lineHeight: 20,
  },
  scopeHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  focusMetricGrid: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  focusMetricCard: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(12,18,31,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SPACING.xs,
  },
  focusMetricLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  focusMetricValue: { fontFamily: FONT_FAMILY.heading, fontSize: 18, color: COLORS.ink },
  focusMetricHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 22 },
  layerSection: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(8,13,24,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary + "88",
  },
  layerSectionKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  layerSectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: 20, color: COLORS.ink },
  layerSectionBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20, flex: 1 },
  layerBulletList: { gap: 5, marginTop: 8 },
  layerBulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  layerBulletDot: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.pine, lineHeight: 20 },
  visualChartKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  visualChartIntro: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 22,
  },
  visualChartFootnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  visualChartAction: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "14",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  annualHeaderRow: {
    gap: SPACING.sm,
  },
  annualYearList: {
    gap: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  annualYearPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  annualYearPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  annualYearText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  annualYearTextActive: {
    color: "#06110F",
  },
  annualSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  annualSummaryCard: {
    width: "48%",
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
    gap: 4,
  },
  annualSummaryValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 17,
  },
  annualFlowChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    paddingTop: SPACING.xs,
  },
  annualMonthCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  annualMonthColMuted: {
    opacity: 0.28,
  },
  annualBarsBox: {
    width: "100%",
    height: 74,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  annualFlowBar: {
    flex: 1,
    maxWidth: 7,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  annualNetList: {
    gap: SPACING.xs,
  },
  annualNetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  annualNetMonth: {
    width: 34,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  annualNetTrack: {
    flex: 1,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  annualNetFill: {
    height: 8,
    borderRadius: RADIUS.full,
  },
  annualNetAmount: {
    width: 88,
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  annualDetailContent: {
    gap: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  annualDetailHero: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  annualDetailTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 20,
    color: COLORS.ink,
  },
  annualDetailMini: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  annualDetailSection: {
    gap: SPACING.sm,
  },
  annualDetailSectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  annualDetailCategoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(9,22,27,0.78)",
    borderWidth: 1,
    borderColor: COLORS.primary + "22",
  },
  annualDetailCategoryName: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  annualDetailCategoryAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.expense,
    textAlign: "right",
  },
  annualMovementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  annualMovementTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  annualMovementMeta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 2,
  },
  annualMovementAmount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    textAlign: "right",
  },
  annualDetailActions: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  annualDetailPrimaryBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  annualDetailPrimaryBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: "#06110F",
  },
  annualDetailSplitActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  annualDetailSecondaryBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  annualDetailSecondaryBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  bridgeChartStack: {
    gap: SPACING.md,
  },
  bridgeRow: {
    gap: SPACING.xs,
  },
  bridgeRowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  bridgeLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  bridgeDetail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  bridgeAmount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    textAlign: "right",
  },
  bridgeTrack: {
    position: "relative",
    height: 12,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  bridgeAxis: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bridgeFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: RADIUS.full,
  },
  savingsSparkWrap: {
    alignItems: "center",
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  savingsStatsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  savingsStatCard: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 3,
  },
  savingsStatLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  savingsStatValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  netBarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  netBarsCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  netBarsBox: {
    position: "relative",
    width: "100%",
    height: 68,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.035)",
    overflow: "hidden",
  },
  netBarsAxis: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 34,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  netBar: {
    position: "absolute",
    left: "24%",
    right: "24%",
    borderRadius: 5,
  },
  netBarPositive: {
    backgroundColor: COLORS.income + "cc",
  },
  netBarNegative: {
    backgroundColor: COLORS.expense + "cc",
  },
  donutChartBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  donutWrap: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  donutCenter: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "rgba(7,11,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  donutCenterValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
    color: COLORS.ink,
  },
  donutCenterLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    maxWidth: 58,
    textAlign: "center",
  },
  donutLegend: {
    flex: 1,
    gap: SPACING.sm,
  },
  donutLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  donutLegendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  donutLegendName: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  donutLegendPct: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  donutLegendAmount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    textAlign: "right",
  },
  qualityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  qualityActions: {
    alignItems: "flex-end",
    gap: SPACING.xs,
  },
  cardHeaderWithAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  inlineExplainBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  inlineExplainBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  qualityKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: "#9EA9FF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  qualityTitle: { fontFamily: FONT_FAMILY.heading, fontSize: 18, color: COLORS.ink },
  qualityBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 22 },
  qualityToggleBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
  },
  qualityToggleBtnText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.primary },
  projectionStack: { gap: SPACING.sm },
  projectionCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(12,18,31,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SPACING.sm,
  },
  projectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  projectionLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, textTransform: "uppercase", letterSpacing: 0.5 },
  projectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: 18, color: COLORS.ink },
  projectionBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 24 },
  projectionFormulaBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(5,10,18,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: SPACING.sm,
  },
  projectionFormulaHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  projectionFormulaKicker: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  projectionFormulaTotal: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    textAlign: "right",
  },
  projectionFormulaSummary: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  projectionFormulaRows: {
    gap: 8,
  },
  projectionFormulaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  projectionFormulaCopy: {
    flex: 1,
    gap: 2,
  },
  projectionFormulaLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  projectionFormulaDetail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  projectionFormulaAmount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    textAlign: "right",
  },
  projectionFormulaAmountPositive: {
    color: COLORS.income,
  },
  projectionFormulaAmountNegative: {
    color: COLORS.expense,
  },
  projectionFormulaEquals: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.primary + "26",
  },
  projectionFormulaEqualsText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },
  projectionFormulaEqualsAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.primary,
  },
  projectionScenarioStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  projectionScenarioText: {
    flexGrow: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  actionPillRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  actionPillBody: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.ink, lineHeight: 22 },
  actionPill: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.primary + "18" },
  actionPillText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.primary },
  anomalyList: { gap: SPACING.sm, marginBottom: SPACING.md },
  anomalyCard: { padding: SPACING.md, borderRadius: RADIUS.xl, gap: SPACING.sm, borderWidth: 1 },
  anomalyCardStrong: { backgroundColor: "rgba(52,22,33,0.96)", borderColor: "rgba(218,122,154,0.22)" },
  anomalyCardReview: { backgroundColor: "rgba(37,31,19,0.96)", borderColor: "rgba(215,190,123,0.20)" },
  anomalyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  anomalyTitle: { flex: 1, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  anomalyBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 5, borderRadius: RADIUS.full },
  anomalyBadgeStrong: { backgroundColor: "rgba(218,122,154,0.16)" },
  anomalyBadgeReview: { backgroundColor: "rgba(215,190,123,0.16)" },
  anomalyBadgeText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  anomalyBadgeTextStrong: { color: "#FF9DBA" },
  anomalyBadgeTextReview: { color: COLORS.gold },
  anomalyBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.ink, lineHeight: 24 },
  anomalyBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  anomalyMeta: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },
  secondaryOutlineBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryOutlineBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },

  // Accounts breakdown ring
  breakdownWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  breakdownLegend: { flex: 1, gap: SPACING.xs + 1 },
  breakdownItem: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  breakdownDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  breakdownName: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink },
  breakdownPct: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },

  // Savings trend sparkline
  trendHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.xs },
  trendBadge: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  trendBody: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  trendLegend: { flex: 1, gap: 3 },
  trendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, textTransform: "capitalize" },
  trendNet: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },

  // Pro gate
  proGate: {
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: "rgba(215,190,123,0.06)",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(215,190,123,0.18)",
  },
  proGateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  proGateIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  proGateIconWrapLg: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  proGateText: { flex: 1, gap: 2 },
  proGateTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  proGateTitleLg: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  proGateBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 16 },
  proGateBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.12)",
    borderWidth: 1,
    borderColor: "rgba(215,190,123,0.35)",
  },
  proGateBadgeMuted: {
    backgroundColor: "rgba(150,162,181,0.10)",
    borderColor: "rgba(150,162,181,0.20)",
  },
  proGateBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    color: COLORS.gold,
    letterSpacing: 0.8,
  },
  proGateFeatures: {
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(215,190,123,0.10)",
  },
  proGateFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  proGateFeatureText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  advancedGiftCard: {
    overflow: "hidden",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: "#7F1020",
    borderWidth: 1,
    borderColor: "rgba(255,205,214,0.38)",
  },
  advancedGiftHeartsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  advancedGiftHeart: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 34,
    color: "#FFE3E8",
    lineHeight: 38,
  },
  advancedGiftHeartSmall: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 22,
    color: "#FFB7C3",
    lineHeight: 28,
  },
  advancedGiftKicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: "#FFD1D9",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  advancedGiftTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 25,
    color: "#FFFFFF",
    lineHeight: 32,
    textAlign: "center",
  },
  advancedGiftBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: "#FFE8EC",
    lineHeight: 23,
    textAlign: "center",
  },
  advancedGiftPill: {
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
  },
  advancedGiftPillText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: "#FFFFFF",
  },

  // Interpretation lines — one sentence per metric telling the user what the number means
  executiveInterpret: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
    marginTop: 3,
  },
  healthScoreInterpret: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 16,
  },
  healthInterpret: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 15,
    marginTop: 3,
  },
  advMetricInterpret: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.xl, paddingBottom: 100 },
});

// --- Dashboard header right actions -------------------------------------------

function DashboardHeaderRight({ onSignOut }: { onSignOut: () => void }) {
  const { profile } = useAuth();
  const { workspaces } = useWorkspaceListStore();
  const router = useRouter();
  const { data: notifications = [] } = useNotificationsQuery(profile?.id ?? null);
  const unreadCount = (notifications as { readAt: string | null }[]).filter((n) => !n.readAt).length;

  return (
    <View style={hdrStyles.row}>
      {workspaces.length > 1 && <WorkspaceSelector />}
      <TouchableOpacity
        style={hdrStyles.iconBtn}
        onPress={() => router.push("/notifications")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Bell size={19} color={COLORS.storm} strokeWidth={2} />
        {unreadCount > 0 && (
          <View style={hdrStyles.badge}>
            <Text style={hdrStyles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={hdrStyles.avatar} onPress={onSignOut}>
        {profile?.avatarUrl
          ? <Image source={{ uri: profile.avatarUrl }} style={hdrStyles.avatarImage} />
          : <Text style={hdrStyles.avatarText}>{profile?.initials ?? "?"}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const hdrStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: "#FFFFFF",
    lineHeight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
  },
  avatarText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
});

export default function DashboardScreenRoot() {
  return (
    <ErrorBoundary>
      <DashboardScreen />
    </ErrorBoundary>
  );
}
