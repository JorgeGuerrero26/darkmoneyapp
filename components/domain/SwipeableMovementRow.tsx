import { memo } from "react";
import { StyleSheet } from "react-native";
import { Trash2 } from "lucide-react-native";

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
      <MovementRow
        movement={movement}
        baseCurrencyCode={baseCurrencyCode}
        attachmentCount={attachmentCount}
        selected={selected}
        onPress={onPress}
        onLongPress={onLongPress}
      />
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
});
