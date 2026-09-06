import { memo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Plus } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { SpendingHabit } from "../../../movements/lib/spendingHabits";

type Props = {
  habits: SpendingHabit[];
  currencyCode: string;
  /** El que se está guardando ahora mismo, para no dejar el toque sin respuesta. */
  savingKey: string | null;
  onRegister: (habit: SpendingHabit) => void;
};

/**
 * Los gastos que repites, a un toque, cuando toca.
 *
 * **Por qué existe.** Registrar los S/ 2 de la moto al trabajo son cinco pasos —abrir el
 * formulario, tipo, monto, cuenta, categoría— para un dato que se repite veintisiete veces al
 * mes y siempre igual. La app ya sabe cuál es: está en tus propios movimientos.
 *
 * **Por qué aparece y desaparece.** Solo se ven los hábitos que encajan con este momento: el
 * día correcto —la moto es de lunes a viernes— y dentro de su franja habitual. Una fila fija
 * con todo lo que sueles gastar sería otro menú; esto es una sugerencia que pasa.
 *
 * **Y por qué no hay IA aquí.** Es contar repeticiones y mirar la hora. Así es instantáneo,
 * gratis y funciona sin señal: tres cosas que una llamada a un modelo no da. Un atajo que tarda
 * dos segundos en aparecer ya no es un atajo.
 */
function QuickHabitsRowBase({ habits, currencyCode, savingKey, onRegister }: Props) {
  if (habits.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Lo de siempre</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {habits.map((habit) => {
          const saving = savingKey === habit.key;
          return (
            <TouchableOpacity
              key={habit.key}
              style={[styles.chip, saving && styles.chipSaving]}
              onPress={() => onRegister(habit)}
              disabled={saving}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={`Registrar ${habit.label} de ${formatCurrency(habit.amount, currencyCode)}`}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.storm} />
              ) : (
                <Plus size={15} color={COLORS.fog} strokeWidth={2.5} />
              )}
              <View style={styles.chipCopy}>
                <Text style={styles.chipLabel} numberOfLines={1}>{habit.label}</Text>
                <Text style={styles.chipAmount}>{formatCurrency(habit.amount, currencyCode)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.sm },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  row: { gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  chipSaving: { opacity: 0.6 },
  chipCopy: { gap: 1 },
  chipLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  chipAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xs, color: COLORS.storm },
});

export const QuickHabitsRow = memo(QuickHabitsRowBase);
