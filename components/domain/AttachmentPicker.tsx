import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { X, Plus } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/workspace-context";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

export type Attachment = {
  uri: string;         // local URI or remote URL
  storagePath?: string; // path in Supabase Storage (after upload)
  isUploading?: boolean;
};

type Props = {
  movementId?: number; // required for upload path; if undefined, upload is deferred
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
};

export function AttachmentPicker({ movementId, attachments, onChange }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const [uploading, setUploading] = useState(false);

  async function uploadImage(localUri: string): Promise<string | null> {
    if (!supabase || !activeWorkspaceId) return null;

    // Match web path format: {workspaceId}/{entityType}/{entityId}/{uuid}.webp
    const uuid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const path = movementId
      ? `${activeWorkspaceId}/movement/${movementId}/${uuid}.webp`
      : `${activeWorkspaceId}/movement/draft/${uuid}.webp`;

    const response = await fetch(localUri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from("receipts")
      .upload(path, arrayBuffer, {
        contentType: "image/webp",
        upsert: false,
      });

    if (error) throw error;
    return path;
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Se necesita acceso a la galería para adjuntar imágenes.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      quality: 0.82,
      selectionLimit: 5,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    await processSelectedAssets(result.assets.map((a) => a.uri));
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Se necesita acceso a la cámara para tomar fotos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.82,
    });

    if (result.canceled) return;

    await processSelectedAssets([result.assets[0].uri]);
  }

  async function processSelectedAssets(uris: string[]) {
    setUploading(true);
    const newAttachments: Attachment[] = [...attachments];

    for (const uri of uris) {
      const placeholder: Attachment = { uri, isUploading: true };
      newAttachments.push(placeholder);
      onChange([...newAttachments]);

      try {
        const storagePath = await uploadImage(uri);
        const idx = newAttachments.findIndex((a) => a.uri === uri && a.isUploading);
        if (idx !== -1) {
          newAttachments[idx] = { uri, storagePath: storagePath ?? undefined, isUploading: false };
          onChange([...newAttachments]);
        }
      } catch {
        // Remove failed attachment
        const idx = newAttachments.findIndex((a) => a.uri === uri && a.isUploading);
        if (idx !== -1) newAttachments.splice(idx, 1);
        onChange([...newAttachments]);
        Alert.alert("Error", "No se pudo subir la imagen. Intenta de nuevo.");
      }
    }

    setUploading(false);
  }

  function removeAttachment(index: number) {
    const att = attachments[index];
    if (att.isUploading) return; // can't remove while uploading

    Alert.alert("Eliminar adjunto", "¿Eliminar esta imagen?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          if (att.storagePath && supabase) {
            await supabase.storage.from("receipts").remove([att.storagePath]);
          }
          const updated = attachments.filter((_, i) => i !== index);
          onChange(updated);
        },
      },
    ]);
  }

  function showAddOptions() {
    Alert.alert("Adjuntar imagen", "Selecciona una fuente", [
      { text: "Cámara", onPress: pickFromCamera },
      { text: "Galería", onPress: pickFromGallery },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Comprobantes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {attachments.map((att, idx) => (
          <View key={`${att.uri}-${idx}`} style={styles.thumb}>
            <Image source={{ uri: att.uri }} style={styles.thumbImage} />
            {att.isUploading ? (
              <View style={styles.thumbOverlay}>
                <ActivityIndicator color="#FFF" size="small" />
              </View>
            ) : (
              <TouchableOpacity style={styles.thumbRemove} onPress={() => removeAttachment(idx)} accessibilityLabel="Eliminar adjunto">
                <X size={12} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {attachments.length < 5 ? (
          <TouchableOpacity style={styles.addBtn} onPress={showAddOptions} disabled={uploading}>
            <Plus size={20} color={COLORS.textMuted} />
            <Text style={styles.addBtnText}>Adjuntar</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    position: "relative",
  },
  thumbImage: { width: 72, height: 72 },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveText: { color: "#FFF", fontSize: 14, lineHeight: 18 },
  addBtn: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addBtnIcon: { fontSize: 20, color: COLORS.textMuted },
  addBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
});
