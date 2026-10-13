import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { FormFeedbackProvider, FormSubmitBar } from "../../../../components/ui/FormFeedback";

import { Text, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";


import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import type { ObligationPaymentRequest } from "../../../../types/domain";
import { TextField } from "../../../../components/ui/TextField";

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
  onConfirm: () => void | Promise<void>;
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
  const submit = onConfirm;
  const validationFields = { rejectReason: { value: rejectReason, serverKeys: ["rejection_reason"] } };
  return (
    <FormFeedbackProvider visible={Boolean(rejectingRequest)} resetKey={rejectingRequest?.id} busy={rejectIsPending} onSubmit={submit} fields={validationFields}>
    <BottomSheet entranceAnimation="springFade" visible={Boolean(rejectingRequest)} onClose={onCancel} title={"Rechazar solicitud"} snapHeight={0.9} footer={<FormSubmitBar label="Confirmar rechazo" onSubmit={submit} loading={rejectIsPending}></FormSubmitBar>}>
          {rejectingRequest ? (
            <Text style={styles.rejectSub}>
              {formatCurrency(rejectingRequest.amount, currencyCode)}
              {" - "}
              {format(parseDisplayDate(rejectingRequest.paymentDate), "d MMM yyyy", { locale: es })}
            </Text>
          ) : null}
          <View style={styles.rejectInputWrap}>
            <TextField fieldId="rejectReason"
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={onChangeReason}
              placeholder="Motivo (opcional)"
              placeholderTextColor={COLORS.textDisabled}
            />
          </View>

    </BottomSheet>
    </FormFeedbackProvider>
  );
}
