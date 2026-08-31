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
  /** Abre "Ajustar monto": una venta o un préstamo más, o una corrección hacia abajo. */
  onPressAdjust?: () => void;
};

export function RegisterPaymentButton({
  styles,
  obligation,
  isSharedViewer,
  onPressViewerRequest,
  onPressOwnerRegister,
  onPressAdjust,
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
   * Ajustar es la acción secundaria al lado de la principal: en una cuenta corriente con un
   * cliente ocurre doce veces, mientras que editar los datos administrativos —que era el botón
   * más llamativo de la pantalla— se fue al menú de la esquina.
   *
   * Es **un** botón, no dos: subir y bajar el monto son la misma hoja con un conmutador desde la
   * Revisión 15, así que "Aumentar monto" aquí y "Reducir monto" en el menú de la esquina eran
   * dos puertas al mismo formulario, y ninguna de las dos decía lo que el formulario hace.
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
      {onPressAdjust ? (
        <TouchableOpacity style={styles.paySecondaryBtn} onPress={onPressAdjust}>
          <Text style={styles.paySecondaryBtnText}>Ajustar monto</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
