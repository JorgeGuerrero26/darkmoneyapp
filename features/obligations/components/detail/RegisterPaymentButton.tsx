import {
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { obligationViewerActsAsCollector } from "../../../../lib/obligation-viewer-labels";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type RegisterPaymentButtonStyles = {
  payBtn: StyleProp<ViewStyle>;
  payBtnText: StyleProp<TextStyle>;
};

type Props = {
  styles: RegisterPaymentButtonStyles;
  obligation: ObligationSummary | SharedObligationSummary;
  isSharedViewer: boolean;
  onPressViewerRequest: () => void;
  onPressOwnerRegister: () => void;
};

export function RegisterPaymentButton({
  styles,
  obligation,
  isSharedViewer,
  onPressViewerRequest,
  onPressOwnerRegister,
}: Props) {
  if (obligation.status !== "active") return null;

  if (isSharedViewer) {
    return (
      <TouchableOpacity style={styles.payBtn} onPress={onPressViewerRequest}>
        <Text style={styles.payBtnText}>
          {obligationViewerActsAsCollector(obligation.direction, true)
            ? "Solicitar cobro"
            : "Solicitar pago"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.payBtn} onPress={onPressOwnerRegister}>
      <Text style={styles.payBtnText}>
        {obligationViewerActsAsCollector(obligation.direction, false)
          ? "Registrar cobro"
          : "Registrar pago"}
      </Text>
    </TouchableOpacity>
  );
}
