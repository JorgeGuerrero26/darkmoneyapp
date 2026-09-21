import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

export type DraftCardStatus = "pending" | "saved" | "discarded";

/** Qué significa la cifra. Decide su color: la regla del color en esta app es el dinero. */
export type DraftAmountTone = "expense" | "income" | "neutral";

type Props = {
  title: string;
  amountLabel: string;
  amountTone?: DraftAmountTone;
  lines: { label: string; value: string }[];
  /** Encabezado de la fila colapsada tras guardar, p. ej. "Gasto registrado". */
  savedTitle?: string;
  /** Segunda línea de esa fila, p. ej. "Pan · Alimentación". */
  savedSubtitle?: string;
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
  amountTone = "neutral",
  lines,
  savedTitle,
  savedSubtitle,
  status,
  isSaving,
  onSave,
  onEdit,
  onCancel,
  onViewMovement,
}: Props) {
  const amountStyle =
    amountTone === "expense" ? styles.amountExpense : amountTone === "income" ? styles.amountIncome : null;

  /* Un formulario ya resuelto no debería seguir ocupando el alto de un formulario. Al guardar,
     la tarjeta se colapsa a una fila de hecho —check, qué fue, cuánto— en vez de quedarse con
     sus cuatro filas y sus tres botones inertes. Aquí el color de la cifra ya es puramente
     informativo: describe un movimiento que existe, no una sugerencia por confirmar. */
  if (status === "saved") {
    return (
      <TouchableOpacity
        style={styles.savedCard}
        onPress={onViewMovement}
        disabled={!onViewMovement}
        accessibilityLabel={onViewMovement ? "Ver el movimiento guardado" : "Movimiento guardado"}
      >
        <Check size={15} color={COLORS.pine} strokeWidth={2.6} />
        <View style={styles.savedBody}>
          <Text style={styles.savedTitle} numberOfLines={1}>{savedTitle ?? "Guardado"}</Text>
          {savedSubtitle ? (
            <Text style={styles.savedSubtitle} numberOfLines={1}>{savedSubtitle}</Text>
          ) : null}
        </View>
        <Text style={[styles.savedAmount, amountStyle]} numberOfLines={1}>{amountLabel}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.amount, amountStyle]}>{amountLabel}</Text>
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
      ) : (
        <Text style={styles.discardedText}>Descartado</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    /* xl, el radio de Card y ResourceCard. Es una tarjeta: estaba en lg (10) y salía más
       cuadrada que cualquier otra superficie de la app. */
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    /* Neutro: cardActiveBorder es verde menta, y una tarjeta de GASTO con aro verde contradice
       la cifra que lleva dentro. El color de esta tarjeta lo pone su monto, no su borde. */
    borderColor: SURFACE.cardBorder,
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
  /* La cifra SÍ lleva color: es dinero. Clay lo que sale, menta lo que entra. */
  amountExpense: { color: COLORS.dangerSoft },
  amountIncome: { color: COLORS.pine },
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
  /* Hueso, no verde. "Guardar" no es una cifra: es el mismo botón primario que usa el resto de
     la app. En verde, y sobre una tarjeta de GASTO, el verde dejaba de significar "entra dinero"
     y pasaba a significar "botón" — que es justo lo que rompe la regla del color. */
  btnPrimary: { backgroundColor: COLORS.action, borderColor: COLORS.action },
  btnPrimaryText: { color: COLORS.actionText, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    maxWidth: "94%",
    alignSelf: "flex-start",
  },
  savedBody: { flex: 1, minWidth: 0, gap: 2 },
  savedTitle: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  savedSubtitle: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  savedAmount: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  discardedText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
});
