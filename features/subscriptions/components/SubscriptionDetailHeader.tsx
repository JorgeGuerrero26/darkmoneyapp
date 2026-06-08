import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import { getMonthlySubscriptionAmount } from "../lib/subscriptionFilters";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
};

const STATUS_LABEL: Record<SubscriptionSummary["status"], string> = {
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

function statusColor(status: SubscriptionSummary["status"]) {
  if (status === "active") return COLORS.income;
  if (status === "paused") return COLORS.gold;
  return COLORS.storm;
}

export function SubscriptionDetailHeader({ subscription }: Props) {
  const monthly = getMonthlySubscriptionAmount(subscription);
  const showMonthly = subscription.frequency !== "monthly" && Math.abs(monthly - subscription.amount) > 0.001;
  const color = statusColor(subscription.status);

  return (
    <Card style={styles.hero}>
      <Text style={styles.scopeChip}>{subscription.vendor || subscription.categoryName || "Suscripción"}</Text>
      <Text style={styles.amount}>
        {formatCurrency(subscription.amount, subscription.currencyCode)}
      </Text>
      <Text style={styles.frequency}>{subscription.frequencyLabel}</Text>
      {showMonthly ? (
        <Text style={styles.monthlyEquivalent}>
          ~{formatCurrency(monthly, subscription.currencyCode)}/mes
        </Text>
      ) : null}
      <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
        <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[subscription.status]}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  scopeChip: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.expense,
  },
  frequency: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  monthlyEquivalent: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
  },
  statusText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});
