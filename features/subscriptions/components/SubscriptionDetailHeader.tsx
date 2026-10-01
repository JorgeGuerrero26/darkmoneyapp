import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { AmountDisplay, formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { todayPeru } from "../../../lib/date";
import { subscriptionCadenceSuffix } from "../../../lib/subscription-helpers";
import { getMonthlySubscriptionAmount } from "../lib/subscriptionFilters";
import { subscriptionStanding, type StandingOccurrence } from "../lib/subscriptionStanding";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  occurrences?: StandingOccurrence[];
};

function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function SubscriptionDetailHeader({ subscription, occurrences }: Props) {
  const monthly = getMonthlySubscriptionAmount(subscription);
  const showMonthly = subscription.frequency !== "monthly" && Math.abs(monthly - subscription.amount) > 0.001;
  const standing = subscriptionStanding({
    subscription,
    today: todayPeru(),
    formatAmount: (amount) => formatCurrency(amount, subscription.currencyCode),
    formatDate: (ymd) => format(parseYmd(ymd), "d MMM", { locale: es }),
    occurrences,
  });

  return (
    <View style={styles.hero}>
      <Text style={styles.labels}>Suscripción · {standing.label}</Text>
      <AmountDisplay
        flat
        amount={subscription.amount}
        currencyCode={subscription.currencyCode}
        size="xl"
        color={COLORS.ink}
        prefix=""
      />
      <Text style={styles.caption}>
        {subscriptionCadenceSuffix(subscription.intervalCount, subscription.frequency)}
        {showMonthly ? ` · ~${formatCurrency(monthly, subscription.currencyCode)} al mes` : ""}
      </Text>
      <Text style={styles.detail}>{standing.detail}</Text>
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
