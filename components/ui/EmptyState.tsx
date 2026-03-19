import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Inbox, Search } from "lucide-react-native";
import { Button } from "./Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Variant = "empty" | "no-results";

type Props = {
  variant?: Variant;
  title?: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
  action?: { label: string; onPress: () => void };
};

const DEFAULTS: Record<Variant, { title: string; description: string }> = {
  empty: {
    title: "Sin datos aún",
    description: "No hay nada que mostrar. Crea el primero.",
  },
  "no-results": {
    title: "Sin resultados",
    description: "Ningún elemento coincide con los filtros aplicados.",
  },
};

export function EmptyState({ variant = "empty", title, description, style, action }: Props) {
  const defaults = DEFAULTS[variant];
  const Icon = variant === "no-results" ? Search : Inbox;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Icon size={28} color={COLORS.storm} />
      </View>
      <Text style={styles.title}>{title ?? defaults.title}</Text>
      <Text style={styles.description}>{description ?? defaults.description}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="ghost"
          size="sm"
          style={styles.actionBtn}
        />
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
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    textAlign: "center",
  },
  description: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: SPACING.sm,
  },
});
