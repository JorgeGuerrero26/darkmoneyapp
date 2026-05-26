import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { addDays, differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { UPCOMING_DAYS } from "../../lib/constants";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type UpcomingSectionProps = {
  obligations: {
    id: number;
    title: string;
    direction?: string;
    dueDate: string | null;
    pendingAmount: number;
    currencyCode: string;
  }[];
  subscriptions: { id: number; name: string; nextDueDate: string; amount: number; currencyCode: string }[];
  recurringIncome: { id: number; name: string; nextExpectedDate: string; amount: number; currencyCode: string }[];
  router: ReturnType<typeof useRouter>;
};

export function UpcomingSection({ obligations, subscriptions, recurringIncome, router }: UpcomingSectionProps) {
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
        key: `ob-${ob.id}`,
        label: ob.title,
        amount: ob.pendingAmount,
        currency: ob.currencyCode,
        date: d,
        kind: "obligation",
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
        key: `sub-${sub.id}`,
        label: sub.name,
        amount: sub.amount,
        currency: sub.currencyCode,
        date: d,
        kind: "subscription",
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
        key: `ri-${income.id}`,
        label: `Ingreso fijo · ${income.name}`,
        amount: income.amount,
        currency: income.currencyCode,
        date: d,
        kind: "income",
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
                <View
                  style={[
                    subStyles.upcomingBadge,
                    item.flow === "in"
                      ? subStyles.upcomingBadgeIncome
                      : item.kind === "subscription"
                        ? subStyles.upcomingBadgeSubscription
                        : subStyles.upcomingBadgeObligation,
                  ]}
                >
                  <Text
                    style={[
                      subStyles.upcomingBadgeText,
                      item.flow === "in"
                        ? subStyles.upcomingBadgeTextIncome
                        : item.kind === "subscription"
                          ? subStyles.upcomingBadgeTextSubscription
                          : subStyles.upcomingBadgeTextObligation,
                    ]}
                  >
                    {item.badge}
                  </Text>
                </View>
                <Text style={subStyles.upcomingLabel} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>
              <View
                style={[
                  subStyles.upcomingAmountPill,
                  item.flow === "in" ? subStyles.upcomingAmountPillIncome : subStyles.upcomingAmountPillOut,
                ]}
              >
                <Text
                  style={[
                    subStyles.upcomingAmount,
                    item.flow === "in" ? subStyles.upcomingAmountIncome : subStyles.upcomingAmountOut,
                  ]}
                >
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
