import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { AmountDisplay, formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { todayPeru } from "../../../lib/date";
import { subscriptionCadenceSuffix } from "../../../lib/subscription-helpers";
import { getMonthlyRecurringIncomeAmount } from "../lib/recurringIncomeFilters";
import { recurringIncomeStanding } from "../lib/recurringIncomeStanding";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = { item: RecurringIncomeSummary };

function displayDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return format(new Date(year, month - 1, day), "d MMM", { locale: es });
}

export function RecurringIncomeDetailHero({ item }: Props) {
  const monthly = getMonthlyRecurringIncomeAmount(item);
  const showMonthly = (item.frequency !== "monthly" || item.intervalCount > 1)
    && Math.abs(monthly - item.amount) > 0.001;
  const standing = recurringIncomeStanding({
    item,
    today: todayPeru(),
    formatAmount: (amount) => formatCurrency(amount, item.currencyCode),
    formatDate: displayDate,
  });

  return (
    <View style={styles.hero}>
      <Text style={styles.labels}>Ingreso fijo · {standing.label}</Text>
      <AmountDisplay flat amount={item.amount} currencyCode={item.currencyCode} size="xl" color={COLORS.ink} prefix="" />
      <Text style={styles.caption}>
        {subscriptionCadenceSuffix(item.intervalCount, item.frequency)}
        {showMonthly ? ` · ~${formatCurrency(monthly, item.currencyCode)} al mes` : ""}
      </Text>
      <Text style={styles.detail}>{standing.summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: SPACING.xs,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  labels: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  caption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
  detail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
});
