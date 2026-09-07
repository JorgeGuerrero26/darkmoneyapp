import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import { todayPeru } from "../../../lib/date";
import { subscriptionCadenceSuffix } from "../../../lib/subscription-helpers";
import { getMonthlyRecurringIncomeAmount } from "../lib/recurringIncomeFilters";
import {
  recurringIncomeStanding,
  type RecurringIncomeStandingTone,
} from "../lib/recurringIncomeStanding";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
};

/** Clay para lo que ya venció sin confirmar; ámbar para lo que aún no pasa. */
function toneColor(tone: RecurringIncomeStandingTone): string {
  switch (tone) {
    case "unconfirmed":
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
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Cuánto llega, cada cuánto y qué falta por confirmar.
 *
 * Eran cuatro piezas apiladas y centradas para decir un monto: "SUELDO" arriba —la categoría,
 * que ya está en la ficha—, la cifra, "Mensual" debajo y "Activo" al final. La cadencia se dice
 * mejor con el día y vive en su fila; el monto lleva **"al mes" al lado**, que es la misma
 * información en una línea menos.
 *
 * **Y el monto va en hueso, no en menta.** Menta es la plata que entró; esto es la que debería
 * entrar. Pintar de verde un sueldo que lleva dos meses sin confirmarse era el mismo error que
 * la cápsula: decía "Activo" a diez píxeles de una fecha vencida hace treinta y nueve días.
 * "Activo" describe la configuración; lo que hace falta saber es cuántos sueldos faltan.
 *
 * El cálculo entero sale de [[recurringIncomeStanding]]; aquí solo se pinta.
 */
export function RecurringIncomeDetailHeader({ item }: Props) {
  const monthly = getMonthlyRecurringIncomeAmount(item);
  const cadence = subscriptionCadenceSuffix(item.intervalCount, item.frequency);
  const showMonthly =
    item.frequency !== "monthly" && Math.abs(monthly - item.amount) > 0.001;

  const standing = recurringIncomeStanding({
    item,
    today: todayPeru(),
    formatAmount: (amount) => formatCurrency(amount, item.currencyCode),
    formatDate: (ymd) => format(parseYmd(ymd), "d MMM", { locale: es }),
  });
  const color = toneColor(standing.tone);

  return (
    <Card style={styles.hero}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.status, { color }]}>{standing.label}</Text>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatCurrency(item.amount, item.currencyCode)}</Text>
        <Text style={styles.cadence}>{cadence}</Text>
      </View>
      {showMonthly ? (
        <Text style={styles.monthlyEquivalent}>
          ~{formatCurrency(monthly, item.currencyCode)} al mes
        </Text>
      ) : null}

      <Text style={styles.detail}>{standing.summary}</Text>
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
