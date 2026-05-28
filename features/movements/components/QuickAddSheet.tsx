import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { MOVEMENT_LABELS } from "../lib/labels";
import type { MovementType } from "../../../types/domain";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: MovementType) => void;
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
export function QuickAddSheet({ visible, onClose, onSelect }: Props) {
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
