import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Inbox, Search, type LucideIcon } from "lucide-react-native";
import { Button } from "./Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Variant = "empty" | "no-results";

type Props = {
  variant?: Variant;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  hint?: string;
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

export function EmptyState({ variant = "empty", icon, title, description, hint, style, action }: Props) {
  const defaults = DEFAULTS[variant];
  const DefaultIcon = variant === "no-results" ? Search : Inbox;
  const Icon = icon ?? DefaultIcon;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Icon size={26} color={COLORS.storm} strokeWidth={1.5} />
      </View>
      <Text style={styles.title}>{title ?? defaults.title}</Text>
      <Text style={styles.description}>{description ?? defaults.description}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
    width: 60,
    height: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
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
    lineHeight: 21,
    maxWidth: 300,
  },
  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 18,
    opacity: 0.6,
    maxWidth: 280,
    marginTop: -SPACING.xs,
  },
  actionBtn: {
    marginTop: SPACING.xs,
  },
});
