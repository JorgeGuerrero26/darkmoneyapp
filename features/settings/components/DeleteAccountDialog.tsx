import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Input } from "../../../components/ui/Input";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import {
  type AccountDeletionPreview,
  DELETE_CONFIRM_WORD,
  deleteMyAccount,
  fetchAccountDeletionPreview,
} from "../../../services/queries/account-deletion";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** La cuenta ya se eliminó en el servidor: queda borrar el teléfono y salir. */
  onDeleted: () => Promise<void>;
};

const WHAT_GETS_DELETED = [
  "Tus cuentas, movimientos, presupuestos, suscripciones, deudas y contactos.",
  "Tus comprobantes y tu foto de perfil.",
  "Tus ajustes, notificaciones y lo que guardaste en este teléfono.",
];

/**
 * Eliminar la cuenta: explica qué se borra, pide escribir ELIMINAR y recién entonces enciende el botón rojo.
 * Sin "Deshacer". Los errores se quedan dentro del diálogo; si Pro se sigue cobrando, se pide cancelarlo primero.
 */
export function DeleteAccountDialog({ visible, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelPro, setCancelPro] = useState<{ message: string; manageUrl: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setConfirmText("");
    setError(null);
    setPreview(null);
    setPreviewError(null);
    setCancelPro(null);
    let alive = true;
    fetchAccountDeletionPreview()
      .then((result) => {
        if (!alive) return;
        setPreview(result);
        if (result.mustCancelPro) {
          setCancelPro({
            message: "Tu plan Pro se sigue cobrando. Cancélalo primero en la web (Configuración → Suscripción) y vuelve a intentarlo.",
            manageUrl: result.manageUrl,
          });
        }
      })
      .catch((cause: unknown) => alive && setPreviewError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      alive = false;
    };
  }, [visible]);

  const confirmed = confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteMyAccount(confirmText);
    if (result.kind === "deleted") {
      await onDeleted();
      return;
    }
    setDeleting(false);
    if (result.kind === "cancel_pro_first") setCancelPro({ message: result.message, manageUrl: result.manageUrl });
    else setError(result.message);
  }

  if (cancelPro) {
    return (
      <ConfirmDialog
        visible={visible}
        icon="💳"
        title="Primero cancela Pro"
        body={cancelPro.message}
        confirmLabel="Abrir la web"
        cancelLabel="Cerrar"
        destructive={false}
        onConfirm={() => {
          void Linking.openURL(cancelPro.manageUrl);
          onClose();
        }}
        onCancel={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      visible={visible}
      icon="⚠️"
      title="Eliminar tu cuenta"
      body="Se borrarán para siempre tu cuenta y todos tus datos. No se puede deshacer."
      confirmLabel="Eliminar cuenta"
      cancelLabel="Cancelar"
      destructive
      confirmDisabled={!confirmed || !preview}
      confirmLoading={deleting}
      confirmLoadingLabel="Eliminando"
      avoidKeyboard
      onConfirm={() => void handleDelete()}
      onCancel={onClose}
    >
      <View style={styles.list}>
        {WHAT_GETS_DELETED.map((line) => (
          <Text key={line} style={styles.item}>• {line}</Text>
        ))}
        {preview?.transfers.map((transfer) => (
          <Text key={transfer.workspaceName} style={styles.item}>
            • «{transfer.workspaceName}» no se borra: pasará a ser de {transfer.newOwnerName}, con lo que registraron los demás.
          </Text>
        ))}
      </View>
      {!preview && !previewError ? <ActivityIndicator color={COLORS.storm} style={styles.loading} /> : null}
      {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
      <Input
        label={`Escribe ${DELETE_CONFIRM_WORD} para confirmar`}
        value={confirmText}
        onChangeText={(text) => {
          setConfirmText(text);
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!deleting}
        accessibilityLabel={`Escribe ${DELETE_CONFIRM_WORD} para confirmar`}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ConfirmDialog>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.xs, marginBottom: SPACING.sm },
  item: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  loading: { marginBottom: SPACING.sm },
  error: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.danger, lineHeight: 20 },
});
