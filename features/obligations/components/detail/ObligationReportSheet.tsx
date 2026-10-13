import { Text, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";

import { Input } from "../../../../components/ui/Input";
import { FormFeedbackProvider, FormSubmitBar, FormActionButton } from "../../../../components/ui/FormFeedback";

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
  onCopyMessage: () => void | Promise<void>;
  onSharePdf: () => void | Promise<void>;
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
  const fields = { message: { value: message } };
  return (
    <FormFeedbackProvider visible={visible} busy={isSharing} fields={fields} onSubmit={onSharePdf}>
    <BottomSheet visible={visible} onClose={onClose} title="Reporte listo" snapHeight={0.62}
      footer={<FormSubmitBar label="Compartir PDF" onSubmit={() => { void onSharePdf(); }} loadingLabel="Generando PDF…" failureTitle="No se pudo completar la acción">
        <FormActionButton label="Copiar mensaje" variant="secondary" style={{ flex: 1 }} onAction={onCopyMessage} />
      </FormSubmitBar>}>
      <View style={styles.shareSheet}>
        <Text style={styles.shareSheetSub}>
          Folio {folio}. Copia el mensaje, comparte el PDF por WhatsApp y pega el texto en el chat.
        </Text>
        <Input fieldId="message"
          label="Mensaje para acompañar el reporte"
          value={message}
          onChangeText={onChangeMessage}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>
    </BottomSheet>
    </FormFeedbackProvider>
  );
}
