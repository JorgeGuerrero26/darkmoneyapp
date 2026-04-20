import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Image,
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
  useSharedObligationsQuery,
  useNotificationsQuery,
  useUserEntitlementQuery,
  mergeWorkspaceAndSharedObligations,
  type DashboardMovementRow,
  type DashboardAnalyticsBundle,
} from "../../services/queries/workspace-data";
import type { ExchangeRateSummary } from "../../types/domain";
import { useUiStore } from "../../store/ui-store";
import { Card } from "../../components/ui/Card";
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

// --- Constants ----------------------------------------------------------------

const UPCOMING_DAYS = 30;

type Period = "today" | "week" | "month" | "last_30";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  last_30: "30 días",
};

type AdvancedPreset = "manual" | "liquidity" | "portfolio" | "control" | "analytics";

const DASHBOARD_ADVANCED_PRESET_KEY = "darkmoney.dashboard.advancedPreset";
const ADVANCED_WIDGET_LIBRARY = ["Flujo", "Salud", "Suscripciones", "Cartera", "Semanal", "Pulso", "Radar", "Calidad", "Aprendizaje", "Actividad"];

const ADVANCED_PRESET_META: Record<AdvancedPreset, { title: string; subtitle: string; cta: string; situationalSubtitle: string }> = {
  manual:    { title: "Manual",          subtitle: "Elige tus propios widgets abajo y ordénalos como quieras.", cta: "Armar mi panel",    situationalSubtitle: "Sin urgencia detectada - personaliza tú mismo." },
  liquidity: { title: "Ver caja",        subtitle: "Caja, compromisos próximos y cierre estimado del mes.",    cta: "Vigilar liquidez",  situationalSubtitle: "Próximos 7-30 días bajo presión - conviene vigilar caja." },
  portfolio: { title: "Revisar cartera", subtitle: "Cobros, pagos y vencimientos de la cartera.",              cta: "Ordenar cartera",   situationalSubtitle: "Hay vencimientos sin resolver que distorsionan la lectura." },
  control:   { title: "Limpiar datos",   subtitle: "Categorización, duplicados y suscripciones.",              cta: "Mejorar calidad",   situationalSubtitle: "Categorías incompletas - las señales del dashboard pierden precisión." },
  analytics: { title: "Analizar mes",    subtitle: "Patrones, comparativos y aprendizaje del sistema.",        cta: "Ver patrones",      situationalSubtitle: "Base suficientemente sana para lectura fina de hábitos." },
};

const ADVANCED_PRESET_WIDGETS: Record<AdvancedPreset, string[]> = {
  manual: [],
  liquidity: ["Flujo", "Salud", "Pulso", "Suscripciones"],
  portfolio: ["Cartera", "Flujo", "Actividad"],
  control: ["Calidad", "Actividad", "Suscripciones"],
  analytics: ["Semanal", "Pulso", "Radar", "Aprendizaje"],
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

  const duplicateGroups = new Map<string, number>();
  for (const movement of movements) {
    if (!isExpense(movement)) continue;
    const label = movement.description.trim().toLowerCase() || "sin-descripcion";
    const key = `${movement.occurredAt.slice(0, 10)}|${movementDisplayAmount(movement).toFixed(2)}|${label}`;
    duplicateGroups.set(key, (duplicateGroups.get(key) ?? 0) + 1);
  }
  const duplicateExpenseGroups = Array.from(duplicateGroups.values()).filter((count) => count > 1).length;

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

function normalizeAnalyticsText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAnalyticsText(value: string) {
  return normalizeAnalyticsText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function buildCategorySuggestions(
  movements: DashboardMovementRow[],
  categories: Array<{ id: number; name: string }>,
  ctx: ConversionCtx,
): DashboardCategorySuggestion[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const categorizedHistory = movements
    .filter((movement) => movement.status === "posted")
    .filter(isCategorizedCashflow)
    .filter((movement) => movement.categoryId != null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const uncategorizedTargets = movements
    .filter((movement) => movement.status === "posted")
    .filter(isCategorizedCashflow)
    .filter((movement) => movement.categoryId == null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 8);

  const suggestions: DashboardCategorySuggestion[] = [];

  for (const target of uncategorizedTargets) {
    const targetNormalized = normalizeAnalyticsText(target.description);
    const targetTokens = tokenizeAnalyticsText(target.description);
    const targetAmount = movementActsAsIncome(target) ? incomeAmt(target, ctx) : expenseAmt(target, ctx);
    const isTargetIncome = movementActsAsIncome(target);
    const categoryScores = new Map<number, { score: number; samples: number; exact: number; closeAmount: number; sameCounterparty: number }>();

    for (const sample of categorizedHistory) {
      if (sample.id === target.id || sample.categoryId == null) continue;
      if (movementActsAsIncome(sample) !== isTargetIncome) continue;

      const sampleNormalized = normalizeAnalyticsText(sample.description);
      const sampleTokens = tokenizeAnalyticsText(sample.description);
      const sampleAmount = movementActsAsIncome(sample) ? incomeAmt(sample, ctx) : expenseAmt(sample, ctx);
      let score = 0;

      if (targetNormalized && sampleNormalized && targetNormalized === sampleNormalized) score += 5;

      if (targetTokens.length > 0 && sampleTokens.length > 0) {
        const overlap = targetTokens.filter((token) => sampleTokens.includes(token)).length;
        const overlapRatio = overlap / Math.max(targetTokens.length, sampleTokens.length);
        if (overlapRatio >= 0.75) score += 2.5;
        else if (overlapRatio >= 0.45) score += 1.25;
      }

      if (target.counterpartyId && sample.counterpartyId && target.counterpartyId === sample.counterpartyId) score += 2;

      if (targetAmount > 0.009 && sampleAmount > 0.009) {
        const ratio = Math.abs(targetAmount - sampleAmount) / Math.max(targetAmount, sampleAmount);
        if (ratio <= 0.12) score += 1.5;
        else if (ratio <= 0.3) score += 0.75;
      }

      if (score < 1.25) continue;

      const current = categoryScores.get(sample.categoryId) ?? { score: 0, samples: 0, exact: 0, closeAmount: 0, sameCounterparty: 0 };
      categoryScores.set(sample.categoryId, {
        score: current.score + score,
        samples: current.samples + 1,
        exact: current.exact + (targetNormalized && sampleNormalized && targetNormalized === sampleNormalized ? 1 : 0),
        closeAmount: current.closeAmount + (targetAmount > 0.009 && sampleAmount > 0.009 && Math.abs(targetAmount - sampleAmount) / Math.max(targetAmount, sampleAmount) <= 0.12 ? 1 : 0),
        sameCounterparty: current.sameCounterparty + (target.counterpartyId && sample.counterpartyId && target.counterpartyId === sample.counterpartyId ? 1 : 0),
      });
    }

    const ranked = Array.from(categoryScores.entries()).sort((a, b) => b[1].score - a[1].score);
    if (ranked.length === 0) continue;

    const [bestCategoryId, best] = ranked[0];
    const secondScore = ranked[1]?.[1].score ?? 0;
    const scoreGap = Math.max(0, best.score - secondScore);
    const confidence = Math.max(
      0.46,
      Math.min(
        0.97,
        0.38 +
          Math.min(best.samples, 4) * 0.09 +
          Math.min(best.exact, 2) * 0.14 +
          Math.min(best.closeAmount, 2) * 0.06 +
          Math.min(best.sameCounterparty, 1) * 0.08 +
          Math.min(scoreGap / 6, 0.18),
      ),
    );

    if (best.score < 3.4 || confidence < 0.62) continue;

    const reasons: string[] = [];
    if (best.exact > 0) reasons.push("misma descripción ya vista");
    if (best.sameCounterparty > 0) reasons.push("misma contraparte");
    if (best.closeAmount > 0) reasons.push("monto parecido");
    if (best.samples >= 2) reasons.push(`${best.samples} casos parecidos en tu historial`);
    if (reasons.length === 0) reasons.push("patrón repetido en tu historial");

    suggestions.push({
      movementId: target.id,
      description: target.description.trim() || "Movimiento sin descripción",
      occurredAt: target.occurredAt,
      amount: targetAmount,
      suggestedCategoryId: bestCategoryId,
      suggestedCategoryName: categoryMap.get(bestCategoryId) ?? "Categoría sugerida",
      confidence,
      matchedSamples: best.samples,
      reasons,
    });
  }

  return suggestions
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
  const expenses = movements
    .filter(isExpense)
    .filter((movement) => movement.description.trim())
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const descriptionHistory = new Map<string, number[]>();
  const categoryHistory = new Map<number, number[]>();
  const duplicateBuckets = new Map<string, DashboardMovementRow[]>();
  const findings: DashboardAnomalyFinding[] = [];

  for (const movement of expenses) {
    const amount = expenseAmt(movement, ctx);
    const normalizedDescription = normalizeAnalyticsText(movement.description) || "sin-descripcion";
    const descriptionSamples = descriptionHistory.get(normalizedDescription) ?? [];
    const categorySamples = movement.categoryId != null ? categoryHistory.get(movement.categoryId) ?? [] : [];

    if (amount >= 12 && descriptionSamples.length >= 3) {
      const n = descriptionSamples.length;
      const avg = descriptionSamples.reduce((sum, value) => sum + value, 0) / n;
      if (avg > 0) {
        const variance = descriptionSamples.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / n;
        const std = Math.sqrt(variance);
        const z = (amount - avg) / Math.max(std, avg * 0.10);
        if (z >= 2.0) {
          const accountLabel = accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta";
          findings.push({
            key: `desc-${movement.id}`,
            movementId: movement.id,
            title: movement.description.trim() || "Movimiento",
            body: `${z.toFixed(1)}sigma por encima de tu promedio habitual (${avg.toFixed(2)} ± ${std.toFixed(2)}).`,
            meta: `${accountLabel} · ${formatCurrency(amount, ctx.displayCurrency)} · ${format(new Date(movement.occurredAt), "d MMM", { locale: es })}`,
            level: z >= 3.0 ? "strong" : "review",
            score: Math.min(99, Math.round(45 + Math.min(z, 6) * 8)),
            reasons: [
              "pico estadístico contra su propia descripción",
              `${n} casos previos comparables`,
            ],
          });
        }
      }
    }

    if (movement.categoryId != null && amount >= 15 && categorySamples.length >= 4) {
      const n = categorySamples.length;
      const avg = categorySamples.reduce((sum, value) => sum + value, 0) / n;
      if (avg > 0) {
        const variance = categorySamples.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / n;
        const std = Math.sqrt(variance);
        const z = (amount - avg) / Math.max(std, avg * 0.10);
        if (z >= 2.0) {
          findings.push({
            key: `cat-${movement.id}`,
            movementId: movement.id,
            title: movement.description.trim() || (categoryMap.get(movement.categoryId) ?? "Movimiento"),
            body: `${z.toFixed(1)}sigma por encima de tu promedio habitual en esta categoría (${avg.toFixed(2)} ± ${std.toFixed(2)}).`,
            meta: `${categoryMap.get(movement.categoryId) ?? "Sin categoría"} · ${formatCurrency(amount, ctx.displayCurrency)} · ${format(new Date(movement.occurredAt), "d MMM", { locale: es })}`,
            level: z >= 3.0 ? "strong" : "review",
            score: Math.min(99, Math.round(45 + Math.min(z, 6) * 8)),
            reasons: [
              "pico estadístico contra su categoría",
              `${n} gastos previos de referencia`,
            ],
          });
        }
      }
    }

    descriptionHistory.set(normalizedDescription, [...descriptionSamples.slice(-5), amount]);
    if (movement.categoryId != null) {
      categoryHistory.set(movement.categoryId, [...categorySamples.slice(-7), amount]);
    }

    const duplicateKey = `${movement.occurredAt.slice(0, 10)}|${movementDisplayAmount(movement).toFixed(2)}|${normalizedDescription}`;
    duplicateBuckets.set(duplicateKey, [...(duplicateBuckets.get(duplicateKey) ?? []), movement]);
  }

  for (const bucket of duplicateBuckets.values()) {
    if (bucket.length < 2) continue;
    const first = bucket[0];
    findings.push({
      key: `dup-${first.id}`,
      movementId: first.id,
      title: first.description.trim() || "Posible duplicado",
      body: `${bucket.length} movimientos con la misma descripción y monto aparecieron en una ventana de 1 día.`,
      meta: `${categoryMap.get(first.categoryId ?? -1) ?? "Sin categoría"} · ${formatCurrency(expenseAmt(first, ctx), ctx.displayCurrency)} · ${format(new Date(first.occurredAt), "d MMM", { locale: es })}`,
      level: bucket.length >= 3 ? "strong" : "review",
      score: Math.min(96, 56 + (bucket.length - 2) * 11),
      reasons: [
        "misma descripción y monto",
        `${bucket.length} repeticiones en una ventana corta`,
      ],
    });
  }

  const unique = new Map<string, DashboardAnomalyFinding>();
  for (const finding of findings.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.level !== b.level) return a.level === "strong" ? -1 : 1;
    return b.movementId - a.movementId;
  })) {
    if (!unique.has(finding.key)) unique.set(finding.key, finding);
  }

  return Array.from(unique.values()).slice(0, 4);
}

