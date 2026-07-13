// components/ui/NotificationReasonBanner.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  reason: string | null;
  onDismiss: () => void;
};

/** Nota descartable "por qué llegaste aquí" bajo el header de un detalle. */
export function NotificationReasonBanner({ reason, onDismiss }: Props) {
  if (!reason) return null;
  return (
    <View style={styles.banner}>
      <Info size={16} color={COLORS.gold} />
      <Text style={styles.text}>{reason}</Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
        <X size={16} color={COLORS.storm} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(215, 190, 123, 0.28)",
    backgroundColor: "rgba(215, 190, 123, 0.08)",
  },
  text: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 18,
  },
});
