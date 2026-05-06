import { memo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { CheckCircle2, Circle, Trash2 } from "lucide-react-native";

import { MovementRow } from "./MovementRow";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import type { MovementRecord } from "../../types/domain";

const REVEAL_WIDTH = 80;

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  attachmentCount?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  selectMode?: boolean;
  selected?: boolean;
};

export const SwipeableMovementRow = memo(function SwipeableMovementRow({
  movement,
  baseCurrencyCode,
  attachmentCount,
  onPress,
  onLongPress,
  onDelete,
  selectMode,
  selected,
}: Props) {
  if (selectMode) {
    return (
      <View style={[styles.container, selected && styles.containerSelected]}>
        <View style={styles.selectRow}>
          <TouchableOpacity
            style={styles.checkWrap}
            onPress={() => onPress?.()}
            activeOpacity={0.7}
          >
            {selected
              ? <CheckCircle2 size={20} color={COLORS.primary} />
              : <Circle size={20} color={COLORS.storm} />}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <MovementRow
              movement={movement}
              baseCurrencyCode={baseCurrencyCode}
              attachmentCount={attachmentCount}
              selected={selected}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <SwipeActionRow
      revealWidth={REVEAL_WIDTH}
      borderRadius={RADIUS.xl}
      style={styles.container}
      rightAction={
        onDelete
          ? {
              label: "Eliminar",
              icon: Trash2,
              color: COLORS.danger,
              backgroundColor: COLORS.danger + "30",
              haptic: "warning",
              onPress: onDelete,
            }
          : null
      }
    >
      {({ close, isOpen }) => (
        <MovementRow
          movement={movement}
          baseCurrencyCode={baseCurrencyCode}
          attachmentCount={attachmentCount}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress?.();
          }}
          onLongPress={onLongPress}
        />
      )}
    </SwipeActionRow>
  );
});

const styles = StyleSheet.create({
  container: {},
  containerSelected: {
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    borderRadius: RADIUS.xl,
    overflow: "hidden",
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkWrap: {
    paddingLeft: SPACING.sm,
    paddingRight: 4,
    paddingVertical: SPACING.sm,
  },
});
