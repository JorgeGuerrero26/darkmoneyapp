import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CalendarDays, ChevronRight, X } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { DatePickerModal } from "./DatePickerModal";
import { relativeDateLabel } from "../../lib/calendar";
import { todayPeru } from "../../lib/date";

type Props = {
  label: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void; // emits "YYYY-MM-DD" o ""
  placeholder?: string;
  optional?: boolean;
  /** Muestra botón para borrar la fecha en la fila (solo si optional y hay valor) */
  showInlineClear?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Sin etiqueta interna (usa la del padre, p. ej. dentro de una tarjeta agrupada) */
  hideLabel?: boolean;
  /** `formRow`: trigger más alto y redondeado para bloques de formulario */
  variant?: "default" | "formRow";
};

/**
 * El campo de fecha con su ícono y su valor, que abre el calendario de `DatePickerModal`.
 *
 * Para una fila dentro de una tarjeta agrupada existe `FormDateRow`, que enseña lo mismo con la
 * tipografía de las filas hermanas y sin ícono propio.
 */
export function DatePickerInput({
  label,
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  optional = false,
  showInlineClear = true,
  minimumDate,
  maximumDate,
  hideLabel = false,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);

  /* Formato corto. "1 de septiembre 2…" no cabía en medio ancho con un icono de 44px delante:
     el formato largo existe para ser legible y terminaba truncado. */
  const displayText = value ? relativeDateLabel(value, todayPeru()) : "";
  const showClear = optional && showInlineClear && Boolean(value?.trim());

  return (
    <View style={styles.container}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}

      <View style={styles.triggerRow}>
        <TouchableOpacity
          style={[styles.trigger, variant === "formRow" && styles.triggerFormRow, styles.triggerFlex]}
          onPress={() => setOpen(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayText || placeholder}`}
          accessibilityHint="Toca para abrir el selector de fecha"
        >
          <View style={styles.triggerIconWrap}>
            <CalendarDays size={18} color={value ? COLORS.fog : COLORS.storm} strokeWidth={2} />
          </View>
          <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
            {displayText || placeholder}
          </Text>
          <ChevronRight size={18} color={COLORS.storm} strokeWidth={2} />
        </TouchableOpacity>
        {showClear ? (
          <TouchableOpacity
            style={styles.inlineClearBtn}
            onPress={() => onChange("")}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityLabel="Quitar fecha"
            accessibilityRole="button"
          >
            <X size={20} color={COLORS.storm} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      <DatePickerModal
        visible={open}
        label={label}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
        optional={optional}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },

  triggerRow: { flexDirection: "row", alignItems: "stretch", gap: SPACING.xs },
  triggerFlex: { flex: 1, minWidth: 0 },
  inlineClearBtn: {
    width: 48,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.dangerBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerFormRow: {
    minHeight: 52,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
  },

  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },

  /** Sin tinte menta: una fecha no es plata que entra (revisión 21). */
  triggerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(10,10,9,0.55)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 48,
  },

  triggerText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },

  triggerPlaceholder: { color: COLORS.textDisabled },
});
