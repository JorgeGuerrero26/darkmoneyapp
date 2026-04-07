import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system";
import { Camera, ChevronRight, Images, Plus, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";

import { supabase, supabaseUrl, supabaseAnonKey } from "../../lib/supabase";
import { SUPABASE_STORAGE_BUCKET } from "../../constants/config";
import { useAuth } from "../../lib/auth-context";
import {
  buildEntityAttachmentDir,
  buildEntityAttachmentDraftDir,
  type AttachmentEntityType,
} from "../../lib/entity-attachments";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useWorkspace } from "../../lib/workspace-context";
import { useUserEntitlementQuery } from "../../services/queries/workspace-data";
import { BottomSheet } from "../ui/BottomSheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  GLASS,
  RADIUS,
  SPACING,
} from "../../constants/theme";

export type Attachment = {
  uri: string;
  storagePath?: string;
  isUploading?: boolean;
  uploadProgress?: number; // 0-100 while uploading
};

type Props = {
  movementId?: number;
  entityType?: AttachmentEntityType;
  entityId?: number | null;
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  isHydratingExisting?: boolean;
};

const MAX_ATTACHMENTS = 5;

function extensionFromMimeType(mimeType?: string | null): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

function getAssetExtension(asset: ImagePicker.ImagePickerAsset): string {
  const fileName = asset.fileName?.trim();
  if (fileName) {
    const match = fileName.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }
  return extensionFromMimeType(asset.mimeType);
}

