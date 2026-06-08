import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import { getMonthlyRecurringIncomeAmount } from "../lib/recurringIncomeFilters";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
};

const STATUS_LABEL: Record<RecurringIncomeSummary["status"], string> = {
  active: "Activo",
  paused: "Pausado",
  cancelled: "Cancelado",
};

function statusColor(status: RecurringIncomeSummary["status"]) {
  if (status === "active") return COLORS.income;
  if (status === "paused") return COLORS.gold;
  return COLORS.storm;
}

export function RecurringIncomeDetailHeader({ item }: Props) {
  const monthly = getMonthlyRecurringIncomeAmount(item);
  const showMonthly = item.frequency !== "monthly" && Math.abs(monthly - item.amount) > 0.001;
  const color = statusColor(item.status);

  return (
    <Card style={styles.hero}>
      <Text style={styles.payerChip}>{item.payer?.trim() || item.categoryName || "Ingreso fijo"}</Text>
      <Text style={styles.amount}>
        {formatCurrency(item.amount, item.currencyCode)}
      </Text>
      <Text style={styles.frequency}>{item.frequencyLabel}</Text>
      {showMonthly ? (
        <Text style={styles.monthlyEquivalent}>
          ~{formatCurrency(monthly, item.currencyCode)}/mes
        </Text>
      ) : null}
      <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
        <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[item.status]}</Text>
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
  payerChip: {
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
    color: COLORS.income,
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
