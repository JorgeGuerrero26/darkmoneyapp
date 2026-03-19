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
  addDays,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CreditCard, Wallet, Landmark, PiggyBank, TrendingUp, Banknote,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set(["joradrianmori@gmail.com"]);
const UPCOMING_DAYS = 30;

type Period = "this_month" | "last_30";

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
  return INCOME_TYPES.has(m.movementType) && m.status === "posted";
}
function isExpense(m: DashboardMovementRow) {
  return EXPENSE_TYPES.has(m.movementType) && m.status === "posted";
}
function incomeAmt(m: DashboardMovementRow) {
  return m.destinationAmount || m.sourceAmount || 0;
}
function expenseAmt(m: DashboardMovementRow) {
  return m.sourceAmount || m.destinationAmount || 0;
}

function inRange(m: DashboardMovementRow, start: Date, end: Date) {
  const d = new Date(m.occurredAt);
  return d >= start && d <= end;
}

function useDashboardStats(movements: DashboardMovementRow[], period: Period) {
  return useMemo(() => {
    const now = new Date();
    let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date;

    if (period === "this_month") {
      curStart = startOfMonth(now);
      curEnd = now;
      const prev = subMonths(now, 1);
      prevStart = startOfMonth(prev);
      prevEnd = endOfMonth(prev);
    } else {
      curStart = subDays(now, 29);
      curEnd = now;
      prevStart = subDays(now, 59);
      prevEnd = subDays(now, 30);
    }

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

    return {
      curStart, curEnd, income, expense, net,
      prevIncome, prevExpense,
      chartDays, monthlyPulse, catTotals,
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
  return (
    <View style={subStyles.heroCard}>
      <View style={subStyles.heroGlow} />

      {/* Period toggle compact */}
      <View style={subStyles.heroPeriodRow}>
        {(["this_month", "last_30"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[subStyles.heroPeriodBtn, period === p && subStyles.heroPeriodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[subStyles.heroPeriodText, period === p && subStyles.heroPeriodTextActive]}>
              {p === "this_month" ? "Este mes" : "30 días"}
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
                  <Icon size={16} color={a.color} />
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

  const [period, setPeriod] = useState<Period>("this_month");
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
        {/* Mode toggle */}
        <ModeToggle mode={dashboardMode} setMode={setDashboardMode} isPro={isPro} />

        {/* Hero balance */}
        <HeroCard
          netWorth={netWorth}
          income={stats.income}
          expense={stats.expense}
          currency={baseCurrency}
          period={period}
          setPeriod={setPeriod}
        />

        {/* Flow KPI row */}
        <FlowRow
          income={stats.income}
          expense={stats.expense}
          net={stats.net}
          currency={baseCurrency}
          prevIncome={stats.prevIncome}
          prevExpense={stats.prevExpense}
        />

        {/* Mini chart */}
        <MiniBarChart data={stats.chartDays} />

        {/* Accounts */}
        <AccountsScroll
          accounts={activeAccounts}
          onPress={(id) => router.push(`/account/${id}`)}
        />

        {/* Upcoming */}
        <UpcomingSection
          obligations={snapshot?.obligations ?? []}
          subscriptions={snapshot?.subscriptions ?? []}
          router={router}
        />

        {/* Budget alerts */}
        <BudgetsSection budgets={snapshot?.budgets ?? []} router={router} />

        {/* ── Advanced section ── */}
        {isAdvanced && !isPro && <ProGate />}

        {isAdvanced && isPro && (
          <>
            <ObligationsSection obligations={snapshot?.obligations ?? []} router={router} />

            <CategoryBreakdown
              catTotals={stats.catTotals}
              categories={snapshot?.categories ?? []}
              currency={baseCurrency}
            />

            <MonthlyPulse data={stats.monthlyPulse} currency={baseCurrency} />

            <SubscriptionsSummary
              subscriptions={snapshot?.subscriptions ?? []}
              currency={baseCurrency}
            />

            <HealthScore
              netWorth={netWorth}
              income={stats.income}
              expense={stats.expense}
              obligations={snapshot?.obligations ?? []}
              netWorthThreeMonthExpense={netWorth / Math.max(stats.expense, 1)}
            />
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setFormVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

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
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
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
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
  },
  toggleText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  toggleTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  proBadge: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs - 1, color: COLORS.gold },

  // Hero card
  heroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
    padding: SPACING.xl,
    gap: SPACING.xs,
    overflow: "hidden",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GLASS.cardActive,
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
    paddingHorizontal: SPACING.md,
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
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 3,
    overflow: "hidden",
  },
  kpiAccent: {
    ...StyleSheet.absoluteFillObject,
  },
  kpiLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: 9, color: COLORS.storm, textTransform: "uppercase", letterSpacing: 0.4 },
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
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    alignItems: "center",
    gap: SPACING.xs,
    minWidth: 100,
    maxWidth: 130,
  },
  accountChipIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
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
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  budgetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  budgetName: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  budgetPct: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm },
  budgetMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Obligations advanced
  obGroupTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SPACING.xs },
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
  catTrack: { height: 6, backgroundColor: GLASS.card, borderRadius: RADIUS.full, overflow: "hidden", borderWidth: 0.5, borderColor: GLASS.cardBorder },
  catFill: { height: 6, backgroundColor: COLORS.rosewood + "88", borderRadius: RADIUS.full },

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
  healthTrack: { height: 5, backgroundColor: GLASS.card, borderRadius: RADIUS.full, overflow: "hidden", borderWidth: 0.5, borderColor: GLASS.cardBorder },
  healthFill: { height: 5, borderRadius: RADIUS.full },

  // Pro gate
  proGate: { alignItems: "center", padding: SPACING.xl, gap: SPACING.sm },
  proGateIcon: { fontSize: 32 },
  proGateTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  proGateBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", lineHeight: 20 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 100 },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.pine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 28,
    color: COLORS.canvas,
    lineHeight: 34,
  },
});
