import { Trash2 } from "lucide-react-native";

import { ExchangeRateCard } from "../../../components/domain/ExchangeRateCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, GLASS, RADIUS } from "../../../constants/theme";
import type { ExchangeRateRecord } from "../../../services/queries/exchange-rates";

type Props = {
  rate: ExchangeRateRecord;
  onPress: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
  onTogglePin?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

export function ExchangeRateSwipeRow({
  rate,
  onPress,
  onDelete,
  onLongPress,
  onTogglePin,
  selected = false,
  selectMode = false,
}: Props) {
  if (selectMode) {
    return (
      <ExchangeRateCard
        rate={rate}
        onPress={onPress}
        onLongPress={onLongPress}
        selected={selected}
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={92}
      borderRadius={RADIUS.xl}
      rightAction={{
        label: "Eliminar",
        icon: Trash2,
        onPress: onDelete,
        color: COLORS.danger,
        backgroundColor: GLASS.dangerBg,
        haptic: "warning",
      }}
    >
      {({ close, isOpen }) => (
        <ExchangeRateCard
          rate={rate}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
          onTogglePin={onTogglePin}
        />
      )}
    </SwipeActionRow>
  );
}
