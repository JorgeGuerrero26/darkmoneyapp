import { memo } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, Trash2, X } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../constants/theme";
import type { MovementAttachmentFile } from "../../../../services/queries/movements";

type Props = {
  attachments: MovementAttachmentFile[];
  loading: boolean;
  selectedPaths: string[];
  deletingSelected: boolean;
  onTogglePath: (filePath: string) => void;
  onClearSelection: () => void;
  onPreview: (attachment: MovementAttachmentFile) => void;
  onRequestDeleteSelected: () => void;
  /** Ref de instancia para distinguir tap vs longPress en el mismo path. */
  onLongPressBegin: (filePath: string) => void;
  isLongPressActive: (filePath: string) => boolean;
};

export const MovementAttachmentsGallery = memo(function MovementAttachmentsGallery({
  attachments,
  loading,
  selectedPaths,
  deletingSelected,
  onTogglePath,
  onClearSelection,
  onPreview,
  onRequestDeleteSelected,
  onLongPressBegin,
  isLongPressActive,
}: Props) {
  const isSelecting = selectedPaths.length > 0;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Comprobantes</Text>
        {isSelecting ? (
          <View style={styles.selectionHeader}>
            <Text style={styles.selectionCount}>
              {selectedPaths.length} seleccionado{selectedPaths.length === 1 ? "" : "s"}
            </Text>
            <TouchableOpacity
              style={styles.selectionClear}
              onPress={onClearSelection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Limpiar selección"
            >
              <X size={14} color={COLORS.storm} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.count}>
            {attachments.length > 0
              ? `${attachments.length} adjunto${attachments.length === 1 ? "" : "s"}`
              : "Sin adjuntos"}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <Text style={styles.emptyText}>Cargando comprobantes...</Text>
        </View>
      ) : attachments.length === 0 ? (
        <Text style={styles.emptyText}>
          Este movimiento no tiene comprobantes visibles todavía.
        </Text>
      ) : (
        <>
          {isSelecting ? (
            <View style={styles.selectionBar}>
              <Text style={styles.hint}>
                Toca para seleccionar o deseleccionar. Luego elimina en lote.
              </Text>
              <TouchableOpacity
                style={[styles.deleteSelectedBtn, deletingSelected && styles.deleteSelectedBtnDisabled]}
                onPress={onRequestDeleteSelected}
                disabled={deletingSelected}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel="Eliminar comprobantes seleccionados"
              >
                {deletingSelected ? (
                  <ActivityIndicator size="small" color={COLORS.ink} />
                ) : (
                  <>
                    <Trash2 size={14} color={COLORS.ink} />
                    <Text style={styles.deleteSelectedText}>Eliminar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.hint}>
              Toca una imagen para verla completa. Manten presionada para seleccionar varias.
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {attachments.map((attachment) => {
              const isSelected = selectedPaths.includes(attachment.filePath);
              return (
                <TouchableOpacity
                  key={attachment.filePath}
                  style={[
                    styles.card,
                    isSelected && styles.cardSelected,
                  ]}
                  onPress={() => {
                    if (isLongPressActive(attachment.filePath)) {
                      onLongPressBegin("");
                      return;
                    }
                    if (isSelecting) {
                      onTogglePath(attachment.filePath);
                      return;
                    }
                    onPreview(attachment);
                  }}
                  onLongPress={() => {
                    onLongPressBegin(attachment.filePath);
                    onTogglePath(attachment.filePath);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={attachment.fileName}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityHint={
                    isSelecting
                      ? "Toca para alternar selección"
                      : "Toca para ver, mantén presionado para seleccionar"
                  }
                >
                  <Image source={{ uri: attachment.signedUrl }} style={styles.image} />
                  {isSelecting ? (
                    <View
                      style={[
                        styles.selectionBadge,
                        isSelected && styles.selectionBadgeActive,
                      ]}
                    >
                      {isSelected ? <Check size={14} color={COLORS.ink} /> : null}
                    </View>
                  ) : null}
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>{attachment.fileName}</Text>
                    <Text style={styles.cta}>
                      {isSelecting
                        ? isSelected
                          ? "Seleccionado"
                          : "Tocar para seleccionar"
                        : "Ver comprobante"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  count: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  selectionCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  selectionClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.separator,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    flex: 1,
    lineHeight: 18,
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  deleteSelectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger,
  },
  deleteSelectedBtnDisabled: { opacity: 0.7 },
  deleteSelectedText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  row: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  card: {
    width: 144,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  image: {
    width: "100%",
    height: 132,
    backgroundColor: COLORS.mist,
  },
  selectionBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  selectionBadgeActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  meta: { padding: SPACING.sm, gap: 2 },
  name: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  cta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});
