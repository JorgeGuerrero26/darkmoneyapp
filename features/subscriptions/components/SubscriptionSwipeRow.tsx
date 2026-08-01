import { CheckCircle2, Play, Trash2 } from "lucide-react-native";

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
  onPay: () => void;
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
  onPay,
  onAnalytics,
  onLongPress,
  onTogglePin,
  selected = false,
  selectMode = false,
}: Props) {
  const isActive = subscription.status === "active";
  const isPaused = subscription.status === "paused";
  // Swipe izquierdo contextual: activas → "Pagar" (registra el pago y alimenta el
  // historial/estadísticas); pausadas → "Reactivar". Pausar una activa sigue
  // disponible dentro del detalle de la suscripción.
  const leftAction = isActive
    ? {
        label: "Pagar",
        icon: CheckCircle2,
        onPress: onPay,
        color: COLORS.pine,
        backgroundColor: COLORS.pine + "26",
      }
    : isPaused
      ? {
          label: "Reactivar",
          icon: Play,
          onPress: onTogglePause,
          color: COLORS.primary,
          backgroundColor: COLORS.primary + "26",
        }
      : null;

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
      leftAction={leftAction}
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
