import { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ChevronRight, Clock } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  label: string;
  /** "HH:mm" (hora local Perú tal como la ve el usuario). */
  value: string;
  onChange: (value: string) => void;
  hideLabel?: boolean;
  variant?: "default" | "formRow";
};

function valueToDate(value: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(value?.trim() ?? "");
  const date = new Date();
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  return date;
}

function dateToValue(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Selector de hora hermano de DatePickerInput (mismo trigger visual).
 * Android: diálogo nativo de reloj. iOS: spinner en modal con confirmación.
 */
export function TimePickerInput({ label, value, onChange, hideLabel = false, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => valueToDate(value));

  function handleOpen() {
    setTempDate(valueToDate(value));
    setOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, date?: Date) {
    setOpen(false);
    if (event.type === "set" && date) onChange(dateToValue(date));
  }

  const triggerStyles = [styles.trigger, variant === "formRow" && styles.triggerFormRow];

  return (
    <View style={styles.container}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={triggerStyles}
        onPress={handleOpen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "sin hora"}`}
        accessibilityHint="Toca para abrir el selector de hora"
      >
        <View style={styles.triggerIconWrap}>
          <Clock size={18} color={value ? COLORS.pine : COLORS.storm} strokeWidth={2} />
        </View>
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
          {value || "Seleccionar hora"}
        </Text>
        <ChevronRight size={18} color={COLORS.storm} strokeWidth={2} />
      </TouchableOpacity>

      {open && Platform.OS === "android" ? (
        <DateTimePicker value={tempDate} mode="time" is24Hour display="clock" onChange={handleAndroidChange} />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.iosBackdrop}>
            <View style={styles.iosSheet}>
              <DateTimePicker
                value={tempDate}
                mode="time"
                display="spinner"
                onChange={(_, date) => date && setTempDate(date)}
              />
              <View style={styles.iosActions}>
                <TouchableOpacity onPress={() => setOpen(false)} style={styles.iosAction}>
                  <Text style={styles.iosActionText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    onChange(dateToValue(tempDate));
                    setOpen(false);
                  }}
                  style={styles.iosAction}
                >
                  <Text style={[styles.iosActionText, styles.iosActionConfirm]}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  // Espejo de DatePickerInput: ambos van lado a lado en los formularios y
  // deben verse idénticos en alto, tipografía y label.
  label: {
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
    backgroundColor: "rgba(5,8,12,0.55)",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 48,
  },
  triggerFormRow: {
    minHeight: 52,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  triggerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(107,228,197,0.10)",
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  triggerText: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
  },
  triggerPlaceholder: { color: COLORS.storm },
  iosBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  iosSheet: {
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingBottom: SPACING.xl,
  },
  iosActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
  },
  iosAction: { padding: SPACING.md },
  iosActionText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  iosActionConfirm: { color: COLORS.primary },
});
