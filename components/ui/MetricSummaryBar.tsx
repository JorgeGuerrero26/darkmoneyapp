import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";

export type MetricSummaryBarAction = {
  key: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  /** Etiqueta pequeña encima de la cifra. Se omite si no hay cifra. */
  label?: string;
  /** La ÚNICA cifra grande. Si falta, el resumen es solo la línea de apoyo. */
  value?: string | null;
  valueColor?: string;
  /**
   * Línea de apoyo, en gris. Es una **frase**, no una lista de celdas:
   * "No debes nada · 4 obligaciones activas, 1 compartida contigo".
   */
  support?: string | null;
  /** Nota al pie sobre el alcance del dato. Letra chica. */
  footnote?: string | null;
  actions?: MetricSummaryBarAction[];
  /** Explicación que se abre al tocar la cifra. */
  help?: { title: string; description: string };
};

/**
 * Resumen de un módulo de lista: **una** cifra y una frase.
 *
 * Antes eran tres celdas del mismo tamaño, y ese formato **obliga a inventar un tercer dato**.
 * Salía "27 · 27 · 0" en Categorías —que son una sola frase: tienes 27 y todas están activas—,
 * y en Créditos el NETO repetía exactamente COBRAR cuando no debes nada: la misma cifra dos
 * veces, en dos colores distintos. También partía las etiquetas: "SIN…", "LEÍ…", "INV…".
 *
 * Si el módulo no tiene una cifra que merezca 34 px, **no lleva cifra**: solo la frase.
 */
export function MetricSummaryBar({
  label,
  value,
  valueColor,
  support,
  footnote,
  actions = [],
  help,
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  if (!value && !support && actions.length === 0) return null;

  const headline = value ? (
    <View style={styles.headline}>
      {label ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
      <Text
        style={[styles.value, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={1.1}
      >
        {value}
      </Text>
    </View>
  ) : null;

  return (
    <>
      <View style={styles.root}>
        <View style={styles.main}>
          {help && headline ? (
            <Pressable
              onPress={() => setHelpOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Explicar ${label ?? "el resumen"}`}
            >
              {headline}
            </Pressable>
          ) : headline}
          {support ? <Text style={styles.support}>{support}</Text> : null}
        </View>

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={[styles.action, action.active && styles.actionActive, action.disabled && styles.actionDisabled]}
                onPress={action.onPress}
                disabled={action.disabled}
              >
                <Text
                  style={[
                    styles.actionText,
                    action.active && styles.actionTextActive,
                    action.destructive && styles.actionTextDestructive,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* La nota de alcance va al PIE y con palabras, no apretada junto a la cifra. */}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}

      <BottomSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={help?.title}
        snapHeight={0.34}
      >
        <View style={styles.helpContent}>
          {value ? (
            <Text style={[styles.helpMetricValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
          ) : null}
          {help?.description ? <Text style={styles.helpDescription}>{help.description}</Text> : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headline: {
    gap: 2,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    lineHeight: FONT_SIZE.xs + 3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.storm,
  },
  value: {
    fontFamily: FONT_FAMILY.heading,
    // 32: la cifra del módulo es lo primero que se lee. Es el tamaño de "cifra de tarjeta" de
    // la escala, sin inventar uno nuevo.
    fontSize: FONT_SIZE.xxxl,
    lineHeight: FONT_SIZE.xxxl + 4,
    letterSpacing: -0.035 * FONT_SIZE.xxxl,
    color: COLORS.ink,
  },
  // Frase de apoyo: todo lo que NO merece 32px. En gris, porque el color se reserva a la cifra.
  support: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 19,
    color: COLORS.storm,
  },
  footnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.xs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  action: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  actionActive: {
    backgroundColor: COLORS.action,
    borderColor: COLORS.action,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  actionTextActive: {
    color: COLORS.actionText,
  },
  actionTextDestructive: {
    color: COLORS.dangerStrong,
  },
  helpContent: {
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  helpMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxl,
    color: COLORS.ink,
  },
  helpDescription: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 21,
    color: COLORS.fog,
  },
});
