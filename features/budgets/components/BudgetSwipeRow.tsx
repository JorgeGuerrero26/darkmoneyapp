import { Trash2 } from "lucide-react-native";

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
  onAnalytics: () => void;
};

export function BudgetSwipeRow({
  budget,
  selected,
  onPress,
  onLongPress,
  onDelete,
  onAnalytics,
}: Props) {
  return (
    <SwipeActionRow
      revealWidth={88}
      borderRadius={RADIUS.xl}
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
        />
      )}
    </SwipeActionRow>
  );
}
