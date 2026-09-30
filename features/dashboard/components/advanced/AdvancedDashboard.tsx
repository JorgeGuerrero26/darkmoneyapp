import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { obligationViewerDirection } from "../../../../lib/obligation-viewer-labels";
import {
  Animated,
  Easing,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { useRouter } from "expo-router";
import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDays,
  differenceInDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  parseISO,
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
  type LucideIcon,
} from "lucide-react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
import { useUiStore } from "../../../../store/ui-store";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../../../lib/movement-display";
import { parseDisplayDate } from "../../../../lib/date";
import { displayCategoryName } from "../../../../lib/category-display-name";
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
  useProjectionHistoryQuery,
  projectionHistoryStart,
  usePersistDashboardAnalyticsMutation,
  usePersistLearningFeedbackMutation,
  useUpdateMovementMutation,
  type DashboardAnalyticsBundle,
  type DashboardMovementRow,
} from "../../../../services/queries/workspace-data";
import { useToast } from "../../../../hooks/useToast";
import { useAfterFirstPaint } from "../../../../hooks/useAfterFirstPaint";

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
  windowsFromFlowItems,
  buildReviewInboxSnapshot,
  convertDashboardCurrency,
  getWeekCoverageStatus,
  type FutureFlowItem,
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
import { SystemStateSheet } from "./SystemStateSheet";
import { WeekOutlookSheet } from "./WeekOutlookSheet";
import { MonthEndSheet } from "./MonthEndSheet";
import { PatternsTab } from "./PatternsTab";
import { FlowTab } from "./FlowTab";
import { HistoryTab } from "./HistoryTab";
import { HistoryMonthSheet } from "./HistoryMonthSheet";
import {
  buildDashboardAiTextParts,
  ensureDashboardAiComplexTerms,
  type DashboardAiComplexTerm,
  type DashboardAiDailyCache,
  type DashboardAiTone,
  type DashboardAiToneResponse,
} from "../../lib/dashboard-ai-content";
import { useDashboardStats } from "../../hooks/useDashboardStats";
import { buildSystemState } from "../../lib/system-state";
import { expenseTitle, habitPresentation, weeklySpendPattern } from "../../lib/patterns-view";
import { isHistoryBalanceCorrection, periodSavingsRate } from "../../lib/history-view";

import { SectionTitle } from "../simple/SectionTitle";
import { useCashflowProjection, type CashflowProjectionInputs } from "../../hooks/useCashflowProjection";
import { isLiquidAccount } from "../../../projection/lib/liquid-balance";
import type { ProjectionLine } from "../../../projection/lib/cashflow-calendar";
import { projectionFlowItems } from "../../lib/projectionFlowItems";
import { ReviewInbox } from "../simple/ReviewInbox";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

