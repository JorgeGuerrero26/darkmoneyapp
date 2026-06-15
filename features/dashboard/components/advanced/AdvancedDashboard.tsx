import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  differenceInDays,
  endOfDay,
  endOfMonth,
  format,
  getDay,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Brain,
  Sparkles,
  Tag,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, SPACING } from "../../../../constants/theme";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../../../lib/movement-display";
import { parseDisplayDate } from "../../../../lib/date";
import { normalizeAnalyticsText } from "../../../../services/analytics/movement-features";
import { buildFinancialGraphRank, type FinancialGraphRankNode } from "../../../../services/analytics/financial-graph";
import { buildFocusActionRanking } from "../../../../services/analytics/focus-scoring";
import { buildHistoryFactorAnalysis } from "../../../../services/analytics/history-factor-analysis";
import { buildPatternClusters } from "../../../../services/analytics/pattern-clustering";
import {
  buildPaymentOptimizationPlan,
  type PaymentOptimizationRecommendation,
} from "../../../../services/analytics/payment-optimization";
import { clusterHistoryMonths } from "../../../../services/analytics/month-clustering";
import { detectHistoryChangePoint } from "../../../../services/analytics/history-change-points";
import { findProbableDuplicateGroups } from "../../../../services/analytics/duplicate-detection";
import {
  useDashboardYearMovementsQuery,
  usePersistDashboardAnalyticsMutation,
  usePersistLearningFeedbackMutation,
  useUpdateMovementMutation,
  type DashboardAnalyticsBundle,
  type DashboardMovementRow,
} from "../../../../services/queries/workspace-data";
import { useToast } from "../../../../hooks/useToast";

import {
  expenseAmt,
  inRange,
  incomeAmt,
  isCategorizedCashflow,
  isExpense,
  isIncome,
  isTransfer,
  sortMovementsRecentFirst,
  transferAmt,
} from "../../lib/aggregations";
import {
  buildFutureFlowWindows,
  buildReviewInboxSnapshot,
  convertDashboardCurrency,
} from "../../lib/dashboard-builders";
import {
  buildAnomalyFindings,
  buildCategorySuggestions,
  buildLearningFeedbackCategorySuggestions,
  buildMonthProjectionModel,
} from "../../lib/advanced-builders";
import {
  type DashboardCategorySuggestion,
  type ExplanationTone,
  type MovementPreviewSheetState,
} from "../../lib/advanced-types";
import { useDashboardAiOrchestration } from "../../hooks/useDashboardAiOrchestration";
import { DashboardSectionBoundary } from "../shared/DashboardSectionBoundary";
import { AiResponseSkeleton } from "./AiResponseSkeleton";
import {
  DASHBOARD_AI_TONE_OPTIONS,
  GEMINI_BRAND,
  buildDashboardAiTextParts,
  ensureDashboardAiComplexTerms,
  type DashboardAiComplexTerm,
  type DashboardAiDailyCache,
  type DashboardAiTone,
  type DashboardAiToneResponse,
} from "../../lib/dashboard-ai-content";
import { useDashboardStats } from "../../hooks/useDashboardStats";
import { movementPreviewActionLabel } from "../../lib/aggregations";

import { SectionTitle } from "../simple/SectionTitle";
import { FutureFlowPreview } from "../simple/FutureFlowPreview";
import { ProjectionFormulaBreakdown } from "../simple/ProjectionFormulaBreakdown";
import { ReviewInbox } from "../simple/ReviewInbox";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

import {
  ExplanationActions,
  ExplanationIntro,
  ExplanationResult,
  ExplanationSection,
  ExplanationVisualSummary,
} from "./ExplanationCard";
import { LearningPanel } from "./LearningPanel";
import { ProCommandCenter } from "./ProCommandCenter";
import {
  CategoryBreakdown,
  MonthlyPulse,
  ObligationsSection,
  SubscriptionsSummary,
} from "./AdvancedSections";
import {
  AlertCenter,
  HealthScore,
  ObligationWatch,
  PaymentOptimizationCard,
} from "./HealthAndAlerts";
import {
  ActivityTimeline,
  AdvancedGiftCard,
  AlgorithmReadinessCard,
  AnomalyWatch,
  CurrencyExposure,
  DashboardLayerHeader,
  DataQuality,
  FinancialGraphCard,
  PeriodRadar,
  TransferSnapshot,
  WeeklyPattern,
} from "./AdvancedCards";
import {
  AnnualHistoryPanel,
  CategoryDonutChart,
  ProjectionBridgeChart,
  SavingsMomentumChart,
  type AnnualHistoryMonth,
} from "./DashboardCharts";
import { ADVANCED_TABS, DashboardTabBar, type AdvancedTab, type TabIndicator } from "./DashboardTabBar";

