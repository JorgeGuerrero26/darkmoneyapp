import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { subscriptionRecurrencePhrase } from "../../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  /** Los huecos se llenan aquí mismo: la fila sin valor abre su selector. */
  onPickAccount: () => void;
  onPickCategory: () => void;
};

/**
 * Los cuatro datos de la suscripción, en filas.
 *
 * Estaban en una cuadrícula de 2×2 con un separador vertical corto que no llegaba a los bordes,
 * y leerlos obligaba a ir en zigzag. Cuatro filas es como se leen los datos en el resto de la
 * app, y de paso caben los valores largos sin partirse.
 *
 * **"Sin cuenta" y "Sin categoría" son huecos con arreglo**, así que llevan chevrón y se llenan
 * desde aquí. El de la cuenta importa más de lo que parece: sin ella, "Anotar el gasto solo" no
 * puede funcionar, y esta pantalla era el único sitio donde eso se veía.
 */
export function SubscriptionDetailFacts({ subscription, onPickAccount, onPickCategory }: Props) {
  const remind = subscription.remindDaysBefore;

  return (
    <View style={styles.group}>
      <Fact
        label="Se repite"
        value={subscriptionRecurrencePhrase(subscription.intervalCount, subscription.frequency)}
      />
      <Fact
        label="Avisarme antes"
        value={remind > 0 ? `${remind} ${remind === 1 ? "día" : "días"}` : "Sin aviso"}
      />
      <Fact
        label="Se paga con"
        value={subscription.accountName ?? null}
        empty="Sin cuenta"
        support={
          subscription.autoCreateMovement && !subscription.accountName
            ? "Sin cuenta, el gasto no se anota solo"
            : subscription.autoCreateMovement
              ? "El gasto se anota solo"
              : undefined
        }
        onPress={onPickAccount}
      />
      <Fact
        label="Categoría"
        value={subscription.categoryName ?? null}
        empty="Sin categoría"
        onPress={onPickCategory}
        last
      />
    </View>
  );
}

function Fact({
  label,
  value,
  empty,
  support,
  onPress,
  last = false,
}: {
  label: string;
  value: string | null;
  /** Lo que dice la fila cuando no hay dato, con palabras. */
  empty?: string;
  support?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const filled = Boolean(value);
  const body = (
    <>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {support ? <Text style={styles.support}>{support}</Text> : null}
      </View>
      <Text style={[styles.value, !filled && styles.valueEmpty]} numberOfLines={2}>
        {value ?? empty}
      </Text>
      {/* El chevrón solo donde lleva a algo: un hueco que se puede llenar. */}
      {!filled && onPress ? <ChevronRight size={16} color={COLORS.storm} /> : null}
    </>
  );

  if (!filled && onPress) {
    return (
      <TouchableOpacity
        style={[styles.row, !last && styles.rowDivided]}
        onPress={onPress}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${empty}. Toca para elegir`}
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
    minHeight: 56,
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
  copy: { flex: 1, gap: 2 },
  label: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  support: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  value: {
    flexShrink: 1,
    maxWidth: "50%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  valueEmpty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
