import { memo } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react-native";

import { DetailActionBar } from "../../../components/ui/DetailActionBar";

type Props = {
  bottomInset: number;
  onEdit: () => void;
  onAdjustLimit: () => void;
};

export const BudgetDetailActions = memo(function BudgetDetailActions({ bottomInset, onEdit, onAdjustLimit }: Props) {
  return (
    <DetailActionBar
      bottomInset={bottomInset}
      primarySide="right"
      secondary={{ label: "Editar", accessibilityLabel: "Editar presupuesto", icon: Pencil, onPress: onEdit }}
      primary={{ label: "Ajustar límite", accessibilityLabel: "Ajustar límite del presupuesto", icon: SlidersHorizontal, onPress: onAdjustLimit }}
    />
  );
});
