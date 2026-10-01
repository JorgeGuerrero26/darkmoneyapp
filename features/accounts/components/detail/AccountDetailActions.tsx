import { memo } from "react";
import { ArrowDown, Pencil } from "lucide-react-native";

import { DetailActionBar } from "../../../../components/ui/DetailActionBar";

type Props = {
  bottomInset: number;
  isArchived: boolean;
  onEdit: () => void;
  onNewExpense: () => void;
};

export const AccountDetailActions = memo(function AccountDetailActions({ bottomInset, isArchived, onEdit, onNewExpense }: Props) {
  return (
    <DetailActionBar
      bottomInset={bottomInset}
      primary={{ label: "Editar", accessibilityLabel: "Editar cuenta", icon: Pencil, onPress: onEdit }}
      secondary={isArchived ? undefined : {
        label: "Nuevo gasto",
        accessibilityLabel: "Nuevo gasto en esta cuenta",
        icon: ArrowDown,
        onPress: onNewExpense,
      }}
    />
  );
});
