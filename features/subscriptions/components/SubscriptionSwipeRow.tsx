import { Pause, Play, Trash2 } from "lucide-react-native";

import { SubscriptionCard } from "../../../components/domain/SubscriptionCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  monthlyAmount: number;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onAnalytics: () => void;
};

export function SubscriptionSwipeRow({
  subscription,
  monthlyAmount,
  onEdit,
  onDelete,
  onTogglePause,
  onAnalytics,
}: Props) {
  const canPause = subscription.status === "active" || subscription.status === "paused";
  const pauseIsActive = subscription.status === "paused";

  return (
    <SwipeActionRow
      revealWidth={92}
      borderRadius={RADIUS.xl}
      leftAction={canPause ? {
        label: pauseIsActive ? "Reactivar" : "Pausar",
        icon: pauseIsActive ? Play : Pause,
        onPress: onTogglePause,
        color: pauseIsActive ? COLORS.primary : COLORS.gold,
        backgroundColor: (pauseIsActive ? COLORS.primary : COLORS.gold) + "26",
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
        <SubscriptionCard
          subscription={subscription}
          monthlyAmount={monthlyAmount}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onEdit();
          }}
          onAnalytics={onAnalytics}
        />
      )}
    </SwipeActionRow>
  );
}
