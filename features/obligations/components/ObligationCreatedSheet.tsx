import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { SafeBlurView } from "../../../components/ui/SafeBlurView";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  /** El nombre de la obligación recién creada. */
  title: string;
  /** "S/ 1,000.00 · 6 pagos a medida". */
  summary: string;
  counterpartyName: string;
  email: string;
  onChangeEmail: (value: string) => void;
  message: string;
  onChangeMessage: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  /** Irse sin invitar a nadie. */
  onDismiss: () => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Lo que pasa después de crear una obligación.
 *
 * **La obligación ya está guardada**, y eso se dice en la primera línea. Es lo que hace a esta
 * pantalla distinta de la tarjeta de invitación que vivía dentro del formulario: ahí el mismo
 * botón guardaba y mandaba un correo a la vez, sin previsualización. Aquí el usuario puede irse
 * por "Ver la obligación" sin invitar a nadie y no pierde nada.
 *
 * No hay pantalla de "¡Listo!" con palomita: el título ya dice "Obligación creada" y debajo
 * están el nombre y el monto, que son la confirmación real. Y el rótulo va en gris, no en menta:
 * sobre una obligación por cobrar, un verde se lee como plata que entró.
 */
export function ObligationCreatedSheet({
  visible,
  title,
  summary,
  counterpartyName,
  email,
  onChangeEmail,
  message,
  onChangeMessage,
  sending,
  onSend,
  onDismiss,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.root}>
      <SafeBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.card}>
        <Text style={styles.kicker}>Obligación creada</Text>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.summary}>{summary}</Text>

        <View style={styles.inviteHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(counterpartyName)}</Text>
          </View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteTitle}>Invitar a {counterpartyName}</Text>
            <Text style={styles.inviteSubtitle}>Verá el plan y podrá marcar sus pagos</Text>
          </View>
        </View>

        <TextField
          style={styles.input}
          value={email}
          onChangeText={onChangeEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor={COLORS.storm}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Correo del invitado"
        />
        <TextField
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={onChangeMessage}
          placeholder="Agregar un mensaje"
          placeholderTextColor={COLORS.storm}
          multiline
          accessibilityLabel="Mensaje para el invitado"
        />

        {/* La frase que hacía falta, y que la letra chica anterior decía al revés. */}
        <Text style={styles.note}>
          Nada se envía hasta que toques Enviar invitación. La obligación ya está guardada.
        </Text>

        <Button
          label="Enviar invitación"
          size="lg"
          onPress={onSend}
          loading={sending}
          disabled={!email.trim()}
        />
        <TouchableOpacity
          style={styles.dismiss}
          onPress={onDismiss}
          activeOpacity={0.72}
          accessibilityRole="button"
        >
          <Text style={styles.dismissText}>Ver la obligación</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderTopColor: SURFACE.sheetBorder,
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  kicker: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  summary: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    marginBottom: SPACING.sm,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  inviteCopy: { flex: 1, gap: 2 },
  inviteTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  inviteSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  input: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  messageInput: { minHeight: 64, paddingTop: SPACING.sm + 2, textAlignVertical: "top" },
  note: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
    marginBottom: SPACING.xs,
  },
  dismiss: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