// --- Sub-components -----------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return <Text style={subStyles.sectionTitle}>{children}</Text>;
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
  obligations: { id: number; title: string; dueDate: string | null; pendingAmount: number; currencyCode: string }[];
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
        onPress: () => router.push("/recurring-income"),
      });
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  const visible = items.slice(0, 5);
  const inflowCount = visible.filter((item) => item.kind === "income").length;
  const outflowCount = visible.length - inflowCount;

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
      {visible.map((item) => (
        <TouchableOpacity key={item.key} style={subStyles.upcomingRow} onPress={item.onPress} activeOpacity={0.75}>
          <View style={subStyles.upcomingLeft}>
            <View style={subStyles.upcomingTitleRow}>
              <View style={[
                subStyles.upcomingKindDot,
                item.kind === "income" ? subStyles.upcomingKindDotIncome : item.kind === "subscription" ? subStyles.upcomingKindDotSubscription : subStyles.upcomingKindDotObligation,
              ]} />
              <Text style={subStyles.upcomingLabel} numberOfLines={1}>{item.label}</Text>
            </View>
            <Text style={subStyles.upcomingDate}>
              {format(item.date, "d MMM", { locale: es })} · en {Math.max(0, differenceInDays(item.date, now))}d
            </Text>
          </View>
          <Text style={[subStyles.upcomingAmount, item.kind === "income" && subStyles.upcomingAmountIncome]}>
            {item.kind === "income" ? "+" : "-"}
            {formatCurrency(item.amount, item.currency)}
          </Text>
        </TouchableOpacity>
      ))}
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
}) {
  const review = useMemo(
    () => buildReviewInboxSnapshot(movements, subscriptions, obligations),
    [movements, obligations, subscriptions],
  );

  const items = [
    { key: "uncategorized", count: review.uncategorizedCount, title: "Sin categoria", detail: "Movimientos aplicados que aun no clasificas.", route: "/movements", icon: Tag, tone: COLORS.warning },
    { key: "pending", count: review.pendingMovementsCount, title: "Pendientes de aplicar", detail: "Todavia no impactan el saldo real.", route: "/movements", icon: Clock, tone: COLORS.warning },
    { key: "duplicates", count: review.duplicateExpenseGroups, title: "Posibles duplicados", detail: "Mismo dia, monto y descripcion en gastos.", route: "/movements", icon: AlertTriangle, tone: COLORS.warning },
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
            <TouchableOpacity key={item.key} style={subStyles.reviewItem} onPress={() => router.push(item.route as never)} activeOpacity={0.82}>
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
    if (historyDays >= 45 && categorizedRate >= 0.6) insights.push("Ya hay una base decente para empezar a notar patrones y presión futura.");
    if (insights.length === 0) insights.push("La base del workspace ya está suficientemente sana para lecturas más finas.");
    return { categorizedRate, historyDays, insights, phases, readinessScore, repeatedDescription, usefulCount: useful.length };
  }, [movements]);

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
          : "Sin acciones críticas de aprendizaje",
        body: categorySuggestionsCount > 0 || anomalySignalsCount > 0
          ? "Primero atiende estas señales: mejoran categorización, anomalías y confianza de forecast."
          : "Puedes usar esta capa como monitoreo, no como lista urgente.",
      },
    ];
  }, [
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

function MonthlyPulse({ data, currency }: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
}) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const BAR_HEIGHT = 64;
  return (
    <Card>
      <SectionTitle>Pulso mensual (6 meses)</SectionTitle>
      <View style={subStyles.chartRow}>
        {data.map((d, i) => (
          <View key={i} style={subStyles.chartCol}>
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT }]}>
              <View style={[subStyles.chartBar, { height: Math.max((d.income / maxVal) * BAR_HEIGHT, d.income > 0 ? 3 : 0), backgroundColor: COLORS.income + "cc" }]} />
              <View style={[subStyles.chartBar, { height: Math.max((d.expense / maxVal) * BAR_HEIGHT, d.expense > 0 ? 3 : 0), backgroundColor: COLORS.expense + "cc" }]} />
            </View>
            <Text style={subStyles.chartLabel}>{d.label}</Text>
          </View>
        ))}
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
    { label: "Tasa de ahorro", value: s1, desc: `${(savingsRate * 100).toFixed(1)}% del ingreso` },
    { label: "Meses de cobertura", value: s2, desc: `${coverageMonths.toFixed(1)} meses` },
    { label: "Relación deuda/ingreso", value: s3, desc: `${(debtToIncome * 100).toFixed(1)}%` },
    { label: "Obligaciones al día", value: s4, desc: overdueCount === 0 ? "Sin vencidas" : `${overdueCount} vencidas` },
  ];

  return (
    <Card>
      <View style={subStyles.healthHeader}>
        <SectionTitle>Salud financiera</SectionTitle>
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

// Weekly pattern - average expense per day of week
function WeeklyPattern({ movements, ctx }: { movements: DashboardMovementRow[]; ctx: ConversionCtx }) {
  const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  // getDay returns 0=Sun..6=Sat. We want Mon=0..Sun=6
  const byDay = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  const weekSet = new Set<string>();

  for (const m of movements.filter(isExpense)) {
    const d = new Date(m.occurredAt);
    const jsDay = getDay(d); // 0=Sun
    const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
    byDay[idx].total += expenseAmt(m, ctx);
    // track unique weeks for averaging
    const weekKey = `${d.getFullYear()}-${format(startOfWeek(d, { weekStartsOn: 1 }), "MM-dd")}`;
    weekSet.add(weekKey);
  }

  const weekCount = Math.max(weekSet.size, 1);
  const averages = byDay.map((d) => d.total / weekCount);
  const maxAvg = Math.max(...averages, 1);
  const BAR_HEIGHT = 56;

  if (averages.every((a) => a === 0)) return null;

  return (
    <Card>
      <SectionTitle>Patrón semanal de gastos</SectionTitle>
      <View style={subStyles.chartRow}>
        {averages.map((avg, i) => (
          <View key={i} style={subStyles.chartCol}>
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT, justifyContent: "flex-end" }]}>
              <View
                style={[
                  subStyles.weeklyBar,
                  { height: Math.max((avg / maxAvg) * BAR_HEIGHT, avg > 0 ? 3 : 0) },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{DAY_LABELS[i]}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// Transfer snapshot - top 3 transfer routes
function TransferSnapshot({
  movements, accounts, ctx,
}: {
  movements: DashboardMovementRow[];
  accounts: { id: number; name: string }[];
  ctx: ConversionCtx;
}) {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Group by (sourceAccountId, destinationAccountId)
  const routeMap = new Map<string, { srcId: number; dstId: number; total: number; count: number }>();
  for (const m of movements.filter((m) => m.movementType === "transfer" && m.status === "posted")) {
    if (!m.sourceAccountId || !m.destinationAccountId) continue;
    const key = `${m.sourceAccountId}-${m.destinationAccountId}`;
    const existing = routeMap.get(key);
    if (existing) {
      existing.total += expenseAmt(m, ctx);
      existing.count++;
    } else {
      routeMap.set(key, { srcId: m.sourceAccountId, dstId: m.destinationAccountId, total: expenseAmt(m, ctx), count: 1 });
    }
  }

  const routes = Array.from(routeMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  if (routes.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Rutas de transferencia</SectionTitle>
      {routes.map((r, i) => {
        const srcName = accMap.get(r.srcId) ?? `Cuenta ${r.srcId}`;
        const dstName = accMap.get(r.dstId) ?? `Cuenta ${r.dstId}`;
        return (
          <View key={i} style={[subStyles.transferRow, i < routes.length - 1 && subStyles.leadersSep]}>
            <View style={subStyles.transferRoute}>
              <Text style={subStyles.transferAcct} numberOfLines={1}>{srcName}</Text>
              <ArrowRight size={12} color={COLORS.storm} />
              <Text style={subStyles.transferAcct} numberOfLines={1}>{dstName}</Text>
            </View>
            <Text style={subStyles.transferAmt}>{formatCurrency(r.total, "")}</Text>
          </View>
        );
      })}
    </Card>
  );
}

// Data quality widget
function DataQuality({ movements }: { movements: DashboardMovementRow[] }) {
  const relevant = movements.filter(
    (m) => isCategorizedCashflow(m),
  );
  const noCat = relevant.filter((m) => m.categoryId === null).length;
  const noCounterparty = relevant.filter((m) => m.counterpartyId === null).length;

  if (noCat === 0 && noCounterparty === 0) return null;

  return (
    <Card>
      <SectionTitle>Calidad de datos</SectionTitle>
      {noCat > 0 && (
        <View style={subStyles.dqRow}>
          <Tag size={13} color={COLORS.gold} />
          <Text style={subStyles.dqText}>{noCat} movimiento{noCat !== 1 ? "s" : ""} sin categoría</Text>
        </View>
      )}
      {noCounterparty > 0 && (
        <View style={subStyles.dqRow}>
          <AlertCircle size={13} color={COLORS.storm} />
          <Text style={subStyles.dqText}>{noCounterparty} movimiento{noCounterparty !== 1 ? "s" : ""} sin contraparte</Text>
        </View>
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
  router,
}: {
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  categoryMap: Map<number, string>;
  accountMap: Map<number, string>;
  onExplainPress?: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const anomalies = useMemo(() => {
    const expenses = movements
      .filter(isExpense)
      .filter((movement) => movement.description.trim())
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

    const descriptionHistory = new Map<string, number[]>();
    const categoryHistory = new Map<number, number[]>();
    const duplicateBuckets = new Map<string, DashboardMovementRow[]>();
    const findings: Array<{
      key: string;
      movementId: number;
      title: string;
      body: string;
      meta: string;
      level: "strong" | "review";
    }> = [];

    for (const movement of expenses) {
      const amount = expenseAmt(movement, ctx);
      const normalizedDescription = movement.description.trim().toLowerCase() || "sin-descripcion";
      const descriptionSamples = descriptionHistory.get(normalizedDescription) ?? [];
      const categorySamples = movement.categoryId != null ? categoryHistory.get(movement.categoryId) ?? [] : [];

      if (amount >= 12 && descriptionSamples.length >= 2) {
        const avg = descriptionSamples.reduce((sum, value) => sum + value, 0) / descriptionSamples.length;
        if (avg > 0) {
          const ratio = amount / avg;
          if (ratio >= 2.2) {
            const accountLabel = accountMap.get(movementDisplayAccountId(movement) ?? -1) ?? "Cuenta";
            findings.push({
              key: `desc-${movement.id}`,
              movementId: movement.id,
              title: movement.description.trim() || "Movimiento",
              body: `Este movimiento se ve ${ratio.toFixed(1)}x por encima de lo que suele pasar con esa descripción (${avg.toFixed(2)} como referencia).`,
              meta: `${accountLabel} · ${formatCurrency(amount, ctx.displayCurrency)} · ${format(new Date(movement.occurredAt), "d MMM", { locale: es })}`,
              level: ratio >= 4 ? "strong" : "review",
            });
          }
        }
      }

      if (movement.categoryId != null && amount >= 15 && categorySamples.length >= 3) {
        const avg = categorySamples.reduce((sum, value) => sum + value, 0) / categorySamples.length;
        if (avg > 0) {
          const ratio = amount / avg;
          if (ratio >= 2.3) {
            findings.push({
              key: `cat-${movement.id}`,
              movementId: movement.id,
              title: movement.description.trim() || (categoryMap.get(movement.categoryId) ?? "Movimiento"),
              body: `Este movimiento se ve ${ratio.toFixed(1)}x por encima de lo que suele pasar con esa categoría (${avg.toFixed(2)} como referencia).`,
              meta: `${categoryMap.get(movement.categoryId) ?? "Sin categoría"} · ${formatCurrency(amount, ctx.displayCurrency)} · ${format(new Date(movement.occurredAt), "d MMM", { locale: es })}`,
              level: ratio >= 4 ? "strong" : "review",
            });
          }
        }
      }

      descriptionHistory.set(normalizedDescription, [...descriptionSamples.slice(-5), amount]);
      if (movement.categoryId != null) {
        categoryHistory.set(movement.categoryId, [...categorySamples.slice(-7), amount]);
      }

      const duplicateKey = `${movement.occurredAt.slice(0, 10)}|${movementDisplayAmount(movement).toFixed(2)}|${normalizedDescription}`;
      duplicateBuckets.set(duplicateKey, [...(duplicateBuckets.get(duplicateKey) ?? []), movement]);
    }

    for (const bucket of duplicateBuckets.values()) {
      if (bucket.length < 2) continue;
      const first = bucket[0];
      findings.push({
        key: `dup-${first.id}`,
        movementId: first.id,
        title: first.description.trim() || "Posible duplicado",
        body: `${bucket.length} movimientos con la misma descripción y monto aparecieron en una ventana de 1 día.`,
        meta: `${categoryMap.get(first.categoryId ?? -1) ?? "Sin categoría"} · ${formatCurrency(expenseAmt(first, ctx), ctx.displayCurrency)} · ${format(new Date(first.occurredAt), "d MMM", { locale: es })}`,
        level: "review",
      });
    }

    const unique = new Map<string, typeof findings[number]>();
    for (const finding of findings.sort((a, b) => {
      if (a.level !== b.level) return a.level === "strong" ? -1 : 1;
      return b.movementId - a.movementId;
    })) {
      if (!unique.has(finding.key)) unique.set(finding.key, finding);
    }

    return Array.from(unique.values()).slice(0, 4);
  }, [accountMap, categoryMap, ctx, movements]);

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
            onPress={() => router.push(`/movement/${item.movementId}?from=dashboard`)}
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
      <TouchableOpacity style={subStyles.secondaryOutlineBtn} onPress={() => router.push("/movements" as never)} activeOpacity={0.82}>
        <Text style={subStyles.secondaryOutlineBtnText}>Abrir movimientos para revisar</Text>
      </TouchableOpacity>
    </Card>
  );
}

function DashboardLayerHeader({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <View style={subStyles.layerSection}>
      <Text style={subStyles.layerSectionKicker}>{kicker}</Text>
      <Text style={subStyles.layerSectionTitle}>{title}</Text>
      <Text style={subStyles.layerSectionBody}>{body}</Text>
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

type AdvancedTab = 'Hoy' | 'Análisis' | 'Agenda' | 'Historial' | 'Datos';

const ADVANCED_TABS: { id: AdvancedTab; label: string }[] = [
  { id: 'Hoy',      label: 'Hoy' },
  { id: 'Análisis', label: 'Análisis' },
  { id: 'Agenda',   label: 'Agenda' },
  { id: 'Historial',label: 'Historial' },
  { id: 'Datos',    label: 'Datos' },
];

function DashboardTabBar({ activeTab, onTabChange }: { activeTab: AdvancedTab; onTabChange: (tab: AdvancedTab) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabBarStyles.row}
      style={tabBarStyles.container}
    >
      {ADVANCED_TABS.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => onTabChange(tab.id)}
          style={[tabBarStyles.chip, activeTab === tab.id && tabBarStyles.chipActive]}
        >
          <Text style={[tabBarStyles.chipText, activeTab === tab.id && tabBarStyles.chipTextActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
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
    return {
      month: selectedAnnualMonth,
      incomeCount: monthMovements.filter(isIncome).length,
      expenseCount: monthMovements.filter(isExpense).length,
      topCategoryId,
      topCategoryName: topCategoryAmount > 0 ? (topCategoryId != null ? (categoryMap.get(topCategoryId) ?? "Categoría") : "Sin categoría") : "Sin gasto categorizado",
      topCategoryAmount,
      largestMovements: relevantMovements,
      savingsRate,
    };
  }, [accountCurrencyMap, accountMap, activeCurrency, categoryMap, exchangeRateMap, movements, selectedAnnualMonth]);

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
    if (total <= 0) return { hhi: null, label: "Sin datos", color: COLORS.storm, topCategory: null, topShare: null };
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
    return { hhi: Math.round(hhi * 1000) / 1000, label, color, topCategory, topShare };
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

  const [preset, setPreset] = useState<AdvancedPreset>("manual");
  const presetLoadedRef = useRef(false);
  useEffect(() => {
    if (presetLoadedRef.current) return;
    presetLoadedRef.current = true;
    void AsyncStorage.getItem(DASHBOARD_ADVANCED_PRESET_KEY).then((stored) => {
      if (stored && stored in ADVANCED_PRESET_META) setPreset(stored as AdvancedPreset);
    });
  }, []);

  const applyPreset = useCallback((nextPreset: AdvancedPreset) => {
    setPreset(nextPreset);
    void AsyncStorage.setItem(DASHBOARD_ADVANCED_PRESET_KEY, nextPreset);
  }, []);

  const anomalySignals = useMemo(
    () => buildAnomalyFindings(
      movements,
      { accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency },
      categoryMap,
      accountMap,
    ),
    [accountCurrencyMap, accountMap, activeCurrency, categoryMap, exchangeRateMap, movements],
  );

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

  const focusAction = useMemo(() => {
    if (review.uncategorizedCount > 0) {
      return {
        title: "Ordenar categorías",
        body: `${review.uncategorizedCount} movimientos siguen sin categoría.`,
        detail: "Más categoría significa comparativos y alertas mucho más finas.",
        tag: "Orden fino",
        route: "/movements",
      };
    }
    if (review.overdueObligationsCount > 0) {
      return {
        title: "Resolver vencimientos",
        body: `${review.overdueObligationsCount} cobros o pagos ya se quedaron fuera de fecha.`,
        detail: "Limpiar esto primero evita que la cartera siga arrastrando lectura falsa.",
        tag: "Cartera",
        route: "/obligations",
      };
    }
    if (review.subscriptionsAttentionCount > 0) {
      return {
        title: "Revisar suscripciones",
        body: `${review.subscriptionsAttentionCount} cargos fijos todavía necesitan cuenta o fecha más clara.`,
        detail: "Ordenar esa base mejora la proyección de corto plazo.",
        tag: "Liquidez",
        route: "/subscriptions",
      };
    }
    if (weekWindow.expectedOutflow > weekWindow.expectedInflow) {
      return {
        title: "Cuidar liquidez",
        body: "La próxima semana sale más dinero del que entra.",
        detail: "Revisa compromisos cercanos antes de que la presión se sienta tarde.",
        tag: "Liquidez",
        route: "/dashboard",
      };
    }
    return {
      title: "Mantener el ritmo",
      body: "No vemos una fricción fuerte inmediata en tu sistema.",
      detail: "Buen momento para consolidar hábitos, metas y calidad del dato.",
      tag: "Estable",
      route: "/dashboard",
    };
  }, [review, weekWindow.expectedInflow, weekWindow.expectedOutflow]);

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
  const [advancedDetail, setAdvancedDetail] = useState<"focusCenter" | "projection" | "review" | "advancedMetrics" | "quality" | null>(null);
  const [projectionDetail, setProjectionDetail] = useState<"conservative" | "expected" | "included" | null>(null);

  const openMovementsQuickFilter = useCallback((
    quickFilterOrOptions:
      | "uncategorized"
      | {
        quickFilter?: "uncategorized";
        quickStatus?: "pending" | "planned" | "posted";
        quickCategoryId?: number | null;
        quickDateFrom?: string;
        quickDateTo?: string;
        quickType?: "income" | "expense" | "transfer" | "obligation_payment" | "subscription_payment" | "refund" | "adjustment" | "obligation_opening";
      },
    quickStatus?: "pending" | "planned" | "posted",
  ) => {
    const options = typeof quickFilterOrOptions === "string"
      ? { quickFilter: quickFilterOrOptions, quickStatus }
      : quickFilterOrOptions;
    const params: Record<string, string> = {
      quickScope: "dashboard-executive",
      quickToken: `${Date.now()}`,
    };
    if (options.quickFilter) params.quickFilter = options.quickFilter;
    if (options.quickStatus) params.quickStatus = options.quickStatus;
    if (options.quickCategoryId != null) params.quickCategoryId = String(options.quickCategoryId);
    if (options.quickDateFrom) params.quickDateFrom = options.quickDateFrom;
    if (options.quickDateTo) params.quickDateTo = options.quickDateTo;
    if (options.quickType) params.quickType = options.quickType;
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setSelectedAnnualMonth(null);
    router.push({ pathname: "/movements", params } as never);
  }, [router]);

  const openFocusActionDestination = useCallback(() => {
    if (review.uncategorizedCount > 0) {
      openMovementsQuickFilter("uncategorized");
      return;
    }
    setAdvancedDetail(null);
    if (focusAction.route === "/dashboard") return;
    router.push(focusAction.route as never);
  }, [focusAction.route, openMovementsQuickFilter, review.uncategorizedCount, router]);

  const openPrecisionLayer = useCallback(() => {
    setExecutiveDetail(null);
    setAdvancedDetail(null);
    setProjectionDetail(null);
    setQualityOpen(true);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => onRequestPrecisionFocus?.(), 120);
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
    if (persistedCategorySuggestions.length > 0) return persistedCategorySuggestions;
    return buildCategorySuggestions(movements, snapshot?.categories ?? [], {
      accountCurrencyMap,
      exchangeRateMap,
      displayCurrency: activeCurrency,
    });
  }, [
    accountCurrencyMap,
    activeCurrency,
    exchangeRateMap,
    movements,
    persistedCategorySuggestions,
    snapshot?.categories,
  ]);

  const projectionModel = useMemo(() => {
    const currentMonthKey = format(new Date(), "yyyy-MM");
    if (
      analytics?.projectionSnapshot &&
      analytics.projectionSnapshot.periodKey === currentMonthKey &&
      analytics.projectionSnapshot.expectedBalance != null &&
      analytics.projectionSnapshot.conservativeBalance != null &&
      analytics.projectionSnapshot.optimisticBalance != null &&
      analytics.projectionSnapshot.committedInflow != null &&
      analytics.projectionSnapshot.committedOutflow != null &&
      analytics.projectionSnapshot.variableIncomeProjection != null &&
      analytics.projectionSnapshot.variableExpenseProjection != null &&
      analytics.projectionSnapshot.confidence != null
    ) {
      const confidence = Math.round(analytics.projectionSnapshot.confidence);
      return {
        expectedBalance: analytics.projectionSnapshot.expectedBalance,
        conservativeBalance: analytics.projectionSnapshot.conservativeBalance,
        optimisticBalance: analytics.projectionSnapshot.optimisticBalance,
        committedInflow: analytics.projectionSnapshot.committedInflow,
        committedOutflow: analytics.projectionSnapshot.committedOutflow,
        variableIncomeProjection: analytics.projectionSnapshot.variableIncomeProjection,
        variableExpenseProjection: analytics.projectionSnapshot.variableExpenseProjection,
        confidence,
        confidenceLabel: confidence >= 78 ? "Alta" : confidence >= 60 ? "Media" : "Base corta",
        remainingDays: Math.max(0, differenceInDays(endOfMonth(new Date()), new Date())),
      } satisfies DashboardProjectionModel;
    }

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
    analytics?.projectionSnapshot,
    currentVisibleBalance,
    exchangeRateMap,
    movements,
    obligations,
    recurringIncome,
    subscriptions,
  ]);

  const suggestedPreset = useMemo<AdvancedPreset>(() => {
    if (review.uncategorizedCount > 0 || review.pendingMovementsCount > 0 || review.duplicateExpenseGroups > 0) return "control";
    if (review.overdueObligationsCount > 0 || review.obligationsWithoutPlanCount > 0) return "portfolio";
    if (weekWindow.expectedOutflow > weekWindow.expectedInflow || projectionModel.expectedBalance < currentVisibleBalance * 0.92) return "liquidity";
    if (learning.readinessScore >= 70) return "analytics";
    return "manual";
  }, [currentVisibleBalance, learning.readinessScore, projectionModel.expectedBalance, review, weekWindow.expectedInflow, weekWindow.expectedOutflow]);

  const persistDashboardAnalyticsMutation = usePersistDashboardAnalyticsMutation(workspaceId);
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
  const featuredWidgetChips = ADVANCED_PRESET_WIDGETS[preset];
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

  const executiveDetails = useMemo(() => ({
    focus: {
      title: "Estado del sistema",
      summary: "Te dice qué tan confiable es la lectura general antes de tomar decisiones con el dashboard.",
      meaning: [
        "Esta tarjeta no te dice qué hacer ahora; solo mide si la base de datos permite confiar en los análisis.",
        "Sirve para saber si las demás lecturas salen de información suficientemente ordenada o si todavía hay ruido que puede distorsionar comparativos y proyecciones.",
      ],
      calculation: [
        `La confianza actual es ${learning.readinessScore}%. Se calcula con historia observada (${learning.historyDays} días), movimientos útiles (${learning.usefulCount}) y categorías útiles (${Math.round(learning.categorizedRate * 100)}%).`,
        `Además revisamos fricción operativa: ${review.uncategorizedCount} movimientos sin categoría, ${review.overdueObligationsCount} obligaciones vencidas, ${review.subscriptionsAttentionCount} suscripciones con atención y ${review.pendingMovementsCount} movimientos pendientes.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Abrir ${review.uncategorizedCount} sin categoría`, onPress: () => openMovementsQuickFilter("uncategorized") }
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
        `Después aplicamos la fórmula: saldo visible + comprometido neto (${formatCurrency(projectionCommittedNet, activeCurrency)}) + variable neto (${formatCurrency(projectionVariableNet, activeCurrency)}) = ${formatCurrency(projectionModel.expectedBalance, activeCurrency)}.`,
        `El rango defensivo queda en ${formatCurrency(projectionModel.conservativeBalance, activeCurrency)} y el escenario alto en ${formatCurrency(projectionModel.optimisticBalance, activeCurrency)}.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: "Limpiar movimientos sin categoría", onPress: () => openMovementsQuickFilter("uncategorized") }
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
    openMovementsQuickFilter,
    projectionModel.conservativeBalance,
    projectionModel.committedInflow,
    projectionModel.committedOutflow,
    projectionModel.expectedBalance,
    projectionModel.optimisticBalance,
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
      summary: "Te explica por que esta es la mejor accion inmediata y te deja saltar directo a la pantalla donde puedes resolverla.",
      meaning: [
        "No busca mostrarlo todo. Prioriza una sola accion para que sepas por donde empezar sin interpretar demasiados widgets antes.",
        "Sirve para decisiones inmediatas: ordenar datos, corregir cartera, revisar suscripciones o proteger liquidez de corto plazo.",
      ],
      calculation: [
        `Hoy el foco cayo en "${focusAction.title}" porque el motor pondera primero datos sin categoria, luego obligaciones vencidas, despues suscripciones con atencion y al final la presion de 7 dias.`,
        `En esta lectura vemos ${review.uncategorizedCount} movimientos sin categoria, ${review.overdueObligationsCount} obligaciones vencidas, ${review.subscriptionsAttentionCount} suscripciones con atencion y una caja libre de ${cashCushion.days} dias.`,
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Abrir ${review.uncategorizedCount} sin categoria`, onPress: () => openMovementsQuickFilter("uncategorized") }
          : review.overdueObligationsCount > 0
            ? { label: "Abrir creditos y deudas", onPress: () => { setAdvancedDetail(null); router.push("/obligations" as never); } }
            : review.subscriptionsAttentionCount > 0
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
      ],
      actions: [
        review.uncategorizedCount > 0
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: () => openMovementsQuickFilter("uncategorized") }
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
        { label: "Abrir movimientos para revisar", onPress: () => { setAdvancedDetail(null); router.push("/movements" as never); } },
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
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoria`, onPress: () => openMovementsQuickFilter("uncategorized") }
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
          ? { label: `Abrir ${qualitySnapshot.noCategoryCount} sin categoría`, onPress: () => openMovementsQuickFilter("uncategorized") }
          : null,
        { label: qualityOpen ? "Ocultar capa de calidad" : "Abrir capa de calidad", onPress: qualityOpen ? () => { setAdvancedDetail(null); setQualityOpen(false); } : openPrecisionLayer },
      ].filter((action): action is { label: string; onPress: () => void } => Boolean(action)),
    },
  }), [
    activeCurrency,
    cashCushion.days,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    collectionEfficiency.rate,
    collectionEfficiency.total,
    focusAction.title,
    incomeStabilityScore.cvPct,
    incomeStabilityScore.score,
    learning.readinessScore,
    monthlySavingsRate.lastRate,
    monthlySavingsRate.trend,
    openFocusActionDestination,
    openMovementsQuickFilter,
    openPrecisionLayer,
    projectionModel.committedInflow,
    projectionModel.committedOutflow,
    projectionModel.conservativeBalance,
    projectionModel.expectedBalance,
    projectionModel.variableExpenseProjection,
    projectionModel.variableIncomeProjection,
    qualityOpen,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
    router,
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
  }), [
    activeCurrency,
    anomalySignals,
    categoryConcentration.label,
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
  } as const), [
    anomalySignals,
    incomeStabilityScore.score,
    monthlySavingsRate.lastRate,
    projectionModel.confidence,
    qualitySnapshot.noCategoryCount,
    qualitySnapshot.noCounterpartyCount,
    review.overdueObligationsCount,
    review.subscriptionsAttentionCount,
    review.uncategorizedCount,
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
          ? { label: `Limpiar ${review.uncategorizedCount} sin categoría`, onPress: () => openMovementsQuickFilter("uncategorized") }
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
        { label: "Ver movimientos del mes", onPress: () => openMovementsQuickFilter({
          quickDateFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"),
          quickDateTo: format(endOfMonth(new Date()), "yyyy-MM-dd"),
        }) },
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
  const [activeTab, setActiveTab] = useState<AdvancedTab>('Hoy');
  const handleTabChange = useCallback((tab: AdvancedTab) => {
    setActiveTab(tab);
    onScrollToTop?.();
  }, [onScrollToTop]);

  return (
    <>
      <DashboardTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 'Hoy' && <>
      <DashboardLayerHeader
        kicker="Hoy"
        title="Lectura rápida"
        body="Esta capa resume el estado del sistema: qué tan confiable es la lectura, cómo viene la semana y cómo podría cerrar el mes."
      />

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
              {review.totalIssues > 0 ? `${review.totalIssues} punto${review.totalIssues === 1 ? "" : "s"} afectan precisión` : "Base lista para lecturas finas"}
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
            <Text style={subStyles.executiveCaption}>Entran {formatCurrency(weekWindow.expectedInflow, activeCurrency)} y salen {formatCurrency(weekWindow.expectedOutflow, activeCurrency)}</Text>
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
            <Text style={subStyles.executiveCaption}>Suma visible hoy: {formatCurrency(currentVisibleBalance, activeCurrency)} · {activeAccounts.length} cuenta{activeAccounts.length === 1 ? "" : "s"}</Text>
            <Text style={subStyles.executiveCaption}>{visibleAccountSummary}</Text>
            <Text style={[subStyles.executiveDeltaChip, { color: monthEndDelta >= 0 ? COLORS.income : COLORS.expense }]}>Vs hoy: {formatCurrency(monthEndDelta, activeCurrency)}</Text>
          </TouchableOpacity>
        </View>
      </Card>

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

            <View style={subStyles.annualDetailSection}>
              <Text style={subStyles.annualDetailSectionTitle}>Qué empujó el gasto</Text>
              <TouchableOpacity
                style={subStyles.annualDetailCategoryCard}
                onPress={() => {
                  if (!selectedAnnualMonthDetail) return;
                  openMovementsQuickFilter({
                    ...(selectedAnnualMonthDetail.topCategoryId == null ? { quickFilter: "uncategorized" as const } : { quickCategoryId: selectedAnnualMonthDetail.topCategoryId }),
                    quickDateFrom: selectedAnnualMonthDetail.month.dateFrom,
                    quickDateTo: selectedAnnualMonthDetail.month.dateTo,
                  });
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
                      setSelectedAnnualMonth(null);
                      router.push(`/movement/${movement.id}?from=dashboard` as never);
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
                onPress={() => openMovementsQuickFilter({
                  quickDateFrom: selectedAnnualMonthDetail.month.dateFrom,
                  quickDateTo: selectedAnnualMonthDetail.month.dateTo,
                })}
                activeOpacity={0.84}
              >
                <Text style={subStyles.annualDetailPrimaryBtnText}>Abrir movimientos del mes</Text>
              </TouchableOpacity>
              <View style={subStyles.annualDetailSplitActions}>
                <TouchableOpacity
                  style={subStyles.annualDetailSecondaryBtn}
                  onPress={() => openMovementsQuickFilter({
                    quickDateFrom: selectedAnnualMonthDetail.month.dateFrom,
                    quickDateTo: selectedAnnualMonthDetail.month.dateTo,
                    quickType: "income",
                  })}
                  activeOpacity={0.84}
                >
                  <Text style={subStyles.annualDetailSecondaryBtnText}>Solo ingresos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={subStyles.annualDetailSecondaryBtn}
                  onPress={() => openMovementsQuickFilter({
                    quickDateFrom: selectedAnnualMonthDetail.month.dateFrom,
                    quickDateTo: selectedAnnualMonthDetail.month.dateTo,
                    quickType: "expense",
                  })}
                  activeOpacity={0.84}
                >
                  <Text style={subStyles.annualDetailSecondaryBtnText}>Solo gastos</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </BottomSheet>

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
              <View style={subStyles.focusHeroTonePillMuted}><Text style={subStyles.focusHeroToneTextMuted} numberOfLines={1}>Sistema</Text></View>
            </View>
          </View>
          <View style={subStyles.focusHeroMiddle}>
            <View style={{ flex: 1, gap: SPACING.xs }}>
              <Text style={subStyles.focusHeroTitle}>{focusAction.title}</Text>
              <Text style={subStyles.focusHeroValue}>{focusAction.body}</Text>
              <Text style={subStyles.focusHeroBody}>{focusAction.detail}</Text>
            </View>
            <ArrowRight size={20} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        <View style={subStyles.focusMetricGrid}>
          <TouchableOpacity style={subStyles.focusMetricCard} onPress={() => setExecutiveDetail("risk")} activeOpacity={0.84}>
            <Text style={subStyles.focusMetricLabel}>Presión 7 días</Text>
            <Text style={subStyles.focusMetricValue}>{formatCurrency(weekWindow.expectedInflow - weekWindow.expectedOutflow, activeCurrency)}</Text>
            <Text style={subStyles.focusMetricHint}>Sobre saldo visible actual: entran {formatCurrency(weekWindow.expectedInflow, activeCurrency)} · sale {formatCurrency(weekWindow.expectedOutflow, activeCurrency)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={subStyles.focusMetricCard} onPress={() => setExecutiveDetail("month")} activeOpacity={0.84}>
            <Text style={subStyles.focusMetricLabel}>Caja estimada fin de mes</Text>
            <Text style={subStyles.focusMetricValue}>{formatCurrency(monthEndReading, activeCurrency)}</Text>
            <Text style={subStyles.focusMetricHint}>Suma visible hoy {formatCurrency(currentVisibleBalance, activeCurrency)} · vs hoy {formatCurrency(monthEndDelta, activeCurrency)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[subStyles.focusMetricCard, subStyles.focusMetricCardWide]} onPress={() => setAdvancedDetail("focusCenter")} activeOpacity={0.84}>
            <Text style={subStyles.focusMetricLabel}>Caja libre</Text>
            <Text style={[subStyles.focusMetricValue, { color: cashCushion.color }]}>{cashCushion.days}d · {cashCushion.label}</Text>
            <Text style={subStyles.focusMetricHint}>Sobre {formatCurrency(currentVisibleBalance, activeCurrency)} visibles · {cashCushion.daysWithCommitments}d con compromisos</Text>
          </TouchableOpacity>
        </View>

        <View style={subStyles.coachChipList}>
          {panelCoachChips.map((chip, i) => (
            <View key={i} style={[subStyles.coachChip, { borderLeftColor: chip.color }]}>
              <chip.icon size={13} color={chip.color} strokeWidth={2} />
              <Text style={[subStyles.coachChipText, chip.weight === "high" && { color: COLORS.ink }]}>{chip.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <DashboardLayerHeader
        kicker="Coach IA"
        title="Panel recomendado y modo de lectura"
        body="Esta capa no decide por ti: ordena lo destacado, sugiere una vista y te deja fijar los widgets que quieres ver primero."
      />

      <Card>
        <Text style={subStyles.panelKicker}>Widgets fijos</Text>
        <Text style={subStyles.panelTitle}>Panel destacado Pro</Text>
        <Text style={subStyles.panelBody}>
          Ancla los widgets que quieras arriba, reordena su prioridad y deja que el dashboard recuerde tu lectura favorita.
        </Text>
        <View style={subStyles.panelCoachCard}>
          <View style={subStyles.panelCoachTop}>
            <View style={subStyles.panelCoachIcon}>
              <Sparkles size={16} color={COLORS.gold} />
            </View>
            <View style={subStyles.panelCoachCopy}>
              <Text style={subStyles.panelCoachLabel}>Coach del panel</Text>
              <Text style={subStyles.panelCoachTitle}>{ADVANCED_PRESET_META[suggestedPreset].cta} - {ADVANCED_PRESET_META[suggestedPreset].title}</Text>
            </View>
            <View style={subStyles.panelCoachPill}>
              <Text style={subStyles.panelCoachPillText}>Sugerencia</Text>
            </View>
          </View>
          <View style={subStyles.coachChipList}>
            {panelCoachChips.map((chip, i) => (
              <View key={i} style={[subStyles.coachChip, { borderLeftColor: chip.color }]}>
                <chip.icon size={13} color={chip.color} strokeWidth={2} />
                <Text style={[subStyles.coachChipText, chip.weight === "high" && { color: COLORS.ink }]}>{chip.label}</Text>
              </View>
            ))}
          </View>
          <View style={subStyles.panelCoachFooter}>
            <Text style={subStyles.panelCoachFooterText}>
              {preset === "manual" ? "Aun no fijaste un panel principal." : `Panel actual: ${ADVANCED_PRESET_META[preset].title}.`}
            </Text>
            {preset !== suggestedPreset ? (
              <TouchableOpacity style={subStyles.panelApplyBtn} onPress={() => applyPreset(suggestedPreset)} activeOpacity={0.85}>
                <Text style={subStyles.panelApplyBtnText}>{ADVANCED_PRESET_META[suggestedPreset].cta}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={subStyles.presetHeaderRow}>
          <Text style={subStyles.presetTitle}>Presets y modo</Text>
          <View style={subStyles.panelCoachPill}>
            <Text style={subStyles.panelCoachPillText}>Recomendado por DarkMoney</Text>
          </View>
        </View>

        <View style={subStyles.presetGrid}>
          {(Object.keys(ADVANCED_PRESET_META) as AdvancedPreset[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[subStyles.presetCard, preset === option && subStyles.presetCardActive, option === "analytics" && subStyles.presetCardWide]}
              onPress={() => applyPreset(option)}
              activeOpacity={0.84}
            >
              <View style={subStyles.presetCardTop}>
                <Text style={subStyles.presetCardTitle}>{ADVANCED_PRESET_META[option].title}</Text>
                {option === suggestedPreset ? (
                  <View style={subStyles.presetBadge}>
                    <Text style={subStyles.presetBadgeText}>{option === "control" ? "Sugerido" : "Recomendado"}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={subStyles.presetCardBody}>{ADVANCED_PRESET_META[option].subtitle}</Text>
              {option === suggestedPreset ? (
                <Text style={subStyles.presetSituationalText}>{ADVANCED_PRESET_META[option].situationalSubtitle}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        <View style={subStyles.widgetPanelCard}>
          <Text style={subStyles.widgetPanelTitle}>
            {featuredWidgetChips.length > 0 ? "Widgets priorizados" : "Aun no tienes widgets fijados"}
          </Text>
          <Text style={subStyles.widgetPanelBody}>
            {featuredWidgetChips.length > 0
              ? `Tu panel ${ADVANCED_PRESET_META[preset].title} prioriza esta lectura arriba, pero el resto del dashboard sigue explicando tu sistema por capas.`
              : "Elige los widgets que quieras para convertir la parte alta del dashboard en tu panel favorito."}
          </Text>
          {featuredWidgetChips.length === 0 ? (
            <Text style={subStyles.widgetPanelHint}>Si no quieres un preset, toca Manual y luego elige abajo tus widgets favoritos.</Text>
          ) : null}
          <View style={subStyles.widgetChipWrap}>
            {(featuredWidgetChips.length > 0 ? featuredWidgetChips : ADVANCED_WIDGET_LIBRARY).map((chip) => (
              <View key={chip} style={subStyles.widgetChip}>
                <Text style={subStyles.widgetChipText}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <Text style={subStyles.layerKicker}>Como funciona tu panel</Text>
        <Text style={subStyles.layerHeroTitle}>Los presets cambian lo destacado, pero las capas se mantienen</Text>
        <Text style={subStyles.layerHeroBody}>
          Aunque uses un preset, el dashboard Pro conserva una ruta fija: hoy, liquidez, evolución, patrones, coach y precisión.
        </Text>
        <View style={subStyles.howList}>
          <View style={subStyles.howItem}>
            <Text style={subStyles.howTitle}>Hoy</Text>
            <Text style={subStyles.howBody}>Te ubica rápido: foco, presión cercana y posible cierre del mes.</Text>
          </View>
          <View style={subStyles.howItem}>
            <Text style={subStyles.howTitle}>Próximas semanas</Text>
            <Text style={subStyles.howBody}>Mira compromisos, entradas esperadas y salud de caja antes de que llegue la presión.</Text>
          </View>
          <View style={subStyles.howItem}>
            <Text style={subStyles.howTitle}>Evolución y patrones</Text>
            <Text style={subStyles.howBody}>Compara tu ritmo histórico y detecta categorías, hábitos o movimientos raros.</Text>
          </View>
          <View style={subStyles.howItem}>
            <Text style={subStyles.howTitle}>Precisión</Text>
            <Text style={subStyles.howBody}>Te dice qué tan confiable es la lectura y qué datos conviene limpiar.</Text>
          </View>
        </View>
      </Card>

      </>}

      {activeTab === 'Análisis' && <>
      <DashboardLayerHeader
        kicker="Gráficos"
        title="Lecturas visuales"
        body="Una capa rápida para ver de un golpe qué mueve tu cierre, cómo viene tu ahorro y dónde se concentra el gasto."
      />

      <ProjectionBridgeChart
        currentVisibleBalance={currentVisibleBalance}
        committedNet={projectionCommittedNet}
        variableNet={projectionVariableNet}
        expectedBalance={projectionModel.expectedBalance}
        currency={activeCurrency}
        onOpenAccounts={() => router.push("/accounts" as never)}
        onExplainProjection={() => setAdvancedDetail("projection")}
        onOpenMonthMovements={() => openMovementsQuickFilter({
          quickDateFrom: format(advancedStats.curStart, "yyyy-MM-dd"),
          quickDateTo: format(advancedStats.curEnd, "yyyy-MM-dd"),
        })}
      />
      <SavingsMomentumChart
        data={advancedStats.monthlyPulse}
        currency={activeCurrency}
        onOpenMonth={(quickDateFrom, quickDateTo) => openMovementsQuickFilter({ quickDateFrom, quickDateTo })}
      />
      <CategoryDonutChart
        catTotals={advancedStats.catTotals}
        categories={snapshot?.categories ?? []}
        currency={activeCurrency}
        onOpenCategory={(quickCategoryId) => openMovementsQuickFilter({
          ...(quickCategoryId == null ? { quickFilter: "uncategorized" as const } : { quickCategoryId }),
          quickDateFrom: format(advancedStats.curStart, "yyyy-MM-dd"),
          quickDateTo: format(advancedStats.curEnd, "yyyy-MM-dd"),
        })}
      />

      </>}

      {activeTab === 'Agenda' && <>
      <DashboardLayerHeader
        kicker="Próximas semanas"
        title="Liquidez, salud y compromisos"
        body="Esta parte te dice si lo que viene se ve controlado o si conviene mover foco antes de que se sienta la presión."
      />
      <FutureFlowPreview
        obligations={obligations}
        subscriptions={subscriptions}
        recurringIncome={recurringIncome}
        displayCurrency={activeCurrency}
        exchangeRateMap={exchangeRateMap}
        currentVisibleBalance={currentVisibleBalance}
      />
      <UpcomingSection
        obligations={obligations}
        subscriptions={subscriptions}
        recurringIncome={recurringIncome}
        router={router}
      />
      <Card>
        <View style={subStyles.cardHeaderWithAction}>
          <SectionTitle>Proyección refinada</SectionTitle>
          <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={() => setAdvancedDetail("projection")} activeOpacity={0.82}>
            <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
          </TouchableOpacity>
        </View>
        <Text style={subStyles.executiveIntro}>
          Esta lectura ya separa lo comprometido del mes de tu ritmo variable reciente para darte una banda más útil, no un solo número.
        </Text>
        <View style={subStyles.executiveGrid}>
          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setProjectionDetail("conservative")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Conservador</Text>
              <View style={[subStyles.executiveTonePill, subStyles.executiveTonePillWarning]}>
                <Text style={[subStyles.executiveToneText, subStyles.executiveToneTextWarning]}>Defensivo</Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{formatCurrency(projectionModel.conservativeBalance, activeCurrency)}</Text>
            <Text style={subStyles.executiveCaption}>Vs visible hoy: {formatCurrency(projectionConservativeDelta, activeCurrency)} con escenario defensivo.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={subStyles.executiveCard} activeOpacity={0.84} onPress={() => setProjectionDetail("expected")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Esperado</Text>
              <View style={subStyles.executiveTonePill}>
                <Text style={subStyles.executiveToneText}>{projectionModel.confidenceLabel}</Text>
              </View>
            </View>
            <Text style={subStyles.executiveValue}>{formatCurrency(projectionModel.expectedBalance, activeCurrency)}</Text>
            <Text style={subStyles.executiveCaption}>{projectionModel.confidence}% de confianza · vs hoy {formatCurrency(projectionExpectedDelta, activeCurrency)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[subStyles.executiveCard, subStyles.executiveCardWide]} activeOpacity={0.84} onPress={() => setProjectionDetail("included")}>
            <View style={subStyles.executiveTop}>
              <Text style={subStyles.executiveLabel}>Qué ya entra en la lectura</Text>
            </View>
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
              <Text style={subStyles.projectionScenarioText}>Piso defensivo: {formatCurrency(projectionModel.conservativeBalance, activeCurrency)}</Text>
              <Text style={subStyles.projectionScenarioText}>Escenario alto: {formatCurrency(projectionModel.optimisticBalance, activeCurrency)}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Card>
      <HealthScore
        netWorth={currentVisibleBalance}
        income={monthToDate.income}
        expense={monthToDate.expense}
        obligations={obligations}
        netWorthThreeMonthExpense={currentVisibleBalance / Math.max(monthToDate.expense, 1)}
      />
      <SubscriptionsSummary subscriptions={subscriptions} currency={activeCurrency} />
      <ObligationWatch obligations={obligations} router={router} />

      </>}

      {activeTab === 'Análisis' && <>
      <DashboardLayerHeader
        kicker="Patrones"
        title="Hábitos, anomalías y categorías"
        body="Abre esta parte cuando quieras entender de dónde sale la lectura del resumen y qué hábitos están marcando el mes."
      />
      <ReviewInbox
        movements={movements}
        subscriptions={subscriptions}
        obligations={obligations}
        router={router}
      />
      <Card>
        <SectionTitle>Sugerencias de categoría</SectionTitle>
        <Text style={subStyles.executiveIntro}>
          Aquí DarkMoney ya se apoya en tu historial: descripciones repetidas, contraparte y montos parecidos para adelantarte categorías con confianza.
        </Text>
        {categorySuggestions.length === 0 ? (
          <View style={subStyles.richEmptyState}>
            <Brain size={18} color={COLORS.primary} />
            <Text style={subStyles.richEmptyTitle}>Aún no hay sugerencias fuertes</Text>
            <Text style={subStyles.richEmptyBody}>Cuando vea repeticiones más claras en tu historial, aquí te propondrá categorías antes de que tengas que buscarlas a mano.</Text>
          </View>
        ) : (
          <View style={subStyles.commandActions}>
            {categorySuggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.movementId}
                style={subStyles.commandActionRow}
                onPress={() => router.push("/movements" as never)}
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
      <AnomalyWatch
        movements={movements}
        ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }}
        categoryMap={categoryMap}
        accountMap={accountMap}
        onExplainPress={() => setAdvancedDetail("review")}
        router={router}
      />
      <CategoryBreakdown catTotals={advancedStats.catTotals} categories={snapshot?.categories ?? []} currency={activeCurrency} />
      <TransferSnapshot movements={movements} accounts={activeAccounts} ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }} />
      <WeeklyPattern movements={movements} ctx={{ accountCurrencyMap, exchangeRateMap, displayCurrency: activeCurrency }} />
      <AccountsBreakdown
        accounts={snapshot?.accounts ?? []}
        displayCurrency={activeCurrency}
        baseCurrency={baseCurrency}
        exchangeRateMap={exchangeRateMap}
      />
      <CurrencyExposure accounts={snapshot?.accounts ?? []} />

      </>}

      {activeTab === 'Historial' && <>
      <DashboardLayerHeader
        kicker="Evolución"
        title="Historial y métricas"
        body="Aquí ves si el mes actual es una excepción o parte de una tendencia: ahorro, estabilidad, pulso mensual y comparación con tu propio historial."
      />
      <AnnualHistoryPanel
        years={historyYears}
        selectedYear={selectedHistoryYear}
        onSelectYear={setSelectedHistoryYear}
        data={annualHistory}
        currency={activeCurrency}
        onSelectMonth={setSelectedAnnualMonth}
      />
      <MonthlyPulse data={advancedStats.monthlyPulse} currency={activeCurrency} />

      {/* N1-N5: Métricas avanzadas - tasa de ahorro, estabilidad, concentración, cobranza, estacional */}
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
        <TouchableOpacity style={subStyles.advMetricSection} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.84}>
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
              : "Insuficiente historial para calcular promedio"}
          </Text>
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
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.84}>
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
              : incomeStabilityScore.label}
          </Text>
          {incomeStabilityScore.score != null ? (
            <View style={subStyles.advScoreBar}>
              <View style={[subStyles.advScoreFill, { width: `${incomeStabilityScore.score}%` as any, backgroundColor: incomeStabilityScore.color }]} />
            </View>
          ) : null}
        </TouchableOpacity>

        {/* N3: Índice HHI de concentración de gasto */}
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.84}>
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
              ? `HHI: ${categoryConcentration.hhi.toFixed(3)}${categoryConcentration.topCategory ? ` · mayor partida: ${categoryConcentration.topCategory} (${categoryConcentration.topShare}%)` : ""}`
              : "Sin movimientos categorizados este periodo"}
          </Text>
        </TouchableOpacity>

        {/* N4: Eficiencia de cobranza */}
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.84}>
          <View style={subStyles.advMetricHeader}>
            <Text style={subStyles.advMetricTitle}>Eficiencia de cobranza</Text>
            {collectionEfficiency.rate != null ? (
              <Text style={[subStyles.advMetricBadge, { color: collectionEfficiency.color }]}>
                {collectionEfficiency.rate}% - {collectionEfficiency.label}
              </Text>
            ) : null}
          </View>
          <Text style={subStyles.advMetricBody}>
            {collectionEfficiency.rate != null
              ? `${collectionEfficiency.resolved} de ${collectionEfficiency.total} cobros resueltos en los últimos 30 días`
              : collectionEfficiency.label}
          </Text>
          {collectionEfficiency.rate != null ? (
            <View style={subStyles.advScoreBar}>
              <View style={[subStyles.advScoreFill, { width: `${collectionEfficiency.rate}%` as any, backgroundColor: collectionEfficiency.color }]} />
            </View>
          ) : null}
        </TouchableOpacity>

        {/* N5: Comparación estacional */}
        <TouchableOpacity style={[subStyles.advMetricSection, subStyles.advMetricSectionBorder]} onPress={() => setAdvancedDetail("advancedMetrics")} activeOpacity={0.84}>
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
            </>
          ) : (
            <Text style={subStyles.advMetricBody}>Se necesita historial de al menos 12 meses para esta comparación.</Text>
          )}
        </TouchableOpacity>
      </Card>

      <PeriodRadar
        income={advancedStats.income}
        expense={advancedStats.expense}
        catTotals={advancedStats.catTotals}
        categories={snapshot?.categories ?? []}
        curStart={advancedStats.curStart}
        curEnd={advancedStats.curEnd}
        movements={movements}
      />

      </>}

      {activeTab === 'Datos' && <>
      <DashboardLayerHeader
        kicker="Precisión"
        title="Calidad de datos y aprendizaje"
        body="Esta capa te dice qué tan confiable es la lectura y dónde DarkMoney ya puede ver patrones, proyectar o necesita más datos."
      />

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
      </Card>

      {qualityOpen ? (
        <>
          <DataQuality movements={movements} />
          <LearningPanel
            movements={movements}
            projectionModel={projectionModel}
            activeCurrency={activeCurrency}
            weeklyPatternInsight={weeklyPatternInsight}
            categoryConcentration={categoryConcentration}
            categorySuggestionsCount={categorySuggestions.length}
            anomalySignalsCount={anomalySignals.length}
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
              </View>
              <View style={subStyles.projectionCard}>
                <View style={subStyles.projectionTop}>
                  <Text style={subStyles.projectionLabel}>Que conviene limpiar o reforzar</Text>
                </View>
                <Text style={subStyles.projectionBody}>
                  Si mejoras estos puntos, el dashboard deja de adivinar y pasa a explicarte mejor por qué hoy estás estable, con margen o bajo presión.
                </Text>
                {review.uncategorizedCount > 0 ? (
                  <TouchableOpacity style={subStyles.actionPillRow} onPress={() => openMovementsQuickFilter("uncategorized")} activeOpacity={0.85}>
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
  const isCheckingAdvancedAccess = isAdvanced && entitlementQuery.isLoading && !entitlementQuery.data;
  const shouldShowAdvancedProGate = isAdvanced && !isCheckingAdvancedAccess && !isPro;

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
        <ModeToggle mode={dashboardMode} setMode={setDashboardMode} isPro={isPro} />
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
        {isAdvanced && isPro && (
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
            analytics={dashboardAnalytics}
            router={router}
            accountCurrencyMap={accountCurrencyMap}
            onRequestPrecisionFocus={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
            onScrollToTop={() => {
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          />
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
    gap: SPACING.sm,
  },
  upcomingSummaryCard: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 2,
  },
  upcomingSummaryLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  upcomingSummaryValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 18,
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  upcomingLeft: { flex: 1, gap: 2 },
  upcomingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  upcomingKindDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  upcomingKindDotIncome: {
    backgroundColor: COLORS.income,
  },
  upcomingKindDotSubscription: {
    backgroundColor: COLORS.secondary,
  },
  upcomingKindDotObligation: {
    backgroundColor: COLORS.expense,
  },
  upcomingLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  upcomingDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  upcomingAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.rosewood },
  upcomingAmountIncome: { color: COLORS.income },

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
  weeklyBar: {
    flex: 1,
    backgroundColor: COLORS.rosewood + "99",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  // Transfer snapshot
  transferRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm },
  transferRoute: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  transferAcct: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.ink, flexShrink: 1 },
  transferAmt: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.storm },

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
  layerSectionBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm, lineHeight: 26 },
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

