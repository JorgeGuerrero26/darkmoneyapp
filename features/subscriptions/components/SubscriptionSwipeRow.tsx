import { Pause, Play, Trash2 } from "lucide-react-native";

import { SubscriptionCard } from "../../../components/domain/SubscriptionCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  subscription: SubscriptionSummary;
  monthlyAmount: number;
  onPress: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onAnalytics: () => void;
  onLongPress?: () => void;
  onTogglePin?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

export function SubscriptionSwipeRow({
  subscription,
  monthlyAmount,
  onPress,
  onDelete,
  onTogglePause,
  onAnalytics,
  onLongPress,
  onTogglePin,
  selected = false,
  selectMode = false,
}: Props) {
  const canPause = subscription.status === "active" || subscription.status === "paused";
  const pauseIsActive = subscription.status === "paused";

  if (selectMode) {
    return (
      <SubscriptionCard
        subscription={subscription}
        monthlyAmount={monthlyAmount}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalytics={onAnalytics}
        selected={selected}
      />
    );
  }

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
            onPress();
          }}
          onLongPress={onLongPress}
          onAnalytics={onAnalytics}
          onTogglePin={onTogglePin}
        />
      )}
    </SwipeActionRow>
  );
}
