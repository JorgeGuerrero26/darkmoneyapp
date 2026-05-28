import { memo } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../constants/theme";
import { useDismissibleSheet } from "../../../../components/ui/useDismissibleSheet";
import type { ObligationSummary } from "../../../../types/domain";

type Props = {
  visible: boolean;
  isIncome: boolean;
  obligations: ObligationSummary[];
  bottomInset: number;
  onClose: () => void;
  onPick: (obligationId: number) => void;
};

export const LinkObligationModal = memo(function LinkObligationModal({
  visible,
  isIncome,
  obligations,
  bottomInset,
  onClose,
  onPick,
}: Props) {
  const dismiss = useDismissibleSheet({ visible, onClose });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, dismiss.backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: bottomInset + SPACING.lg }, dismiss.sheetStyle]}
          onStartShouldSetResponder={() => true}
          {...dismiss.panHandlers}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Asociar a credito / deuda</Text>
          <Text style={styles.sub}>
            {isIncome ? "Creditos activos (ingresos)" : "Deudas activas (egresos)"}
          </Text>
          {obligations.length === 0 ? (
            <Text style={styles.empty}>No hay obligaciones activas compatibles</Text>
          ) : (
            <FlatList
              data={obligations}
              keyExtractor={(o) => String(o.id)}
              renderItem={({ item: o }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => onPick(o.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Asociar a ${o.title}`}
                >
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemTitle}>{o.title}</Text>
                    <Text style={styles.itemSub}>{o.counterparty || "Sin contacto"}</Text>
                  </View>
                  <Text style={styles.itemAmount}>
                    {o.currencyCode}{" "}
                    {o.pendingAmount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.shell,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    maxHeight: "70%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  sub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  empty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  itemLeft: { flex: 1, gap: 2 },
  itemTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  itemSub: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  itemAmount: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.warning,
  },
  sep: { height: 1, backgroundColor: SURFACE.separator },
});
