import { CalendarClock, Trash2 } from "lucide-react-native";

import { RecurringIncomeCard } from "../../../components/domain/RecurringIncomeCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  monthlyAmount: number;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmArrival: () => void;
  onToggleStatus: () => void;
  onAnalytics: () => void;
};

export function RecurringIncomeSwipeRow({
  item,
  monthlyAmount,
  onEdit,
  onDelete,
  onConfirmArrival,
  onToggleStatus,
  onAnalytics,
}: Props) {
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
            onEdit();
          }}
          onAnalytics={onAnalytics}
          onToggleStatus={onToggleStatus}
        />
      )}
    </SwipeActionRow>
  );
}
