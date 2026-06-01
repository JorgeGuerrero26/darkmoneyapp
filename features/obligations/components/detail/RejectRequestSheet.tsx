import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "../../../../components/ui/Button";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, SPACING } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import type { ObligationPaymentRequest } from "../../../../types/domain";

export type RejectRequestSheetStyles = {
  overlay: StyleProp<ViewStyle>;
  rejectSheet: StyleProp<ViewStyle>;
  rejectTitle: StyleProp<TextStyle>;
  rejectSub: StyleProp<TextStyle>;
  rejectInputWrap: StyleProp<ViewStyle>;
  rejectInput: StyleProp<TextStyle>;
  rejectConfirmBtn: StyleProp<ViewStyle>;
};

type Props = {
  styles: RejectRequestSheetStyles;
  rejectingRequest: ObligationPaymentRequest | null;
  currencyCode: string;
  rejectReason: string;
  rejectIsPending: boolean;
  insetBottom: number;
  onChangeReason: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RejectRequestSheet({
  styles,
  rejectingRequest,
  currencyCode,
  rejectReason,
  rejectIsPending,
  insetBottom,
  onChangeReason,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={Boolean(rejectingRequest)}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View
          style={[styles.rejectSheet, { paddingBottom: insetBottom + SPACING.lg }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.rejectTitle}>Rechazar solicitud</Text>
          {rejectingRequest ? (
            <Text style={styles.rejectSub}>
              {formatCurrency(rejectingRequest.amount, currencyCode)}
              {" - "}
              {format(parseDisplayDate(rejectingRequest.paymentDate), "d MMM yyyy", { locale: es })}
            </Text>
          ) : null}
          <View style={styles.rejectInputWrap}>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={onChangeReason}
              placeholder="Motivo (opcional)"
              placeholderTextColor={COLORS.textDisabled}
            />
          </View>
          <Button
            label="Confirmar rechazo"
            variant="ghost"
            onPress={onConfirm}
            loading={rejectIsPending}
            style={styles.rejectConfirmBtn}
          />
          <Button label="Cancelar" variant="ghost" onPress={onCancel} />
        </View>
      </Pressable>
    </Modal>
  );
}
