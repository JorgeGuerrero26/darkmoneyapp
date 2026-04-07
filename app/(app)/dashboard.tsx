import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
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
  Brain, Lock, Sparkles, Target, TrendingUp,
  type LucideIcon,
} from "lucide-react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDashboardMovementsQuery,
  useSharedObligationsQuery,
  useNotificationsQuery,
  useUserEntitlementQuery,
  mergeWorkspaceAndSharedObligations,
  type DashboardMovementRow,
} from "../../services/queries/workspace-data";
import type { ExchangeRateSummary } from "../../types/domain";
import { useUiStore } from "../../store/ui-store";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const UPCOMING_DAYS = 30;

type Period = "today" | "week" | "month" | "last_30";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  last_30: "30 días",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Exchange rate helpers ─────────────────────────────────────────────────────

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
  return 1; // no rate found → keep original
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

// ─── Stats ────────────────────────────────────────────────────────────────────

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

    // Daily chart — last 7 days (con metadatos para detalle al tocar)
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

    // Monthly pulse — last 6 months
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

    // Category breakdown — current period, expenses only
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// KPI row — 3 compact cards (income %, expense %, net)
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
  const arrow = change == null ? null : change >= 0 ? "↑" : "↓";

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

// Mini bar chart (7 days) — toque abre detalle con ahorro del día y movimientos
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
      <SectionTitle>Últimos 7 días — flujo diario</SectionTitle>
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
  obligations, subscriptions, router,
}: {
  obligations: { id: number; title: string; dueDate: string | null; pendingAmount: number; currencyCode: string }[];
  subscriptions: { id: number; name: string; nextDueDate: string; amount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  const now = new Date();
  const limit = addDays(now, UPCOMING_DAYS);

  type UpcomingItem = { key: string; label: string; amount: number; currency: string; date: Date; onPress: () => void };
  const items: UpcomingItem[] = [];

  for (const ob of obligations) {
    if (!ob.dueDate) continue;
    const d = new Date(ob.dueDate);
    if (d >= now && d <= limit) {
      items.push({
        key: `ob-${ob.id}`, label: ob.title, amount: ob.pendingAmount,
        currency: ob.currencyCode, date: d,
        onPress: () => router.push(`/obligation/${ob.id}`),
      });
    }
  }
  for (const sub of subscriptions) {
    const d = new Date(sub.nextDueDate);
    if (d >= now && d <= limit) {
      items.push({
        key: `sub-${sub.id}`, label: sub.name, amount: sub.amount,
        currency: sub.currencyCode, date: d,
        onPress: () => router.push(`/subscription/${sub.id}`),
      });
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  const visible = items.slice(0, 5);

  if (visible.length === 0) return null;
  return (
    <View>
      <SectionTitle>Próximos vencimientos</SectionTitle>
      {visible.map((item) => (
        <TouchableOpacity key={item.key} style={subStyles.upcomingRow} onPress={item.onPress} activeOpacity={0.75}>
          <View style={subStyles.upcomingLeft}>
            <Text style={subStyles.upcomingLabel} numberOfLines={1}>{item.label}</Text>
            <Text style={subStyles.upcomingDate}>
              {format(item.date, "d MMM", { locale: es })}
            </Text>
          </View>
          <Text style={subStyles.upcomingAmount}>
            {formatCurrency(item.amount, item.currency)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Budget alerts section
function BudgetsSection({
  budgets, router,
}: {
  budgets: { id: number; name: string; usedPercent: number; alertPercent: number; spentAmount: number; limitAmount: number; currencyCode: string; isOverLimit: boolean; isNearLimit: boolean }[];
  router: ReturnType<typeof useRouter>;
}) {
  const alert = budgets.filter((b) => b.isOverLimit || b.isNearLimit);
  if (alert.length === 0) return null;
  return (
    <View>
      <SectionTitle>Presupuestos con alerta</SectionTitle>
      {alert.map((b) => (
        <TouchableOpacity
          key={b.id}
          style={subStyles.budgetRow}
          onPress={() => router.push("/(app)/budgets?from=dashboard")}
          activeOpacity={0.8}
        >
          <View style={subStyles.budgetHeader}>
            <Text style={subStyles.budgetName} numberOfLines={1}>{b.name}</Text>
            <Text style={[subStyles.budgetPct, b.isOverLimit ? { color: COLORS.expense } : { color: COLORS.warning }]}>
              {Math.round(b.usedPercent)}%
            </Text>
          </View>
          <ProgressBar percent={b.usedPercent} alertPercent={b.alertPercent} height={6} />
          <Text style={subStyles.budgetMeta}>
            {formatCurrency(b.spentAmount, b.currencyCode)} de {formatCurrency(b.limitAmount, b.currencyCode)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Simple widgets: ReceivableLeaders + PayableLeaders ───────────────────────

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

// Category comparison (current vs prev period) — Simple widget
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

// ─── New visual widgets ───────────────────────────────────────────────────────

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
          {trendUp ? "↑" : "↓"} tendencia
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

// ─── Advanced widgets ─────────────────────────────────────────────────────────

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
  displayCurrency,
  exchangeRateMap,
  currentVisibleBalance,
}: {
  obligations: Array<{ direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string }>;
  subscriptions: Array<{ amount: number; currencyCode: string; nextDueDate: string; status: string }>;
  displayCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
}) {
  const windows = useMemo(
    () => buildFutureFlowWindows(obligations, subscriptions, displayCurrency, exchangeRateMap, currentVisibleBalance),
    [currentVisibleBalance, displayCurrency, exchangeRateMap, obligations, subscriptions],
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

function LearningPanel({ movements }: { movements: DashboardMovementRow[] }) {
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
      { step: 2, title: "Patrones", description: "Empieza a distinguir habitos y semanas raras.", progress: Math.min(1, Math.min(useful.length / 30, historyDays / 30)) },
      { step: 3, title: "Proyecciones", description: "Ya puede estimar presion futura con mas confianza.", progress: Math.min(1, Math.min(useful.length / 70, historyDays / 60, categorizedRate / 0.6)) },
      { step: 4, title: "Alertas finas", description: "Lista para senales mas finas y anomalias.", progress: Math.min(1, Math.min(useful.length / 120, historyDays / 120, categorizedRate / 0.82)) },
    ];
    const insights: string[] = [];
    if (categorizedRate < 0.55) insights.push("Tus categorias aun necesitan trabajo para que las comparaciones sean mas confiables.");
    if (useful.length < 25) insights.push("Todavia falta un poco de historia para detectar habitos mas estables.");
    if (historyDays >= 45 && categorizedRate >= 0.6) insights.push("Ya hay una base decente para empezar a notar patrones y presion futura.");
    if (insights.length === 0) insights.push("La base del workspace ya esta suficientemente sana para lecturas mas finas.");
    return { categorizedRate, historyDays, insights, phases, readinessScore, usefulCount: useful.length };
  }, [movements]);

  return (
    <Card>
      <SectionTitle>Aprendiendo de ti</SectionTitle>
      <View style={subStyles.learningTopGrid}>
        <View style={subStyles.learningMetricCard}><Brain size={16} color={COLORS.primary} /><Text style={subStyles.learningMetricValue}>{learning.usefulCount}</Text><Text style={subStyles.learningMetricLabel}>Movimientos utiles</Text></View>
        <View style={subStyles.learningMetricCard}><Clock size={16} color={COLORS.secondary} /><Text style={subStyles.learningMetricValue}>{learning.historyDays} d</Text><Text style={subStyles.learningMetricLabel}>Historia observada</Text></View>
        <View style={subStyles.learningMetricCard}><Tag size={16} color={COLORS.warning} /><Text style={subStyles.learningMetricValue}>{Math.round(learning.categorizedRate * 100)}%</Text><Text style={subStyles.learningMetricLabel}>Categorias utiles</Text></View>
        <View style={subStyles.learningMetricCard}><Sparkles size={16} color={COLORS.income} /><Text style={subStyles.learningMetricValue}>{learning.readinessScore}%</Text><Text style={subStyles.learningMetricLabel}>Confianza actual</Text></View>
      </View>
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
  displayCurrency,
  exchangeRateMap,
  currentVisibleBalance,
  router,
  accountCurrencyMap,
}: {
  movements: DashboardMovementRow[];
  obligations: Array<{ id: number; title: string; direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string; lastPaymentDate?: string | null; startDate?: string }>;
  subscriptions: Array<{ id: number; name: string; amount: number; currencyCode: string; nextDueDate: string; accountId?: number | null; status: string }>;
  displayCurrency: string;
  exchangeRateMap: Map<string, number>;
  currentVisibleBalance: number;
  router: ReturnType<typeof useRouter>;
  accountCurrencyMap: Map<number, string>;
}) {
  const review = useMemo(() => buildReviewInboxSnapshot(movements, subscriptions, obligations), [movements, obligations, subscriptions]);
  const windows = useMemo(() => buildFutureFlowWindows(obligations, subscriptions, displayCurrency, exchangeRateMap, currentVisibleBalance), [currentVisibleBalance, displayCurrency, exchangeRateMap, obligations, subscriptions]);
  const monthToDate = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const income = movements.filter((movement) => inRange(movement, start, now) && isIncome(movement)).reduce((sum, movement) => sum + incomeAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    const expense = movements.filter((movement) => inRange(movement, start, now) && isExpense(movement)).reduce((sum, movement) => sum + expenseAmt(movement, { accountCurrencyMap, exchangeRateMap, displayCurrency }), 0);
    return { net: income - expense, daysElapsed: Math.max(1, differenceInDays(now, start) + 1) };
  }, [accountCurrencyMap, displayCurrency, exchangeRateMap, movements]);
  const daysInMonth = differenceInDays(endOfMonth(new Date()), startOfMonth(new Date())) + 1;
  const monthEndEstimate = currentVisibleBalance + (monthToDate.net / monthToDate.daysElapsed) * (daysInMonth - monthToDate.daysElapsed);
  const weekWindow = windows[0];
  const actions = [
    review.overdueObligationsCount > 0 ? { key: "overdue", title: "Resolver vencimientos", detail: `${review.overdueObligationsCount} cobros o pagos ya estan fuera de fecha.`, route: "/obligations" } : null,
    review.pendingMovementsCount > 0 ? { key: "pending", title: "Aplicar cola pendiente", detail: `${review.pendingMovementsCount} movimientos aun no impactan tus saldos.`, route: "/movements" } : null,
    review.uncategorizedCount > 0 ? { key: "uncategorized", title: "Categorizar gastos e ingresos", detail: `${review.uncategorizedCount} movimientos siguen sin categoria.`, route: "/movements" } : null,
    review.subscriptionsAttentionCount > 0 ? { key: "subscriptions", title: "Confirmar suscripciones", detail: `${review.subscriptionsAttentionCount} cargos fijos necesitan cuenta o fecha revisada.`, route: "/subscriptions" } : null,
  ].filter(Boolean) as Array<{ key: string; title: string; detail: string; route: string }>;
  const recommendation = review.overdueObligationsCount > 0 ? "Tu prioridad mas rentable hoy es limpiar vencimientos de cartera antes de que se arrastre mas el desfase." : weekWindow.expectedOutflow > weekWindow.expectedInflow ? "La proxima semana sale mas dinero del que entra: revisa compromisos y mueve foco a liquidez." : review.uncategorizedCount > 0 ? "Con unas cuantas categorias mas, el dashboard puede darte comparativos y senales mucho mas finas." : "No vemos friccion fuerte: aprovecha para ordenar metas, presupuestos o suscripciones.";

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
          <Text style={subStyles.commandMetricHint}>Extrapola el neto diario del mes en curso.</Text>
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

// Alert center — anomalies detection
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

// Obligation watch — full list with aging
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

// Weekly pattern — average expense per day of week
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

// Transfer snapshot — top 3 transfer routes
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

// Period radar — 5 compact readings
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
  let topCatName = "—";
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
    { label: "Mayor gasto", value: topCatAmt > 0 ? `${topCatName}` : "—" },
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

function ProGate() {
  return (
    <View style={subStyles.proGate}>
      <View style={subStyles.proGateIconWrap}>
        <Lock size={16} color={COLORS.gold} strokeWidth={1.8} />
      </View>
      <View style={subStyles.proGateText}>
        <Text style={subStyles.proGateTitle}>Dashboard Avanzado</Text>
        <Text style={subStyles.proGateBody}>Análisis detallado, gráficos y salud financiera</Text>
      </View>
      <View style={subStyles.proGateBadge}>
        <Text style={subStyles.proGateBadgeText}>PRO</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function ProGateLoading() {
  return (
    <View style={subStyles.proGate}>
      <View style={subStyles.proGateIconWrap}>
        <Lock size={16} color={COLORS.storm} strokeWidth={1.8} />
      </View>
      <View style={subStyles.proGateText}>
        <Text style={subStyles.proGateTitle}>Dashboard Avanzado</Text>
        <Text style={subStyles.proGateBody}>Verificando acceso…</Text>
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

  // Map accountId → currencyCode for movement conversion
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
        {isCheckingAdvancedAccess ? <ProGateLoading /> : shouldShowAdvancedProGate ? <ProGate /> : (
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

        {/* ── Advanced section ── */}
        {isAdvanced && isPro && (
          <>
            <ReviewInbox
              movements={movements}
              subscriptions={snapshot?.subscriptions ?? []}
              obligations={obligationsMerged}
              router={router}
            />

            <ProCommandCenter
              movements={movements}
              obligations={obligationsMerged}
              subscriptions={snapshot?.subscriptions ?? []}
              displayCurrency={activeCurrency}
              exchangeRateMap={exchangeRateMap}
              currentVisibleBalance={netWorth}
              router={router}
              accountCurrencyMap={accountCurrencyMap}
            />

            <FutureFlowPreview
              obligations={obligationsMerged}
              subscriptions={snapshot?.subscriptions ?? []}
              displayCurrency={activeCurrency}
              exchangeRateMap={exchangeRateMap}
              currentVisibleBalance={netWorth}
            />

            <LearningPanel movements={movements} />

            {/* 10. Category breakdown (detail) */}
            <CategoryBreakdown
              catTotals={stats.catTotals}
              categories={snapshot?.categories ?? []}
              currency={activeCurrency}
            />

            {/* 11. Obligations section */}
            <ObligationsSection obligations={obligationsMerged} router={router} />

            {/* 12. Alert center */}
            <AlertCenter
              budgets={snapshot?.budgets ?? []}
              obligations={obligationsMerged}
              subscriptions={snapshot?.subscriptions ?? []}
              movements={movements}
            />

            {/* 13. Obligation watch */}
            <ObligationWatch obligations={obligationsMerged} router={router} />

            {/* 14. Weekly pattern */}
            <WeeklyPattern movements={movements} ctx={conversionCtx} />

            {/* 15. Transfer snapshot */}
            <TransferSnapshot
              movements={movements}
              accounts={activeAccounts}
              ctx={conversionCtx}
            />

            {/* 16. Monthly pulse */}
            <MonthlyPulse data={stats.monthlyPulse} currency={activeCurrency} />

            {/* 17. Subscriptions summary */}
            <SubscriptionsSummary
              subscriptions={snapshot?.subscriptions ?? []}
              currency={activeCurrency}
            />

            {/* 18. Health score */}
            <HealthScore
              netWorth={netWorth}
              income={stats.income}
              expense={stats.expense}
              obligations={obligationsMerged}
              netWorthThreeMonthExpense={netWorth / Math.max(stats.expense, 1)}
            />

            {/* 19. Currency exposure */}
            <CurrencyExposure accounts={snapshot?.accounts ?? []} />

            {/* 20. Period radar */}
            <PeriodRadar
              income={stats.income}
              expense={stats.expense}
              catTotals={stats.catTotals}
              categories={snapshot?.categories ?? []}
              curStart={stats.curStart}
              curEnd={stats.curEnd}
              movements={movements}
            />

            {/* 21. Data quality */}
            <DataQuality movements={movements} />

            {/* 22. Activity timeline */}
            <ActivityTimeline snapshot={snapshot} />
          </>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // Hero card — most prominent, gets the full premium glass treatment
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
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.separator,
  },
  upcomingLeft: { flex: 1, gap: 2 },
  upcomingLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  upcomingDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  upcomingAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.rosewood },

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
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: "rgba(215,190,123,0.06)",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(215,190,123,0.15)",
  },
  proGateIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(215,190,123,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  proGateText: { flex: 1, gap: 2 },
  proGateTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
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
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.xl, paddingBottom: 100 },
});

// ─── Dashboard header right actions ───────────────────────────────────────────

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
        <Text style={hdrStyles.avatarText}>{profile?.initials ?? "?"}</Text>
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
