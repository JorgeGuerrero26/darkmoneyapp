import { memo } from "react";
import { Copy, Pencil } from "lucide-react-native";

import { DetailActionBar } from "../../../../components/ui/DetailActionBar";

type Props = {
  bottomInset?: number;
  auditLine?: string | null;
  onPressEdit?: () => void;
  onPressDuplicate?: () => void;
  onPressVoid?: () => void;
};

export const MovementDetailActions = memo(function MovementDetailActions({
  bottomInset = 0,
  auditLine,
  onPressEdit,
  onPressDuplicate,
  onPressVoid,
}: Props) {
  return (
    <DetailActionBar
      bottomInset={bottomInset}
      footNote={auditLine}
      showFooter
      primary={onPressEdit && onPressDuplicate ? {
        label: "Editar",
        accessibilityLabel: "Editar movimiento",
        icon: Pencil,
        onPress: onPressEdit,
      } : undefined}
      secondary={onPressEdit && onPressDuplicate ? {
        label: "Duplicar",
        accessibilityLabel: "Duplicar movimiento",
        icon: Copy,
        onPress: onPressDuplicate,
      } : undefined}
      footerAction={onPressVoid ? {
        label: "Anular movimiento",
        accessibilityLabel: "Anular movimiento",
        onPress: onPressVoid,
      } : undefined}
    />
  );
});