export function AdvancedDashboard({
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
  userEmail,
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
  userEmail?: string | null;
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
    baseCurrency,
  });
  const historyYears = useMemo(() => {
    // El historial anual tiene su propia query (24 meses); ofrecer siempre el año previo.
    const years = new Set<number>([new Date().getFullYear(), new Date().getFullYear() - 1]);
    for (const movement of movements) {
      const year = new Date(movement.occurredAt).getFullYear();
      if (Number.isFinite(year)) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [movements]);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(new Date().getFullYear());
  // La query base del dashboard trae solo 90 días; el historial anual, los factores
  // y la comparación estacional necesitan el año completo + año anterior.
  const yearMovementsQuery = useDashboardYearMovementsQuery(workspaceId, selectedHistoryYear);
  const historyMovements = yearMovementsQuery.data ?? movements;
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
      const monthMovements = isFuture ? [] : historyMovements.filter((movement) => inRange(movement, monthStart, cappedEnd));
      const income = monthMovements.filter(isIncome).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
      const expense = monthMovements.filter(isExpense).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
  }, [accountCurrencyMap, activeCurrency, baseCurrency, exchangeRateMap, historyMovements, selectedHistoryYear]);
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
    () => buildFutureFlowWindows(obligations, subscriptions, recurringIncome, activeCurrency, exchangeRateMap, currentVisibleBalance, baseCurrency),
    [activeCurrency, baseCurrency, currentVisibleBalance, exchangeRateMap, obligations, recurringIncome, subscriptions],
  );
  const weekWindow = windows[0];

  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements.filter((movement) => inRange(movement, start, now) && isIncome(movement)).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const expense = movements.filter((movement) => inRange(movement, start, now) && isExpense(movement)).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
        return sum + (convertDashboardCurrency(income.amount, income.currencyCode, activeCurrency, exchangeRateMap, baseCurrency) ?? 0);
      }, 0);
  }, [activeCurrency, baseCurrency, exchangeRateMap, recurringIncome]);

  // A3: Cash Cushion — días de caja libre al ritmo actual
  const cashCushion = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 29);
    const totalExpenses30d = movements
      .filter((m) => isExpense(m) && inRange(m, thirtyDaysAgo, now))
      .reduce((sum, m) => sum + expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
        weekBuckets[11 - weeksAgo] += expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(selectedHistoryYear, monthIndex, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const cappedEnd = selectedHistoryYear === now.getFullYear() && monthIndex === now.getMonth() ? now : monthEnd;
      const isFuture = monthStart > now;
      const totals = new Map<number | null, number>();
      if (!isFuture) {
        for (const movement of historyMovements.filter((item) => isExpense(item) && inRange(item, monthStart, cappedEnd))) {
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
  }, [accountCurrencyMap, activeCurrency, baseCurrency, categoryMap, exchangeRateMap, historyMovements, selectedHistoryYear]);

  const historyReadiness = useMemo(() => {
    const observedMonths = annualHistory.filter((month) => !month.isFuture && (month.income > 0.009 || month.expense > 0.009)).length;
    const yearStart = startOfDay(new Date(selectedHistoryYear, 0, 1));
    const yearEnd = endOfDay(new Date(selectedHistoryYear, 11, 31));
    const yearMovements = historyMovements.filter((movement) => movement.status === "posted" && inRange(movement, yearStart, yearEnd));
    const expenseCategoryIds = new Set(
      yearMovements
        .filter(isExpense)
        .filter((movement) => expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }) > 0.009)
        .map((movement) => movement.categoryId ?? null),
    );
    return {
      observedMonths,
      movementCount: yearMovements.length,
      expenseCategoryCount: expenseCategoryIds.size,
      allReady: observedMonths >= 6 && expenseCategoryIds.size >= 2 && yearMovements.length >= 8,
    };
  }, [accountCurrencyMap, activeCurrency, annualHistory, baseCurrency, exchangeRateMap, historyMovements, selectedHistoryYear]);

  const selectedAnnualMonthDetail = useMemo(() => {
    if (!selectedAnnualMonth) return null;
    const from = startOfDay(parseDisplayDate(selectedAnnualMonth.dateFrom));
    const to = endOfDay(parseDisplayDate(selectedAnnualMonth.dateTo));
    const monthMovements = historyMovements.filter((movement) => inRange(movement, from, to));
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
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
  }, [accountCurrencyMap, accountMap, activeCurrency, annualHistory, baseCurrency, categoryMap, exchangeRateMap, historyMovements, selectedAnnualMonth]);

  const monthlySavingsRate = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const mDate = subMonths(now, 5 - i);
      const mStart = startOfMonth(mDate);
      const mEnd = i === 5 ? now : endOfMonth(mDate);
      const mMvs = movements.filter((m) => inRange(m, mStart, mEnd));
      const inc = mMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
      const exp = mMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
    const curMvs = historyMovements.filter((m) => inRange(m, curStart, curEnd));
    const prevMvs = historyMovements.filter((m) => inRange(m, prevYearStart, prevYearEnd));
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
  }, [accountCurrencyMap, activeCurrency, baseCurrency, exchangeRateMap, historyMovements]);

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
      { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency },
      categoryMap,
      accountMap,
    ),
    [accountCurrencyMap, accountMap, activeCurrency, categoryMap, exchangeRateMap, movements],
  );

  const repeatedPatterns = useMemo(() => {
    const now = new Date();
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
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
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
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
          ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
          : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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
      { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency },
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
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const expense = currentMonthVariableMovements
      .filter((movement) => movementActsAsExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
    const total = categoryMovements.reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
      if (isTransfer(movement)) return sum + transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
      return sum + (movementActsAsIncome(movement)
        ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
        : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }));
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
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const expense = rangeMovements
      .filter((movement) => movementActsAsExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
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
      baseCurrency,
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
        baseCurrency,
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
          amount:
            convertDashboardCurrency(rawAmount, obligation.currencyCode, activeCurrency, exchangeRateMap, baseCurrency) ?? 0,
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

  // Paridad de moneda: HealthScore suma pendingAmount, así que se convierte ANTES
  // de pasarlo (montos no convertibles cuentan como 0, nunca 1:1 silencioso).
  const obligationsForHealth = useMemo(
    () =>
      obligations.map((obligation) => ({
        ...obligation,
        pendingAmount:
          convertDashboardCurrency(
            obligation.pendingAmount,
            obligation.currencyCode,
            activeCurrency,
            exchangeRateMap,
            baseCurrency,
          ) ?? 0,
      })),
    [activeCurrency, baseCurrency, exchangeRateMap, obligations],
  );

  // Inputs unificados de salud financiera (mismo contrato que web vía buildHealthScore).
  // liquidMoney: el móvil no clasifica cuentas por tipo aquí, así que usa el balance
  // visible como "dinero disponible". averageMonthlyExpense: promedio de gasto de los
  // 6 meses de monthlyPulse (estable). periodIncome/periodNet: mes a la fecha (mismo
  // período que la web). totalPayable/overdueCount: obligaciones payable activas.
  const healthInputs = useMemo(() => {
    const now = new Date();
    const expenses = advancedStats.monthlyPulse.map((m) => m.expense);
    const averageMonthlyExpense =
      expenses.length > 0 ? expenses.reduce((s, v) => s + v, 0) / expenses.length : 0;
    let totalPayable = 0;
    let overdueCount = 0;
    for (const o of obligationsForHealth) {
      if (o.direction !== "payable" || o.status !== "active") continue;
      totalPayable += o.pendingAmount;
      if (o.dueDate && new Date(o.dueDate) < now) overdueCount += 1;
    }
    return {
      liquidMoney: currentVisibleBalance,
      averageMonthlyExpense,
      periodIncome: monthToDate.income,
      periodNet: monthToDate.income - monthToDate.expense,
      totalPayable,
      overdueCount,
    };
  }, [advancedStats.monthlyPulse, currentVisibleBalance, monthToDate.expense, monthToDate.income, obligationsForHealth]);

  // SubscriptionsSummary suma mensualidades: convertir monto y reflejar la moneda activa.
  const subscriptionsForSummary = useMemo(
    () =>
      subscriptions.map((subscription) => ({
        ...subscription,
        amount:
          convertDashboardCurrency(
            subscription.amount,
            subscription.currencyCode,
            activeCurrency,
            exchangeRateMap,
            baseCurrency,
          ) ?? 0,
        currencyCode: activeCurrency,
      })),
    [activeCurrency, baseCurrency, exchangeRateMap, subscriptions],
  );

  const financialGraphRank = useMemo(() => (
    buildFinancialGraphRank<DashboardMovementRow>({
      movements: movements.filter((movement) => movement.status === "posted"),
      getAmount: (movement) => {
        if (isTransfer(movement)) return transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
        return movementActsAsIncome(movement)
          ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
          : expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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
      totals[normalized] += expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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
        amount:
          convertDashboardCurrency(account.currentBalance, account.currencyCode, activeCurrency, exchangeRateMap, baseCurrency) ?? 0,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  ), [activeAccounts, activeCurrency, baseCurrency, exchangeRateMap]);
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
  const dashboardAiPatternsPayload = useMemo(() => ({
    workspaceName: "Workspace actual",
    currency: activeCurrency,
    repeatedPatternsCount: repeatedPatterns.length,
    repeatedPatternsTop: repeatedPatterns.slice(0, 4).map((pattern) => ({
      label: pattern.label,
      type: pattern.type,
      category: pattern.category,
      count: pattern.count,
      average: formatCurrency(pattern.average, activeCurrency),
      total: formatCurrency(pattern.total, activeCurrency),
      confidencePct: pattern.confidence,
      lastSeen: pattern.lastLabel,
      reason: pattern.reason,
    })),
    risingCategoriesCount: risingCategoryPatterns.length,
    risingCategoriesTop: risingCategoryPatterns.slice(0, 4).map((item) => ({
      name: item.name,
      current: formatCurrency(item.current, activeCurrency),
      previous: formatCurrency(item.previous, activeCurrency),
      delta: formatCurrency(item.delta, activeCurrency),
      pct: item.pct == null ? null : Number(item.pct.toFixed(1)),
    })),
    anomalySignalsCount: anomalySignals.length,
    anomalySignalsTop: anomalySignals.slice(0, 4).map((item) => ({
      title: item.title,
      body: item.body,
      meta: item.meta,
      level: item.level,
      reasons: item.reasons,
    })),
    topHabit: repeatedPatterns[0]
      ? {
          label: repeatedPatterns[0].label,
          count: repeatedPatterns[0].count,
          average: formatCurrency(repeatedPatterns[0].average, activeCurrency),
          total: formatCurrency(repeatedPatterns[0].total, activeCurrency),
        }
      : null,
    topRise: risingCategoryPatterns[0]
      ? {
          name: risingCategoryPatterns[0].name,
          delta: formatCurrency(risingCategoryPatterns[0].delta, activeCurrency),
          pct: risingCategoryPatterns[0].pct == null ? null : Number(risingCategoryPatterns[0].pct.toFixed(1)),
        }
      : null,
    patternQuickRead,
    weeklyPatternInsight: weeklyPatternInsight
      ? {
          dayLabel: weeklyPatternInsight.dayLabel,
          sharePct: weeklyPatternInsight.share,
        }
      : null,
    categoryConcentration: {
      label: categoryConcentration.label,
      hhi: categoryConcentration.hhi == null ? null : Number(categoryConcentration.hhi.toFixed(3)),
      topCategory: categoryConcentration.topCategory,
      topShare: categoryConcentration.topShare,
    },
  }), [
    activeCurrency,
    anomalySignals,
    categoryConcentration.hhi,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    categoryConcentration.topShare,
    patternQuickRead,
    repeatedPatterns,
    risingCategoryPatterns,
    weeklyPatternInsight,
  ]);
  const dashboardAiFlowPayload = useMemo(() => ({
    workspaceName: "Workspace actual",
    currency: activeCurrency,
    currentVisibleBalance: formatCurrency(currentVisibleBalance, activeCurrency),
    weekNet: formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, activeCurrency),
    weekExpectedInflow: formatCurrency(weekWindow.expectedInflow, activeCurrency),
    weekExpectedOutflow: formatCurrency(weekWindow.expectedOutflow, activeCurrency),
    weekStatus: pressureStatus,
    weekScheduledCount: weekWindow.scheduledCount,
    weekPayableCount: weekWindow.payableCount,
    weekReceivableCount: weekWindow.receivableCount,
    monthEndReading: formatCurrency(projectionModel.expectedBalance, activeCurrency),
    monthEndDelta: formatCurrency(projectionModel.expectedBalance - currentVisibleBalance, activeCurrency),
    conservativeBalance: formatCurrency(projectionModel.conservativeBalance, activeCurrency),
    optimisticBalance: formatCurrency(projectionModel.optimisticBalance, activeCurrency),
    confidencePct: projectionModel.confidence,
    confidenceLabel: projectionModel.confidenceLabel,
    committedInflow: formatCurrency(projectionModel.committedInflow, activeCurrency),
    committedOutflow: formatCurrency(projectionModel.committedOutflow, activeCurrency),
    committedNet: formatCurrency(projectionCommittedNet, activeCurrency),
    variableIncomeProjection: formatCurrency(projectionModel.variableIncomeProjection, activeCurrency),
    variableExpenseProjection: formatCurrency(projectionModel.variableExpenseProjection, activeCurrency),
    variableNet: formatCurrency(projectionVariableNet, activeCurrency),
    pressureProbabilityPct: projectionModel.pressureProbability,
    pressureThreshold: formatCurrency(projectionModel.pressureThreshold, activeCurrency),
    cashCushionDays: cashCushion.days,
    cashCushionDaysWithCommitments: cashCushion.daysWithCommitments,
    cashCushionLabel: cashCushion.label,
    paymentOptimizationTop: paymentOptimization.slice(0, 3).map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
      actionLabel: item.actionLabel,
      amount: formatCurrency(item.amount, activeCurrency),
      direction: item.direction,
      score: item.score,
      reason: item.reason,
    })),
    subscriptionsCount: subscriptions.length,
    obligationsCount: obligations.length,
  }), [
    activeCurrency,
    cashCushion.days,
    cashCushion.daysWithCommitments,
    cashCushion.label,
    currentVisibleBalance,
    obligations.length,
    paymentOptimization,
    pressureStatus,
    projectionCommittedNet,
    projectionModel.committedInflow,
    projectionModel.committedOutflow,
    projectionModel.confidence,
    projectionModel.confidenceLabel,
    projectionModel.conservativeBalance,
    projectionModel.expectedBalance,
    projectionModel.optimisticBalance,
    projectionModel.pressureProbability,
    projectionModel.pressureThreshold,
    projectionModel.variableExpenseProjection,
    projectionModel.variableIncomeProjection,
    projectionVariableNet,
    subscriptions.length,
    weekWindow.expectedInflow,
    weekWindow.expectedOutflow,
    weekWindow.payableCount,
    weekWindow.receivableCount,
    weekWindow.scheduledCount,
  ]);
  const dashboardAiHistoryPayload = useMemo(() => {
    const observedMonths = annualHistory.filter((month) => !month.isFuture && (month.income > 0.009 || month.expense > 0.009));
    const positiveMonths = observedMonths.filter((month) => month.net > 0).length;
    const negativeMonths = observedMonths.filter((month) => month.net < 0).length;
    const annualIncome = observedMonths.reduce((sum, month) => sum + month.income, 0);
    const annualExpense = observedMonths.reduce((sum, month) => sum + month.expense, 0);
    const annualNet = observedMonths.reduce((sum, month) => sum + month.net, 0);
    const topMonths = observedMonths
      .slice()
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 4)
      .map((month) => ({
        label: month.label,
        income: formatCurrency(month.income, activeCurrency),
        expense: formatCurrency(month.expense, activeCurrency),
        net: formatCurrency(month.net, activeCurrency),
      }));

    return {
      workspaceName: "Workspace actual",
      currency: activeCurrency,
      selectedYear: selectedHistoryYear,
      observedMonths: historyReadiness.observedMonths,
      movementCount: historyReadiness.movementCount,
      expenseCategoryCount: historyReadiness.expenseCategoryCount,
      historyDays: learning.historyDays,
      readinessScore: learning.readinessScore,
      usefulCount: learning.usefulCount,
      categorizedRatePct: Math.round(learning.categorizedRate * 100),
      annualIncome: formatCurrency(annualIncome, activeCurrency),
      annualExpense: formatCurrency(annualExpense, activeCurrency),
      annualNet: formatCurrency(annualNet, activeCurrency),
      positiveMonths,
      negativeMonths,
      topMonths,
      changePoint: historyChangePoint
        ? {
            title: historyChangePoint.title,
            body: historyChangePoint.body,
            metric: historyChangePoint.metric,
            direction: historyChangePoint.direction,
            changePct: Number(historyChangePoint.changePct.toFixed(1)),
            recentAverage: formatCurrency(historyChangePoint.recentAverage, activeCurrency),
            previousAverage: formatCurrency(historyChangePoint.previousAverage, activeCurrency),
          }
        : null,
      monthClusters: monthClusters.slice(0, 4).map((cluster) => ({
        title: cluster.title,
        description: cluster.description,
        count: cluster.count,
        averageIncome: formatCurrency(cluster.averageIncome, activeCurrency),
        averageExpense: formatCurrency(cluster.averageExpense, activeCurrency),
        averageNet: formatCurrency(cluster.averageNet, activeCurrency),
        months: cluster.monthLabels,
      })),
      factorAnalysis: historyFactorAnalysis
        ? {
            title: historyFactorAnalysis.title,
            body: historyFactorAnalysis.body,
            explainedVariancePct: historyFactorAnalysis.explainedVariancePct,
            topCategories: historyFactorAnalysis.topCategories.map((category) => ({
              name: category.name,
              amount: formatCurrency(category.amount, activeCurrency),
              weight: category.weight,
              direction: category.direction,
            })),
            activeMonths: historyFactorAnalysis.activeMonths.map((month) => ({
              label: month.label,
              score: Number(month.score.toFixed(2)),
            })),
          }
        : null,
      savingsRate: {
        avgRate: monthlySavingsRate.avgRate == null ? null : Number(monthlySavingsRate.avgRate.toFixed(1)),
        lastRate: monthlySavingsRate.lastRate == null ? null : Number(monthlySavingsRate.lastRate.toFixed(1)),
        trend: monthlySavingsRate.trend,
      },
      incomeStability: {
        score: incomeStabilityScore.score,
        cvPct: incomeStabilityScore.cvPct,
        label: incomeStabilityScore.label,
      },
      seasonalComparison: {
        hasHistory: seasonalComparison.hasHistory,
        expenseDelta: seasonalComparison.expenseDelta == null ? null : Number(seasonalComparison.expenseDelta.toFixed(1)),
        incomeDelta: seasonalComparison.incomeDelta == null ? null : Number(seasonalComparison.incomeDelta.toFixed(1)),
        expenseLabel: seasonalComparison.expenseLabel,
      },
    };
  }, [
    activeCurrency,
    annualHistory,
    historyChangePoint,
    historyFactorAnalysis,
    historyReadiness.expenseCategoryCount,
    historyReadiness.movementCount,
    historyReadiness.observedMonths,
    incomeStabilityScore.cvPct,
    incomeStabilityScore.label,
    incomeStabilityScore.score,
    learning.categorizedRate,
    learning.historyDays,
    learning.readinessScore,
    learning.usefulCount,
    monthClusters,
    monthlySavingsRate.avgRate,
    monthlySavingsRate.lastRate,
    monthlySavingsRate.trend,
    seasonalComparison.expenseDelta,
    seasonalComparison.expenseLabel,
    seasonalComparison.hasHistory,
    seasonalComparison.incomeDelta,
    selectedHistoryYear,
  ]);
  const dashboardAiHealthPayload = useMemo(() => ({
    workspaceName: "Workspace actual",
    currency: activeCurrency,
    totalIssues: review.totalIssues,
    uncategorizedCount: review.uncategorizedCount,
    pendingMovementsCount: review.pendingMovementsCount,
    subscriptionsAttentionCount: review.subscriptionsAttentionCount,
    overdueObligationsCount: review.overdueObligationsCount,
    duplicateExpenseCount: duplicateExpenseReviewMovements.length,
    noCounterpartyCount: qualitySnapshot.noCounterpartyCount,
    noCategoryCount: qualitySnapshot.noCategoryCount,
    categorySuggestionsCount: categorySuggestions.length,
    categorySuggestionsTop: categorySuggestions.slice(0, 4).map((suggestion) => ({
      description: suggestion.description,
      suggestedCategoryName: suggestion.suggestedCategoryName,
      amount: formatCurrency(suggestion.amount, activeCurrency),
      confidencePct: Math.round(suggestion.confidence * 100),
      reasons: suggestion.reasons,
    })),
    collectionEfficiency: {
      rate: collectionEfficiency.rate,
      resolved: collectionEfficiency.resolved,
      total: collectionEfficiency.total,
      label: collectionEfficiency.label,
    },
    systemReadiness: {
      score: learning.readinessScore,
      historyDays: learning.historyDays,
      usefulCount: learning.usefulCount,
      categorizedRatePct: Math.round(learning.categorizedRate * 100),
    },
    projectionConfidence: {
      score: projectionModel.confidence,
      label: projectionModel.confidenceLabel,
    },
    acceptedFeedbackCount,
    cashCushion: {
      days: cashCushion.days,
      label: cashCushion.label,
    },
    coachSignals: panelCoachChips.map((chip) => chip.label),
  }), [
    acceptedFeedbackCount,
    activeCurrency,
    cashCushion.days,
    cashCushion.label,
    categorySuggestions,
    collectionEfficiency.label,
    collectionEfficiency.rate,
    collectionEfficiency.resolved,
    collectionEfficiency.total,
    duplicateExpenseReviewMovements.length,
    learning.categorizedRate,
    learning.historyDays,
    learning.readinessScore,
    learning.usefulCount,
    panelCoachChips,
    projectionModel.confidence,
    projectionModel.confidenceLabel,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.pendingMovementsCount,
    review.subscriptionsAttentionCount,
    review.totalIssues,
    review.uncategorizedCount,
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
        return sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
      }
      if (movementActsAsExpense(movement)) {
        return sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
      }
      return sum + transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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
  const dashboardAi = useDashboardAiOrchestration({ userId, userEmail });
  const dashboardAiFlowMutation = dashboardAi.mutations.flow;
  const dashboardAiHealthMutation = dashboardAi.mutations.health;
  const dashboardAiHistoryMutation = dashboardAi.mutations.history;
  const dashboardAiPatternsMutation = dashboardAi.mutations.patterns;
  const dashboardAiSummaryMutation = dashboardAi.mutations.summary;
  type DashboardAiCacheSetter = (
    next:
      | DashboardAiDailyCache
      | null
      | ((current: DashboardAiDailyCache | null) => DashboardAiDailyCache | null),
  ) => void;
  const dashboardAiDailyCache = dashboardAi.caches.summary;
  const setDashboardAiDailyCache: DashboardAiCacheSetter = useCallback(
    (next) => dashboardAi.setCache("summary", next),
    [dashboardAi],
  );
  const dashboardAiFlowCache = dashboardAi.caches.flow;
  const setDashboardAiFlowCache: DashboardAiCacheSetter = useCallback(
    (next) => dashboardAi.setCache("flow", next),
    [dashboardAi],
  );
  const dashboardAiHealthCache = dashboardAi.caches.health;
  const setDashboardAiHealthCache: DashboardAiCacheSetter = useCallback(
    (next) => dashboardAi.setCache("health", next),
    [dashboardAi],
  );
  const dashboardAiHistoryCache = dashboardAi.caches.history;
  const setDashboardAiHistoryCache: DashboardAiCacheSetter = useCallback(
    (next) => dashboardAi.setCache("history", next),
    [dashboardAi],
  );
  const dashboardAiPatternsCache = dashboardAi.caches.patterns;
  const setDashboardAiPatternsCache: DashboardAiCacheSetter = useCallback(
    (next) => dashboardAi.setCache("patterns", next),
    [dashboardAi],
  );
  const [activeDashboardAiTerm, setActiveDashboardAiTerm] = useState<DashboardAiComplexTerm | null>(null);
  const dashboardAiTone = dashboardAi.tone;
  const setDashboardAiTone = dashboardAi.setTone;
  const dashboardAiBreath = useRef(new Animated.Value(0)).current;
  const dashboardAiUsageDate = dashboardAi.usageDate;
  const dashboardAiIsAdmin = dashboardAi.isAdmin;
  const [activeTab, setActiveTab] = useState<AdvancedTab>('Resumen');
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(dashboardAiBreath, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dashboardAiBreath, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      dashboardAiBreath.stopAnimation();
    };
  }, [dashboardAiBreath]);
  const handleTabChange = useCallback((tab: AdvancedTab) => {
    setActiveTab(tab);
    onScrollToTop?.();
  }, [onScrollToTop]);
  const dashboardAiHaloScale = dashboardAiBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.12],
  });
  const dashboardAiHaloOpacity = dashboardAiBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.38],
  });
  const dashboardAiCoreScale = dashboardAiBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const dashboardAiBadgeTranslateY = dashboardAiBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });
  const dashboardAiOrbShift = dashboardAiBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const dashboardAiCurrentToneResponse = dashboardAiDailyCache?.responses?.[dashboardAiTone] ?? null;
  const dashboardAiReply = dashboardAiCurrentToneResponse?.reply ?? null;
  const dashboardAiComplexTerms = dashboardAiCurrentToneResponse?.complexTerms ?? [];
  const dashboardAiFlowCurrentToneResponse = dashboardAiFlowCache?.responses?.[dashboardAiTone] ?? null;
  const dashboardAiFlowReply = dashboardAiFlowCurrentToneResponse?.reply ?? null;
  const dashboardAiFlowComplexTerms = dashboardAiFlowCurrentToneResponse?.complexTerms ?? [];
  const dashboardAiHealthCurrentToneResponse = dashboardAiHealthCache?.responses?.[dashboardAiTone] ?? null;
  const dashboardAiHealthReply = dashboardAiHealthCurrentToneResponse?.reply ?? null;
  const dashboardAiHealthComplexTerms = dashboardAiHealthCurrentToneResponse?.complexTerms ?? [];
  const dashboardAiHistoryCurrentToneResponse = dashboardAiHistoryCache?.responses?.[dashboardAiTone] ?? null;
  const dashboardAiHistoryReply = dashboardAiHistoryCurrentToneResponse?.reply ?? null;
  const dashboardAiHistoryComplexTerms = dashboardAiHistoryCurrentToneResponse?.complexTerms ?? [];
  const dashboardAiPatternsCurrentToneResponse = dashboardAiPatternsCache?.responses?.[dashboardAiTone] ?? null;
  const dashboardAiPatternsReply = dashboardAiPatternsCurrentToneResponse?.reply ?? null;
  const dashboardAiPatternsComplexTerms = dashboardAiPatternsCurrentToneResponse?.complexTerms ?? [];
  const dashboardAiLimitReached = !dashboardAiIsAdmin &&
    dashboardAiDailyCache?.usageDate === dashboardAiUsageDate &&
    Boolean(dashboardAiDailyCache?.lastUsedAt);
  const dashboardAiFlowLimitReached = !dashboardAiIsAdmin &&
    dashboardAiFlowCache?.usageDate === dashboardAiUsageDate &&
    Boolean(dashboardAiFlowCache?.lastUsedAt);
  const dashboardAiHealthLimitReached = !dashboardAiIsAdmin &&
    dashboardAiHealthCache?.usageDate === dashboardAiUsageDate &&
    Boolean(dashboardAiHealthCache?.lastUsedAt);
  const dashboardAiHistoryLimitReached = !dashboardAiIsAdmin &&
    dashboardAiHistoryCache?.usageDate === dashboardAiUsageDate &&
    Boolean(dashboardAiHistoryCache?.lastUsedAt);
  const dashboardAiPatternsLimitReached = !dashboardAiIsAdmin &&
    dashboardAiPatternsCache?.usageDate === dashboardAiUsageDate &&
    Boolean(dashboardAiPatternsCache?.lastUsedAt);
  const dashboardAiResolvedTerms = useMemo(
    () => ensureDashboardAiComplexTerms(dashboardAiReply ?? "", dashboardAiComplexTerms),
    [dashboardAiComplexTerms, dashboardAiReply],
  );
  const dashboardAiTextParts = useMemo(
    () => buildDashboardAiTextParts(dashboardAiReply ?? "", dashboardAiResolvedTerms),
    [dashboardAiReply, dashboardAiResolvedTerms],
  );
  const dashboardAiFlowResolvedTerms = useMemo(
    () => ensureDashboardAiComplexTerms(dashboardAiFlowReply ?? "", dashboardAiFlowComplexTerms),
    [dashboardAiFlowComplexTerms, dashboardAiFlowReply],
  );
  const dashboardAiFlowTextParts = useMemo(
    () => buildDashboardAiTextParts(dashboardAiFlowReply ?? "", dashboardAiFlowResolvedTerms),
    [dashboardAiFlowReply, dashboardAiFlowResolvedTerms],
  );
  const dashboardAiHealthResolvedTerms = useMemo(
    () => ensureDashboardAiComplexTerms(dashboardAiHealthReply ?? "", dashboardAiHealthComplexTerms),
    [dashboardAiHealthComplexTerms, dashboardAiHealthReply],
  );
  const dashboardAiHealthTextParts = useMemo(
    () => buildDashboardAiTextParts(dashboardAiHealthReply ?? "", dashboardAiHealthResolvedTerms),
    [dashboardAiHealthReply, dashboardAiHealthResolvedTerms],
  );
  const dashboardAiHistoryResolvedTerms = useMemo(
    () => ensureDashboardAiComplexTerms(dashboardAiHistoryReply ?? "", dashboardAiHistoryComplexTerms),
    [dashboardAiHistoryComplexTerms, dashboardAiHistoryReply],
  );
  const dashboardAiHistoryTextParts = useMemo(
    () => buildDashboardAiTextParts(dashboardAiHistoryReply ?? "", dashboardAiHistoryResolvedTerms),
    [dashboardAiHistoryReply, dashboardAiHistoryResolvedTerms],
  );
  const dashboardAiPatternsResolvedTerms = useMemo(
    () => ensureDashboardAiComplexTerms(dashboardAiPatternsReply ?? "", dashboardAiPatternsComplexTerms),
    [dashboardAiPatternsComplexTerms, dashboardAiPatternsReply],
  );
  const dashboardAiPatternsTextParts = useMemo(
    () => buildDashboardAiTextParts(dashboardAiPatternsReply ?? "", dashboardAiPatternsResolvedTerms),
    [dashboardAiPatternsReply, dashboardAiPatternsResolvedTerms],
  );
  const handleRequestDashboardAiSummary = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    if (dashboardAiLimitReached) {
      showToast("Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.", "error");
      return;
    }
    try {
      setActiveDashboardAiTerm(null);
      const response = await dashboardAiSummaryMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiSummaryPayload,
        tone: dashboardAiTone,
      });
      const nextResponse: DashboardAiToneResponse = {
        reply: response.reply,
        complexTerms: response.complexTerms ?? [],
        generatedAt: new Date().toISOString(),
      };
      setDashboardAiDailyCache((current) => ({
        usageDate: dashboardAiUsageDate,
        lastUsedAt: nextResponse.generatedAt,
        responses: {
          ...(current?.usageDate === dashboardAiUsageDate ? current.responses : {}),
          [dashboardAiTone]: nextResponse,
        },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA.", "error");
    }
  }, [dashboardAiLimitReached, dashboardAiSummaryMutation, dashboardAiSummaryPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiFlow = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    if (dashboardAiFlowLimitReached) {
      showToast("Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.", "error");
      return;
    }
    try {
      setActiveDashboardAiTerm(null);
      const response = await dashboardAiFlowMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiFlowPayload,
        tone: dashboardAiTone,
      });
      const nextResponse: DashboardAiToneResponse = {
        reply: response.reply,
        complexTerms: response.complexTerms ?? [],
        generatedAt: new Date().toISOString(),
      };
      setDashboardAiFlowCache((current) => ({
        usageDate: dashboardAiUsageDate,
        lastUsedAt: nextResponse.generatedAt,
        responses: {
          ...(current?.usageDate === dashboardAiUsageDate ? current.responses : {}),
          [dashboardAiTone]: nextResponse,
        },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA de flujo.", "error");
    }
  }, [dashboardAiFlowLimitReached, dashboardAiFlowMutation, dashboardAiFlowPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiHealth = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    if (dashboardAiHealthLimitReached) {
      showToast("Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.", "error");
      return;
    }
    try {
      setActiveDashboardAiTerm(null);
      const response = await dashboardAiHealthMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiHealthPayload,
        tone: dashboardAiTone,
      });
      const nextResponse: DashboardAiToneResponse = {
        reply: response.reply,
        complexTerms: response.complexTerms ?? [],
        generatedAt: new Date().toISOString(),
      };
      setDashboardAiHealthCache((current) => ({
        usageDate: dashboardAiUsageDate,
        lastUsedAt: nextResponse.generatedAt,
        responses: {
          ...(current?.usageDate === dashboardAiUsageDate ? current.responses : {}),
          [dashboardAiTone]: nextResponse,
        },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA de salud.", "error");
    }
  }, [dashboardAiHealthLimitReached, dashboardAiHealthMutation, dashboardAiHealthPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiHistory = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    if (dashboardAiHistoryLimitReached) {
      showToast("Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.", "error");
      return;
    }
    try {
      setActiveDashboardAiTerm(null);
      const response = await dashboardAiHistoryMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiHistoryPayload,
        tone: dashboardAiTone,
      });
      const nextResponse: DashboardAiToneResponse = {
        reply: response.reply,
        complexTerms: response.complexTerms ?? [],
        generatedAt: new Date().toISOString(),
      };
      setDashboardAiHistoryCache((current) => ({
        usageDate: dashboardAiUsageDate,
        lastUsedAt: nextResponse.generatedAt,
        responses: {
          ...(current?.usageDate === dashboardAiUsageDate ? current.responses : {}),
          [dashboardAiTone]: nextResponse,
        },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA de historial.", "error");
    }
  }, [dashboardAiHistoryLimitReached, dashboardAiHistoryMutation, dashboardAiHistoryPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiPatterns = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se encontró el workspace activo.", "error");
      return;
    }
    if (dashboardAiPatternsLimitReached) {
      showToast("Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.", "error");
      return;
    }
    try {
      setActiveDashboardAiTerm(null);
      const response = await dashboardAiPatternsMutation.mutateAsync({
        workspaceId,
        summary: dashboardAiPatternsPayload,
        tone: dashboardAiTone,
      });
      const nextResponse: DashboardAiToneResponse = {
        reply: response.reply,
        complexTerms: response.complexTerms ?? [],
        generatedAt: new Date().toISOString(),
      };
      setDashboardAiPatternsCache((current) => ({
        usageDate: dashboardAiUsageDate,
        lastUsedAt: nextResponse.generatedAt,
        responses: {
          ...(current?.usageDate === dashboardAiUsageDate ? current.responses : {}),
          [dashboardAiTone]: nextResponse,
        },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo consultar a la IA de patrones.", "error");
    }
  }, [dashboardAiPatternsLimitReached, dashboardAiPatternsMutation, dashboardAiPatternsPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);

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

      {activeTab === 'Resumen' && (
        <DashboardSectionBoundary sectionLabel="Resumen">
        <>
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
        <View style={subStyles.aiSummaryShellWrap}>
          <LinearGradient
            colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={subStyles.aiSummaryGradientBorder}
            pointerEvents="none"
          />
        <View style={subStyles.aiSummaryShell}>
          <Animated.View
            pointerEvents="none"
            style={[
              subStyles.aiSummaryAmbientGlow,
              subStyles.aiSummaryAmbientGlowBlue,
              { transform: [{ scale: dashboardAiHaloScale }] },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              subStyles.aiSummaryAmbientGlow,
              subStyles.aiSummaryAmbientGlowCoral,
              { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              subStyles.aiSummaryAmbientGlow,
              subStyles.aiSummaryAmbientGlowGold,
              { transform: [{ scale: dashboardAiHaloScale }, { translateY: Animated.multiply(dashboardAiOrbShift, -0.6) }] },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              subStyles.aiSummaryAmbientGlow,
              subStyles.aiSummaryAmbientGlowTeal,
              { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
            ]}
          />
          <Animated.View style={[subStyles.aiSummaryBadgeRow, { transform: [{ translateY: dashboardAiBadgeTranslateY }] }]}>
            <View style={subStyles.aiSummaryGeminiBadge}>
              <Sparkles size={12} color={GEMINI_BRAND.teal} />
              <View style={subStyles.aiSummaryGeminiDotsRow}>
                <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue }]} />
                <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral }]} />
                <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold }]} />
                <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal }]} />
              </View>
              <Text style={subStyles.aiSummaryGeminiBadgeText}>Impulsado por Gemini AI</Text>
            </View>
            <Text style={subStyles.aiSummaryGeminiKicker}>Lee las señales de tu dashboard y las convierte en una explicación accionable.</Text>
          </Animated.View>
          <View style={subStyles.aiSummaryHeader}>
            <View style={subStyles.aiSummaryHeaderText}>
              <Text style={subStyles.aiSummaryTitle}>Tu situación explicada</Text>
              <Text style={subStyles.aiSummaryBody}>
                Una capa inteligente de Gemini toma el estado actual de tu dashboard y lo convierte en una lectura simple, accionable y más fácil de entender.
              </Text>
            </View>
            <View style={subStyles.aiSummaryOrbWrap}>
              <Animated.View
                pointerEvents="none"
                style={[
                  subStyles.aiSummaryPulseHalo,
                  { opacity: dashboardAiHaloOpacity, transform: [{ scale: dashboardAiHaloScale }] },
                ]}
              />
              <Animated.View style={{ transform: [{ scale: dashboardAiCoreScale }] }}>
                <View style={subStyles.aiSummaryIconWrap}>
                  <View style={subStyles.aiSummaryIconRing}>
                    <Sparkles size={20} color={GEMINI_BRAND.teal} />
                  </View>
                </View>
              </Animated.View>
            </View>
          </View>
          <Text style={subStyles.aiSummarySelectorLabel}>Elige cómo quieres ver la explicación</Text>
          <View style={subStyles.aiSummaryToneRow}>
            {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
              const active = option.id === dashboardAiTone;
              return (
                <TouchableOpacity
                  key={option.id}
                  activeOpacity={0.85}
                  style={[subStyles.aiSummaryToneChip, active && subStyles.aiSummaryToneChipActive]}
                  onPress={() => {
                    setDashboardAiTone(option.id);
                    setActiveDashboardAiTerm(null);
                  }}
                >
                  <Text style={[subStyles.aiSummaryToneChipTitle, active && subStyles.aiSummaryToneChipTitleActive]}>
                    {option.label}
                  </Text>
                  <Text style={[subStyles.aiSummaryToneChipBody, active && subStyles.aiSummaryToneChipBodyActive]}>
                    {option.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => void handleRequestDashboardAiSummary()}
            disabled={dashboardAiSummaryMutation.isPending || dashboardAiLimitReached}
            style={[
              subStyles.aiSummaryButton,
              (dashboardAiSummaryMutation.isPending || dashboardAiLimitReached) && subStyles.aiSummaryButtonDisabled,
            ]}
          >
            <View style={subStyles.aiSummaryButtonAccent} />
            <View style={subStyles.aiSummaryButtonInner}>
              <Sparkles size={16} color={dashboardAiSummaryMutation.isPending || dashboardAiLimitReached ? "rgba(255,255,255,0.4)" : GEMINI_BRAND.teal} />
              <Text style={subStyles.aiSummaryButtonLabel}>
                {dashboardAiSummaryMutation.isPending
                  ? "Preparando explicacion..."
                  : dashboardAiLimitReached
                    ? "Consulta de hoy usada"
                    : dashboardAiTone === "managerial"
                      ? "Ver informe gerencial"
                      : "Hablar con mi asesor personal"}
              </Text>
            </View>
          </TouchableOpacity>
          {dashboardAiSummaryMutation.isPending && !dashboardAiReply ? <AiResponseSkeleton /> : null}
          {dashboardAiReply ? (
            <View style={subStyles.aiSummaryResponseCard}>
              <LinearGradient
                pointerEvents="none"
                colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={subStyles.aiSummaryResponseGradientBar}
              />
              <View style={subStyles.aiSummaryResponseAiTag}>
                <Sparkles size={11} color={GEMINI_BRAND.teal} />
                <View style={subStyles.aiSummaryGeminiDotsRow}>
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue, width: 5, height: 5 }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral, width: 5, height: 5 }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold, width: 5, height: 5 }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal, width: 5, height: 5 }]} />
                </View>
                <Text style={subStyles.aiSummaryResponseLabel}>
                  {dashboardAiTone === "managerial" ? "Gemini · Modo gerencial" : "Gemini · Modo asesor"}
                </Text>
              </View>
              {dashboardAiResolvedTerms.length > 0 ? (
                <Text style={subStyles.aiSummaryGlossaryHint}>
                  Toca las palabras resaltadas para ver su explicación.
                </Text>
              ) : null}
              <Text style={subStyles.aiSummaryResponseText}>
                {dashboardAiTextParts.map((part, index) => (
                  part.type === "term" ? (
                    <Text
                      key={`${part.term.term}-${index}`}
                      style={subStyles.aiSummaryResponseTerm}
                      onPress={() => setActiveDashboardAiTerm(part.term)}
                    >
                      {part.value}
                    </Text>
                  ) : (
                    <Text key={`text-${index}`}>{part.value}</Text>
                  )
                ))}
              </Text>
            </View>
          ) : (
            <Text style={subStyles.aiSummaryHint}>
              {dashboardAiLimitReached
                ? "Ya usaste tu explicación de IA de hoy en este módulo. Podrás pedir otra mañana."
                : "Gemini interpreta tu resumen actual y siempre cierra con una recomendación concreta para hoy."}
            </Text>
          )}
          <View style={subStyles.aiSummaryFooterRow}>
            <Text style={subStyles.aiSummaryFooterText}>Gemini mejora la lectura del sistema, pero usa solo los datos que ya existen en DarkMoney.</Text>
          </View>
        </View>
        </View>
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

      </>
      </DashboardSectionBoundary>
      )}

      <BottomSheet
        visible={Boolean(activeDashboardAiTerm)}
        onClose={() => setActiveDashboardAiTerm(null)}
        title="Explicación"
        snapHeight={0.42}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <View style={subStyles.aiSummaryTermSheetBadge}>
              <Sparkles size={12} color={GEMINI_BRAND.teal} />
              <Text style={subStyles.aiSummaryTermSheetBadgeText}>Explicación simple</Text>
            </View>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : null}
      </BottomSheet>

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
                    ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
                    : expenseLike
                      ? expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
                      : transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
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

      {activeTab === 'Resumen' && (
        <DashboardSectionBoundary sectionLabel="Resumen">
        <>
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

      </>
      </DashboardSectionBoundary>
      )}

      {activeTab === 'Patrones' && (
        <DashboardSectionBoundary sectionLabel="Patrones">
        <>
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
      <Card>
        <View style={subStyles.aiSummaryShellWrap}>
          <LinearGradient
            colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={subStyles.aiSummaryGradientBorder}
            pointerEvents="none"
          />
          <View style={subStyles.aiSummaryShell}>
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowBlue,
                { transform: [{ scale: dashboardAiHaloScale }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowCoral,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowGold,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: Animated.multiply(dashboardAiOrbShift, -0.6) }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowTeal,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View style={[subStyles.aiSummaryBadgeRow, { transform: [{ translateY: dashboardAiBadgeTranslateY }] }]}>
              <View style={subStyles.aiSummaryGeminiBadge}>
                <Sparkles size={12} color={GEMINI_BRAND.teal} />
                <View style={subStyles.aiSummaryGeminiDotsRow}>
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal }]} />
                </View>
                <Text style={subStyles.aiSummaryGeminiBadgeText}>Impulsado por Gemini AI</Text>
              </View>
              <Text style={subStyles.aiSummaryGeminiKicker}>Interpreta hábitos, subidas y gastos raros para que entiendas cómo se mueve tu dinero.</Text>
            </Animated.View>
            <View style={subStyles.aiSummaryHeader}>
              <View style={subStyles.aiSummaryHeaderText}>
                <Text style={subStyles.aiSummaryTitle}>Tus patrones explicados</Text>
                <Text style={subStyles.aiSummaryBody}>
                  Gemini toma los hábitos repetidos, los cambios recientes y las anomalías del dashboard para explicarte qué patrones ya se están formando en tus finanzas.
                </Text>
              </View>
              <View style={subStyles.aiSummaryOrbWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    subStyles.aiSummaryPulseHalo,
                    { opacity: dashboardAiHaloOpacity, transform: [{ scale: dashboardAiHaloScale }] },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: dashboardAiCoreScale }] }}>
                  <View style={subStyles.aiSummaryIconWrap}>
                    <View style={subStyles.aiSummaryIconRing}>
                      <Sparkles size={20} color={GEMINI_BRAND.teal} />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>
            <Text style={subStyles.aiSummarySelectorLabel}>Elige cómo quieres ver la explicación</Text>
            <View style={subStyles.aiSummaryToneRow}>
              {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
                const active = option.id === dashboardAiTone;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    style={[subStyles.aiSummaryToneChip, active && subStyles.aiSummaryToneChipActive]}
                    onPress={() => {
                      setDashboardAiTone(option.id);
                      setActiveDashboardAiTerm(null);
                    }}
                  >
                    <Text style={[subStyles.aiSummaryToneChipTitle, active && subStyles.aiSummaryToneChipTitleActive]}>
                      {option.label}
                    </Text>
                    <Text style={[subStyles.aiSummaryToneChipBody, active && subStyles.aiSummaryToneChipBodyActive]}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => void handleRequestDashboardAiPatterns()}
              disabled={dashboardAiPatternsMutation.isPending || dashboardAiPatternsLimitReached}
              style={[
                subStyles.aiSummaryButton,
                (dashboardAiPatternsMutation.isPending || dashboardAiPatternsLimitReached) && subStyles.aiSummaryButtonDisabled,
              ]}
            >
              <View style={subStyles.aiSummaryButtonAccent} />
              <View style={subStyles.aiSummaryButtonInner}>
                <Sparkles size={16} color={dashboardAiPatternsMutation.isPending || dashboardAiPatternsLimitReached ? "rgba(255,255,255,0.4)" : GEMINI_BRAND.teal} />
                <Text style={subStyles.aiSummaryButtonLabel}>
                  {dashboardAiPatternsMutation.isPending
                    ? "Preparando explicacion..."
                    : dashboardAiPatternsLimitReached
                      ? "Consulta de hoy usada"
                      : dashboardAiTone === "managerial"
                        ? "Ver informe de patrones"
                        : "Hablar con mi asesor de patrones"}
                </Text>
              </View>
            </TouchableOpacity>
            {dashboardAiPatternsMutation.isPending && !dashboardAiPatternsReply ? <AiResponseSkeleton /> : null}
            {dashboardAiPatternsReply ? (
              <View style={subStyles.aiSummaryResponseCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={subStyles.aiSummaryResponseGradientBar}
                />
                <View style={subStyles.aiSummaryResponseAiTag}>
                  <Sparkles size={11} color={GEMINI_BRAND.teal} />
                  <View style={subStyles.aiSummaryGeminiDotsRow}>
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal, width: 5, height: 5 }]} />
                  </View>
                  <Text style={subStyles.aiSummaryResponseLabel}>
                    {dashboardAiTone === "managerial" ? "Gemini · Patrones gerenciales" : "Gemini · Patrones en modo asesor"}
                  </Text>
                </View>
                {dashboardAiPatternsResolvedTerms.length > 0 ? (
                  <Text style={subStyles.aiSummaryGlossaryHint}>
                    Toca las palabras resaltadas para ver su explicación.
                  </Text>
                ) : null}
                <Text style={subStyles.aiSummaryResponseText}>
                  {dashboardAiPatternsTextParts.map((part, index) => (
                    part.type === "term" ? (
                      <Text
                        key={`${part.term.term}-patterns-${index}`}
                        style={subStyles.aiSummaryResponseTerm}
                        onPress={() => setActiveDashboardAiTerm(part.term)}
                      >
                        {part.value}
                      </Text>
                    ) : (
                      <Text key={`patterns-text-${index}`}>{part.value}</Text>
                    )
                  ))}
                </Text>
              </View>
            ) : (
              <Text style={subStyles.aiSummaryHint}>
                {dashboardAiPatternsLimitReached
                  ? "Ya usaste tu explicación de IA de hoy en este módulo. Podrás pedir otra mañana."
                  : "Gemini toma tus hábitos, variaciones y anomalías recientes para explicarte qué patrones ya importan en tus finanzas."}
              </Text>
            )}
            <View style={subStyles.aiSummaryFooterRow}>
              <Text style={subStyles.aiSummaryFooterText}>La explicación usa solo los patrones detectados por DarkMoney dentro de esta pestaña.</Text>
            </View>
          </View>
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
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }}
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
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }}
        categoryMap={categoryMap}
        accountMap={accountMap}
        onExplainPress={() => setAdvancedDetail("review")}
        onOpenMovement={(movementId) => openAnomalyMovementsPreview([movementId], "Movimiento fuera de costumbre")}
        onOpenAll={(movementIds) => openAnomalyMovementsPreview(movementIds)}
        router={router}
      />

      </>
      </DashboardSectionBoundary>
      )}

      {activeTab === 'Flujo' && (
        <DashboardSectionBoundary sectionLabel="Flujo">
        <>
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
      <Card>
        <View style={subStyles.aiSummaryShellWrap}>
          <LinearGradient
            colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={subStyles.aiSummaryGradientBorder}
            pointerEvents="none"
          />
          <View style={subStyles.aiSummaryShell}>
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowBlue,
                { transform: [{ scale: dashboardAiHaloScale }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowCoral,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowGold,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: Animated.multiply(dashboardAiOrbShift, -0.6) }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowTeal,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View style={[subStyles.aiSummaryBadgeRow, { transform: [{ translateY: dashboardAiBadgeTranslateY }] }]}>
              <View style={subStyles.aiSummaryGeminiBadge}>
                <Sparkles size={12} color={GEMINI_BRAND.teal} />
                <View style={subStyles.aiSummaryGeminiDotsRow}>
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal }]} />
                </View>
                <Text style={subStyles.aiSummaryGeminiBadgeText}>Impulsado por Gemini AI</Text>
              </View>
              <Text style={subStyles.aiSummaryGeminiKicker}>Interpreta tu caja, compromisos y proyección para que entiendas cómo viene el flujo.</Text>
            </Animated.View>
            <View style={subStyles.aiSummaryHeader}>
              <View style={subStyles.aiSummaryHeaderText}>
                <Text style={subStyles.aiSummaryTitle}>Tu flujo explicado</Text>
                <Text style={subStyles.aiSummaryBody}>
                  Gemini toma la proyección, la agenda comprometida y la salud de caja para explicarte con claridad qué presión tiene tu flujo y qué deberías vigilar primero.
                </Text>
              </View>
              <View style={subStyles.aiSummaryOrbWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    subStyles.aiSummaryPulseHalo,
                    { opacity: dashboardAiHaloOpacity, transform: [{ scale: dashboardAiHaloScale }] },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: dashboardAiCoreScale }] }}>
                  <View style={subStyles.aiSummaryIconWrap}>
                    <View style={subStyles.aiSummaryIconRing}>
                      <Sparkles size={20} color={GEMINI_BRAND.teal} />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>
            <Text style={subStyles.aiSummarySelectorLabel}>Elige cómo quieres ver la explicación</Text>
            <View style={subStyles.aiSummaryToneRow}>
              {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
                const active = option.id === dashboardAiTone;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    style={[subStyles.aiSummaryToneChip, active && subStyles.aiSummaryToneChipActive]}
                    onPress={() => {
                      setDashboardAiTone(option.id);
                      setActiveDashboardAiTerm(null);
                    }}
                  >
                    <Text style={[subStyles.aiSummaryToneChipTitle, active && subStyles.aiSummaryToneChipTitleActive]}>
                      {option.label}
                    </Text>
                    <Text style={[subStyles.aiSummaryToneChipBody, active && subStyles.aiSummaryToneChipBodyActive]}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => void handleRequestDashboardAiFlow()}
              disabled={dashboardAiFlowMutation.isPending || dashboardAiFlowLimitReached}
              style={[
                subStyles.aiSummaryButton,
                (dashboardAiFlowMutation.isPending || dashboardAiFlowLimitReached) && subStyles.aiSummaryButtonDisabled,
              ]}
            >
              <View style={subStyles.aiSummaryButtonAccent} />
              <View style={subStyles.aiSummaryButtonInner}>
                <Sparkles size={16} color={dashboardAiFlowMutation.isPending || dashboardAiFlowLimitReached ? "rgba(255,255,255,0.4)" : GEMINI_BRAND.teal} />
                <Text style={subStyles.aiSummaryButtonLabel}>
                  {dashboardAiFlowMutation.isPending
                    ? "Preparando explicacion..."
                    : dashboardAiFlowLimitReached
                      ? "Consulta de hoy usada"
                      : dashboardAiTone === "managerial"
                        ? "Ver informe de flujo"
                        : "Hablar con mi asesor de flujo"}
                </Text>
              </View>
            </TouchableOpacity>
            {dashboardAiFlowMutation.isPending && !dashboardAiFlowReply ? <AiResponseSkeleton /> : null}
            {dashboardAiFlowReply ? (
              <View style={subStyles.aiSummaryResponseCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={subStyles.aiSummaryResponseGradientBar}
                />
                <View style={subStyles.aiSummaryResponseAiTag}>
                  <Sparkles size={11} color={GEMINI_BRAND.teal} />
                  <View style={subStyles.aiSummaryGeminiDotsRow}>
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal, width: 5, height: 5 }]} />
                  </View>
                  <Text style={subStyles.aiSummaryResponseLabel}>
                    {dashboardAiTone === "managerial" ? "Gemini · Flujo gerencial" : "Gemini · Flujo en modo asesor"}
                  </Text>
                </View>
                {dashboardAiFlowResolvedTerms.length > 0 ? (
                  <Text style={subStyles.aiSummaryGlossaryHint}>
                    Toca las palabras resaltadas para ver su explicación.
                  </Text>
                ) : null}
                <Text style={subStyles.aiSummaryResponseText}>
                  {dashboardAiFlowTextParts.map((part, index) => (
                    part.type === "term" ? (
                      <Text
                        key={`${part.term.term}-flow-${index}`}
                        style={subStyles.aiSummaryResponseTerm}
                        onPress={() => setActiveDashboardAiTerm(part.term)}
                      >
                        {part.value}
                      </Text>
                    ) : (
                      <Text key={`flow-text-${index}`}>{part.value}</Text>
                    )
                  ))}
                </Text>
              </View>
            ) : (
              <Text style={subStyles.aiSummaryHint}>
                {dashboardAiFlowLimitReached
                  ? "Ya usaste tu explicación de IA de hoy en este módulo. Podrás pedir otra mañana."
                  : "Gemini interpreta tu caja, tus compromisos y la proyección actual para explicarte el flujo con lenguaje claro."}
              </Text>
            )}
            <View style={subStyles.aiSummaryFooterRow}>
              <Text style={subStyles.aiSummaryFooterText}>La explicación usa solo la información de flujo visible en esta pestaña.</Text>
            </View>
          </View>
        </View>
      </Card>
      <View style={{ height: SPACING.sm }} />
      <FutureFlowPreview
        obligations={obligations}
        subscriptions={subscriptions}
        recurringIncome={recurringIncome}
        displayCurrency={activeCurrency}
        baseCurrency={baseCurrency}
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
        liquidMoney={healthInputs.liquidMoney}
        averageMonthlyExpense={healthInputs.averageMonthlyExpense}
        periodIncome={healthInputs.periodIncome}
        periodNet={healthInputs.periodNet}
        totalPayable={healthInputs.totalPayable}
        overdueCount={healthInputs.overdueCount}
      />
      <View style={{ height: SPACING.sm }} />
      <SubscriptionsSummary subscriptions={subscriptionsForSummary} currency={activeCurrency} />
      <View style={{ height: SPACING.sm }} />
      <ObligationWatch obligations={obligations} router={router} />
      <View style={{ height: SPACING.sm }} />
      <TransferSnapshot
        movements={movements}
        accounts={activeAccounts}
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }}
        onOpenRoute={openTransferRoutePreview}
      />

      </>
      </DashboardSectionBoundary>
      )}

      {activeTab === 'Historial' && (
        <DashboardSectionBoundary sectionLabel="Historial">
        <>
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
      <View style={{ height: SPACING.sm }} />
      <Card>
        <View style={subStyles.aiSummaryShellWrap}>
          <LinearGradient
            colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={subStyles.aiSummaryGradientBorder}
            pointerEvents="none"
          />
          <View style={subStyles.aiSummaryShell}>
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowBlue,
                { transform: [{ scale: dashboardAiHaloScale }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowCoral,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowGold,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: Animated.multiply(dashboardAiOrbShift, -0.6) }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowTeal,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View style={[subStyles.aiSummaryBadgeRow, { transform: [{ translateY: dashboardAiBadgeTranslateY }] }]}>
              <View style={subStyles.aiSummaryGeminiBadge}>
                <Sparkles size={12} color={GEMINI_BRAND.teal} />
                <View style={subStyles.aiSummaryGeminiDotsRow}>
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal }]} />
                </View>
                <Text style={subStyles.aiSummaryGeminiBadgeText}>Impulsado por Gemini AI</Text>
              </View>
              <Text style={subStyles.aiSummaryGeminiKicker}>Interpreta tu evolución en el tiempo para explicarte qué cambió, qué se repite y qué merece vigilarse.</Text>
            </Animated.View>
            <View style={subStyles.aiSummaryHeader}>
              <View style={subStyles.aiSummaryHeaderText}>
                <Text style={subStyles.aiSummaryTitle}>Tu historial explicado</Text>
                <Text style={subStyles.aiSummaryBody}>
                  Gemini toma el año seleccionado, los cambios detectados y las métricas históricas para explicarte cómo viene evolucionando tu dinero y qué lectura merece más atención.
                </Text>
              </View>
              <View style={subStyles.aiSummaryOrbWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    subStyles.aiSummaryPulseHalo,
                    { opacity: dashboardAiHaloOpacity, transform: [{ scale: dashboardAiHaloScale }] },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: dashboardAiCoreScale }] }}>
                  <View style={subStyles.aiSummaryIconWrap}>
                    <View style={subStyles.aiSummaryIconRing}>
                      <Sparkles size={20} color={GEMINI_BRAND.teal} />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>
            <Text style={subStyles.aiSummarySelectorLabel}>Elige cómo quieres ver la explicación</Text>
            <View style={subStyles.aiSummaryToneRow}>
              {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
                const active = option.id === dashboardAiTone;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    style={[subStyles.aiSummaryToneChip, active && subStyles.aiSummaryToneChipActive]}
                    onPress={() => {
                      setDashboardAiTone(option.id);
                      setActiveDashboardAiTerm(null);
                    }}
                  >
                    <Text style={[subStyles.aiSummaryToneChipTitle, active && subStyles.aiSummaryToneChipTitleActive]}>
                      {option.label}
                    </Text>
                    <Text style={[subStyles.aiSummaryToneChipBody, active && subStyles.aiSummaryToneChipBodyActive]}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => void handleRequestDashboardAiHistory()}
              disabled={dashboardAiHistoryMutation.isPending || dashboardAiHistoryLimitReached}
              style={[
                subStyles.aiSummaryButton,
                (dashboardAiHistoryMutation.isPending || dashboardAiHistoryLimitReached) && subStyles.aiSummaryButtonDisabled,
              ]}
            >
              <View style={subStyles.aiSummaryButtonAccent} />
              <View style={subStyles.aiSummaryButtonInner}>
                <Sparkles size={16} color={dashboardAiHistoryMutation.isPending || dashboardAiHistoryLimitReached ? "rgba(255,255,255,0.4)" : GEMINI_BRAND.teal} />
                <Text style={subStyles.aiSummaryButtonLabel}>
                  {dashboardAiHistoryMutation.isPending
                    ? "Preparando explicacion..."
                    : dashboardAiHistoryLimitReached
                      ? "Consulta de hoy usada"
                      : dashboardAiTone === "managerial"
                        ? "Ver informe histórico"
                        : "Hablar con mi asesor histórico"}
                </Text>
              </View>
            </TouchableOpacity>
            {dashboardAiHistoryMutation.isPending && !dashboardAiHistoryReply ? <AiResponseSkeleton /> : null}
            {dashboardAiHistoryReply ? (
              <View style={subStyles.aiSummaryResponseCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={subStyles.aiSummaryResponseGradientBar}
                />
                <View style={subStyles.aiSummaryResponseAiTag}>
                  <Sparkles size={11} color={GEMINI_BRAND.teal} />
                  <View style={subStyles.aiSummaryGeminiDotsRow}>
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal, width: 5, height: 5 }]} />
                  </View>
                  <Text style={subStyles.aiSummaryResponseLabel}>
                    {dashboardAiTone === "managerial" ? "Gemini · Historial gerencial" : "Gemini · Historial en modo asesor"}
                  </Text>
                </View>
                {dashboardAiHistoryResolvedTerms.length > 0 ? (
                  <Text style={subStyles.aiSummaryGlossaryHint}>
                    Toca las palabras resaltadas para ver su explicación.
                  </Text>
                ) : null}
                <Text style={subStyles.aiSummaryResponseText}>
                  {dashboardAiHistoryTextParts.map((part, index) => (
                    part.type === "term" ? (
                      <Text
                        key={`${part.term.term}-history-${index}`}
                        style={subStyles.aiSummaryResponseTerm}
                        onPress={() => setActiveDashboardAiTerm(part.term)}
                      >
                        {part.value}
                      </Text>
                    ) : (
                      <Text key={`history-text-${index}`}>{part.value}</Text>
                    )
                  ))}
                </Text>
              </View>
            ) : (
              <Text style={subStyles.aiSummaryHint}>
                {dashboardAiHistoryLimitReached
                  ? "Ya usaste tu explicación de IA de hoy en este módulo. Podrás pedir otra mañana."
                  : "Gemini usa los meses del año seleccionado, los cambios de comportamiento y las métricas históricas para contarte cómo ha evolucionado tu situación."}
              </Text>
            )}
            <View style={subStyles.aiSummaryFooterRow}>
              <Text style={subStyles.aiSummaryFooterText}>La explicación usa solo las señales históricas visibles dentro de esta pestaña.</Text>
            </View>
          </View>
        </View>
      </Card>
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

      </>
      </DashboardSectionBoundary>
      )}

      {activeTab === 'Salud' && (
        <DashboardSectionBoundary sectionLabel="Salud">
        <>
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
        <View style={subStyles.aiSummaryShellWrap}>
          <LinearGradient
            colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={subStyles.aiSummaryGradientBorder}
            pointerEvents="none"
          />
          <View style={subStyles.aiSummaryShell}>
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowBlue,
                { transform: [{ scale: dashboardAiHaloScale }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowCoral,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowGold,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: Animated.multiply(dashboardAiOrbShift, -0.6) }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                subStyles.aiSummaryAmbientGlow,
                subStyles.aiSummaryAmbientGlowTeal,
                { transform: [{ scale: dashboardAiHaloScale }, { translateY: dashboardAiOrbShift }] },
              ]}
            />
            <Animated.View style={[subStyles.aiSummaryBadgeRow, { transform: [{ translateY: dashboardAiBadgeTranslateY }] }]}>
              <View style={subStyles.aiSummaryGeminiBadge}>
                <Sparkles size={12} color={GEMINI_BRAND.teal} />
                <View style={subStyles.aiSummaryGeminiDotsRow}>
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold }]} />
                  <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal }]} />
                </View>
                <Text style={subStyles.aiSummaryGeminiBadgeText}>Impulsado por Gemini AI</Text>
              </View>
              <Text style={subStyles.aiSummaryGeminiKicker}>Interpreta tu limpieza operativa, la calidad del dato y los puntos que hoy bajan la precisión del sistema.</Text>
            </Animated.View>
            <View style={subStyles.aiSummaryHeader}>
              <View style={subStyles.aiSummaryHeaderText}>
                <Text style={subStyles.aiSummaryTitle}>Tu salud financiera explicada</Text>
                <Text style={subStyles.aiSummaryBody}>
                  Gemini toma los pendientes, las sugerencias y la calidad actual del dashboard para explicarte qué está frenando la precisión y qué conviene ordenar primero.
                </Text>
              </View>
              <View style={subStyles.aiSummaryOrbWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    subStyles.aiSummaryPulseHalo,
                    { opacity: dashboardAiHaloOpacity, transform: [{ scale: dashboardAiHaloScale }] },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: dashboardAiCoreScale }] }}>
                  <View style={subStyles.aiSummaryIconWrap}>
                    <View style={subStyles.aiSummaryIconRing}>
                      <Sparkles size={20} color={GEMINI_BRAND.teal} />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>
            <Text style={subStyles.aiSummarySelectorLabel}>Elige cómo quieres ver la explicación</Text>
            <View style={subStyles.aiSummaryToneRow}>
              {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
                const active = option.id === dashboardAiTone;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    style={[subStyles.aiSummaryToneChip, active && subStyles.aiSummaryToneChipActive]}
                    onPress={() => {
                      setDashboardAiTone(option.id);
                      setActiveDashboardAiTerm(null);
                    }}
                  >
                    <Text style={[subStyles.aiSummaryToneChipTitle, active && subStyles.aiSummaryToneChipTitleActive]}>
                      {option.label}
                    </Text>
                    <Text style={[subStyles.aiSummaryToneChipBody, active && subStyles.aiSummaryToneChipBodyActive]}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => void handleRequestDashboardAiHealth()}
              disabled={dashboardAiHealthMutation.isPending || dashboardAiHealthLimitReached}
              style={[
                subStyles.aiSummaryButton,
                (dashboardAiHealthMutation.isPending || dashboardAiHealthLimitReached) && subStyles.aiSummaryButtonDisabled,
              ]}
            >
              <View style={subStyles.aiSummaryButtonAccent} />
              <View style={subStyles.aiSummaryButtonInner}>
                <Sparkles size={16} color={dashboardAiHealthMutation.isPending || dashboardAiHealthLimitReached ? "rgba(255,255,255,0.4)" : GEMINI_BRAND.teal} />
                <Text style={subStyles.aiSummaryButtonLabel}>
                  {dashboardAiHealthMutation.isPending
                    ? "Preparando explicacion..."
                    : dashboardAiHealthLimitReached
                      ? "Consulta de hoy usada"
                      : dashboardAiTone === "managerial"
                        ? "Ver informe de salud"
                        : "Hablar con mi asesor de salud"}
                </Text>
              </View>
            </TouchableOpacity>
            {dashboardAiHealthMutation.isPending && !dashboardAiHealthReply ? <AiResponseSkeleton /> : null}
            {dashboardAiHealthReply ? (
              <View style={subStyles.aiSummaryResponseCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[GEMINI_BRAND.blue, GEMINI_BRAND.coral, GEMINI_BRAND.gold, GEMINI_BRAND.teal]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={subStyles.aiSummaryResponseGradientBar}
                />
                <View style={subStyles.aiSummaryResponseAiTag}>
                  <Sparkles size={11} color={GEMINI_BRAND.teal} />
                  <View style={subStyles.aiSummaryGeminiDotsRow}>
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.blue, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.coral, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.gold, width: 5, height: 5 }]} />
                    <View style={[subStyles.aiSummaryGeminiDot, { backgroundColor: GEMINI_BRAND.teal, width: 5, height: 5 }]} />
                  </View>
                  <Text style={subStyles.aiSummaryResponseLabel}>
                    {dashboardAiTone === "managerial" ? "Gemini · Salud gerencial" : "Gemini · Salud en modo asesor"}
                  </Text>
                </View>
                {dashboardAiHealthResolvedTerms.length > 0 ? (
                  <Text style={subStyles.aiSummaryGlossaryHint}>
                    Toca las palabras resaltadas para ver su explicación.
                  </Text>
                ) : null}
                <Text style={subStyles.aiSummaryResponseText}>
                  {dashboardAiHealthTextParts.map((part, index) => (
                    part.type === "term" ? (
                      <Text
                        key={`${part.term.term}-health-${index}`}
                        style={subStyles.aiSummaryResponseTerm}
                        onPress={() => setActiveDashboardAiTerm(part.term)}
                      >
                        {part.value}
                      </Text>
                    ) : (
                      <Text key={`health-text-${index}`}>{part.value}</Text>
                    )
                  ))}
                </Text>
              </View>
            ) : (
              <Text style={subStyles.aiSummaryHint}>
                {dashboardAiHealthLimitReached
                  ? "Ya usaste tu explicación de IA de hoy en este módulo. Podrás pedir otra mañana."
                  : "Gemini interpreta tus pendientes, la calidad del dato y las sugerencias activas para explicarte qué está afectando hoy la salud del sistema."}
              </Text>
            )}
            <View style={subStyles.aiSummaryFooterRow}>
              <Text style={subStyles.aiSummaryFooterText}>La explicación usa solo las señales de limpieza y calidad visibles en esta pestaña.</Text>
            </View>
          </View>
        </View>
      </Card>

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
      </>
      </DashboardSectionBoundary>
      )}
    </>
  );
}

