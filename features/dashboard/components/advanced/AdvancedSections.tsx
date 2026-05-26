import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, SPACING } from "../../../../constants/theme";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

type ObligationItem = { id: number; title: string; direction: string; pendingAmount: number; currencyCode: string; counterparty: string };

export function ObligationsSection({ obligations, router }: { obligations: ObligationItem[]; router: ReturnType<typeof useRouter> }) {
  const receivable = obligations.filter((o) => o.direction === "receivable").slice(0, 3);
  const payable = obligations.filter((o) => o.direction === "payable").slice(0, 3);
  if (receivable.length === 0 && payable.length === 0) return null;

  function renderGroup(title: string, items: ObligationItem[], color: string) {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: SPACING.sm }}>
        <Text style={[subStyles.obGroupTitle, { color }]}>{title}</Text>
        {items.map((o) => (
          <TouchableOpacity key={o.id} style={subStyles.obRow} onPress={() => router.push(`/obligation/${o.id}`)} activeOpacity={0.75}>
            <View style={subStyles.obLeft}>
              <Text style={subStyles.obTitle} numberOfLines={1}>{o.title}</Text>
              <Text style={subStyles.obCounterparty} numberOfLines={1}>{o.counterparty}</Text>
            </View>
            <Text style={[subStyles.obAmount, { color }]}>{formatCurrency(o.pendingAmount, o.currencyCode)}</Text>
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

export function CategoryBreakdown({
  catTotals,
  categories,
  currency,
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

export function MonthlyPulse({
  data,
  currency,
  onOpenMonth,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  onOpenMonth?: (dateFrom: string, dateTo: string) => void;
}) {
  void currency;
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

export function SubscriptionsSummary({
  subscriptions,
  currency,
}: {
  subscriptions: { id: number; name: string; amount: number; currencyCode: string; frequency: string; intervalCount: number }[];
  currency: string;
}) {
  const active = subscriptions.slice(0, 4);
  if (active.length === 0) return null;

  function toMonthly(amount: number, freq: string, interval: number): number {
    if (freq === "monthly") return amount / interval;
    if (freq === "yearly") return amount / (12 * interval);
    if (freq === "weekly") return (amount * 4.345) / interval;
    if (freq === "quarterly") return amount / (3 * interval);
    if (freq === "daily") return (amount * 30) / interval;
    return amount;
  }

  const totalMonthly = subscriptions.reduce((sum, s) => sum + toMonthly(s.amount, s.frequency, s.intervalCount), 0);

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
