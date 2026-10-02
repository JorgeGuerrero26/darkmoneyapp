import { CalendarClock, Trash2 } from "lucide-react-native";

import { RecurringIncomeCard } from "../../../components/domain/RecurringIncomeCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS } from "../../../constants/theme";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  onPress: () => void;
  onDelete: () => void;
  onConfirmArrival: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

export function RecurringIncomeSwipeRow({
  item,
  onPress,
  onDelete,
  onConfirmArrival,
  onLongPress,
  selected = false,
  selectMode = false,
}: Props) {
  if (selectMode) {
    return (
      <RecurringIncomeCard
        item={item}
        onPress={onPress}
        onLongPress={onLongPress}
        selected={selected}
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={96}
      borderRadius={0}
      leftAction={item.status === "active" ? {
        label: "Confirmar",
        icon: CalendarClock,
        onPress: onConfirmArrival,
        color: COLORS.primary,
        backgroundColor: COLORS.primary + "24",
      } : null}
      rightAction={{
        label: "Eliminar",
        icon: Trash2,
        onPress: onDelete,
        color: COLORS.danger,
        backgroundColor: COLORS.danger + "28",
        haptic: "warning",
      }}
    >
      {({ close, isOpen }) => (
        <RecurringIncomeCard
          item={item}
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
