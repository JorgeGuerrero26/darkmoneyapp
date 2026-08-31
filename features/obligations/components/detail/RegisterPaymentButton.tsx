import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import {
  obligationViewerActsAsCollector,
  obligationViewerPaymentRequestTitle,
} from "../../../../lib/obligation-viewer-labels";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type RegisterPaymentButtonStyles = {
  payBtn: StyleProp<ViewStyle>;
  payBtnText: StyleProp<TextStyle>;
  payRow: StyleProp<ViewStyle>;
  paySecondaryBtn: StyleProp<ViewStyle>;
  paySecondaryBtnText: StyleProp<TextStyle>;
};

type Props = {
  styles: RegisterPaymentButtonStyles;
  obligation: ObligationSummary | SharedObligationSummary;
  isSharedViewer: boolean;
  onPressViewerRequest: () => void;
  onPressOwnerRegister: () => void;
  /** Registrar una venta o un préstamo más sobre la misma cuenta. */
  onPressIncrease?: () => void;
};

export function RegisterPaymentButton({
  styles,
  obligation,
  isSharedViewer,
  onPressViewerRequest,
  onPressOwnerRegister,
  onPressIncrease,
}: Props) {
  if (obligation.status !== "active") return null;

  if (isSharedViewer) {
    return (
      <TouchableOpacity style={styles.payBtn} onPress={onPressViewerRequest}>
        <Text style={styles.payBtnText}>
          {obligationViewerPaymentRequestTitle(obligation.direction)}
        </Text>
      </TouchableOpacity>
    );
  }

  /**
   * Aumentar es la acción secundaria al lado de la principal: en una cuenta corriente con un
   * cliente ocurre doce veces, mientras que editar los datos administrativos —que era el botón
   * más llamativo de la pantalla— se fue al menú de la esquina.
   */
  return (
    <View style={styles.payRow}>
      <TouchableOpacity style={styles.payBtn} onPress={onPressOwnerRegister}>
        <Text style={styles.payBtnText}>
          {obligationViewerActsAsCollector(obligation.direction, false)
            ? "Registrar cobro"
            : "Registrar pago"}
        </Text>
      </TouchableOpacity>
      {onPressIncrease ? (
        <TouchableOpacity style={styles.paySecondaryBtn} onPress={onPressIncrease}>
          <Text style={styles.paySecondaryBtnText}>Aumentar monto</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
