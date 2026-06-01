import {
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { Button } from "../../../../components/ui/Button";
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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Compartir obligación"
      snapHeight={0.42}
    >
      <View style={styles.shareSheet}>
        <Text style={styles.shareSheetSub}>
          La otra parte podra ver el estado y registrar pagos
        </Text>
        <Input
          label="Email del destinatario *"
          value={shareEmail}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="correo@ejemplo.com"
        />
        <Button
          label="Enviar invitacion"
          onPress={onSubmit}
          loading={isSubmitting}
        />
      </View>
    </BottomSheet>
  );
}
