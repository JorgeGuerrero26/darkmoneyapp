import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  destructive = true,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive ? styles.destructiveBtn : styles.primaryBtn]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmText, destructive ? styles.destructiveText : styles.primaryText]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
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
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
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
  confirmBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  destructiveBtn: {
    backgroundColor: COLORS.danger + "22",
    borderColor: COLORS.danger + "66",
  },
  primaryBtn: {
    backgroundColor: COLORS.primary + "22",
    borderColor: COLORS.primary + "66",
  },
  confirmText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  destructiveText: { color: COLORS.danger },
  primaryText: { color: COLORS.primary },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textMuted,
  },
});
