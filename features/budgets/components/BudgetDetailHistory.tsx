import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { budgetRuleKey } from "../lib/budgetRules";
import { budgetSeriesReading } from "../lib/budgetVerdict";
import type { BudgetOverview } from "../../../types/domain";

const MAX_HISTORY = 6;

type Props = {
  current: BudgetOverview;
  allBudgets: BudgetOverview[];
};

/**
 * Los meses anteriores, en fila, con la lectura debajo.
 *
 * Era la última tarjeta de la pantalla, con una línea y el rótulo "PERÍODOS ANTERIORES · 1" — y
 * contenía el único dato que juzgaba el presupuesto: que el mes pasado cerró en 152%, mientras
 * arriba, en verde y a 40px, decía "En rango".
 *
 * **Un presupuesto se evalúa por su serie, no por un mes.** Tres meses seguidos por encima
 * significan que el límite está mal puesto, y eso solo se ve en fila. Por eso sube, va una barra
 * por mes con su porcentaje, y debajo la conclusión que el usuario iba a sacar solo.
 */
export function BudgetDetailHistory({ current, allBudgets }: Props) {
  const key = budgetRuleKey(current);
  const history = allBudgets
    .filter((budget) => budget.id !== current.id && budgetRuleKey(budget) === key && budget.periodEnd < current.periodStart)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, MAX_HISTORY);

  if (history.length === 0) return null;

  const money = (value: number) => formatCurrency(value, current.currencyCode);
  const reading = budgetSeriesReading(history, money);

  return (
    <View style={styles.group}>
      <Text style={styles.title}>Meses anteriores</Text>

      {history.map((budget) => {
        const percent = budget.limitAmount > 0 ? (budget.spentAmount / budget.limitAmount) * 100 : 0;
        const over = budget.spentAmount > budget.limitAmount;
        const mes = capitalize(format(parseDisplayDate(budget.periodStart), "LLLL", { locale: es }));
        /* Un mes cerrado sin movimientos no es un 0%: es que no se anotó nada. Pintarlo como
           barra vacía diría que cumpliste el límite, que es justo el error de esta revisión. */
        const sinDatos = budget.movementCount === 0;

        return (
          <View key={budget.id} style={styles.row}>
            <Text style={styles.month}>{mes}</Text>
            {sinDatos ? (
              <Text style={styles.noData}>sin movimientos</Text>
            ) : (
              <>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.min(100, Math.max(2, percent))}%` },
                      over && styles.fillOver,
                    ]}
                  />
                </View>
                <Text style={[styles.percent, over && styles.percentOver]}>
                  {Math.round(percent)}%
                </Text>
              </>
            )}
          </View>
        );
      })}

      {reading ? <Text style={styles.reading}>{reading}</Text> : null}
    </View>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  group: { gap: SPACING.sm },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, minHeight: 32 },
  month: { width: 68, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  track: {
    flex: 1,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.fog },
  fillOver: { backgroundColor: COLORS.expense },
  percent: {
    width: 52,
    textAlign: "right",
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  percentOver: { color: COLORS.expense },
  noData: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  reading: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
});
