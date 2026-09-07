import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { subscriptionRecurrencePhrase } from "../../../lib/subscription-helpers";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  /** El único hueco que se llena desde aquí: ver abajo por qué solo ese. */
  onPickPayer: () => void;
};

/**
 * Los cuatro datos del ingreso, en filas.
 *
 * Era una cuadrícula de 2×2 con un quinto dato suelto debajo y sin alineación entre filas —la
 * tercera vez que aparece el mismo patrón, después del detalle de movimiento y el de
 * suscripción—. Leerla obligaba a ir en zigzag. En filas de etiqueta a la izquierda y valor a la
 * derecha se lee de arriba abajo, y caben los valores largos sin partirse.
 *
 * **"Quién paga" gana su chevrón y las otras cuatro no.** Es el hueco que quedó abierto cuando
 * salió de la lista, y llenarlo no debería costar entrar a Editar. Las demás sí se cambian ahí:
 * dar un atajo a cada fila convierte la ficha en un formulario, que es de lo que veníamos.
 *
 * El recordatorio no está aquí: vive junto a "Llegadas", que es lo que avisa.
 */
export function RecurringIncomeDetailFacts({ item, onPickPayer }: Props) {
  return (
    <View style={styles.group}>
      <Fact
        label="Se repite"
        value={subscriptionRecurrencePhrase(item.intervalCount, item.frequency, item.dayOfMonth)}
      />
      <Fact label="Entra a" value={item.accountName ?? null} empty="Sin cuenta" />
      <Fact label="Categoría" value={item.categoryName ?? null} empty="Sin categoría" />
      <Fact
        label="Quién paga"
        value={item.payer?.trim() || null}
        empty="Nadie elegido"
        onPress={onPickPayer}
        last
      />
    </View>
  );
}

function Fact({
  label,
  value,
  empty,
  onPress,
  last = false,
}: {
  label: string;
  value: string | null;
  /** Lo que dice la fila cuando no hay dato, con palabras. */
  empty?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const filled = Boolean(value);
  const body = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, !filled && styles.valueEmpty]} numberOfLines={2}>
        {value ?? empty}
      </Text>
      {onPress ? <ChevronRight size={16} color={COLORS.storm} /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.row, !last && styles.rowDivided]}
        onPress={onPress}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? empty}. Toca para elegir`}
      >
        {body}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.row, !last && styles.rowDivided]}>{body}</View>;
}

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  label: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  value: {
    flexShrink: 1,
    maxWidth: "55%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  valueEmpty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
