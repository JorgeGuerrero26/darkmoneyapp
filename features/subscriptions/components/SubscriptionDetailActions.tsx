import { memo } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react-native";

import { DetailActionBar } from "../../../components/ui/DetailActionBar";
import type { SubscriptionSummary } from "../../../types/domain";

type Props = {
  bottomInset: number;
  status: SubscriptionSummary["status"];
  isOverdue: boolean;
  onEdit: () => void;
  onMarkPaid: () => void;
  onReactivate: () => void;
};

export const SubscriptionDetailActions = memo(function SubscriptionDetailActions({
  bottomInset,
  status,
  isOverdue,
  onEdit,
  onMarkPaid,
  onReactivate,
}: Props) {
  return (
    <DetailActionBar
      bottomInset={bottomInset}
      primarySide="right"
      secondary={{
        label: "Editar",
        accessibilityLabel: "Editar suscripción",
        icon: Pencil,
        onPress: onEdit,
      }}
      primary={status === "active" ? {
        label: isOverdue ? "Poner al día" : "Registrar pago",
        accessibilityLabel: isOverdue ? "Poner suscripción al día" : "Registrar pago de suscripción",
        icon: Check,
        onPress: onMarkPaid,
      } : {
        label: "Reactivar",
        accessibilityLabel: "Reactivar suscripción",
        icon: RotateCcw,
        onPress: onReactivate,
      }}
    />
  );
});
