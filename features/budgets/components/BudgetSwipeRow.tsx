import { Copy, Trash2 } from "lucide-react-native";

import { BudgetCard } from "../../../components/domain/BudgetCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

type Props = {
  pendingAt?: string | null;
  budget: BudgetOverview;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin?: () => void;
};

export function BudgetSwipeRow({
  budget,
  pendingAt,
  selected,
  onPress,
  onLongPress,
  onDelete,
  onDuplicate,
  onTogglePin,
}: Props) {
  return (
    <SwipeActionRow
      revealWidth={88}
      borderRadius={0}
      leftAction={{
        label: "Duplicar",
        icon: Copy,
        onPress: onDuplicate,
        color: COLORS.primary,
        backgroundColor: COLORS.primary + "30",
        haptic: "medium",
      }}
      rightAction={{
        label: "Eliminar",
        icon: Trash2,
        onPress: onDelete,
        color: COLORS.danger,
        backgroundColor: COLORS.danger + "30",
        haptic: "warning",
      }}
    >
      {({ close, isOpen }) => (
        <BudgetCard
          budget={budget}
          pendingAt={pendingAt}
          selected={selected}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
        />
      )}
    </SwipeActionRow>
  );
}
