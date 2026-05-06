import { Trash2 } from "lucide-react-native";

import { ExchangeRateCard } from "../../../components/domain/ExchangeRateCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, RADIUS } from "../../../constants/theme";
import type { ExchangeRateRecord } from "../../../services/queries/workspace-data";

type Props = {
  rate: ExchangeRateRecord;
  onEdit: () => void;
  onDelete: () => void;
};

export function ExchangeRateSwipeRow({ rate, onEdit, onDelete }: Props) {
  return (
    <SwipeActionRow
      revealWidth={92}
      borderRadius={RADIUS.xl}
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
        <ExchangeRateCard
          rate={rate}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onEdit();
          }}
        />
      )}
    </SwipeActionRow>
  );
}
