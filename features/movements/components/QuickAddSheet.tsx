import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { MOVEMENT_LABELS } from "../lib/labels";
import type { MovementType } from "../../../types/domain";
import type { MovementTemplate } from "../../../services/queries/movement-templates";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: MovementType) => void;
  /** Plantillas del workspace: tap = abrir el form prellenado; long-press = eliminar. */
  templates?: MovementTemplate[];
  onSelectTemplate?: (template: MovementTemplate) => void;
  onDeleteTemplate?: (template: MovementTemplate) => void;
};

const OPTIONS: { type: MovementType; label: string; Icon: typeof ArrowDownCircle; color: string }[] = [
  { type: "expense", label: MOVEMENT_LABELS.list.quickAdd.expense, Icon: ArrowDownCircle, color: COLORS.expense },
  { type: "income", label: MOVEMENT_LABELS.list.quickAdd.income, Icon: ArrowUpCircle, color: COLORS.income },
  { type: "transfer", label: MOVEMENT_LABELS.list.quickAdd.transfer, Icon: ArrowLeftRight, color: COLORS.transfer },
];

/**
 * Sheet de quick-add disparado por long-press del FAB.
 * Reduce 3-4 taps por entrada manual cuando el usuario sabe el tipo desde el inicio.
 */
export function QuickAddSheet({ visible, onClose, onSelect, templates, onSelectTemplate, onDeleteTemplate }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={MOVEMENT_LABELS.list.quickAdd.title} snapHeight={0.4}>
      <View style={styles.content}>
        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.type}
            style={styles.option}
            onPress={() => {
              onSelect(opt.type);
              onClose();
            }}
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel={`Registrar ${opt.label.replace(/^\+ ?/, "").toLowerCase()}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: opt.color + "1F", borderColor: opt.color + "55" }]}>
              <opt.Icon size={22} color={opt.color} strokeWidth={2} />
            </View>
            <Text style={[styles.label, { color: opt.color }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
        {templates && templates.length > 0 && onSelectTemplate ? (
          <>
            <Text style={styles.templatesLabel}>Plantillas</Text>
            {templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateRow}
                activeOpacity={0.76}
                onPress={() => {
                  onSelectTemplate(template);
                  onClose();
                }}
                onLongPress={
                  onDeleteTemplate
                    ? () => {
                        Alert.alert(
                          "Eliminar plantilla",
                          `¿Eliminar la plantilla "${template.name}"?`,
                          [
                            { text: "Cancelar", style: "cancel" },
                            { text: "Eliminar", style: "destructive", onPress: () => onDeleteTemplate(template) },
                          ],
                        );
                      }
                    : undefined
                }
                accessibilityRole="button"
                accessibilityLabel={`Usar plantilla ${template.name}`}
              >
                <View style={styles.templateTextWrap}>
                  <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                  <Text style={styles.templateMeta} numberOfLines={1}>
                    {MOVEMENT_LABELS.list.quickAdd[template.movementType as "expense" | "income" | "transfer"] ?? template.movementType}
                    {template.sourceAmount != null ? ` · ${template.sourceAmount.toLocaleString("es-PE", { maximumFractionDigits: 2 })}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.templatesHint}>Mantén presionada una plantilla para eliminarla.</Text>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  templatesLabel: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.md,
  },
  templateRow: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.subtleBorder,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  templateTextWrap: { gap: 2 },
  templateName: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  templateMeta: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
  },
  templatesHint: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    textAlign: "center",
  },
  content: {
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    letterSpacing: 0.2,
  },
});
