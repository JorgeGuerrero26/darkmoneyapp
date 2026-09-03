import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import { todayPeru } from "../../../lib/date";
import { subscriptionCadenceSuffix } from "../../../lib/subscription-helpers";
import { getMonthlySubscriptionAmount } from "../lib/subscriptionFilters";
import {
  subscriptionStanding,
  type StandingOccurrence,
  type SubscriptionStandingTone,
} from "../lib/subscriptionStanding";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  /** El historial mes a mes. Llega despues del primer pintado; sin el se estima. */
  occurrences?: StandingOccurrence[];
};

/** Clay solo para lo vencido, amarillo solo para lo que aún no pasa (regla 4 de la plantilla). */
function toneColor(tone: SubscriptionStandingTone): string {
  switch (tone) {
    case "overdue":
      return COLORS.expense;
    case "soon":
      return COLORS.warning;
    case "paused":
      return COLORS.textDisabled;
    default:
      return COLORS.storm;
  }
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Cuánto cuesta y en qué situación está, en una tarjeta.
 *
 * El monto iba en clay —"esto es un gasto"— cuando el gasto todavía no ocurrió, con
 * "SUSCRIPCIÓN" encima (ya se sabe dónde se está) y "Mensual" en una línea aparte. Va en hueso,
 * con **"al mes"** al lado, que es la misma información ocupando una línea menos.
 *
 * Y la cápsula decía "Activa" en menta con tres cobros sin anotar debajo. El estado que hace
 * falta lo calcula [[subscriptionStanding]]; aquí solo se pinta.
 */
export function SubscriptionDetailHeader({ subscription, occurrences }: Props) {
  const monthly = getMonthlySubscriptionAmount(subscription);
  /* "al mes", no "Mensual": el monto y su cadencia se leen como una frase, en una línea en vez
     de dos. */
  const cadence = subscriptionCadenceSuffix(subscription.intervalCount, subscription.frequency);
  const showMonthly =
    subscription.frequency !== "monthly" && Math.abs(monthly - subscription.amount) > 0.001;

  const standing = subscriptionStanding({
    subscription,
    today: todayPeru(),
    formatAmount: (amount) => formatCurrency(amount, subscription.currencyCode),
    formatDate: (ymd) => format(parseYmd(ymd), "d MMM", { locale: es }),
    occurrences,
  });
  const color = toneColor(standing.tone);

  return (
    <Card style={styles.hero}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.status, { color }]}>{standing.label}</Text>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>
          {formatCurrency(subscription.amount, subscription.currencyCode)}
        </Text>
        <Text style={styles.cadence}>{cadence}</Text>
      </View>
      {showMonthly ? (
        <Text style={styles.monthlyEquivalent}>
          ~{formatCurrency(monthly, subscription.currencyCode)} al mes
        </Text>
      ) : null}

      <Text style={styles.detail}>{standing.detail}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACING.sm },
  statusRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  dot: { width: 7, height: 7, borderRadius: RADIUS.full },
  status: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  cadence: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  monthlyEquivalent: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    marginTop: -SPACING.xs,
  },
  detail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
    lineHeight: 21,
  },
});
