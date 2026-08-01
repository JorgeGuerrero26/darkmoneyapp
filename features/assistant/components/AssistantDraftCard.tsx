import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

export type DraftCardStatus = "pending" | "saved" | "discarded";

type Props = {
  title: string;
  amountLabel: string;
  lines: { label: string; value: string }[];
  status: DraftCardStatus;
  isSaving: boolean;
  onSave: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onViewMovement?: () => void;
};

/**
 * Tarjeta de confirmación de un movimiento propuesto por el asistente. Puramente
 * presentacional: recibe líneas ya resueltas (cuenta, categoría, etc.) y
 * callbacks. El guardado real vive en app/assistant.tsx.
 */
export function AssistantDraftCard({
  title,
  amountLabel,
  lines,
  status,
  isSaving,
  onSave,
  onEdit,
  onCancel,
  onViewMovement,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.amount}>{amountLabel}</Text>
      {lines.map((line) => (
        <View key={line.label} style={styles.line}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <Text style={styles.lineValue}>{line.value}</Text>
        </View>
      ))}
      {status === "pending" ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={onSave}
            disabled={isSaving}
            accessibilityLabel="Guardar movimiento"
          >
            <Text style={styles.btnPrimaryText}>{isSaving ? "Guardando…" : "Guardar"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onEdit} disabled={isSaving} accessibilityLabel="Editar antes de guardar">
            <Text style={styles.btnText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onCancel} disabled={isSaving} accessibilityLabel="Cancelar">
            <Text style={styles.btnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : status === "saved" ? (
        <TouchableOpacity style={styles.savedRow} onPress={onViewMovement} accessibilityLabel="Ver el movimiento guardado">
          <Text style={styles.savedText}>Guardado ✓{onViewMovement ? "  ·  Ver movimiento" : ""}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.discardedText}>Descartado</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardActiveBorder,
    backgroundColor: SURFACE.card,
    padding: SPACING.md,
    gap: SPACING.xs,
    maxWidth: "94%",
    alignSelf: "flex-start",
  },
  title: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  amount: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg },
  line: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  lineLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  lineValue: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, flexShrink: 1, textAlign: "right" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm },
  btn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  btnText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  btnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  btnPrimaryText: { color: COLORS.void, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  savedRow: { marginTop: SPACING.xs },
  savedText: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  discardedText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
});
