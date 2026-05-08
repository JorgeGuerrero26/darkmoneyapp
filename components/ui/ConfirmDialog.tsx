import { Modal, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { SafeBlurView } from "./SafeBlurView";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  /** Emoji string (e.g. "👋") rendered centered above the title in a circular wrapper. */
  icon?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  confirmLoading?: boolean;
  confirmLoadingLabel?: string;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  icon,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  destructive = true,
  confirmLoading = false,
  confirmLoadingLabel,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={confirmLoading ? undefined : onCancel}>
      <View style={styles.overlay}>
        <SafeBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.card}>
          {icon ? (
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>{icon}</Text>
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          {children ?? null}
          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              size="lg"
              onPress={onConfirm}
              loading={confirmLoading}
              loadingLabel={confirmLoadingLabel}
            />
            <Button
              label={cancelLabel}
              variant="ghost"
              size="md"
              onPress={onCancel}
              disabled={confirmLoading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(10,14,20,0.92)",
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.dangerMuted,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  icon: { fontSize: 32 },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  body: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  actions: { gap: SPACING.sm },
});
