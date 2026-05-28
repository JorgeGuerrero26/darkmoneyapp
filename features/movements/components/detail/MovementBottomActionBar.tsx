import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
  SURFACE,
} from "../../../../constants/theme";

type Props = {
  bottomInset: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onVoid: () => void;
};

export const MovementBottomActionBar = memo(function MovementBottomActionBar({
  bottomInset,
  onEdit,
  onDuplicate,
  onVoid,
}: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + SPACING.sm }]}>
      <TouchableOpacity
        style={styles.btn}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="Editar movimiento"
      >
        <Text style={styles.primary}>Editar</Text>
      </TouchableOpacity>
      <View style={styles.sep} />
      <TouchableOpacity
        style={styles.btn}
        onPress={onDuplicate}
        accessibilityRole="button"
        accessibilityLabel="Duplicar movimiento"
      >
        <Text style={styles.secondary}>Duplicar</Text>
      </TouchableOpacity>
      <View style={styles.sep} />
      <TouchableOpacity
        style={styles.btn}
        onPress={onVoid}
        accessibilityRole="button"
        accessibilityLabel="Anular movimiento"
      >
        <Text style={styles.danger}>Anular</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: SURFACE.separator,
    backgroundColor: COLORS.shell,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  btn: { flex: 1, alignItems: "center", paddingVertical: SPACING.sm },
  primary: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  secondary: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  danger: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  sep: { width: 1, backgroundColor: SURFACE.separator, marginVertical: 4 },
});
