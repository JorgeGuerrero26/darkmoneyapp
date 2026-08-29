import type { ComponentType } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";

import { SafeBlurView } from "../ui/SafeBlurView";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

/**
 * Seis tonos, todos del sistema.
 *
 * Los doce anteriores —violeta, rosa, azul eléctrico, naranja saturado— no aparecían en ninguna
 * otra pantalla. Son **etiquetas para reconocer de un vistazo**, no decoración libre, así que
 * salen de la paleta que ya usa la app.
 *
 * El violeta queda fuera a propósito aunque exista (`COLORS.pro`): está reservado a la IA, y
 * usarlo para una categoría cualquiera lo vacía de significado.
 */
export const CATEGORY_COLOR_CHOICES = [
  COLORS.pine,
  COLORS.dangerSoft,
  COLORS.ember,
  COLORS.gold,
  COLORS.dangerStrong,
  COLORS.neutral,
];

type IconOption = { key: string; Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }> };

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  color: string;
  onColorChange: (color: string) => void;
  icon: string;
  onIconChange: (icon: string) => void;
  iconOptions: IconOption[];
  /** Compara la clave elegida con la de cada opción; los iconos tienen alias. */
  isIconSelected?: (optionKey: string, current: string) => boolean;
};

/**
 * La cuadrícula de íconos y colores, ahora **detrás de una fila**.
 *
 * Nueva categoría abría con 29 íconos y 10 colores: 400 px de decoración antes del campo NOMBRE,
 * que es el único obligatorio. Elegir sigue siendo posible; solo deja de ser lo primero.
 *
 * Va por la prop `overlay` del sheet del formulario: iOS presenta un Modal a la vez, así que un
 * selector hermano no llegaría a aparecer.
 */
export function AppearancePickerOverlay({
  visible,
  onClose,
  title = "Apariencia",
  color,
  onColorChange,
  icon,
  onIconChange,
  iconOptions,
  isIconSelected = (optionKey, current) => optionKey === current,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.root}>
      <SafeBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={18} color={COLORS.storm} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Color</Text>
        <View style={styles.colorRow}>
          {CATEGORY_COLOR_CHOICES.map((choice) => (
            <TouchableOpacity
              key={choice}
              style={[styles.colorDot, { backgroundColor: choice }, color === choice && styles.colorDotActive]}
              onPress={() => onColorChange(choice)}
              accessibilityRole="button"
              accessibilityState={{ selected: color === choice }}
            />
          ))}
        </View>

        <Text style={styles.label}>Ícono</Text>
        <ScrollView style={styles.iconScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconGrid}>
            {iconOptions.map(({ key, Icon }) => {
              const selected = isIconSelected(key, icon);
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.iconBtn, selected && styles.iconBtnActive]}
                  onPress={() => onIconChange(key)}
                  accessibilityLabel={`Ícono ${key}`}
                  accessibilityState={{ selected }}
                >
                  <Icon size={22} color={selected ? color : COLORS.fog} strokeWidth={2} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    justifyContent: "flex-end",
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.sm,
  },
  colorRow: { flexDirection: "row", gap: SPACING.sm },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: COLORS.ink, borderWidth: 3 },
  iconScroll: { maxHeight: 220 },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnActive: { borderColor: COLORS.ink },
});
