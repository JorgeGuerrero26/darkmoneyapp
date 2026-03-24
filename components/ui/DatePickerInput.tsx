import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronRight, Check, X } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { AndroidDarkDatePickerModal } from "./AndroidDarkDatePickerModal";

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

/** Fecha inicial del picker cuando aún no hay valor (respeta mínimo si existe) */
function initialPickerDate(value: string, minimumDate?: Date): Date {
  if (value?.trim()) {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return isValid(date) ? date : new Date();
  }
  if (minimumDate) {
    return new Date(
      minimumDate.getFullYear(),
      minimumDate.getMonth(),
      minimumDate.getDate(),
    );
  }
  return new Date();
}

function parseLocalDate(value: string): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isValid(date) ? date : new Date();
}

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
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => initialPickerDate(value, minimumDate));

  const displayText = value
    ? format(parseLocalDate(value), "d 'de' MMMM yyyy", { locale: es })
    : "";

  function handleOpen() {
    const initial = initialPickerDate(value, minimumDate);
    setTempDate(initial);
    setOpen(true);
  }

  function handleChange(_: DateTimePickerEvent, date?: Date) {
    if (date) setTempDate(date);
  }

  function handleConfirm() {
    onChange(format(tempDate, "yyyy-MM-dd"));
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  const triggerStyles = [styles.trigger, variant === "formRow" && styles.triggerFormRow];
  const showClear = optional && showInlineClear && Boolean(value?.trim());

  return (
    <View style={styles.container}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}

      <View style={styles.triggerRow}>
        <TouchableOpacity style={[triggerStyles, styles.triggerFlex]} onPress={handleOpen} activeOpacity={0.75}>
          <View style={styles.triggerIconWrap}>
            <CalendarDays size={18} color={value ? COLORS.pine : COLORS.storm} strokeWidth={2} />
          </View>
          <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
            {displayText || placeholder}
          </Text>
          <ChevronRight size={18} color={COLORS.storm} strokeWidth={2} />
        </TouchableOpacity>
        {showClear ? (
          <TouchableOpacity
            style={styles.inlineClearBtn}
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityLabel="Quitar fecha"
            accessibilityRole="button"
          >
            <X size={20} color={COLORS.storm} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Android: calendario oscuro propio (el nativo Material sale blanco) */}
      {Platform.OS === "android" ? (
        <AndroidDarkDatePickerModal
          visible={open}
          onClose={() => setOpen(false)}
          label={label}
          initialDate={tempDate}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          optional={optional}
          onConfirm={(ymd) => {
            onChange(ymd);
            setOpen(false);
          }}
          onClear={() => {
            onChange("");
            setOpen(false);
          }}
        />
      ) : null}

      {/* iOS: glass premium bottom sheet */}
      {Platform.OS === "ios" && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.iosSheet, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.md) }]} onStartShouldSetResponder={() => true}>
              {/* Drag handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                {optional ? (
                  <TouchableOpacity onPress={handleClear} style={styles.iosClearHeaderBtn}>
                    <Text style={styles.iosClearHeaderText}>Quitar</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSide} />
                )}
                <Text style={styles.sheetTitle}>{label}</Text>
                <TouchableOpacity onPress={handleConfirm} style={styles.confirmBtn}>
                  <Check size={16} color={COLORS.pine} strokeWidth={2.5} />
                  <Text style={styles.confirmBtnText}>Listo</Text>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Date preview */}
              <View style={styles.datePreview}>
                <Text style={styles.datePreviewMonth}>
                  {format(tempDate, "MMMM yyyy", { locale: es })}
                </Text>
                <Text style={styles.datePreviewText}>
                  {format(tempDate, "EEEE, d 'de' MMMM", { locale: es })}
                </Text>
                {optional ? (
                  <TouchableOpacity onPress={handleClear} style={styles.iosClearSubtle}>
                    <Text style={styles.iosClearSubtleText}>Quitar fecha y dejar vacío</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Calendario nativo (iOS 14+); antes era solo ruletas — mucho más claro */}
              <View style={styles.iosCalendarFrame}>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  onChange={handleChange}
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  locale="es-ES"
                  themeVariant="dark"
                  accentColor={COLORS.primary}
                  style={styles.iosInlinePicker}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },

  triggerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SPACING.xs,
  },
  triggerFlex: {
    flex: 1,
    minWidth: 0,
  },
  inlineClearBtn: {
    width: 48,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
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

  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(5,8,12,0.55)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.inputBorder,
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

  triggerPlaceholder: {
    color: COLORS.textDisabled,
  },

  // ─── iOS bottom sheet ─────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "flex-end",
  },

  iosSheet: {
    backgroundColor: "rgba(10,14,20,0.94)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.08)",
    paddingBottom: SPACING.lg,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.50,
    shadowRadius: 24,
    elevation: 16,
  },

  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },

  headerSide: { width: 64, alignItems: "flex-start" },

  sheetTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    flex: 1,
    textAlign: "center",
  },

  iosClearHeaderBtn: {
    width: 64,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  iosClearHeaderText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
  },

  confirmBtn: {
    width: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },

  confirmBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.pine,
  },

  divider: {
    height: 0.5,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginHorizontal: SPACING.lg,
  },

  datePreview: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    gap: 4,
  },

  datePreviewMonth: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "capitalize",
    letterSpacing: 0.8,
  },

  datePreviewText: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    textTransform: "capitalize",
    textAlign: "center",
    paddingHorizontal: SPACING.md,
  },

  iosClearSubtle: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  iosClearSubtleText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textDecorationLine: "underline",
  },

  /** Contenedor del UIDatePicker estilo calendario (inline) */
  iosCalendarFrame: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.18)",
    backgroundColor: "rgba(5,8,12,0.65)",
  },

  iosInlinePicker: {
    width: "100%",
    minHeight: 320,
  },
});
