import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { SpendTypeMix } from "../../lib/spendTypeMix";
import { SectionTitle } from "./SectionTitle";

type Props = {
  mix: SpendTypeMix;
  currency: string;
  /** Lleva a la maestra, que es donde se arregla lo que falta. */
  onPressClassify: () => void;
};

/**
 * En qué se te va: necesidad, deseo o ahorro.
 *
 * La otra tarjeta de categorías dice **en qué** gastaste —Alimentación, Transporte—. Esta dice
 * **si hacía falta**, que es la pregunta que se hace uno al final del mes y que ninguna
 * categoría podía responder: las dos con más movimientos son mixtas.
 *
 * Una barra y sus renglones, no una torta: son tres cifras que se comparan entre sí y una barra
 * apilada las ordena de mayor a menor sin obligar a leer una leyenda aparte.
 */
export function SpendTypeMixCard({ mix, currency, onPressClassify }: Props) {
  if (mix.state === "hidden") return null;

  if (mix.state === "invite") {
    /* Una línea, no un gráfico: con nada clasificado el gráfico sería un solo bloque gris. Se
       apaga sola en cuanto una categoría tenga tipo. */
    return (
      <Card>
        <Pressable onPress={onPressClassify} accessibilityRole="button">
          <SectionTitle>De qué tipo fue tu gasto</SectionTitle>
          <Text style={styles.invite}>
            Ya tienes tus tipos, pero ninguna categoría dice cuál le toca todavía. Ponles el suyo
            y esta tarjeta te dirá cuánto de los {formatCurrency(mix.total, currency)} de este mes
            hacía falta.
          </Text>
          <Text style={styles.inviteAction}>Clasificar mis categorías</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>De qué tipo fue tu gasto</SectionTitle>

      <View style={styles.bar}>
        {mix.segments.map((segment) => (
          <View
            key={segment.id}
            style={{ flex: Math.max(segment.share, 0.01), backgroundColor: segment.color }}
          />
        ))}
      </View>

      {mix.segments.map((segment) => (
        <View key={segment.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: segment.color }]} />
          <Text style={styles.name} numberOfLines={1}>{segment.name}</Text>
          <Text style={styles.percent}>{Math.round(segment.share * 100)}%</Text>
          <Text style={styles.amount}>{formatCurrency(segment.amount, currency)}</Text>
        </View>
      ))}

      {mix.footnote ? (
        <Pressable onPress={onPressClassify} accessibilityRole="button">
          <Text style={styles.footnote}>{mix.footnote}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: RADIUS.full,
    overflow: "hidden",
    backgroundColor: SURFACE.track,
    marginBottom: SPACING.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full },
  name: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  percent: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink, width: 44, textAlign: "right" },
  amount: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, width: 84, textAlign: "right" },
  invite: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  inviteAction: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
    marginTop: SPACING.sm,
  },
  footnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: SPACING.xs,
  },
});
