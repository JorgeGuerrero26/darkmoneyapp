import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "../../../components/ui/Button";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../constants/theme";
import { parseDisplayDate, todayPeru } from "../../../lib/date";
import { expectedPace } from "../lib/budgetRules";
import { budgetHeadState } from "../lib/budgetVerdict";
import type { BudgetOverview } from "../../../types/domain";

type Props = {
  budget: BudgetOverview;
  /** Solo aparece cuando el período cerró vacío: es lo único que se puede hacer al respecto. */
  onReviewMovements?: () => void;
};

/**
 * Lo que encabeza el detalle: progreso, veredicto o ausencia de datos.
 *
 * Decía **"0% · En rango"** en verde, a 40px, sobre un mes cerrado sin un solo movimiento — y el
 * dato que juzgaba de verdad ese presupuesto, que el mes anterior cerró en 152%, estaba al pie
 * en letra de doce. La pantalla felicitaba por un período vacío.
 *
 * También se va la cuadrícula de cuatro cifras: "Restante" era la resta de las dos primeras y
 * "Movimientos" ya está en su sección. Las dos que importan van juntas en una línea —
 * "S/ 322.12 de S/ 400.00" — que es como se leen, una contra la otra; y el restante se dice en
 * la frase, con para cuántos días alcanza, que es lo que lo hace útil.
 *
 * La barra solo acompaña al período que corre: prometer movimiento en un mes cerrado es mentir.
 */
export function BudgetDetailHeader({ budget, onReviewMovements }: Props) {
  const today = todayPeru();
  const money = (value: number) => formatCurrency(value, budget.currencyCode);
  const periodLabel = capitalize(format(parseDisplayDate(budget.periodStart), "LLLL", { locale: es }));
  const state = budgetHeadState({ budget, todayYmd: today, formatAmount: money, periodLabel });

  if (state.kind === "no-data") {
    return (
      <View style={styles.hero}>
        <Text style={styles.emptyTitle}>{state.title}</Text>
        <Text style={styles.emptyBody}>{state.body}</Text>
        {onReviewMovements ? (
          <Button
            label={`Revisar movimientos de ${periodLabel.toLowerCase()}`}
            variant="secondary"
            size="lg"
            onPress={onReviewMovements}
          />
        ) : null}
      </View>
    );
  }

  const over = state.spent > state.limit;
  const percent = state.limit > 0 ? (state.spent / state.limit) * 100 : 0;
  const pace = expectedPace(budget, today);

  return (
    <View style={styles.hero}>
      <View style={styles.amountRow}>
        <Text style={[styles.spent, over && styles.spentOver]}>{money(state.spent)}</Text>
        <Text style={styles.limit}>de {money(state.limit)}</Text>
      </View>

      {state.kind === "progress" ? (
        <View style={styles.track}>
          <View
            style={[styles.fill, { width: `${Math.min(100, Math.max(0, percent))}%` }, over && styles.fillOver]}
          />
          {/* La marca va en el porcentaje TRANSCURRIDO, no en el que queda. */}
          {!over && pace > 0 && pace < 1 ? (
            <View style={[styles.pace, { left: `${pace * 100}%` }]} />
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.sentence, over && styles.sentenceOver]}>{state.sentence}</Text>
    </View>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  hero: { gap: SPACING.sm },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm },
  spent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  spentOver: { color: COLORS.expense },
  limit: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  track: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.fog },
  fillOver: { backgroundColor: COLORS.expense },
  pace: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: COLORS.storm },
  sentence: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
    lineHeight: 21,
  },
  sentenceOver: { color: COLORS.expense },
  emptyTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
    lineHeight: 21,
    marginBottom: SPACING.xs,
  },
});
