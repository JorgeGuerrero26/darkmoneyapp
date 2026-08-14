import { Modal, StyleSheet, Text, View } from "react-native";
import { COLORS, ELEVATION, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
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
  /**
   * Renderiza sin `Modal`, como capa absoluta sobre su contenedor.
   *
   * iOS solo presenta UN Modal a la vez: un ConfirmDialog hermano de un BottomSheet abierto
   * (que también es Modal) simplemente NO aparece, y el usuario se queda sin poder cerrar el
   * formulario — reportado el 2026-08-13 en el iPhone. En Android los Modal hermanos se apilan
   * bien, por eso el fallo era invisible hasta tener un iPhone.
   *
   * Usar junto a la prop `overlay` de BottomSheet, que lo pinta fuera del ScrollView.
   */
  inline?: boolean;
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
  inline = false,
}: Props) {
  const content = (
    <View style={[styles.overlay, inline ? styles.overlayInline : null]}>
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
  );

  // Sin Modal: el contenedor decide dónde va. Ver la nota de la prop `inline`.
  if (inline) return visible ? content : null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={confirmLoading ? undefined : onCancel}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Cubre al contenedor entero (el sheet) en vez de ocupar la pantalla como Modal.
  overlayInline: { ...StyleSheet.absoluteFillObject, zIndex: 20, elevation: 20 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  card: {
    width: "100%",
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: SPACING.sm,
    ...ELEVATION[4],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SURFACE.dangerBg,
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