function getAssetMimeType(asset: ImagePicker.ImagePickerAsset): string {
  return asset.mimeType?.trim() || "image/jpeg";
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/\s/g, "");
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function AttachmentPicker({
  movementId,
  entityType = "movement",
  entityId,
  attachments,
  onChange,
  isHydratingExisting = false,
}: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const draftKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const resolvedEntityId = entityId ?? movementId ?? null;
  const entityLabel = entityType === "obligation-event" ? "evento" : "movimiento";
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const canUploadAttachments = entitlementQuery.data?.proAccessEnabled ?? false;
  const isCheckingProAccess = Boolean(profile?.id) && entitlementQuery.isLoading && !entitlementQuery.data;
  const isUploadLocked = !isCheckingProAccess && !canUploadAttachments;

  const remainingSlots = MAX_ATTACHMENTS - attachments.length;
  const hasUploadingItems = uploading || attachments.some((attachment) => attachment.isUploading);

  const helperText = useMemo(() => {
    if (isCheckingProAccess) {
      return "Estamos comprobando si tu plan permite adjuntar comprobantes.";
    }
    if (isUploadLocked) {
      return "Los comprobantes e imágenes son una función exclusiva para usuarios Pro.";
    }
    if (isHydratingExisting && attachments.length === 0) {
      return `Buscando comprobantes ya guardados para este ${entityLabel}...`;
    }
    if (!resolvedEntityId) {
      return entityType === "obligation-event"
        ? "Se guardaran junto con el evento cuando termines de registrarlo."
        : "Se guardaran junto con el movimiento cuando termines de crearlo.";
    }
    if (attachments.length === 0) {
      return `Agrega boletas, tickets o fotos para dejar el ${entityLabel} mejor documentado.`;
    }
    return remainingSlots > 0
      ? `Puedes agregar ${remainingSlots} comprobante${remainingSlots === 1 ? "" : "s"} mas.`
      : `Ya alcanzaste el maximo de comprobantes para este ${entityLabel}.`;
  }, [attachments.length, entityLabel, entityType, isCheckingProAccess, isHydratingExisting, isUploadLocked, remainingSlots, resolvedEntityId]);

  function invalidateAttachmentQueries() {
    if (!activeWorkspaceId || !resolvedEntityId) return;
    if (entityType === "movement") {
      void queryClient.invalidateQueries({
        queryKey: ["movement-attachments", activeWorkspaceId, resolvedEntityId],
      });
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["entity-attachments", activeWorkspaceId, entityType, resolvedEntityId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["entity-attachment-counts", activeWorkspaceId, entityType],
    });
  }

  async function uploadImage(
    asset: ImagePicker.ImagePickerAsset,
    onProgress: (pct: number) => void,
  ): Promise<string | null> {
    if (!supabase || !activeWorkspaceId) return null;

    const uuid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const extension = getAssetExtension(asset);
    const contentType = getAssetMimeType(asset);
    const basePath = resolvedEntityId != null
      ? buildEntityAttachmentDir(activeWorkspaceId, entityType, resolvedEntityId)
      : buildEntityAttachmentDraftDir(activeWorkspaceId, entityType, draftKeyRef.current);
    const path = `${basePath}/${uuid}.${extension}`;

    let arrayBuffer: ArrayBuffer;
    try {
      const file = new ExpoFile(asset.uri);
      arrayBuffer = await file.arrayBuffer();
    } catch (fileReadError) {
      if (!asset.base64) throw fileReadError;
      arrayBuffer = base64ToArrayBuffer(asset.base64);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? supabaseAnonKey;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${path}`;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            const body = JSON.parse(xhr.responseText) as { message?: string };
            reject(new Error(body.message ?? `Error ${xhr.status}`));
          } catch {
            reject(new Error(`Error ${xhr.status}`));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Error de red al subir imagen."));
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.send(arrayBuffer);
    });

    return path;
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Se necesita acceso a la galería para adjuntar imágenes.", "warning");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.82,
      selectionLimit: remainingSlots,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    await processSelectedAssets(result.assets);
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showToast("Se necesita acceso a la cámara para tomar fotos.", "warning");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.82,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    await processSelectedAssets([result.assets[0]]);
  }

  async function processSelectedAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setUploading(true);
    const newAttachments: Attachment[] = [...attachments];

    for (const asset of assets) {
      const uri = asset.uri;
      const placeholder: Attachment = { uri, isUploading: true, uploadProgress: 0 };
      newAttachments.push(placeholder);
      onChange([...newAttachments]);

      try {
        const storagePath = await uploadImage(asset, (pct) => {
          const idx = newAttachments.findIndex((a) => a.uri === uri && a.isUploading);
          if (idx !== -1) {
            newAttachments[idx] = { ...newAttachments[idx], uploadProgress: pct };
            onChange([...newAttachments]);
          }
        });
        const index = newAttachments.findIndex((attachment) => attachment.uri === uri && attachment.isUploading);
        if (index !== -1) {
          newAttachments[index] = {
            uri,
            storagePath: storagePath ?? undefined,
            isUploading: false,
            uploadProgress: 100,
          };
          onChange([...newAttachments]);
          if (activeWorkspaceId && resolvedEntityId) {
            invalidateAttachmentQueries();
          }
        }
      } catch (error) {
        const index = newAttachments.findIndex((attachment) => attachment.uri === uri && attachment.isUploading);
        if (index !== -1) {
          newAttachments.splice(index, 1);
        }
        onChange([...newAttachments]);
        console.warn("[AttachmentPicker] upload failed", {
          uri,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          error: error instanceof Error ? error.message : String(error),
        });
        showToast(humanizeError(error), "error");
      }
    }

    setUploading(false);
  }

  function openDeleteConfirmation(index: number) {
    if (attachments[index]?.isUploading) return;
    setPendingDeleteIndex(index);
  }

  async function confirmDeleteAttachment() {
    const index = pendingDeleteIndex;
    setPendingDeleteIndex(null);
    if (index === null) return;

    const attachment = attachments[index];
    if (!attachment || attachment.isUploading) return;

    try {
      if (attachment.storagePath && supabase) {
        await supabase.storage.from("receipts").remove([attachment.storagePath]);
      }
      onChange(attachments.filter((_, attachmentIndex) => attachmentIndex !== index));
      if (activeWorkspaceId && resolvedEntityId) {
        invalidateAttachmentQueries();
      }
    } catch (error) {
      showToast(humanizeError(error), "error");
    }
  }

  async function handleSelectSource(source: "camera" | "gallery") {
    setSourceSheetVisible(false);
    if (source === "camera") {
      await pickFromCamera();
      return;
    }
    await pickFromGallery();
  }

  function handleOpenSourceSheet() {
    if (isCheckingProAccess) {
      showToast("Verificando acceso Pro. Intenta de nuevo en un momento.", "info");
      return;
    }
    if (isUploadLocked) {
      showToast("Adjuntar comprobantes es una función exclusiva Pro.", "warning");
      return;
    }
    setSourceSheetVisible(true);
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.badge}>
                <Images size={18} color={COLORS.gold} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Adjuntar imagen</Text>
                <Text style={styles.title}>Comprobantes</Text>
                <Text style={styles.subtitle}>{helperText}</Text>
              </View>
            </View>
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {isHydratingExisting && attachments.length === 0
                  ? `.../${MAX_ATTACHMENTS}`
                  : `${attachments.length}/${MAX_ATTACHMENTS}`}
              </Text>
            </View>
          </View>

          {isUploadLocked ? (
            <View style={styles.proLockBanner}>
              <Text style={styles.proLockTitle}>Disponible con DarkMoney Pro</Text>
              <Text style={styles.proLockBody}>
                Puedes seguir viendo los comprobantes existentes, pero adjuntar nuevos está reservado para usuarios Pro.
              </Text>
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {attachments.map((attachment, index) => (
              <View key={`${attachment.uri}-${index}`} style={styles.thumbCard}>
                <Image source={{ uri: attachment.uri }} style={styles.thumbImage} />
                <View style={styles.thumbMeta}>
                  <Text style={styles.thumbStatus} numberOfLines={1}>
                    {attachment.isUploading
                      ? `${attachment.uploadProgress ?? 0}%`
                      : "Comprobante listo"}
                  </Text>
                </View>
                {attachment.isUploading ? (
                  <View style={styles.thumbOverlay}>
                    <View style={styles.uploadProgressTrack}>
                      <View
                        style={[
                          styles.uploadProgressFill,
                          { width: `${attachment.uploadProgress ?? 0}%` },
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.thumbRemove}
                    onPress={() => openDeleteConfirmation(index)}
                    accessibilityLabel="Eliminar adjunto"
                  >
                    <X size={12} color={COLORS.ink} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {attachments.length < MAX_ATTACHMENTS ? (
              <TouchableOpacity
                style={[
                  styles.addCard,
                  attachments.length === 0 && styles.addCardEmpty,
                  (hasUploadingItems || isUploadLocked || isCheckingProAccess) && styles.addCardDisabled,
                ]}
                onPress={handleOpenSourceSheet}
                disabled={hasUploadingItems || isCheckingProAccess}
                activeOpacity={0.86}
              >
                <View style={styles.addIconWrap}>
                  {hasUploadingItems || isCheckingProAccess ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Plus size={20} color={COLORS.primary} />
                  )}
                </View>
                <Text style={styles.addTitle}>
                  {isCheckingProAccess ? "Comprobando..." : isUploadLocked ? "Solo Pro" : hasUploadingItems ? "Subiendo..." : "Agregar"}
                </Text>
                <Text style={styles.addCaption}>
                  {isUploadLocked
                    ? "Desbloquea comprobantes"
                    : attachments.length === 0
                      ? "Camara o galeria"
                      : "Otro comprobante"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <BottomSheet
        visible={sourceSheetVisible}
        onClose={() => setSourceSheetVisible(false)}
        title="Adjuntar imagen"
        snapHeight={0.48}
      >
        <View style={styles.sheetHero}>
          <Text style={styles.sheetEyebrow}>Comprobantes</Text>
          <Text style={styles.sheetTitle}>Elige como quieres agregar la imagen</Text>
          <Text style={styles.sheetBody}>
            Puedes tomar una foto al instante o elegirla desde tu galeria.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.sourceOption}
          onPress={() => {
            void handleSelectSource("camera");
          }}
          activeOpacity={0.86}
        >
          <View style={[styles.sourceIconWrap, styles.cameraIconWrap]}>
            <Camera size={20} color={COLORS.primary} />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceTitle}>Camara</Text>
            <Text style={styles.sourceBody}>Toma el comprobante sin salir del flujo.</Text>
          </View>
          <ChevronRight size={18} color={COLORS.storm} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sourceOption}
          onPress={() => {
            void handleSelectSource("gallery");
          }}
          activeOpacity={0.86}
        >
          <View style={[styles.sourceIconWrap, styles.galleryIconWrap]}>
            <Images size={20} color={COLORS.gold} />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceTitle}>Galeria</Text>
            <Text style={styles.sourceBody}>Elige una imagen guardada en tu dispositivo.</Text>
          </View>
          <ChevronRight size={18} color={COLORS.storm} />
        </TouchableOpacity>
      </BottomSheet>

      <ConfirmDialog
        visible={pendingDeleteIndex !== null}
        title="Eliminar comprobante"
        body="Quitaremos esta imagen del movimiento actual."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setPendingDeleteIndex(null)}
        onConfirm={() => {
          void confirmDeleteAttachment();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  panel: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warningMuted,
    borderWidth: 1,
    borderColor: COLORS.gold + "55",
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  counterPill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  counterText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  proLockBanner: {
    gap: 4,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.warning + "14",
    borderWidth: 1,
    borderColor: COLORS.warning + "30",
  },
  proLockTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  proLockBody: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 18,
  },
  row: {
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
    alignItems: "stretch",
  },
  thumbCard: {
    width: 112,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  thumbImage: {
    width: "100%",
    height: 104,
    backgroundColor: COLORS.mist,
  },
  thumbMeta: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: "rgba(7,11,20,0.92)",
  },
  thumbStatus: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,11,20,0.55)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: SPACING.sm,
  },
  uploadProgressTrack: {
    width: "80%",
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)",
    overflow: "hidden",
  },
  uploadProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  thumbRemove: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(7,11,20,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  addCard: {
    width: 112,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(107,228,197,0.08)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(107,228,197,0.35)",
    minHeight: 144,
  },
  addCardEmpty: {
    width: 146,
  },
  addCardDisabled: {
    opacity: 0.68,
  },
  addIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  addTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  addCaption: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    textAlign: "center",
    lineHeight: 18,
  },
  sheetHero: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetEyebrow: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  sheetBody: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  sourceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  sourceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cameraIconWrap: {
    backgroundColor: COLORS.primary + "16",
    borderColor: COLORS.primary + "45",
  },
  galleryIconWrap: {
    backgroundColor: COLORS.warning + "16",
    borderColor: COLORS.warning + "45",
  },
  sourceCopy: {
    flex: 1,
    gap: 2,
  },
  sourceTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  sourceBody: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 19,
  },
});
