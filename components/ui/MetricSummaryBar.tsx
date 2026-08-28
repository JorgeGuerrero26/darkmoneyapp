import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";

export type MetricSummaryBarItem = {
  key: string;
  value: string;
  label: string;
  compactLabel?: string;
  color?: string;
  icon?: LucideIcon;
  strong?: boolean;
  helpTitle?: string;
  helpDescription?: string;
};

export type MetricSummaryBarAction = {
  key: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  items: MetricSummaryBarItem[];
  trailingLabel?: string | null;
  actions?: MetricSummaryBarAction[];
};

export function MetricSummaryBar({ items, trailingLabel, actions = [] }: Props) {
  const [selectedHelpItem, setSelectedHelpItem] = useState<MetricSummaryBarItem | null>(null);

  if (items.length === 0) return null;
  const showActions = actions.length > 0;

  return (
    <>
      <View style={styles.root}>
        {items.map((item, index) => {
          const Icon = item.icon;
          const hasHelp = Boolean(item.helpTitle || item.helpDescription);
          const itemContent = (
            // La columna destacada lleva fondo elevado: de las tres, es la unica que responde
            // a la pregunta real ("¿cuanto me queda?"). Las otras dos son el detalle.
            <View style={[styles.item, item.strong && styles.itemStrong]}>
              <View style={styles.labelRow}>
                {Icon ? <Icon size={10} color={item.color ?? COLORS.storm} strokeWidth={2.5} /> : null}
                <Text
                  style={[styles.label, item.color ? { color: item.color } : null]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                >
                  {item.compactLabel ?? item.label}
                </Text>
              </View>
              <Text
                style={[styles.value, item.color ? { color: item.color } : null]}
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.1}
              >
                {item.value}
              </Text>
            </View>
          );

          return (
            <View key={item.key} style={styles.itemWrap}>
              {index > 0 ? <View style={styles.separator} /> : null}
              {hasHelp ? (
                <Pressable
                  style={styles.helpPressable}
                  onPress={() => setSelectedHelpItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Explicar ${item.label}`}
                >
                  {itemContent}
                </Pressable>
              ) : itemContent}
            </View>
          );
        })}
        {showActions ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={[styles.action, action.active && styles.actionActive, action.disabled && styles.actionDisabled]}
                onPress={action.onPress}
                disabled={action.disabled}
              >
                <Text style={[styles.actionText, action.active && styles.actionTextActive, action.destructive && styles.actionTextDestructive]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {/* La nota de alcance va al PIE y con palabras, no apretada entre las columnas.
          "parcial ↓" no decia nada: significa que los totales solo cubren lo cargado. */}
      {trailingLabel ? <Text style={styles.footnote}>{trailingLabel}</Text> : null}

      <BottomSheet
        visible={Boolean(selectedHelpItem)}
        onClose={() => setSelectedHelpItem(null)}
        title={selectedHelpItem?.helpTitle ?? selectedHelpItem?.label}
        snapHeight={0.34}
      >
        <View style={styles.helpContent}>
          <View style={styles.helpMetricRow}>
            <Text style={[styles.helpMetricValue, selectedHelpItem?.color ? { color: selectedHelpItem.color } : null]}>
              {selectedHelpItem?.value}
            </Text>
            <Text style={styles.helpMetricLabel}>{selectedHelpItem?.label}</Text>
          </View>
          {selectedHelpItem?.helpDescription ? (
            <Text style={styles.helpDescription}>{selectedHelpItem.helpDescription}</Text>
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Una sola pieza con reglas verticales, en vez de tres tarjetas con tres bordes y tres
  // sombras. Va como tarjeta cerrada, no como franja a sangre.
  root: {
    flexDirection: "row",
    alignItems: "stretch",
    // Suelo de alto: sin el, una columna sin dato encogia la cinta entera y el resto quedaba
    // recortado por el overflow:hidden de esta misma tarjeta.
    minHeight: 62,
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  itemWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    flex: 1,
    minWidth: 0,
  },
  item: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // La columna destacada lleva fondo elevado: de las tres, es la unica que responde a la
  // pregunta real ("cuanto me queda"). Las otras dos son el detalle que la explica.
  itemStrong: {
    backgroundColor: SURFACE.subtle,
  },
  helpPressable: {
    flex: 1,
    minWidth: 0,
  },
  separator: {
    width: 1,
    backgroundColor: SURFACE.cardBorder,
  },
  // lineHeight explicito: sin el, las fuentes custom con fontScale grande (MIUI)
  // dibujan glifos mas altos que la caja de linea y el texto sale cortado.
  value: {
    fontFamily: FONT_FAMILY.heading,
    // 17 y no 20: con tres columnas en 393px quedan ~93px utiles por cifra, y a 20px un
    // "+12,487.60" ya no entra. Mejor una cifra que se lee entera que una recortada.
    fontSize: FONT_SIZE.lg,
    lineHeight: FONT_SIZE.lg + 4,
    letterSpacing: -0.035 * FONT_SIZE.lg,
    color: COLORS.ink,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    lineHeight: FONT_SIZE.xs + 3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.storm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    // Aire y separador propio: sin esto los chips quedaban pegados al borde donde termina el
    // fondo elevado de la columna, y el corte de color parecia un fallo de dibujado.
    paddingHorizontal: SPACING.md,
    borderLeftWidth: 1,
    borderLeftColor: SURFACE.cardBorder,
    alignSelf: "stretch",
  },
  // Nota al pie de la cinta: alcance del dato, en letra chica y con palabras.
  footnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.xs,
  },
  action: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  actionActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
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
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.pine,
  },
  actionTextDestructive: {
    color: COLORS.danger,
  },
  helpContent: {
    gap: SPACING.md,
  },
  helpMetricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACING.xs,
  },
  helpMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  helpMetricLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  helpDescription: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 21,
    color: COLORS.textMuted,
  },
});
