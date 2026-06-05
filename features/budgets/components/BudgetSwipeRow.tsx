import { Copy, Trash2 } from "lucide-react-native";

import { BudgetCard } from "../../../components/domain/BudgetCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

type Props = {
  budget: BudgetOverview;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAnalytics: () => void;
  onQuickEdit?: () => void;
  onTogglePin?: () => void;
};

export function BudgetSwipeRow({
  budget,
  selected,
  onPress,
  onLongPress,
  onDelete,
  onDuplicate,
  onAnalytics,
  onQuickEdit,
  onTogglePin,
}: Props) {
  return (
    <SwipeActionRow
      revealWidth={88}
      borderRadius={RADIUS.xl}
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
          selected={selected}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
          onAnalytics={onAnalytics}
          onQuickEdit={onQuickEdit}
          onTogglePin={onTogglePin}
        />
      )}
    </SwipeActionRow>
  );
}
