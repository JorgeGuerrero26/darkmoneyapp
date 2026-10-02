import { memo } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react-native";

import { DetailActionBar } from "../../../components/ui/DetailActionBar";
import type { RecurringIncomeSummary } from "../../../types/domain";

type Props = {
  bottomInset: number;
  status: RecurringIncomeSummary["status"];
  pendingCount: number;
  onEdit: () => void;
  onAnnotate: () => void;
  onReactivate: () => void;
};

export const RecurringIncomeDetailActions = memo(function RecurringIncomeDetailActions({
  bottomInset,
  status,
  pendingCount,
  onEdit,
  onAnnotate,
  onReactivate,
}: Props) {
  return (
    <DetailActionBar
      bottomInset={bottomInset}
      primarySide="right"
      secondary={{
        label: "Editar",
        accessibilityLabel: "Editar ingreso fijo",
        icon: Pencil,
        onPress: onEdit,
      }}
      primary={status === "active" ? {
        label: pendingCount > 0 ? "Poner al día" : "Anotar llegada",
        accessibilityLabel: pendingCount > 0 ? "Anotar la primera llegada pendiente" : "Anotar llegada de ingreso fijo",
        icon: Check,
        onPress: onAnnotate,
      } : {
        label: "Reactivar",
        accessibilityLabel: "Reactivar ingreso fijo",
        icon: RotateCcw,
        onPress: onReactivate,
      }}
    />
  );
});
