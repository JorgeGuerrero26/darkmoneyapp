import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, EXTENDED_PALETTE, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
};

export function CategoryFilterSheet({
  visible,
  onClose,
  showInactive,
  onShowInactiveChange,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.42}>
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Estado</Text>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>Incluir inactivas</Text>
            <Text style={styles.switchDesc}>Muestra también las categorías desactivadas.</Text>
          </View>
          <Switch
            value={showInactive}
            onValueChange={onShowInactiveChange}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={EXTENDED_PALETTE.white}
          />
        </View>

        <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.84}>
          <Text style={styles.applyBtnText}>Aplicar</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.md,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  switchLabel: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.ink,
  },
  switchDesc: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
  },
  applyBtn: {
    marginTop: SPACING.sm,
    minHeight: 46,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  applyBtnText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.textInverse,
  },
});
