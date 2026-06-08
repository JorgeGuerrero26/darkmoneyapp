import { CalendarClock, Trash2 } from "lucide-react-native";

import { RecurringIncomeCard } from "../../../components/domain/RecurringIncomeCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  monthlyAmount: number;
  onPress: () => void;
  onDelete: () => void;
  onConfirmArrival: () => void;
  onToggleStatus: () => void;
  onAnalytics: () => void;
  onLongPress?: () => void;
  onTogglePin?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

export function RecurringIncomeSwipeRow({
  item,
  monthlyAmount,
  onPress,
  onDelete,
  onConfirmArrival,
  onToggleStatus,
  onAnalytics,
  onLongPress,
  onTogglePin,
  selected = false,
  selectMode = false,
}: Props) {
  if (selectMode) {
    return (
      <RecurringIncomeCard
        item={item}
        monthlyAmount={monthlyAmount}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalytics={onAnalytics}
        onToggleStatus={onToggleStatus}
        selected={selected}
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={96}
      borderRadius={RADIUS.xl}
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
          monthlyAmount={monthlyAmount}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
          onAnalytics={onAnalytics}
          onToggleStatus={onToggleStatus}
          onTogglePin={onTogglePin}
        />
      )}
    </SwipeActionRow>
  );
}
