import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ResourceCard } from "../ui/ResourceCard";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { budgetRowNote, daysLeft, expectedPace } from "../../features/budgets/lib/budgetRules";
import { todayPeru } from "../../lib/date";
import { useUiStore } from "../../store/ui-store";
import type { BudgetOverview } from "../../types/domain";

type Props = {
  budget: BudgetOverview;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/**
 * Un presupuesto del mes en curso, en una fila.
 *
 * **Decía el mismo estado cuatro veces.** Cápsula "Excedido", barra en clay, el porcentaje en
 * clay y abajo "⚠ Presupuesto excedido" — la última era literalmente la primera escrita de
 * nuevo. Quedan el porcentaje y la barra, y en su lugar la única línea que añade algo: cuánto te
 * pasaste y cuánto falta, que es lo que decide si hay que hacer algo.
 *
 * **Y el ámbar se va.** "Cerca del límite" salía en el color reservado a vencimiento para marcar
 * algo que no era un problema: 81% con 22 días por delante. El clay entra solo al pasarse; lo
 * demás va en hueso, y quien dice si un 81% está bien es **la marca del ritmo** en la barra —
 * el día 8 es alarmante, el día 26 es normal.
 *
 * Fuera también el recuadro de la diana (idéntico en todas las filas, así que no distinguía
 * nada), el ícono de análisis (abre un detalle desde una lista donde aún no elegiste cuál) y
 * "tocar para editar", que era un manual de uso ocupando el sitio de los datos.
 */
function BudgetCardBase({ budget, selected, onPress, onLongPress }: Props) {
  // Suscripción propia: invalida el memo cuando cambia el modo privacidad
  // (los props no cambian al alternar, sin esto la fila mostraría el monto viejo).
  useUiStore((state) => state.privacyMode);

  const today = todayPeru();
  const over = budget.spentAmount > budget.limitAmount;
  const money = (value: number) => formatCurrency(value, budget.currencyCode);
  const nota = budgetRowNote(budget, today, money);
  const restantes = daysLeft(budget, today);
  const pace = expectedPace(budget, today);
  const percent = budget.limitAmount > 0 ? (budget.spentAmount / budget.limitAmount) * 100 : 0;

  return (
    <ResourceCard
      variant="row"
      title={budget.name}
      subtitle={`${budget.movementCount} movimiento${budget.movementCount === 1 ? "" : "s"} · ${restantes === 1 ? "queda 1 día" : `quedan ${restantes} días`}`}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      trailing={
        <Text style={[styles.percent, over && styles.percentOver]}>
          {Math.round(percent)}%
        </Text>
      }
      footer={
        <View style={styles.footer}>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.min(100, Math.max(0, percent))}%` },
                over && styles.fillOver,
              ]}
            />
            {/* Dónde deberías ir a estas alturas del mes: es lo que convierte el porcentaje en
                información en vez de en un dato suelto. */}
            {!over && pace > 0 && pace < 1 ? (
              <View style={[styles.pace, { left: `${pace * 100}%` }]} />
            ) : null}
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.spent}>{money(budget.spentAmount)}</Text>
            <Text style={styles.limit}>de {money(budget.limitAmount)}</Text>
          </View>
          {nota ? <Text style={[styles.note, over && styles.noteOver]}>{nota}</Text> : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  percentOver: { color: COLORS.expense },
  footer: { gap: SPACING.sm, paddingTop: SPACING.xs },
  track: {
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: RADIUS.full, backgroundColor: COLORS.fog },
  fillOver: { backgroundColor: COLORS.expense },
  pace: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: COLORS.storm,
  },
  amountRow: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  spent: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  limit: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  note: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
    lineHeight: 18,
  },
  noteOver: { color: COLORS.expense },
});

export const BudgetCard = memo(BudgetCardBase);
