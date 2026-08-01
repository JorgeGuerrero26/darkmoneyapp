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

export type ObligationReportSheetStyles = {
  shareSheet: StyleProp<ViewStyle>;
  shareSheetSub: StyleProp<TextStyle>;
};

type Props = {
  styles: ObligationReportSheetStyles;
  visible: boolean;
  folio: string;
  message: string;
  isSharing: boolean;
  onChangeMessage: (value: string) => void;
  onCopyMessage: () => void;
  onSharePdf: () => void;
  onClose: () => void;
};

/**
 * Sheet "Reporte listo": WhatsApp descarta el texto al compartir un archivo,
 * así que el flujo es 2 pasos — copiar el mensaje y compartir el PDF.
 */
export function ObligationReportSheet({
  styles,
  visible,
  folio,
  message,
  isSharing,
  onChangeMessage,
  onCopyMessage,
  onSharePdf,
  onClose,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Reporte listo" snapHeight={0.62}>
      <View style={styles.shareSheet}>
        <Text style={styles.shareSheetSub}>
          Folio {folio}. Copia el mensaje, comparte el PDF por WhatsApp y pega el texto en el chat.
        </Text>
        <Input
          label="Mensaje para acompañar el reporte"
          value={message}
          onChangeText={onChangeMessage}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        <Button label="Copiar mensaje" variant="secondary" onPress={onCopyMessage} />
        <Button
          label="Compartir PDF"
          onPress={onSharePdf}
          loading={isSharing}
          loadingLabel="Generando PDF…"
        />
      </View>
    </BottomSheet>
  );
}
