import { useState } from "react";
import {
  Animated,
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
import { format, isValid } from "date-fns";
import { CalendarDays, ChevronRight, X } from "lucide-react-native";
import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { Button } from "./Button";
import { DateTimeCalendar } from "./DateTimeCalendar";
import { useDismissibleSheet } from "./useDismissibleSheet";
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
  const iosSheetDismiss = useDismissibleSheet({
    visible: open && Platform.OS === "ios",
    onClose: () => setOpen(false),
  });
  const [tempDate, setTempDate] = useState<Date>(() => initialPickerDate(value, minimumDate));

  /* Formato corto. "1 de septiembre 2…" no cabía en medio ancho con un icono de 44px delante:
     el formato largo existe para ser legible y terminaba truncado. */
  const displayText = value ? relativeDateLabel(value, todayPeru()) : "";

  function handleOpen() {
    const initial = initialPickerDate(value, minimumDate);
    setTempDate(initial);
    setOpen(true);
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
        <TouchableOpacity
          style={[triggerStyles, styles.triggerFlex]}
          onPress={handleOpen}
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
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityLabel="Quitar fecha"
            accessibilityRole="button"
          >
            <X size={20} color={COLORS.storm} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Un solo calendario para las dos plataformas. Antes iOS abría un modal con el picker
          nativo `inline` y Android su propio `AndroidDarkDatePickerModal`: dos calendarios que se
          veían distinto, y el de iOS decía el mes cuatro veces —subtítulo, título grande, dentro
          del calendario y otra vez en las flechas— con un "Martes, 1 De Septiembre" en title case
          inglés encima. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Animated.View style={[styles.overlay, iosSheetDismiss.backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Animated.View
            style={[
              styles.iosSheet,
              { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.md) },
              iosSheetDismiss.sheetStyle,
            ]}
            onStartShouldSetResponder={() => true}
            {...iosSheetDismiss.panHandlers}
          >
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              {/* "Quitar" se queda: no es otra forma de cerrar, es otra cosa que hacer. */}
              {optional ? (
                <TouchableOpacity onPress={handleClear} style={styles.iosClearHeaderBtn}>
                  <Text style={styles.iosClearHeaderText}>Quitar</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.headerSide} />
              )}
              <Text style={styles.sheetTitle}>{label}</Text>
              <View style={styles.headerSide} />
            </View>

            <View style={styles.divider} />

            <View style={styles.iosCalendarFrame}>
              <DateTimeCalendar
                value={format(tempDate, "yyyy-MM-dd")}
                onChange={(next) => setTempDate(parseLocalDate(next))}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
              />
            </View>

            {/* Un solo botón, y dice el resultado. Antes: "✓ Listo" en menta arriba a la derecha
                en fecha, y "Cancelar / Confirmar" abajo en hora — dos patrones entre hermanos. */}
            <Button
              label={`Usar ${relativeDateLabel(format(tempDate, "yyyy-MM-dd"), todayPeru()).toLowerCase()}`}
              size="lg"
              onPress={handleConfirm}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

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

  triggerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(134,206,150,0.10)",
    borderWidth: 1,
    borderColor: "rgba(134,206,150,0.22)",
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
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: SURFACE.separator,
    borderLeftColor: SURFACE.separator,
    borderRightColor: SURFACE.separator,
    paddingBottom: SPACING.lg,
    maxHeight: "92%",
    ...ELEVATION[4],
  },

  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(244,241,236,0.22)",
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



  divider: {
    height: 0.5,
    backgroundColor: "rgba(244,241,236,0.10)",
    marginHorizontal: SPACING.lg,
  },





  /** Contenedor del UIDatePicker estilo calendario (inline) */
  iosCalendarFrame: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(134,206,150,0.18)",
    backgroundColor: "rgba(10,10,9,0.65)",
  },

});
