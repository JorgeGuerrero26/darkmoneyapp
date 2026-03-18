import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Variant = "empty" | "no-results";

type Props = {
  variant?: Variant;
  title?: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
  action?: { label: string; onPress: () => void };
};

const DEFAULTS: Record<Variant, { title: string; description: string; emoji: string }> = {
  empty: {
    emoji: "📭",
    title: "Sin datos aún",
    description: "No hay nada que mostrar. Crea el primero.",
  },
  "no-results": {
    emoji: "🔍",
    title: "Sin resultados",
    description: "Ningún elemento coincide con los filtros aplicados.",
  },
};

export function EmptyState({ variant = "empty", title, description, style, action }: Props) {
  const defaults = DEFAULTS[variant];

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.emoji}>{defaults.emoji}</Text>
      <Text style={styles.title}>{title ?? defaults.title}</Text>
      <Text style={styles.description}>{description ?? defaults.description}</Text>
      {action ? (
        <TouchableOpacity style={styles.actionBtn} onPress={action.onPress}>
          <Text style={styles.actionBtnText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  emoji: {
    fontSize: 40,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  description: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xl,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
  },
});
