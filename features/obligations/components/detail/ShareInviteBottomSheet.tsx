import { FormFeedbackProvider, FormSubmitBar } from "../../../../components/ui/FormFeedback";
import { requiredField } from "../../../../lib/form-field-rules";
import { Text, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";

import { Input } from "../../../../components/ui/Input";

export type ShareInviteBottomSheetStyles = {
  shareSheet: StyleProp<ViewStyle>;
  shareSheetSub: StyleProp<TextStyle>;
};

type Props = {
  styles: ShareInviteBottomSheetStyles;
  visible: boolean;
  shareEmail: string;
  isSubmitting: boolean;
  onChangeEmail: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ShareInviteBottomSheet({
  styles,
  visible,
  shareEmail,
  isSubmitting,
  onChangeEmail,
  onSubmit,
  onClose,
}: Props) {
  return (
    <FormFeedbackProvider visible={visible} busy={isSubmitting} fields={{ shareEmail: requiredField(shareEmail, "Escribe el correo", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmail.trim()) ? null : "Escribe un correo válido") }} onSubmit={onSubmit}>

    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Compartir obligación"
      snapHeight={0.42}
      footer={<FormSubmitBar label="Enviar invitación" onSubmit={onSubmit} loading={isSubmitting} />}
    >
      <View style={styles.shareSheet}>
        <Text style={styles.shareSheetSub}>
          La otra parte podra ver el estado y registrar pagos
        </Text>
        <Input fieldId="shareEmail"
          label="Correo del destinatario"
          value={shareEmail}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="correo@ejemplo.com"
        />

      </View>
    </BottomSheet>
    </FormFeedbackProvider>
  );
}
