import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";

import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { AttachmentPicker, type Attachment } from "../../../../components/domain/AttachmentPicker";
import type { MovementAttachmentFile } from "../../../../services/queries/movements";

type Props = {
  visible: boolean;
  onClose: () => void;
  movementId: number;
  workspaceId: number;
  /** Los que ya están guardados, tal como los devuelve la consulta del detalle. */
  existing: MovementAttachmentFile[];
  loading: boolean;
  /** Borra el archivo y su espejo en el evento de la obligación, si lo hay. */
  onRemoveStoragePath: (storagePath: string) => Promise<void>;
};

/**
 * Los comprobantes de un movimiento, en su propia hoja.
 *
 * La fila "Comprobante · Agregar" abría el formulario de edición completo, que es justo lo que
 * la Revisión 17 quitó de en medio: adjuntar una foto no es editar el movimiento, y no tenía por
 * qué pasar por los ocho campos del formulario para dejar una imagen.
 *
 * Las fotos viven en el almacenamiento, bajo `{workspace}/movement/{id}`, sin fila en la base:
 * subir una aquí ya la deja guardada, sin un "Guardar" que apretar. Por eso la hoja no tiene
 * botón al pie — se cierra y ya está.
 */
export function MovementAttachmentsSheet({
  visible,
  onClose,
  movementId,
  workspaceId,
  existing,
  loading,
  onRemoveStoragePath,
}: Props) {
  const queryClient = useQueryClient();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /**
   * El comprobante en grande se enseña DENTRO de la hoja, no en un modal encima: iOS presenta un
   * modal a la vez, y esta hoja ya es uno.
   */
  const [preview, setPreview] = useState<Attachment | null>(null);
  const hydratedRef = useRef<string | null>(null);

  // Se parte de lo que ya hay guardado, igual que hace el formulario al editar.
  useEffect(() => {
    if (!visible || loading) return;
    const key = `${movementId}:${existing.map((file) => file.filePath).join("|")}`;
    if (hydratedRef.current === key) return;
    hydratedRef.current = key;
    setAttachments(existing.map((file) => ({
      uri: file.signedUrl,
      storagePath: file.filePath,
      isUploading: false,
    })));
  }, [existing, loading, movementId, visible]);

  useEffect(() => {
    if (!visible) {
      hydratedRef.current = null;
      setPreview(null);
    }
  }, [visible]);

  function handleClose() {
    void queryClient.invalidateQueries({ queryKey: ["movement-attachments", workspaceId, movementId] });
    void queryClient.invalidateQueries({ queryKey: ["entity-attachment-counts", workspaceId, "movement"] });
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Comprobantes" snapHeight={0.6}>
      {preview ? (
        <View style={styles.preview}>
          <TouchableOpacity
            style={styles.back}
            onPress={() => setPreview(null)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <ChevronLeft size={18} color={COLORS.fog} />
            <Text style={styles.backLabel}>Todos los comprobantes</Text>
          </TouchableOpacity>
          <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
        </View>
      ) : (
        <AttachmentPicker
          entityType="movement"
          entityId={movementId}
          movementId={movementId}
          attachments={attachments}
          onChange={setAttachments}
          isHydratingExisting={loading}
          onPressAttachment={setPreview}
          onRemoveStoragePath={onRemoveStoragePath}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  preview: { gap: SPACING.sm },
  back: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, minHeight: 40 },
  backLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  previewImage: {
    width: "100%",
    height: 380,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.input,
  },
});
