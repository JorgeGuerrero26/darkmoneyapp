import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import type { EdgeInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Check, Trash2 } from "lucide-react-native";

import type { EntityAttachmentFile } from "../../services/queries/attachments";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { ConfirmDialog } from "../ui/ConfirmDialog";

type Props = {
  visible: boolean;
  attachments: EntityAttachmentFile[];
  onClose: () => void;
  insets?: Partial<EdgeInsets>;
  title?: string;
  initialPath?: string | null;
  onDeleteAttachment?: (attachment: EntityAttachmentFile) => Promise<void> | void;
  deletingAttachmentPath?: string | null;
  isLoading?: boolean;
};

export function AttachmentPreviewModal({
  visible,
  attachments,
  onClose,
  insets,
  title = "Comprobantes",
  initialPath,
  onDeleteAttachment,
  deletingAttachmentPath,
  isLoading = false,
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const attachmentPaths = useMemo(
    () => attachments.map((attachment) => attachment.filePath),
    [attachments],
  );
  const attachmentPathSignature = attachmentPaths.join("|");
  const stableAttachmentPaths = useMemo(
    () => attachmentPaths,
    [attachmentPathSignature],
  );
  const contentTopInset = (insets?.top ?? 0) + 92;
  const contentBottomInset = (insets?.bottom ?? 0) + SPACING.lg;
  const zoomScale = useSharedValue(1);
  const zoomBaseScale = useSharedValue(1);
  const selectedAttachment = useMemo(
    () =>
      attachments.find((attachment) => attachment.filePath === selectedPath) ??
      attachments[0] ??
      null,
    [attachments, selectedPath],
  );

  useEffect(() => {
    zoomScale.value = 1;
    zoomBaseScale.value = 1;
  }, [selectedAttachment?.filePath, visible, zoomBaseScale, zoomScale]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(Boolean(selectedAttachment))
        .onUpdate((event) => {
          const nextScale = zoomBaseScale.value * event.scale;
          zoomScale.value = Math.max(1, Math.min(4, nextScale));
        })
        .onEnd(() => {
          zoomBaseScale.value = zoomScale.value;
          if (zoomScale.value < 1.02) {
            zoomScale.value = withTiming(1);
            zoomBaseScale.value = 1;
          }
        }),
    [selectedAttachment, zoomBaseScale, zoomScale],
  );

  const zoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomScale.value }],
  }));

  useEffect(() => {
    if (!visible) return;
    setSelectedPath((current) => {
      const nextPath =
        initialPath && stableAttachmentPaths.includes(initialPath)
          ? initialPath
          : current && stableAttachmentPaths.includes(current)
            ? current
            : stableAttachmentPaths[0] ?? null;
      return current === nextPath ? current : nextPath;
    });
  }, [attachmentPathSignature, initialPath, stableAttachmentPaths, visible]);

  useEffect(() => {
    if (!visible) {
      setSelectedPaths((current) => (current.length === 0 ? current : []));
      setDeletingSelected((current) => (current ? false : current));
      return;
    }
    setSelectedPaths((current) => {
      const next = current.filter((filePath) => stableAttachmentPaths.includes(filePath));
      if (next.length === current.length && next.every((filePath, index) => filePath === current[index])) {
        return current;
      }
      return next;
    });
  }, [attachmentPathSignature, stableAttachmentPaths, visible]);

  const deleteLoading =
    selectedAttachment != null && deletingAttachmentPath === selectedAttachment.filePath;
  const isSelecting = selectedPaths.length > 0;
  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => selectedPaths.includes(attachment.filePath)),
    [attachments, selectedPaths],
  );

  function toggleSelection(filePath: string) {
    setSelectedPaths((current) =>
      current.includes(filePath)
        ? current.filter((path) => path !== filePath)
        : [...current, filePath],
    );
  }

  async function handleConfirmDelete() {
    if (!onDeleteAttachment || deletingSelected) return;
    try {
      if (isSelecting) {
        setDeletingSelected(true);
        for (const attachment of selectedAttachments) {
          await onDeleteAttachment(attachment);
        }
        setSelectedPaths([]);
      } else {
        if (!selectedAttachment || deleteLoading) return;
        await onDeleteAttachment(selectedAttachment);
      }
      setConfirmDeleteVisible(false);
    } catch {
      setConfirmDeleteVisible(false);
    } finally {
      setDeletingSelected(false);
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <GestureHandlerRootView style={styles.modalRoot}>
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

            <View
              style={[
                styles.header,
                {
                  top: (insets?.top ?? 0) + SPACING.sm,
                },
              ]}
            >
              <View style={styles.headerCopy}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {isSelecting
                    ? `${selectedPaths.length} comprobante${selectedPaths.length === 1 ? "" : "s"} seleccionado${selectedPaths.length === 1 ? "" : "s"}`
                    : selectedAttachment?.fileName ?? "Sin comprobantes"}
                </Text>
              </View>

              <View style={styles.headerActions}>
                {onDeleteAttachment && isSelecting ? (
                  <TouchableOpacity
                    style={[styles.deleteBtn, deletingSelected && styles.deleteBtnDisabled]}
                    onPress={() => setConfirmDeleteVisible(true)}
                    disabled={deletingSelected}
                    accessibilityLabel="Eliminar comprobantes seleccionados"
                  >
                    {deletingSelected ? (
                      <ActivityIndicator size="small" color={COLORS.danger} />
                    ) : (
                      <View style={styles.deleteBtnContent}>
                        <Trash2 size={14} color={COLORS.danger} />
                        <Text style={styles.deleteText}>Eliminar</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : onDeleteAttachment && selectedAttachment ? (
                  <TouchableOpacity
                    style={[styles.deleteBtn, deleteLoading && styles.deleteBtnDisabled]}
                    onPress={() => setConfirmDeleteVisible(true)}
                    disabled={deleteLoading}
                    accessibilityLabel="Eliminar comprobante"
                  >
                    {deleteLoading ? (
                      <ActivityIndicator size="small" color={COLORS.danger} />
                    ) : (
                      <Text style={styles.deleteText}>Eliminar</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={isSelecting ? () => setSelectedPaths([]) : onClose}
                  accessibilityLabel={isSelecting ? "Cancelar seleccion" : "Cerrar"}
                >
                  <Text style={styles.closeText}>{isSelecting ? "Cancelar" : "Cerrar"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selectedAttachment ? (
              <View
                style={[
                  styles.content,
                  {
                    paddingTop: contentTopInset,
                    paddingBottom: contentBottomInset,
                  },
                ]}
              >
                <GestureDetector gesture={pinchGesture}>
                  <View
                    collapsable={false}
                    style={[
                      styles.heroViewport,
                      attachments.length > 1 ? styles.heroViewportWithGrid : styles.heroViewportSingle,
                    ]}
                  >
                    <Animated.View style={[styles.heroZoomLayer, zoomAnimatedStyle]}>
                      <Image
                        source={{ uri: selectedAttachment.signedUrl }}
                        style={styles.heroImage}
                        resizeMode="contain"
                      />
                    </Animated.View>
                  </View>
                </GestureDetector>

                <Text style={styles.zoomHint}>Pellizca con dos dedos para acercar o alejar.</Text>

                {attachments.length > 1 ? (
                  <Text style={styles.selectionHint}>
                    {isSelecting
                      ? "Toca los comprobantes para marcarlos o quitarlos de la seleccion."
                      : "Manten presionado un comprobante para seleccionar uno o varios y eliminarlos."}
                  </Text>
                ) : null}

                {attachments.length > 1 ? (
                  <ScrollView
                    style={styles.thumbScroll}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.thumbGrid}
                  >
                    {attachments.map((attachment) => {
                      const isActive = attachment.filePath === selectedAttachment.filePath;
                      const isMarked = selectedPaths.includes(attachment.filePath);
                      return (
                        <TouchableOpacity
                          key={attachment.filePath}
                          style={[
                            styles.thumbCard,
                            isActive && styles.thumbCardActive,
                            isMarked && styles.thumbCardSelected,
                          ]}
                          onPress={() => {
                            if (isSelecting) {
                              toggleSelection(attachment.filePath);
                              return;
                            }
                            setSelectedPath(attachment.filePath);
                          }}
                          onLongPress={() => {
                            setSelectedPath(attachment.filePath);
                            toggleSelection(attachment.filePath);
                          }}
                          activeOpacity={0.86}
                        >
                          <Image source={{ uri: attachment.signedUrl }} style={styles.thumbImage} />
                          {isSelecting ? (
                            <View
                              style={[
                                styles.thumbSelectBadge,
                                isMarked && styles.thumbSelectBadgeActive,
                              ]}
                            >
                              {isMarked ? <Check size={14} color={COLORS.ink} /> : null}
                            </View>
                          ) : null}
                          <View style={styles.thumbFooter}>
                            <Text style={styles.thumbLabel} numberOfLines={1}>
                              {attachment.fileName}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            ) : isLoading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator size="large" color={COLORS.storm} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Este registro no tiene comprobantes visibles.</Text>
              </View>
            )}
          </View>
        </GestureHandlerRootView>
      </Modal>

      <ConfirmDialog
        visible={confirmDeleteVisible}
        title={isSelecting ? "Eliminar comprobantes" : "Eliminar comprobante"}
        body={
          isSelecting
            ? `Se eliminar${selectedPaths.length === 1 ? "a" : "an"} ${selectedPaths.length} comprobante${selectedPaths.length === 1 ? "" : "s"} del bucket y de esta vista.`
            : "Este comprobante se eliminara del bucket y de esta vista."
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(3,5,8,0.96)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  content: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  header: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  subtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  closeBtn: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  closeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  deleteBtn: {
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,122,145,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,122,145,0.28)",
  },
  deleteBtnDisabled: {
    opacity: 0.7,
  },
  deleteBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  deleteText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  heroViewport: {
    width: "100%",
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  heroViewportWithGrid: {
    height: "46%",
  },
  heroViewportSingle: {
    height: "68%",
  },
  heroZoomLayer: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.xl,
  },
  zoomHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  selectionHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    textAlign: "center",
    lineHeight: 18,
  },
  thumbGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    justifyContent: "center",
  },
  thumbScroll: {
    width: "100%",
  },
  thumbCard: {
    width: 108,
    height: 132,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  thumbCardActive: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  },
  thumbCardSelected: {
    borderColor: COLORS.gold,
  },
  thumbImage: {
    width: "100%",
    height: 98,
    backgroundColor: COLORS.mist,
  },
  thumbFooter: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    backgroundColor: "rgba(5,7,10,0.72)",
  },
  thumbLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  thumbSelectBadge: {
    position: "absolute",
    top: SPACING.xs,
    right: SPACING.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbSelectBadgeActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: SPACING.xxl,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    textAlign: "center",
  },
});