import {
  ExplanationActions,
  ExplanationIntro,
  ExplanationResult,
  ExplanationSection,
  ExplanationVisualSummary,
} from "./ExplanationCard";
import { ProCommandCenter } from "./ProCommandCenter";
import {
  CategoryBreakdown,
  ObligationsSection,
} from "./AdvancedSections";
import {
  AlertCenter,
  HealthScore,
} from "./HealthAndAlerts";
import {
  AdvancedGiftCard,
  CurrencyExposure,
  FinancialGraphCard,
  PeriodRadar,
} from "./AdvancedCards";
import {
  type AnnualHistoryMonth,
} from "./DashboardCharts";
import { DashboardTabBar, type AdvancedTab } from "./DashboardTabBar";

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
  workspaceId,
  userId,
  userEmail,
  showAdvancedGift,
  analytics,
  router,
  shortcuts,
  accountCurrencyMap,
  onRequestPrecisionFocus,
  onScrollToTop,
}: {
  movements: DashboardMovementRow[];
  // `paymentPlan`, `principalAmount` y las cadencias las pide la proyección mes a mes: sin el
  // cronograma solo puede repartir el saldo a ojo, que es justo lo que no debe hacer.
  obligations: Array<{ id: number; title: string; direction: string; pendingAmount: number; principalAmount?: number; currentPrincipalAmount?: number | null; paymentPlan?: unknown; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string; lastPaymentDate?: string | null; startDate?: string; counterparty: string }>;
  subscriptions: Array<{ id: number; name: string; amount: number; currencyCode: string; nextDueDate: string; endDate?: string | null; accountId?: number | null; status: string; frequency: string; intervalCount: number }>;
  recurringIncome: Array<{ id: number; name: string; amount: number; currencyCode: string; nextExpectedDate: string; endDate?: string | null; frequency?: string; intervalCount?: number | null; status: string }>;
  snapshot: any;
  // `type` y `paymentDay` los pide la proyeccion: arranca del saldo liquido, no del patrimonio
  // neto, y una tarjeta se paga en un mes distinto al que se gasta.
  activeAccounts: { id: number; name: string; type?: string | null; paymentDay?: number | null; currentBalance: number; currentBalanceInBaseCurrency?: number | null; currencyCode: string; includeInNetWorth: boolean; isArchived: boolean }[];
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
  /** Los atajos de un toque. Se pintan como primer bloque de Resumen; ver el comentario allí. */
  shortcuts?: React.ReactNode;
  accountCurrencyMap: Map<number, string>;
  onRequestPrecisionFocus?: () => void;
  onScrollToTop?: () => void;
}) {
  const privacyMode = useUiStore((state) => state.privacyMode);

  /*
   * La proyección, UNA vez, para Resumen y para Flujo.
   *
   * "Fin de mes" tenía su propio cálculo y daba otro cierre que la pestaña Flujo; además no
   * contaba ninguna cuota (miraba solo la fecha final de cada deuda). Ahora las dos pantallas
   * leen esto, así que el cierre de este mes es el mismo número en las dos.
   */
  // Seis meses terminados para el gasto típico: con los 90 días de la query base la mediana
  // salía de dos meses, que es su promedio, y no descartaba nada.
  const projectionHistoryQuery = useProjectionHistoryQuery(workspaceId, userId);
  const projectionHistory = projectionHistoryQuery.data;
  const projectionInputs = useMemo<CashflowProjectionInputs>(() => ({
    movements,
    historyMovements: projectionHistory,
    historyCoveredFrom: projectionHistory ? projectionHistoryStart() : null,
    obligations: obligations.map((obligation) => ({
      ...obligation,
      principalAmount: obligation.principalAmount ?? obligation.pendingAmount,
      startDate: obligation.startDate ?? "",
    })),
    subscriptions,
    recurringIncome: recurringIncome.map((income) => ({
      ...income,
      // Un ingreso fijo sin cadencia declarada es mensual: es lo que son casi todos.
      frequency: income.frequency ?? "monthly",
    })),
    displayCurrency: activeCurrency,
    baseCurrency,
    exchangeRateMap,
    accountCurrencyMap,
    accounts: activeAccounts,
  }), [movements, projectionHistory, obligations, subscriptions, recurringIncome, activeCurrency, baseCurrency, exchangeRateMap, accountCurrencyMap, activeAccounts]);
  const { projection: monthCalendar, liquid: liquidToday, typicalSpend: monthTypicalSpend } = useCashflowProjection(projectionInputs, 2);

  /*
   * "Cuánta plata tengo" en todo el dashboard avanzado es el saldo LÍQUIDO, con la misma
   * definición que la proyección. Antes era el patrimonio neto: sumaba la cuenta de inversión y
   * restaba el saldo de la tarjeta, así que el cierre de mes, la cobertura de la semana y los
   * días de colchón partían de plata que no se puede gastar.
   */
  const currentVisibleBalance = liquidToday.total;
  const liquidAccounts = useMemo(
    () => activeAccounts.filter((account) => !account.isArchived && isLiquidAccount(account.type)),
    [activeAccounts],
  );
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
  // El userId va explícito porque forma parte de la queryKey: sin él la query se ejecutaba con
  // la clave del `null` y al resolver la sesión arrancaba otra desde cero (ver el test de
  // convención query-key-enabled-consistency).
  const yearMovementsQuery = useDashboardYearMovementsQuery(workspaceId, selectedHistoryYear, userId);
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
      const monthMovements = isFuture ? [] : historyMovements.filter((movement) => !isHistoryBalanceCorrection(movement) && inRange(movement, monthStart, cappedEnd));
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
  /*
   * "Esta semana" y las ventanas de 7/15/30 días salen de las líneas del motor, igual que Fin de
   * mes y la Proyección. Antes usaban la lectura vieja, que solo miraba la fecha FINAL de cada
   * deuda: ninguna cuota entraba y la semana no veía el cobro atrasado de Kevin.
   */
  const { windows, weekItems } = useMemo(() => {
    const now = new Date();
    const items = projectionFlowItems(monthCalendar.months, now);
    return {
      windows: windowsFromFlowItems(items, currentVisibleBalance, now),
      weekItems: items.filter((item) => item.date <= addDays(now, 7)),
    };
  }, [monthCalendar, currentVisibleBalance]);
  const weekWindow = windows[0];
  const pressureStatus = getWeekCoverageStatus(weekItems, currentVisibleBalance);

  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements.filter((movement) => inRange(movement, start, now) && isIncome(movement)).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const expense = movements.filter((movement) => inRange(movement, start, now) && isExpense(movement)).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    return { income, expense, net: income - expense, daysElapsed: Math.max(1, differenceInDays(now, start) + 1) };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, movements]);

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
    const color = days >= 90 ? COLORS.income : days >= 30 ? COLORS.storm : COLORS.expense;
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
    for (const category of snapshot?.categories ?? []) map.set(category.id, displayCategoryName(category.name));
    return map;
  }, [snapshot?.categories]);

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const account of snapshot?.accounts ?? []) map.set(account.id, account.name);
    return map;
  }, [snapshot?.accounts]);
  const patternMovementMap = useMemo(() => new Map(movements.map((movement) => [movement.id, movement])), [movements]);

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
        for (const movement of historyMovements.filter((item) => !isHistoryBalanceCorrection(item) && isExpense(item) && inRange(item, monthStart, cappedEnd))) {
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
    const yearMovements = historyMovements.filter((movement) => movement.status === "posted" && !isHistoryBalanceCorrection(movement) && inRange(movement, yearStart, yearEnd));
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
    const monthIndex = annualHistory.findIndex((item) => item.dateFrom === selectedAnnualMonth.dateFrom);
    const month = monthIndex >= 0 ? annualHistory[monthIndex] : selectedAnnualMonth;
    const from = startOfDay(parseDisplayDate(month.dateFrom));
    const to = endOfDay(parseDisplayDate(month.dateTo));
    const monthMovements = historyMovements.filter((movement) => movement.status === "posted" && inRange(movement, from, to));
    const cashflowMovements = monthMovements.filter((movement) => !isHistoryBalanceCorrection(movement));
    const correctionMovements = monthMovements.filter(isHistoryBalanceCorrection);
    const ctx = { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency };
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
          correction: isHistoryBalanceCorrection(movement),
          expenseShare: !income && !isHistoryBalanceCorrection(movement) && month.expense > 0 ? amount / month.expense * 100 : null,
          date: format(new Date(movement.occurredAt), "d MMM", { locale: es }),
          accountName: accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta",
        };
      })
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 4);

    const savingsRate = month.income > 0 ? (month.net / month.income) * 100 : null;
    const prevMonth = monthIndex > 0 ? annualHistory[monthIndex - 1] : null;
    return {
      month,
      incomeCount: cashflowMovements.filter(isIncome).length,
      expenseCount: cashflowMovements.filter(isExpense).length,
      totalCount: monthMovements.length,
      correctionIds: correctionMovements.map((movement) => movement.id),
      largestMovements: relevantMovements,
      savingsRate,
      prevMonth,
    };
  }, [accountCurrencyMap, accountMap, activeCurrency, annualHistory, baseCurrency, exchangeRateMap, historyMovements, selectedAnnualMonth]);

  // Esta query cubre seis meses completos; la lista base de 90 días dejaba abril-junio vacíos.
  const recentHistoryMovements = useMemo(() => {
    const byId = new Map<number, DashboardMovementRow>();
    for (const movement of projectionHistory ?? []) byId.set(movement.id, movement);
    for (const movement of movements) byId.set(movement.id, movement);
    return [...byId.values()];
  }, [movements, projectionHistory]);

  const monthlySavingsRate = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 7 }, (_, i) => {
      const mDate = subMonths(now, 6 - i);
      const mStart = startOfMonth(mDate);
      const mEnd = i === 6 ? now : endOfMonth(mDate);
      const mMvs = recentHistoryMovements.filter((m) => !isHistoryBalanceCorrection(m) && inRange(m, mStart, mEnd));
      const inc = mMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
      const exp = mMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
      const rate = inc > 0 ? ((inc - exp) / inc) * 100 : null;
      return { label: format(mDate, "MMM", { locale: es }), income: inc, expense: exp, rate };
    });
    // Ahorro del período / ingresos del período: pondera los meses por dinero real y evita que
    // uno sin ingresos aparezca como 0% y tire el promedio hacia abajo.
    const completeMonths = months.slice(0, -1);
    const validRates = completeMonths.map((month) => month.rate).filter((rate): rate is number => rate !== null);
    const avgRate = projectionHistory ? periodSavingsRate(completeMonths) : null;
    const lastRate = months[6].rate;
    const trend = validRates.length >= 3
      ? (validRates[validRates.length - 1] - validRates[0]) > 3 ? "mejorando"
        : (validRates[validRates.length - 1] - validRates[0]) < -3 ? "empeorando"
        : "estable"
      : "insuficiente";
    const color = lastRate == null ? COLORS.storm : lastRate >= 20 ? COLORS.income : lastRate >= 0 ? COLORS.storm : COLORS.expense;
    return { months, avgRate, lastRate, trend, color };
  }, [accountCurrencyMap, activeCurrency, exchangeRateMap, projectionHistory, recentHistoryMovements]);

  // N2: Score de estabilidad de ingresos - coeficiente de variación sobre 6 meses (bajo CV = estable)
  const incomeStabilityScore = useMemo(() => {
    const incomes = monthlySavingsRate.months.slice(0, -1).map((month) => month.income);
    if (!projectionHistory || incomes.filter((income) => income > 0).length < 3) return { score: null, cvPct: null, label: "Historial insuficiente", color: COLORS.storm };
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const variance = incomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / incomes.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 1;
    const score = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));
    const cvPct = Math.round(cv * 100);
    const label = score >= 75 ? "Muy estable" : score >= 50 ? "Moderado" : "Variable";
    const color = score >= 75 ? COLORS.income : score >= 50 ? COLORS.storm : COLORS.expense;
    return { score, cvPct, label, color };
  }, [monthlySavingsRate.months, projectionHistory]);

  // N3: Índice de concentración de gasto Herfindahl-Hirschman (HHI) - diversificación entre categorías
  const categoryConcentration = useMemo(() => {
    const catTotals = advancedStats.catTotals;
    const total = Array.from(catTotals.values()).reduce((s, v) => s + v, 0);
    if (total <= 0) return { hhi: null, label: "Sin datos", color: COLORS.storm, topCategory: null, topCategoryId: null, topShare: null };
    const hhi = Array.from(catTotals.values()).reduce((s, v) => s + Math.pow(v / total, 2), 0);
    const label = hhi > 0.25 ? "Concentrado" : hhi > 0.15 ? "Moderado" : "Diversificado";
    const color = hhi > 0.25 ? COLORS.expense : hhi > 0.15 ? COLORS.storm : COLORS.income;
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
    const receivable = obligations.filter((ob) => obligationViewerDirection(ob) === "receivable");
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
    const color = rate >= 80 ? COLORS.income : rate >= 50 ? COLORS.storm : COLORS.expense;
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
    const curMvs = historyMovements.filter((m) => !isHistoryBalanceCorrection(m) && inRange(m, curStart, curEnd));
    const prevMvs = historyMovements.filter((m) => !isHistoryBalanceCorrection(m) && inRange(m, prevYearStart, prevYearEnd));
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

  const hasSeasonalHistory = useMemo(() => {
    if (selectedHistoryYear !== new Date().getFullYear() || !yearMovementsQuery.data) return false;
    const months = new Set(
      historyMovements
        .filter((movement) => movement.status === "posted" && !isHistoryBalanceCorrection(movement) && (isIncome(movement) || isExpense(movement)))
        .map((movement) => format(new Date(movement.occurredAt), "yyyy-MM")),
    );
    return Array.from({ length: 12 }, (_, index) => format(subMonths(new Date(), index), "yyyy-MM"))
      .every((monthKey) => months.has(monthKey));
  }, [historyMovements, selectedHistoryYear, yearMovementsQuery.data]);

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
    // Cuanto subiria si se resolvieran los pendientes: es la unica linea accionable que
    // contenian los ~1.400 px de "madurez del analisis" que salieron de la pantalla.
    const potentialScore = Math.round(
      Math.min(1, useful.length / 120) * 40 + Math.min(1, historyDays / 120) * 25 + 35,
    );
    return { categorizedRate, historyDays, readinessScore, potentialScore, usefulCount: useful.length };
  }, [movements]);
  const systemState = useMemo(
    () => buildSystemState(learning.readinessScore, review.totalIssues, review.uncategorizedCount),
    [learning.readinessScore, review.totalIssues, review.uncategorizedCount],
  );

  const getPatternExpense = useCallback(
    (movement: DashboardMovementRow) => expenseAmt(movement, {
      accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency,
    }),
    [accountCurrencyMap, activeCurrency, baseCurrency, exchangeRateMap],
  );
  const weeklySpend = useMemo(
    () => weeklySpendPattern(movements, (movement) => isExpense(movement) ? getPatternExpense(movement) : 0),
    [getPatternExpense, movements],
  );

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
      limit: movements.length,
    }).map((cluster) => ({
      ...cluster,
      ...habitPresentation(cluster, patternMovementMap, accountMap),
      lastLabel: format(new Date(cluster.lastAt), "d MMM", { locale: es }),
    })).sort((a, b) => b.total - a.total).slice(0, 4);
  }, [accountCurrencyMap, accountMap, activeCurrency, categoryMap, exchangeRateMap, movements, patternMovementMap]);

  const risingCategoryPatterns = useMemo(() => {
    const now = new Date();
    const currentStart = startOfDay(subDays(now, 13));
    const previousStart = startOfDay(subDays(now, 27));
    const previousEnd = endOfDay(subDays(now, 14));
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
      repeatTitle: topRepeat ? topRepeat.title : "Sin hábito repetido claro",
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
      chips.push({ icon: Tag, color: COLORS.expense, label: `${review.uncategorizedCount} sin categoría · comparativos imprecisos`, weight: "high" });
    if (review.overdueObligationsCount > 0)
      chips.push({ icon: AlertTriangle, color: COLORS.expense, label: `${review.overdueObligationsCount} vencimiento${review.overdueObligationsCount === 1 ? "" : "s"} · cartera desactualizada`, weight: "high" });
    if (pressureStatus === "Bajo presión")
      chips.push({ icon: TrendingUp, color: COLORS.expense, label: "Semana: la caja no cubre los pagos", weight: "medium" });
    if (spendingTrend.expenseTrendPct > 5)
      chips.push({ icon: TrendingUp, color: COLORS.expense, label: `Gasto acelerando +${spendingTrend.expenseTrendPct.toFixed(0)}% esta semana`, weight: "medium" });
    if (cashCushion.days < 30)
      chips.push({ icon: AlertCircle, color: COLORS.expense, label: `Caja libre: ${cashCushion.days}d solamente`, weight: "high" });
    if (chips.length === 0)
      chips.push({ icon: Sparkles, color: COLORS.income, label: "Base sana · sin fricción fuerte hoy", weight: "low" });
    return chips.slice(0, 4);
  }, [cashCushion.days, pressureStatus, review.overdueObligationsCount, review.uncategorizedCount, spendingTrend.expenseTrendPct]);

  const [executiveDetail, setExecutiveDetail] = useState<"focus" | "risk" | "month" | null>(null);
  const [advancedDetail, setAdvancedDetail] = useState<"focusCenter" | "projection" | "review" | "advancedMetrics" | "quality" | "categoryConcentration" | "savingsRate" | "incomeStability" | "seasonalComparison" | "collectionEfficiency" | null>(null);
  const [projectionDetail, setProjectionDetail] = useState<"conservative" | "expected" | "included" | null>(null);
  const [movementPreview, setMovementPreview] = useState<MovementPreviewSheetState | null>(null);
  const graphWindowStart = startOfDay(subDays(new Date(), 89)).getTime();
  const [applyingSuggestionMovementId, setApplyingSuggestionMovementId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { showToast, showErrorToast } = useToast();
  const updateMovementMutation = useUpdateMovementMutation(workspaceId);
  const persistDashboardAnalyticsMutation = usePersistDashboardAnalyticsMutation(workspaceId);
  const persistLearningFeedbackMutation = usePersistLearningFeedbackMutation(workspaceId, userId);

  const currentMonthMovements = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    return sortMovementsRecentFirst(movements.filter((movement) => inRange(movement, monthStart, now)));
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

  // iOS no presenta dos Modal a la vez: cerramos la hoja del mes antes de abrir la lista.
  const openHistorySheetPreview = useCallback((preview: MovementPreviewSheetState) => {
    if (selectedAnnualMonth) {
      setSelectedAnnualMonth(null);
      setTimeout(() => openMovementPreview(preview), 350);
      return;
    }
    openMovementPreview(preview);
  }, [openMovementPreview, selectedAnnualMonth]);

  /**
   * Los sin categoría abren la bandeja, no una vista previa.
   *
   * La hoja los enseñaba en fila y para arreglar cada uno había que salir de ella, abrir el
   * movimiento, elegir y volver: doscientas veces. La bandeja los agrupa por lo que son —"Moto"
   * veintitrés veces— y los resuelve de grupo en grupo, con la categoría ya propuesta.
   */
  const openSummaryUncategorizedPreview = useCallback(() => {
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setMovementPreview(null);
    router.push("/categorize" as never);
  }, [router]);

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

  const openPatternHabitPreview = useCallback((pattern: { title: string; count: number; total: number; average: number; movementIds: number[] }) => {
    const patternMovements = getMovementsByIds(pattern.movementIds);
    openMovementPreview({
      title: pattern.title,
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

  const openRemainingCategoriesPreview = useCallback((categoryIds: Array<number | null>) => {
    const selected = new Set(categoryIds);
    const categoryMovements = sortMovementsRecentFirst(movements.filter((movement) =>
      isExpense(movement) &&
      inRange(movement, advancedStats.curStart, advancedStats.curEnd) &&
      selected.has(movement.categoryId ?? null),
    ));
    const total = categoryMovements.reduce((sum, movement) => sum + expenseAmt(movement, {
      accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency,
    }), 0);
    openMovementPreview({
      title: categoryIds.length === 1 ? "1 categoría más" : `${categoryIds.length} categorías más`,
      subtitle: `${categoryMovements.length} gastos del mes suman ${formatCurrency(total, activeCurrency)}.`,
      scopeLabel: `Alcance: ${format(advancedStats.curStart, "d MMM", { locale: es })} - ${format(advancedStats.curEnd, "d MMM yyyy", { locale: es })}.`,
      movements: categoryMovements,
    });
  }, [accountCurrencyMap, activeCurrency, advancedStats.curEnd, advancedStats.curStart, baseCurrency, exchangeRateMap, movements, openMovementPreview]);

  const openFinancialGraphNodePreview = useCallback((node: FinancialGraphRankNode) => {
    const nodeMovements = sortMovementsRecentFirst(
      movements.filter((movement) => {
        if (movement.status !== "posted" || new Date(movement.occurredAt).getTime() < graphWindowStart) return false;
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
    openMovementPreview({
      title: node.label,
      subtitle: `${nodeMovements.length} movimiento${nodeMovements.length === 1 ? "" : "s"} · últimos 90 días`,
      scopeLabel: "Alcance: movimientos confirmados de los últimos 90 días cargados por el dashboard avanzado.",
      variant: "graph",
      graphAccountId: node.kind === "account" ? node.entityId : null,
      emptyTitle: "No encontramos movimientos para este nodo",
      emptyBody: "Puede pasar si la lista se actualizó después de calcular el grafo.",
      movements: nodeMovements,
    });
  }, [
    graphWindowStart,
    movements,
    openMovementPreview,
  ]);

  const openWeeklyDayPreview = useCallback((day: {
    fullLabel: string;
    total: number;
    average: number;
    count: number;
    movements: DashboardMovementRow[];
  }) => {
    openMovementPreview({
      title: `Gastos de ${day.fullLabel}`,
      subtitle: `${day.count} movimiento${day.count === 1 ? "" : "s"} registrado${day.count === 1 ? "" : "s"} en ${day.fullLabel}. En total suman ${formatCurrency(day.total, activeCurrency)}; promedio por ${day.fullLabel}: ${formatCurrency(day.average, activeCurrency)}.`,
      scopeLabel: `Alcance: últimos 90 días. El promedio incluye los ${day.fullLabel} sin gastos.`,
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
      historyMovements.filter((movement) => {
        if (!inRange(movement, from, to)) return false;
        if (kind !== "all" && isHistoryBalanceCorrection(movement)) return false;
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
      .filter((movement) => !isHistoryBalanceCorrection(movement) && movementActsAsIncome(movement))
      .reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const expense = rangeMovements
      .filter((movement) => !isHistoryBalanceCorrection(movement) && movementActsAsExpense(movement))
      .reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }), 0);
    const rangeLabel = `${format(from, "d MMM", { locale: es })} - ${format(to, "d MMM yyyy", { locale: es })}`;
    const defaultTitle = kind === "income"
      ? "Ingresos del periodo"
      : kind === "expense"
        ? "Gastos del periodo"
        : "Movimientos del periodo";

    openHistorySheetPreview({
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
    historyMovements,
    openHistorySheetPreview,
  ]);

  const openAnnualMonthPreview = useCallback((month: AnnualHistoryMonth) => {
    const monthName = format(parseDisplayDate(month.dateFrom), "MMMM yyyy", { locale: es });
    openHistoryRangePreview(month.dateFrom, month.dateTo, {
      title: `Movimientos de ${monthName}`,
    });
  }, [openHistoryRangePreview]);

  const openAnnualCorrectionsPreview = useCallback((ids: number[]) => {
    const idSet = new Set(ids);
    openHistorySheetPreview({
      title: "Correcciones de saldo",
      subtitle: `${ids.length} correcciones que no cuentan como ingresos, gastos ni ahorro.`,
      scopeLabel: "Estas correcciones sí modifican el saldo de sus cuentas.",
      movements: sortMovementsRecentFirst(historyMovements.filter((movement) => idSet.has(movement.id))),
    });
  }, [historyMovements, openHistorySheetPreview]);

  const openSingleMovementPreview = useCallback((movementId: number, title = "Movimiento del historial") => {
    const movement = historyMovements.find((item) => item.id === movementId);
    openHistorySheetPreview({
      title,
      subtitle: movement
        ? "Este movimiento fue uno de los que más peso tuvo en la lectura del mes."
        : "No encontramos este movimiento en la lista actual del dashboard.",
      scopeLabel: "Alcance: selección exacta desde Historial.",
      emptyTitle: "Movimiento no disponible",
      emptyBody: "Puede pasar si los datos se actualizaron después de abrir el detalle.",
      movements: movement ? [movement] : [],
    });
  }, [historyMovements, openHistorySheetPreview]);

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

  const openHealthMovementIssuePreview = useCallback(
    (key: "uncategorized" | "pending" | "duplicates" | "no-counterparty") => {
      if (key === "uncategorized") {
        openSummaryUncategorizedPreview();
        return;
      }
      if (key === "no-counterparty") {
        openNoCounterpartyPreview();
        return;
      }
      if (key === "pending") {
        openPendingReviewPreview();
        return;
      }
      openDuplicateExpensesPreview();
    },
    [
      openDuplicateExpensesPreview,
      openNoCounterpartyPreview,
      openPendingReviewPreview,
      openSummaryUncategorizedPreview,
    ],
  );

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
      showToast("Categoría aplicada", "success", suggestion.categoryName);
    } catch (error) {
      showErrorToast("No se pudo aplicar la categoría", error);
    } finally {
      setApplyingSuggestionMovementId(null);
    }
  }, [movementPreview?.movements, movementPreview?.suggestion, persistDashboardAnalyticsMutation, persistLearningFeedbackMutation, queryClient, showToast, updateMovementMutation]);

  const openPrecisionLayer = useCallback(() => {
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setActiveTab('Salud');
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

  const { projectionModel: legacyProjectionModel, projectionAsOf } = useMemo(() => {
    const now = new Date();
    return { projectionAsOf: now, projectionModel: buildMonthProjectionModel(
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
      now,
    ) };
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

  /*
   * Los números de "Fin de mes" son los del primer mes de la proyección. Del modelo anterior se
   * conserva solo el ancho de las bandas (escenario defensivo, optimista, Monte Carlo), corrido
   * para que quede centrado en el mismo cierre: sin eso, la banda y el número dirían cosas
   * distintas.
   */
  const firstMonth = monthCalendar.months[0];
  const projectionModel = useMemo(() => {
    if (!firstMonth) return legacyProjectionModel;
    const sum = (lines: ProjectionLine[]) => lines.reduce((total, line) => total + line.amount, 0);
    const committedInflow = sum(firstMonth.inflows.filter((line) => line.kind !== "typical_spend"));
    const committedOutflow = sum(firstMonth.outflows.filter((line) => line.kind !== "typical_spend"));
    const typicalSpend = sum(firstMonth.outflows.filter((line) => line.kind === "typical_spend"));
    const expectedBalance = firstMonth.closingBalance;
    const shift = expectedBalance - legacyProjectionModel.expectedBalance;
    return {
      ...legacyProjectionModel,
      expectedBalance,
      conservativeBalance: legacyProjectionModel.conservativeBalance + shift,
      optimisticBalance: legacyProjectionModel.optimisticBalance + shift,
      monteCarloLowBalance: legacyProjectionModel.monteCarloLowBalance + shift,
      monteCarloMedianBalance: legacyProjectionModel.monteCarloMedianBalance + shift,
      monteCarloHighBalance: legacyProjectionModel.monteCarloHighBalance + shift,
      committedInflow,
      committedOutflow,
      variableIncomeProjection: 0,
      variableExpenseProjection: typicalSpend,
    };
  }, [firstMonth, legacyProjectionModel]);

  /** La lista de "Compromisos pendientes", sacada de las mismas líneas que suman el cierre. */
  const monthItems = useMemo<FutureFlowItem[]>(
    () => (firstMonth ? projectionFlowItems([firstMonth], projectionAsOf) : []),
    [firstMonth, projectionAsOf],
  );

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
  // liquidMoney: solo dinero líquido (cash/bank/savings) no archivado, convertido a la
  // moneda activa — paridad con la web (liquidAccountTypes). averageMonthlyExpense:
  // promedio de gasto de los 6 meses de monthlyPulse (estable). periodIncome/periodNet:
  // mes a la fecha (mismo período que la web). totalPayable/overdueCount: payable activas.
  const healthInputs = useMemo(() => {
    const now = new Date();
    const liquidAccountTypes = new Set(["cash", "bank", "savings"]);
    type LiquidAccount = {
      type: string;
      isArchived: boolean;
      currentBalance: number;
      currentBalanceInBaseCurrency?: number | null;
    };
    const liquidMoney = ((snapshot?.accounts ?? []) as LiquidAccount[])
      .filter((a) => liquidAccountTypes.has(a.type) && !a.isArchived)
      .reduce((sum: number, a: LiquidAccount) => {
        const raw = a.currentBalanceInBaseCurrency ?? a.currentBalance;
        return sum + (convertDashboardCurrency(raw, baseCurrency, activeCurrency, exchangeRateMap, baseCurrency) ?? 0);
      }, 0);
    const expenses = projectionHistory ? monthlySavingsRate.months.slice(0, -1).map((month) => month.expense) : [];
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
      liquidMoney,
      averageMonthlyExpense,
      periodIncome: monthToDate.income,
      periodNet: monthToDate.income - monthToDate.expense,
      totalPayable,
      overdueCount,
    };
  }, [activeCurrency, baseCurrency, exchangeRateMap, monthToDate.expense, monthToDate.income, monthlySavingsRate.months, obligationsForHealth, projectionHistory, snapshot?.accounts]);

  const financialGraphRank = useMemo(() => (
    buildFinancialGraphRank<DashboardMovementRow>({
      movements: movements.filter((movement) => movement.status === "posted" && new Date(movement.occurredAt).getTime() >= graphWindowStart),
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
      sortBy: "amount",
    })
  ), [
    accountCurrencyMap,
    accountMap,
    activeCurrency,
    categoryMap,
    counterpartyMap,
    exchangeRateMap,
    graphWindowStart,
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
      onScrollToTop?.();
      return;
    }
    if (focusAction.key === "stable") {
      setActiveTab("Salud");
      onScrollToTop?.();
      return;
    }
    if (focusAction.route === "/dashboard") return;
    router.push(focusAction.route as never);
  }, [focusAction.key, focusAction.quickFilter, focusAction.route, onScrollToTop, openSummaryUncategorizedPreview, router]);

  const lastPersistedAnalyticsKeyRef = useRef<string | null>(null);

  /**
   * Esta escritura es de fondo y prescindible (señales analíticas), pero es PESADA: un upsert
   * con una fila por movimiento con señal. Salía al montar el dashboard, o sea dentro de la
   * ráfaga de peticiones del arranque, y competía con lo que el usuario sí está esperando.
   *
   * Medido en app_error_logs: 3 de los 5 create-movement abortados entre el 16 y el 25 de
   * agosto de 2026 van precedidos, en el MISMO minuto, por un persist-dashboard-analytics
   * abortado. Es el escenario que reportó el usuario: abrir la app tras horas y correr a
   * registrar algo.
   *
   * Así que espera al primer pintado y cede el paso mientras haya un guardado del usuario en
   * vuelo. No se pierde nada: al liberarse, el efecto vuelve a entrar y persiste igual.
   */
  const afterFirstPaint = useAfterFirstPaint();
  const userWritesInFlight = useIsMutating({
    predicate: (mutation) => {
      const key = mutation.options.mutationKey?.[0];
      return typeof key === "string" && !key.startsWith("persist-");
    },
  });

  // Esperar al primer pintado no bastó: el 2026-08-26 a las 19:37 esta escritura arrancó a los
  // pocos segundos del arranque, con 3 consultas de obligaciones todavía en vuelo, y seguía
  // ocupando el tubo cuando el usuario tocó Guardar 16 s después. El candado de escrituras solo
  // impide EMPEZAR durante un guardado; no ayuda si esta salió primero. Así que también espera a
  // que la tormenta de consultas del arranque amaine.
  const queriesInFlight = useIsFetching();

  useEffect(() => {
    if (!workspaceId) return;
    if (!afterFirstPaint || userWritesInFlight > 0 || queriesInFlight > 0) return;
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
  }, [afterFirstPaint, anomalySignals, categorySuggestions, persistDashboardAnalyticsMutation, projectionModel, queriesInFlight, userWritesInFlight, workspaceId]);

  const weeklyPatternInsight = useMemo(() => {
    if (!weeklySpend.hasExpenses) return null;
    const totalSpent = weeklySpend.days.reduce((sum, day) => sum + day.total, 0);
    const labels = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
    return { dayLabel: labels[weeklySpend.top.index], share: Math.round((weeklySpend.top.total / totalSpent) * 100) };
  }, [weeklySpend]);

  const monthEndReading = projectionModel.expectedBalance;
  const monthEndDelta = monthEndReading - currentVisibleBalance;
  const projectionExpectedDelta = projectionModel.expectedBalance - currentVisibleBalance;
  const projectionConservativeDelta = projectionModel.conservativeBalance - currentVisibleBalance;
  const projectionCommittedNet = projectionModel.committedInflow - projectionModel.committedOutflow;
  const projectionVariableNet = projectionModel.variableIncomeProjection - projectionModel.variableExpenseProjection;
  const projectionConservativeVariableNet = projectionModel.conservativeBalance - currentVisibleBalance - projectionCommittedNet;
  const monthStatus: string = monthEndReading >= currentVisibleBalance ? "Cerrando mejor" : monthEndReading >= currentVisibleBalance * 0.92 ? "Ajustado" : "Bajo presión";
  const visibleBalanceLabel = useMemo(() => {
    if (liquidAccounts.length === 0) return "tus cuentas de banco y efectivo";
    if (liquidAccounts.length === 1) return `tu cuenta ${liquidAccounts[0].name}`;
    const names = liquidAccounts.slice(0, 3).map((account) => account.name).join(", ");
    return liquidAccounts.length <= 3
      ? `la suma de tus cuentas de banco y efectivo (${names})`
      : `la suma de tus ${liquidAccounts.length} cuentas de banco y efectivo (${names} y otras)`;
  }, [liquidAccounts]);
  const visibleAccountBreakdown = useMemo(() => (
    liquidAccounts
      .map((account) => ({
        id: account.id,
        name: account.name,
        amount:
          convertDashboardCurrency(account.currentBalanceInBaseCurrency ?? account.currentBalance, baseCurrency, activeCurrency, exchangeRateMap, baseCurrency) ?? 0,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  ), [liquidAccounts, activeCurrency, baseCurrency, exchangeRateMap]);
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
      label: pattern.title,
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
    anomalySignalsTop: anomalySignals.slice(0, 4).map((item) => {
      const movement = patternMovementMap.get(item.movementId);
      const accountId = movement ? movementDisplayAccountId(movement) : null;
      const accountName = accountId == null ? null : accountMap.get(accountId);
      return {
        title: expenseTitle(movement?.description ?? item.title, accountName),
        body: item.body,
        meta: item.meta,
        level: item.level,
        reasons: item.reasons,
      };
    }),
    topHabit: repeatedPatterns[0]
      ? {
          label: repeatedPatterns[0].title,
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
    accountMap,
    anomalySignals,
    categoryConcentration.hhi,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    categoryConcentration.topShare,
    patternQuickRead,
    patternMovementMap,
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
        `Luego se resta tu gasto típico de los días que quedan: ${formatCurrency(projectionModel.variableExpenseProjection, activeCurrency)}, sacado de la mediana de tus meses anteriores. Con eso el esperado es ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}, con piso conservador de ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)}.`,
        `Monte Carlo: probamos muchos cierres posibles tomando días parecidos de tu historial reciente. La banda simulada va de ${formatCurrency(projectionModel.monteCarloLowBalance, activeCurrency)} a ${formatCurrency(projectionModel.monteCarloHighBalance, activeCurrency)}, con mediana de ${formatCurrency(projectionModel.monteCarloMedianBalance, activeCurrency)}.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: openSummaryUncategorizedPreview }
          : null,
        pressureStatus === "Bajo presión"
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
        { label: "Ir a Salud", onPress: openPrecisionLayer },
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
        { label: "Ir a Salud", onPress: openPrecisionLayer },
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
          ? `Este mes la tasa va en ${monthlySavingsRate.lastRate.toFixed(1)}%. ${monthlySavingsRate.avgRate == null ? "El historial de seis meses completos aún está cargando." : `En los seis meses completos anteriores retuviste el ${monthlySavingsRate.avgRate.toFixed(1)}% de lo que entró.`}`
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
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    pressureStatus,
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
          `Luego suma la agenda comprometida del mes (${formatCurrency(projectionCommittedNet, activeCurrency)} neto) y tu gasto típico de los días que quedan (${formatCurrency(projectionVariableNet, activeCurrency)}) para estimar un cierre esperado de ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}.`,
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
        pressureStatus === "Bajo presión"
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
        `Gasto típico del resto del mes: ${formatCurrency(projectionVariableNet, activeCurrency)}. Es tu mes típico —la mediana de tus meses anteriores— repartido en los días que quedan.`,
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
          ? `El gasto típico también suma a favor: ${formatCurrency(projectionVariableNet, activeCurrency)} neto.`
          : `El gasto típico de los días que quedan consume caja: ${formatCurrency(projectionVariableNet, activeCurrency)}.`,
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
    const uncategorized = movementPreview.movements.filter((movement) => isCategorizedCashflow(movement) && movement.categoryId == null).length;
    return {
      uncategorized,
      count: movementPreview.movements.length,
    };
  }, [movementPreview]);
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
  const [summaryAiSheetOpen, setSummaryAiSheetOpen] = useState(false);
  const [patternsAiSheetOpen, setPatternsAiSheetOpen] = useState(false);
  const [flowAiSheetOpen, setFlowAiSheetOpen] = useState(false);
  const [historyAiSheetOpen, setHistoryAiSheetOpen] = useState(false);
  const dashboardAiTone = dashboardAi.tone;
  const setDashboardAiTone = dashboardAi.setTone;
  const dashboardAiBreath = useRef(new Animated.Value(0)).current;
  const dashboardAiUsageDate = dashboardAi.usageDate;
  const dashboardAiIsAdmin = dashboardAi.isAdmin;
  const [activeTab, setActiveTab] = useState<AdvancedTab>('Resumen');
  const weekHasSchedule = weekWindow.scheduledCount > 0;
  const weekNet = weekWindow.expectedInflow - weekWindow.expectedOutflow;
  const reviewDelta = review.totalIssues - priorWeekReview.totalIssues;
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
  const dashboardAiCurrentToneResponse = dashboardAiDailyCache?.responses?.[dashboardAiTone]
    ?? dashboardAiDailyCache?.responses?.managerial
    ?? dashboardAiDailyCache?.responses?.personal
    ?? null;
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
      showToast("No se pudo pedir la explicación", "error", "No hay un espacio activo. Vuelve a abrir la app");
      return;
    }
    if (dashboardAiLimitReached) {
      showToast("Ya usaste la explicación de hoy", "warning", "Podrás pedir otra mañana");
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
      showErrorToast("No se pudo pedir la explicación", error);
    }
  }, [dashboardAiLimitReached, dashboardAiSummaryMutation, dashboardAiSummaryPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiFlow = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se pudo pedir la explicación", "error", "No hay un espacio activo. Vuelve a abrir la app");
      return;
    }
    if (dashboardAiFlowLimitReached) {
      showToast("Ya usaste la explicación de hoy", "warning", "Podrás pedir otra mañana");
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
      showErrorToast("No se pudo pedir la explicación del flujo", error);
    }
  }, [dashboardAiFlowLimitReached, dashboardAiFlowMutation, dashboardAiFlowPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiHealth = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se pudo pedir la explicación", "error", "No hay un espacio activo. Vuelve a abrir la app");
      return;
    }
    if (dashboardAiHealthLimitReached) {
      showToast("Ya usaste la explicación de hoy", "warning", "Podrás pedir otra mañana");
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
      showErrorToast("No se pudo pedir la explicación de salud", error);
    }
  }, [dashboardAiHealthLimitReached, dashboardAiHealthMutation, dashboardAiHealthPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiHistory = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se pudo pedir la explicación", "error", "No hay un espacio activo. Vuelve a abrir la app");
      return;
    }
    if (dashboardAiHistoryLimitReached) {
      showToast("Ya usaste la explicación de hoy", "warning", "Podrás pedir otra mañana");
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
      showErrorToast("No se pudo pedir la explicación del historial", error);
    }
  }, [dashboardAiHistoryLimitReached, dashboardAiHistoryMutation, dashboardAiHistoryPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);
  const handleRequestDashboardAiPatterns = useCallback(async () => {
    if (!workspaceId) {
      showToast("No se pudo pedir la explicación", "error", "No hay un espacio activo. Vuelve a abrir la app");
      return;
    }
    if (dashboardAiPatternsLimitReached) {
      showToast("Ya usaste la explicación de hoy", "warning", "Podrás pedir otra mañana");
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
      showErrorToast("No se pudo pedir la explicación de patrones", error);
    }
  }, [dashboardAiPatternsLimitReached, dashboardAiPatternsMutation, dashboardAiPatternsPayload, dashboardAiTone, dashboardAiUsageDate, showToast, workspaceId]);

  if (privacyMode) {
    return (
      <Card>
        <Text style={advancedPrivacyStyles.title}>Oculto por privacidad</Text>
        <Text style={advancedPrivacyStyles.body}>
          El análisis avanzado muestra tus cifras completas. Desactiva el modo
          privado con el ojo del header para verlo.
        </Text>
      </Card>
    );
  }

  return (
    <>
      <DashboardTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Hay agenda real esta semana? Distinto de "todo suma cero": si no hay ni cobros ni
          pagos previstos, la tarjeta lo dice con palabras en vez de enseñar tres ceros. */}
      {activeTab === 'Resumen' && (
        <DashboardSectionBoundary sectionLabel="Resumen">
        <>
      <View>
        <View style={subStyles.executiveGrid}>
          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setExecutiveDetail("focus")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Estado del sistema</Text>
              <View style={subStyles.executiveTonePill}>
                <Text style={subStyles.executiveToneText} numberOfLines={1}>
                  {systemState.status}
                </Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{systemState.score}%</Text>
            <Text style={subStyles.executiveCaption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {systemState.totalIssues > 0 ? `${systemState.totalIssues} punto${systemState.totalIssues === 1 ? "" : "s"} por revisar` : "Sin pendientes"}
              {reviewDelta !== 0 ? (
                <Text style={{ color: reviewDelta < 0 ? COLORS.income : COLORS.expense }}>
                  {reviewDelta < 0 ? ` · ${Math.abs(reviewDelta)} resueltos` : ` · ${reviewDelta} nuevos`}
                </Text>
              ) : null}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setExecutiveDetail("risk")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Próximos 7 días</Text>
              <View style={[subStyles.executiveTonePill, pressureStatus === "Bajo presión" && subStyles.executiveTonePillWarning]}>
                <Text style={[subStyles.executiveToneText, pressureStatus === "Bajo presión" && subStyles.executiveToneTextWarning]}>{pressureStatus}</Text>
              </View>
            </View>
            {/* Cero NO es estado vacio. "S/ 0.00 · Entran S/ 0.00 · salen S/ 0.00" se lee como
                fallo de carga, no como "no hay nada previsto". Cuando de verdad no hay agenda
                se dice con palabras y la unica cifra que queda es real: los dias de caja libre.
                El cero vuelve a aparecer solo cuando significa cero. */}
            {weekHasSchedule ? (
              <>
                <Text style={[subStyles.executiveValue, weekNet < 0 && { color: COLORS.expense }]}>
                  {weekNet < 0 ? "−" : weekNet > 0 ? "+" : ""}{formatCurrency(Math.abs(weekNet), activeCurrency)}
                </Text>
                <Text style={subStyles.executiveCaption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  Entran {formatCurrency(weekWindow.expectedInflow, activeCurrency)} · salen {formatCurrency(weekWindow.expectedOutflow, activeCurrency)} · caja para {cashCushion.days} días
                </Text>
              </>
            ) : (
              <>
                <Text style={subStyles.executiveEmptyValue}>Sin movimientos previstos</Text>
                <Text style={subStyles.executiveCaption} numberOfLines={1}>Caja para {cashCushion.days} días</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setExecutiveDetail("month")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Fin de mes</Text>
              <View style={[subStyles.executiveTonePill, monthStatus === "Bajo presión" && subStyles.executiveTonePillWarning]}>
                <Text style={[subStyles.executiveToneText, monthStatus === "Bajo presión" && subStyles.executiveToneTextWarning]}>{monthStatus}</Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{formatCurrency(monthEndReading, activeCurrency)}</Text>
            <Text style={subStyles.executiveCaption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              <Text style={{ color: monthEndDelta >= 0 ? COLORS.income : COLORS.expense }}>
                {monthEndDelta >= 0 ? "+" : "−"}{formatCurrency(Math.abs(monthEndDelta), activeCurrency)}
              </Text>
              {` sobre hoy (${formatCurrency(currentVisibleBalance, activeCurrency)} en ${liquidAccounts.length} cuenta${liquidAccounts.length === 1 ? "" : "s"})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: SPACING.sm }} />
      <View style={subStyles.nextStepCard}>
        <Text style={subStyles.nextStepKicker}>Siguiente paso</Text>
        <Text style={subStyles.nextStepTitle}>{focusAction.title}</Text>
        <Text style={subStyles.nextStepDetail}>{focusAction.body}</Text>
        <TouchableOpacity
          style={subStyles.nextStepButton}
          onPress={openFocusActionDestination}
          activeOpacity={0.84}
          accessibilityRole="button"
        >
          <Text style={subStyles.nextStepButtonText}>
            {focusAction.key === "uncategorized" ? "Categorizar ahora" : focusAction.key === "stable" ? "Ver salud" : "Revisar ahora"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: SPACING.sm }} />
      <TouchableOpacity
        style={subStyles.summaryAiRow}
        onPress={() => {
          setSummaryAiSheetOpen(true);
          if (!dashboardAiReply && !dashboardAiLimitReached && !dashboardAiSummaryMutation.isPending) {
            void handleRequestDashboardAiSummary();
          }
        }}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="Abrir informe con IA"
      >
        <View style={subStyles.summaryAiIcon}><Sparkles size={18} color={COLORS.pro} /></View>
        <View style={subStyles.summaryAiCopy}>
          <Text style={subStyles.summaryAiTitle}>Informe con IA</Text>
          <Text style={subStyles.summaryAiSubtitle}>Explica este resumen en palabras</Text>
        </View>
        <ArrowRight size={16} color={COLORS.storm} />
      </TouchableOpacity>

      {financialGraphRank.length > 0 ? (
        <>
          <View style={{ height: SPACING.xxl + SPACING.xs }} />
          <FinancialGraphCard
            nodes={financialGraphRank}
            currency={activeCurrency}
            onOpenNode={openFinancialGraphNodePreview}
          />
        </>
      ) : null}

      {showAdvancedGift ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <AdvancedGiftCard />
        </>
      ) : null}

      {shortcuts ? (
        <>
          <View style={{ height: SPACING.sm }} />
          {shortcuts}
        </>
      ) : null}

      </>
      </DashboardSectionBoundary>
      )}

      <BottomSheet
        visible={summaryAiSheetOpen}
        onClose={() => { setSummaryAiSheetOpen(false); setActiveDashboardAiTerm(null); }}
        title={activeDashboardAiTerm ? "Explicación" : "Informe con IA"}
        snapHeight={0.82}
        blurBackdrop={false}
        headerStyle={subStyles.summarySheetHeader}
        contentStyle={subStyles.summarySheetContent}
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <TouchableOpacity onPress={() => setActiveDashboardAiTerm(null)} accessibilityRole="button">
              <Text style={subStyles.summaryAiBack}>Volver al informe</Text>
            </TouchableOpacity>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : dashboardAiSummaryMutation.isPending && !dashboardAiReply ? (
          <AiResponseSkeleton />
        ) : dashboardAiReply ? (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiTextParts.map((part, index) => part.type === "term" ? (
              <Text
                key={`${part.term.term}-${index}`}
                style={subStyles.summaryAiReportTerm}
                onPress={() => setActiveDashboardAiTerm(part.term)}
              >
                {part.value}
              </Text>
            ) : <Text key={`text-${index}`}>{part.value}</Text>)}
          </Text>
        ) : (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiLimitReached ? "La consulta de hoy ya se usó. Podrás pedir otro informe mañana." : "No se pudo preparar el informe. Cierra la hoja y vuelve a intentarlo."}
          </Text>
        )}
      </BottomSheet>

      <BottomSheet
        visible={patternsAiSheetOpen}
        onClose={() => { setPatternsAiSheetOpen(false); setActiveDashboardAiTerm(null); }}
        title={activeDashboardAiTerm ? "Explicación" : "Informe de patrones con IA"}
        snapHeight={0.82}
        blurBackdrop={false}
        headerStyle={subStyles.summarySheetHeader}
        contentStyle={subStyles.summarySheetContent}
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <TouchableOpacity onPress={() => setActiveDashboardAiTerm(null)} accessibilityRole="button">
              <Text style={subStyles.summaryAiBack}>Volver al informe</Text>
            </TouchableOpacity>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : dashboardAiPatternsMutation.isPending && !dashboardAiPatternsReply ? (
          <AiResponseSkeleton />
        ) : dashboardAiPatternsReply ? (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiPatternsTextParts.map((part, index) => part.type === "term" ? (
              <Text
                key={`${part.term.term}-patterns-${index}`}
                style={subStyles.summaryAiReportTerm}
                onPress={() => setActiveDashboardAiTerm(part.term)}
              >{part.value}</Text>
            ) : <Text key={`patterns-text-${index}`}>{part.value}</Text>)}
          </Text>
        ) : (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiPatternsLimitReached ? "La consulta de hoy ya se usó. Podrás pedir otro informe mañana." : "No se pudo preparar el informe. Cierra la hoja y vuelve a intentarlo."}
          </Text>
        )}
      </BottomSheet>

      <BottomSheet
        visible={flowAiSheetOpen}
        onClose={() => { setFlowAiSheetOpen(false); setActiveDashboardAiTerm(null); }}
        title={activeDashboardAiTerm ? "Explicación" : "Informe de flujo con IA"}
        snapHeight={0.82}
        blurBackdrop={false}
        headerStyle={subStyles.summarySheetHeader}
        contentStyle={subStyles.summarySheetContent}
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <TouchableOpacity onPress={() => setActiveDashboardAiTerm(null)} accessibilityRole="button">
              <Text style={subStyles.summaryAiBack}>Volver al informe</Text>
            </TouchableOpacity>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : dashboardAiFlowMutation.isPending && !dashboardAiFlowReply ? (
          <AiResponseSkeleton />
        ) : dashboardAiFlowReply ? (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiFlowTextParts.map((part, index) => part.type === "term" ? (
              <Text key={`${part.term.term}-flow-${index}`} style={subStyles.summaryAiReportTerm} onPress={() => setActiveDashboardAiTerm(part.term)}>{part.value}</Text>
            ) : <Text key={`flow-text-${index}`}>{part.value}</Text>)}
          </Text>
        ) : (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiFlowLimitReached ? "La consulta de hoy ya se usó. Podrás pedir otro informe mañana." : "No se pudo preparar el informe. Cierra la hoja y vuelve a intentarlo."}
          </Text>
        )}
      </BottomSheet>

      <BottomSheet
        visible={historyAiSheetOpen}
        onClose={() => { setHistoryAiSheetOpen(false); setActiveDashboardAiTerm(null); }}
        title={activeDashboardAiTerm ? "Explicación" : "Informe de historial con IA"}
        snapHeight={0.82}
        blurBackdrop={false}
        headerStyle={subStyles.summarySheetHeader}
        contentStyle={subStyles.summarySheetContent}
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <TouchableOpacity onPress={() => setActiveDashboardAiTerm(null)} accessibilityRole="button">
              <Text style={subStyles.summaryAiBack}>Volver al informe</Text>
            </TouchableOpacity>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : dashboardAiHistoryMutation.isPending && !dashboardAiHistoryReply ? (
          <AiResponseSkeleton />
        ) : dashboardAiHistoryReply ? (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiHistoryTextParts.map((part, index) => part.type === "term" ? (
              <Text key={`${part.term.term}-history-${index}`} style={subStyles.summaryAiReportTerm} onPress={() => setActiveDashboardAiTerm(part.term)}>{part.value}</Text>
            ) : <Text key={`history-text-${index}`}>{part.value}</Text>)}
          </Text>
        ) : (
          <Text style={subStyles.summaryAiReportText}>
            {dashboardAiHistoryLimitReached ? "La consulta de hoy ya se usó. Podrás pedir otro informe mañana." : "No se pudo preparar el informe. Cierra la hoja y vuelve a intentarlo."}
          </Text>
        )}
      </BottomSheet>

      <BottomSheet
        visible={Boolean(activeDashboardAiTerm) && !summaryAiSheetOpen && !patternsAiSheetOpen && !flowAiSheetOpen && !historyAiSheetOpen}
        onClose={() => setActiveDashboardAiTerm(null)}
        title="Explicación"
        snapHeight={0.42}
        blurBackdrop={false}
        backdropColor="rgba(0,0,0,0.68)"
      >
        {activeDashboardAiTerm ? (
          <View style={subStyles.aiSummaryTermSheet}>
            <View style={subStyles.aiSummaryTermSheetBadge}>
              <Sparkles size={12} color={COLORS.pro} />
              <Text style={subStyles.aiSummaryTermSheetBadgeText}>Explicación simple</Text>
            </View>
            <Text style={subStyles.aiSummaryTermSheetTitle}>{activeDashboardAiTerm.term}</Text>
            <Text style={subStyles.aiSummaryTermSheetBody}>{activeDashboardAiTerm.explanation}</Text>
          </View>
        ) : null}
      </BottomSheet>

      {executiveDetail === "focus" ? (
        <SystemStateSheet
          state={systemState}
          onClose={() => setExecutiveDetail(null)}
          onCategorize={openSummaryUncategorizedPreview}
          onOpenHealth={openPrecisionLayer}
        />
      ) : null}

      {executiveDetail === "risk" ? (
        <WeekOutlookSheet
          items={weekItems}
          window={weekWindow}
          status={pressureStatus}
          availableBalance={currentVisibleBalance}
          cushionDays={cashCushion.days}
          currency={activeCurrency}
          onClose={() => setExecutiveDetail(null)}
          onReviewSubscriptions={() => { setExecutiveDetail(null); router.push("/subscriptions" as never); }}
          onOpenItem={(item: FutureFlowItem) => {
            setExecutiveDetail(null);
            const route = item.source === "subscription" ? `/subscription/${item.id}`
              : item.source === "obligation" ? `/obligation/${item.id}`
              : item.source === "card" ? "/(app)/accounts"
              : item.source === "planned" ? `/movement/${item.id}`
              : `/recurring-income/${item.id}`;
            router.push(`${route}?from=dashboard` as never);
          }}
        />
      ) : null}

      {executiveDetail === "month" ? (
        <MonthEndSheet
          currency={activeCurrency}
          balance={currentVisibleBalance}
          accounts={visibleAccountBreakdown}
          committedNet={projectionCommittedNet}
          variableNet={projectionVariableNet}
          projectedIncome={projectionModel.variableIncomeProjection}
          projectedExpense={projectionModel.variableExpenseProjection}
          estimatedBalance={monthEndReading}
          status={monthStatus}
          remainingDays={projectionModel.remainingDays}
          commitments={monthItems}
          typicalSpend={monthTypicalSpend}
          asOfDate={projectionAsOf}
          onClose={() => setExecutiveDetail(null)}
          onOpenCommitment={(item) => {
            setExecutiveDetail(null);
            const route = item.source === "subscription" ? `/subscription/${item.id}`
              : item.source === "obligation" ? `/obligation/${item.id}`
              : item.source === "card" ? "/(app)/accounts"
              : item.source === "planned" ? `/movement/${item.id}`
              : `/recurring-income/${item.id}`;
            router.push(`${route}?from=dashboard` as never);
          }}
        />
      ) : null}

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

      <BottomSheet
        visible={Boolean(movementPreview)}
        onClose={() => setMovementPreview(null)}
        title={movementPreview?.title ?? "Movimientos"}
        snapHeight={0.88}
        blurBackdrop={false}
        headerStyle={subStyles.summarySheetHeader}
        contentStyle={subStyles.summarySheetContent}
      >
            <Text style={subStyles.movementPreviewSubtitle}>
              {movementPreview?.variant === "graph"
                ? `${movementPreviewStats?.count ?? 0} movimientos · últimos 90 días`
                : movementPreview?.subtitle}
            </Text>
            {movementPreview?.variant === "graph" ? null : (
              <Text style={subStyles.movementPreviewScope}>{movementPreview?.scopeLabel}</Text>
            )}
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
            {movementPreviewStats && movementPreviewStats.uncategorized > 0 ? (
              <TouchableOpacity
                style={subStyles.movementPreviewCategorizeRow}
                onPress={() => { setMovementPreview(null); openSummaryUncategorizedPreview(); }}
                activeOpacity={0.82}
                accessibilityRole="button"
              >
                <Text style={subStyles.movementPreviewCategorizeCount}>{movementPreviewStats.uncategorized} sin categoría</Text>
                <Text style={subStyles.movementPreviewCategorizeAction}>Categorizar</Text>
              </TouchableOpacity>
            ) : null}

            {movementPreview && movementPreview.movements.length > 0 ? (
              <View style={subStyles.movementPreviewListContent}>
                {movementPreview.movements.map((movement, index) => {
                  const occurredAt = new Date(movement.occurredAt);
                  const monthKey = format(occurredAt, "yyyy-MM");
                  const previousMonthKey = index > 0 ? format(new Date(movementPreview.movements[index - 1].occurredAt), "yyyy-MM") : null;
                  const incomeLike = movementActsAsIncome(movement);
                  const expenseLike = movementActsAsExpense(movement);
                  const transferIncoming = movement.movementType === "transfer" && movementPreview.graphAccountId != null && movement.destinationAccountId === movementPreview.graphAccountId;
                  const transferOutgoing = movement.movementType === "transfer" && movementPreview.graphAccountId != null && movement.sourceAccountId === movementPreview.graphAccountId;
                  const amount = incomeLike
                    ? incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
                    : expenseLike
                      ? expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency })
                      : transferAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency });
                  const accountId = movementDisplayAccountId(movement);
                  const accountName = accountId ? accountMap.get(accountId) ?? "Cuenta" : "Sin cuenta";
                  const categoryName = movement.categoryId != null ? categoryMap.get(movement.categoryId) ?? "Categoría" : "Sin categoría";
                  const needsCategory = isCategorizedCashflow(movement) && movement.categoryId == null;
                  const statusLabel = movement.status === "posted" ? "" : movement.status === "pending" ? "Pendiente" : movement.status === "planned" ? "Planificado" : "Anulado";
                  const amountColor = incomeLike || transferIncoming ? COLORS.income : expenseLike || transferOutgoing ? COLORS.expense : COLORS.storm;
                  const sign = incomeLike || transferIncoming ? "+" : expenseLike || transferOutgoing ? "−" : "";

                  return (
                    <Fragment key={movement.id}>
                    {monthKey !== previousMonthKey ? (
                      <Text style={subStyles.movementPreviewMonth}>{format(occurredAt, "MMMM", { locale: es })}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={subStyles.movementPreviewRow}
                      onPress={() => { setMovementPreview(null); router.push(`/movement/${movement.id}?from=dashboard` as never); }}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={subStyles.movementPreviewRowTitle} numberOfLines={1}>
                          {movement.description.trim() || (incomeLike ? "Ingreso sin descripción" : expenseLike ? "Gasto sin descripción" : "Movimiento sin descripción")}
                        </Text>
                        <Text style={subStyles.movementPreviewRowMeta} numberOfLines={1}>
                          {format(new Date(movement.occurredAt), "d MMM", { locale: es })} · <Text style={needsCategory && { color: COLORS.expense }}>
                            {movement.movementType === "transfer" ? "Transferencia" : categoryName}
                          </Text>{movementPreview.variant === "graph" ? "" : ` · ${accountName}`}{statusLabel ? ` · ${statusLabel}` : ""}
                        </Text>
                      </View>
                      <Text style={[subStyles.movementPreviewAmount, { color: amountColor }]} numberOfLines={1}>
                        {sign}{formatCurrency(amount, activeCurrency)}
                      </Text>
                    </TouchableOpacity>
                    </Fragment>
                  );
                })}
              </View>
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
      </BottomSheet>

      {selectedAnnualMonthDetail ? (
        <HistoryMonthSheet
          detail={selectedAnnualMonthDetail}
          currency={activeCurrency}
          onClose={() => setSelectedAnnualMonth(null)}
          onOpenAll={() => openAnnualMonthPreview(selectedAnnualMonthDetail.month)}
          onOpenCorrections={() => openAnnualCorrectionsPreview(selectedAnnualMonthDetail.correctionIds)}
          onOpenMovement={(movement) => openSingleMovementPreview(movement.id, movement.title)}
        />
      ) : null}
      {activeTab === 'Patrones' && (
        <DashboardSectionBoundary sectionLabel="Patrones">
          <PatternsTab
            anomalies={anomalySignals}
            rises={risingCategoryPatterns}
            habits={repeatedPatterns}
            categoryTotals={advancedStats.catTotals}
            categoryNames={categoryMap}
            accountNames={accountMap}
            movements={movements}
            currency={activeCurrency}
            weeklySpend={weeklySpend}
            onReviewAnomalies={(ids) => openAnomalyMovementsPreview(ids)}
            onOpenAnomaly={(id) => openAnomalyMovementsPreview([id], "Movimiento fuera de costumbre")}
            onOpenAi={() => {
              setPatternsAiSheetOpen(true);
              if (!dashboardAiPatternsReply && !dashboardAiPatternsLimitReached && !dashboardAiPatternsMutation.isPending) {
                void handleRequestDashboardAiPatterns();
              }
            }}
            onOpenRise={openRisingCategoryPreview}
            onOpenCategory={(id) => openCategoryPeriodPreview(id)}
            onOpenRemainingCategories={openRemainingCategoriesPreview}
            onOpenDay={openWeeklyDayPreview}
            onOpenHabit={openPatternHabitPreview}
          />
        </DashboardSectionBoundary>
      )}
      {activeTab === 'Flujo' && (
        <DashboardSectionBoundary sectionLabel="Flujo">
          <FlowTab
            projectionInputs={projectionInputs}
            windows={windows}
            obligations={obligations}
            movements={movements}
            accounts={activeAccounts}
            conversionCtx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency, baseCurrency }}
            onOpenAi={() => {
              setFlowAiSheetOpen(true);
              if (!dashboardAiFlowReply && !dashboardAiFlowLimitReached && !dashboardAiFlowMutation.isPending) {
                void handleRequestDashboardAiFlow();
              }
            }}
            onOpenObligation={(id) => router.push(`/obligation/${id}`)}
            onOpenSubscription={(id) => router.push(`/subscription/${id}`)}
            onOpenRoute={openTransferRoutePreview}
          />
        </DashboardSectionBoundary>
      )}
      {activeTab === 'Historial' && (
        <DashboardSectionBoundary sectionLabel="Historial">
          <HistoryTab
            years={historyYears}
            selectedYear={selectedHistoryYear}
            onSelectYear={setSelectedHistoryYear}
            months={annualHistory}
            currency={activeCurrency}
            loading={yearMovementsQuery.isPending && Boolean(workspaceId && userId)}
            error={Boolean(yearMovementsQuery.error)}
            onRetry={() => { void yearMovementsQuery.refetch(); }}
            factorAnalysis={historyFactorAnalysis}
            seasonalComparison={hasSeasonalHistory && seasonalComparison.hasHistory ? seasonalComparison : null}
            onOpenMonth={setSelectedAnnualMonth}
            onOpenCategory={(categoryId, name) => openHistoryRangePreview(
              `${selectedHistoryYear}-01-01`,
              `${selectedHistoryYear}-12-31`,
              { kind: "expense", categoryId, title: `${displayCategoryName(name)} en ${selectedHistoryYear}` },
            )}
            onOpenAi={() => {
              setHistoryAiSheetOpen(true);
              if (!dashboardAiHistoryReply && !dashboardAiHistoryLimitReached && !dashboardAiHistoryMutation.isPending) {
                void handleRequestDashboardAiHistory();
              }
            }}
          />
        </DashboardSectionBoundary>
      )}
      {activeTab === 'Salud' && (
        <DashboardSectionBoundary sectionLabel="Salud">
        <>
      <View style={{ height: SPACING.sm }} />
      {/* La pantalla decia 86% ("confianza actual", tres veces con tres nombres distintos),
          68% ("proyeccion con bandas"), 78% ("categorias utiles") y 74% ("Fase 4"). Puestos
          asi, no se sabe cual mirar ni por que difieren. Queda uno, con el umbral por debajo
          del cual las proyecciones dejan de sostenerse. */}
      <Card>
        <View style={subStyles.precisionHeader}>
          <Text style={subStyles.precisionLabel}>Precisión del dato</Text>
          <Text style={subStyles.precisionDays}>{learning.historyDays} días observados</Text>
        </View>
        <Text
          style={[
            subStyles.precisionValue,
            { color: learning.readinessScore >= 80 ? COLORS.income : COLORS.expense },
          ]}
        >
          {learning.readinessScore}%
        </Text>
        <Text style={subStyles.precisionBody}>
          {learning.potentialScore > learning.readinessScore
            ? `Resolver los pendientes de abajo la lleva a ${learning.potentialScore}%. `
            : ""}
          Por debajo de 80% las proyecciones dejan de ser fiables.
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
      <Card>
        <SectionTitle>Ahorro y estabilidad</SectionTitle>
        <TouchableOpacity style={subStyles.advMetricSection} onPress={() => setAdvancedDetail("savingsRate")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Tasa de ahorro</Text>
            {monthlySavingsRate.avgRate != null ? <Text style={[subStyles.advMetricBadge, { color: monthlySavingsRate.avgRate >= 0 ? COLORS.income : COLORS.expense }]}>{monthlySavingsRate.avgRate.toFixed(1)}%</Text> : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {monthlySavingsRate.avgRate == null ? "Esperando seis meses completos de historial." : `En los últimos seis meses completos · este mes ${monthlySavingsRate.lastRate == null ? "sin ingresos" : `${monthlySavingsRate.lastRate.toFixed(1)}%`}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("incomeStability")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Estabilidad de ingresos</Text>
            {incomeStabilityScore.score != null ? <Text style={[subStyles.advMetricBadge, { color: incomeStabilityScore.color }]}>{incomeStabilityScore.score}/100</Text> : null}
          </View>
          <Text style={subStyles.advMetricBody}>{incomeStabilityScore.score == null ? "Se necesitan ingresos en al menos tres meses completos." : incomeStabilityScore.label}</Text>
        </TouchableOpacity>
      </Card>

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
          <SectionTitle>Eficiencia de cobro</SectionTitle>
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

      {/* La proyección del cierre y sus bandas viven en Flujo; el relato del aprendizaje, en
          Ajustes › Acerca de. Aquí solo queda lo que se puede arreglar. */}
      <View style={{ height: SPACING.sm }} />
      <Text style={subStyles.bridgeFootnote}>
        La proyección del cierre y sus bandas viven en Flujo.
      </Text>
      </>
      </DashboardSectionBoundary>
      )}
    </>
  );
}

const advancedPrivacyStyles = StyleSheet.create({
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    marginTop: SPACING.xs,
  },
});
