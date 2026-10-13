import { FormFeedbackProvider, FormSubmitBar } from "../../../components/ui/FormFeedback";
import { Input } from "../../../components/ui/Input";
import { emailField } from "../../../lib/form-field-rules";

export function ObligationInviteFields({ email, message, onEmailChange, onMessageChange, onSend, busy, visible, resend = false }: {
  email: string; message: string; onEmailChange: (value: string) => void;
  onMessageChange: (value: string) => void; onSend: () => Promise<void>;
  busy: boolean; visible: boolean; resend?: boolean;
}) {
  const fields = { shareEmail: { ...emailField(email), serverKeys: ["invited_email"] }, shareMessage: { value: message } };
  return <FormFeedbackProvider visible={visible} fields={fields} onSubmit={onSend} busy={busy}>
    <Input fieldId="shareEmail" label="Correo del destinatario" value={email} onChangeText={onEmailChange}
      keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="correo@ejemplo.com" />
    <Input fieldId="shareMessage" label="Mensaje (opcional)" value={message} onChangeText={onMessageChange} multiline numberOfLines={3} />
    <FormSubmitBar label={resend ? "Reenviar invitación" : "Enviar invitación"} onSubmit={() => { void onSend(); }} loading={busy} />
  </FormFeedbackProvider>;
}
