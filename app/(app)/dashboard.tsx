import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
  startOfWeek,
  addDays,
  getDay,
  differenceInDays,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CreditCard, Wallet, Landmark, PiggyBank, TrendingUp, Banknote,
  AlertTriangle, AlertCircle, Clock, Tag, ArrowRight,
  type LucideIcon,
} from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDashboardMovementsQuery,
  type DashboardMovementRow,
} from "../../services/queries/workspace-data";
import { useUiStore } from "../../store/ui-store";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
import { WorkspaceSelector } from "../../components/layout/WorkspaceSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { FAB } from "../../components/ui/FAB";

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set(["joradrianmori@gmail.com"]);
const UPCOMING_DAYS = 30;

type Period = "today" | "week" | "month" | "last_30";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  last_30: "30 días",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useIsPro(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

function pctChange(current: number, prev: number) {
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

const INCOME_TYPES = new Set(["income", "refund"]);
const EXPENSE_TYPES = new Set(["expense", "subscription_payment", "obligation_payment"]);

function isIncome(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (INCOME_TYPES.has(m.movementType)) return true;
  if (m.movementType === "adjustment") return m.destinationAmount > m.sourceAmount;
  return false;
}

function isExpense(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (EXPENSE_TYPES.has(m.movementType)) return true;
  if (m.movementType === "adjustment") return m.sourceAmount >= m.destinationAmount;
  return false;
}

function incomeAmt(m: DashboardMovementRow): number {
  return m.destinationAmount || m.sourceAmount || 0;
}

function expenseAmt(m: DashboardMovementRow): number {
  return m.sourceAmount || m.destinationAmount || 0;
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

function useDashboardStats(movements: DashboardMovementRow[], period: Period) {
  return useMemo(() => {
    const now = new Date();
    const { curStart, curEnd, prevStart, prevEnd } = getPeriodBounds(period, now);

    const cur = movements.filter((m) => inRange(m, curStart, curEnd));
    const prev = movements.filter((m) => inRange(m, prevStart, prevEnd));

    const income = cur.filter(isIncome).reduce((s, m) => s + incomeAmt(m), 0);
    const expense = cur.filter(isExpense).reduce((s, m) => s + expenseAmt(m), 0);
    const net = income - expense;

    const prevIncome = prev.filter(isIncome).reduce((s, m) => s + incomeAmt(m), 0);
    const prevExpense = prev.filter(isExpense).reduce((s, m) => s + expenseAmt(m), 0);

    // Daily chart — last 7 days
    const chartDays = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const ds = startOfDay(d);
      const de = new Date(ds.getTime() + 86_400_000 - 1);
      const dayMvs = movements.filter((m) => inRange(m, ds, de));
      return {
        label: format(d, "dd/M"),
        income: dayMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m), 0),
        expense: dayMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m), 0),
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
        income: mMvs.filter(isIncome).reduce((s, m) => s + incomeAmt(m), 0),
        expense: mMvs.filter(isExpense).reduce((s, m) => s + expenseAmt(m), 0),
      };
    });

    // Category breakdown — current period, expenses only
    const catTotals = new Map<number | null, number>();
    for (const m of cur.filter(isExpense)) {
      const k = m.categoryId;
      catTotals.set(k, (catTotals.get(k) ?? 0) + expenseAmt(m));
    }

    // Previous period category totals
    const prevCatTotals = new Map<number | null, number>();
    for (const m of prev.filter(isExpense)) {
      const k = m.categoryId;
      prevCatTotals.set(k, (prevCatTotals.get(k) ?? 0) + expenseAmt(m));
    }

    return {
      curStart, curEnd, income, expense, net,
      prevIncome, prevExpense,
      chartDays, monthlyPulse, catTotals, prevCatTotals,
    };
  }, [movements, period]);
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
}: {
  netWorth: number; income: number; expense: number; currency: string;
  period: Period; setPeriod: (p: Period) => void;
}) {
  const net = income - expense;
  const allPeriods: Period[] = ["today", "week", "month", "last_30"];
  return (
    <View style={subStyles.heroCard}>
      {/* Period toggle compact — 4 pills */}
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
      <View style={[subStyles.kpiAccent, { backgroundColor: accent + "33" }]} />
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

// Mini bar chart (7 days)
function MiniBarChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const BAR_HEIGHT = 56;

  return (
    <Card>
      <SectionTitle>Últimos 7 días</SectionTitle>
      <View style={subStyles.chartRow}>
        {data.map((d, i) => (
          <View key={i} style={subStyles.chartCol}>
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
          </View>
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

// Accounts horizontal scroll
const ICON_MAP: Record<string, LucideIcon> = {
  credit_card: CreditCard, cash: Banknote, savings: PiggyBank,
  investment: TrendingUp, bank: Landmark, loan: Wallet,
};

function AccountsScroll({ accounts, onPress }: {
  accounts: { id: number; name: string; type: string; currentBalance: number; currencyCode: string; color: string }[];
  onPress: (id: number) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <View>
      <SectionTitle>Cuentas</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={subStyles.accountsRow}>
          {accounts.map((a) => {
            const Icon = ICON_MAP[a.type] ?? Wallet;
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
          onPress={() => router.push("/(app)/budgets")}
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

// ─── Advanced widgets ─────────────────────────────────────────────────────────

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
    (m) => m.categoryId === null && (EXPENSE_TYPES.has(m.movementType) || INCOME_TYPES.has(m.movementType)) && m.status === "posted",
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
function WeeklyPattern({ movements }: { movements: DashboardMovementRow[] }) {
  const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  // getDay returns 0=Sun..6=Sat. We want Mon=0..Sun=6
  const byDay = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  const weekSet = new Set<string>();

  for (const m of movements.filter(isExpense)) {
    const d = new Date(m.occurredAt);
    const jsDay = getDay(d); // 0=Sun
    const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
    byDay[idx].total += expenseAmt(m);
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
  movements, accounts,
}: {
  movements: DashboardMovementRow[];
  accounts: { id: number; name: string }[];
}) {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));

  // Group by (sourceAccountId, destinationAccountId)
  const routeMap = new Map<string, { srcId: number; dstId: number; total: number; count: number }>();
  for (const m of movements.filter((m) => m.movementType === "transfer" && m.status === "posted")) {
    if (!m.sourceAccountId || !m.destinationAccountId) continue;
    const key = `${m.sourceAccountId}-${m.destinationAccountId}`;
    const existing = routeMap.get(key);
    if (existing) {
      existing.total += expenseAmt(m);
      existing.count++;
    } else {
      routeMap.set(key, { srcId: m.sourceAccountId, dstId: m.destinationAccountId, total: expenseAmt(m), count: 1 });
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
    (m) => (EXPENSE_TYPES.has(m.movementType) || INCOME_TYPES.has(m.movementType)) && m.status === "posted",
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
    <Card>
      <View style={subStyles.proGate}>
        <Text style={subStyles.proGateIcon}>⚡</Text>
        <Text style={subStyles.proGateTitle}>Dashboard Avanzado</Text>
        <Text style={subStyles.proGateBody}>
          Accede a análisis detallados, gráficos avanzados, salud financiera y más con el plan Pro.
        </Text>
      </View>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setWorkspaces } = useWorkspace();
  const { dashboardMode, setDashboardMode } = useUiStore();

  const [period, setPeriod] = useState<Period>("month");
  const [formVisible, setFormVisible] = useState(false);

  const isPro = useIsPro(profile?.email);

  const { data: snapshot, isLoading: snapLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: movements = [] } = useDashboardMovementsQuery(activeWorkspaceId);

  useEffect(() => {
    if (snapshot?.workspaces?.length) setWorkspaces(snapshot.workspaces);
  }, [snapshot?.workspaces, setWorkspaces]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const netWorth = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.accounts
      .filter((a) => a.includeInNetWorth && !a.isArchived)
      .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);
  }, [snapshot]);

  const stats = useDashboardStats(movements, period);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
  }, [queryClient]);

  const activeAccounts = useMemo(
    () => (snapshot?.accounts ?? []).filter((a) => !a.isArchived),
    [snapshot],
  );

  const isAdvanced = dashboardMode === "advanced";

  if (snapLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Inicio" />
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={activeWorkspace?.name ?? "Inicio"}
        subtitle={format(new Date(), "MMMM yyyy", { locale: es })}
        rightAction={<WorkspaceSelector />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={snapLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* 1. Mode toggle */}
        <ModeToggle mode={dashboardMode} setMode={setDashboardMode} isPro={isPro} />

        {/* 2. Hero balance (period selector inside) */}
        <HeroCard
          netWorth={netWorth}
          income={stats.income}
          expense={stats.expense}
          currency={baseCurrency}
          period={period}
          setPeriod={setPeriod}
        />

        {/* 3. Flow KPI row */}
        <FlowRow
          income={stats.income}
          expense={stats.expense}
          net={stats.net}
          currency={baseCurrency}
          prevIncome={stats.prevIncome}
          prevExpense={stats.prevExpense}
        />

        {/* 4. Mini chart */}
        <MiniBarChart data={stats.chartDays} />

        {/* 5. Accounts */}
        <AccountsScroll
          accounts={activeAccounts}
          onPress={(id) => router.push(`/account/${id}`)}
        />

        {/* 6. Receivable + Payable leaders */}
        <LeadersRow obligations={snapshot?.obligations ?? []} router={router} />

        {/* 7. Upcoming */}
        <UpcomingSection
          obligations={snapshot?.obligations ?? []}
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
          currency={baseCurrency}
        />

        {/* ── Advanced section ── */}
        {isAdvanced && !isPro && <ProGate />}

        {isAdvanced && isPro && (
          <>
            {/* 10. Category breakdown (detail) */}
            <CategoryBreakdown
              catTotals={stats.catTotals}
              categories={snapshot?.categories ?? []}
              currency={baseCurrency}
            />

            {/* 11. Obligations section */}
            <ObligationsSection obligations={snapshot?.obligations ?? []} router={router} />

            {/* 12. Alert center */}
            <AlertCenter
              budgets={snapshot?.budgets ?? []}
              obligations={snapshot?.obligations ?? []}
              subscriptions={snapshot?.subscriptions ?? []}
              movements={movements}
            />

            {/* 13. Obligation watch */}
            <ObligationWatch obligations={snapshot?.obligations ?? []} router={router} />

            {/* 14. Weekly pattern */}
            <WeeklyPattern movements={movements} />

            {/* 15. Transfer snapshot */}
            <TransferSnapshot
              movements={movements}
              accounts={activeAccounts}
            />

            {/* 16. Monthly pulse */}
            <MonthlyPulse data={stats.monthlyPulse} currency={baseCurrency} />

            {/* 17. Subscriptions summary */}
            <SubscriptionsSummary
              subscriptions={snapshot?.subscriptions ?? []}
              currency={baseCurrency}
            />

            {/* 18. Health score */}
            <HealthScore
              netWorth={netWorth}
              income={stats.income}
              expense={stats.expense}
              obligations={snapshot?.obligations ?? []}
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
      </ScrollView>

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

      <MovementForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false);
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
        }}
      />
    </View>
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
    borderWidth: 0.5,
    borderColor: GLASS.separator,
    padding: 3,
    gap: 3,
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

  // Hero card
  heroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.xl,
    gap: SPACING.xs,
    overflow: "hidden",
  },
  heroPeriodRow: {
    flexDirection: "row",
    gap: 3,
    marginBottom: SPACING.sm,
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
  heroPeriodTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.canvas },
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
    borderWidth: 1,
    padding: SPACING.md,
    gap: SPACING.xs,
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

  // Pro gate
  proGate: { alignItems: "center", padding: SPACING.xl, gap: SPACING.sm },
  proGateIcon: { fontSize: 32 },
  proGateTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  proGateBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", lineHeight: 20 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.xl, paddingBottom: 100 },
});
