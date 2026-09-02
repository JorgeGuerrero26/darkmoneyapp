import { useEffect, useState } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { format, isValid } from "date-fns";

import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { Button } from "./Button";
import { DateTimeCalendar } from "./DateTimeCalendar";
import { useDismissibleSheet } from "./useDismissibleSheet";
import { relativeDateLabel } from "../../lib/calendar";
import { todayPeru } from "../../lib/date";

type Props = {
  visible: boolean;
  /** Título de la hoja. */
  label: string;
  /** `yyyy-MM-dd`, o "" si aún no hay fecha. */
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** Con fecha opcional aparece "Quitar": no es otra forma de cerrar, es otra cosa que hacer. */
  optional?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
};

function initialDate(value: string, minimumDate?: Date): Date {
  if (value?.trim()) {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (isValid(date)) return date;
  }
  if (minimumDate) {
    return new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate());
  }
  return new Date();
}

function parseLocalDate(value: string): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isValid(date) ? date : new Date();
}

/**
 * El calendario en hoja, sin decidir qué lo abre.
 *
 * Vivía dentro de `DatePickerInput` y por eso una fila que quisiera abrir el calendario tenía
 * que pintar **el campo entero** debajo de sí misma: un acordeón que revelaba otro disparador,
 * dos toques antes de ver un día. Separado, la fila lo abre directo — que es la regla de la
 * revisión 21: fila con chevrón abre una hoja, nada se despliega hacia abajo.
 */
export function DatePickerModal({
  visible,
  label,
  value,
  onChange,
  onClose,
  optional = false,
  minimumDate,
  maximumDate,
}: Props) {
  const insets = useSafeAreaInsets();
  const dismiss = useDismissibleSheet({
    visible: visible && Platform.OS === "ios",
    onClose,
  });
  const [draft, setDraft] = useState<Date>(() => initialDate(value, minimumDate));

  // Cada apertura parte del valor que el campo tiene hoy, no del que se miró la última vez.
  useEffect(() => {
    if (visible) setDraft(initialDate(value, minimumDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const draftYmd = format(draft, "yyyy-MM-dd");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, dismiss.backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.md) },
            dismiss.sheetStyle,
          ]}
          onStartShouldSetResponder={() => true}
          {...dismiss.panHandlers}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            {optional ? (
              <TouchableOpacity
                onPress={() => { onChange(""); onClose(); }}
                style={styles.clearBtn}
                accessibilityRole="button"
              >
                <Text style={styles.clearText}>Quitar</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSide} />
            )}
            <Text style={styles.title}>{label}</Text>
            <View style={styles.headerSide} />
          </View>

          <View style={styles.divider} />

          <View style={styles.calendarFrame}>
            <DateTimeCalendar
              value={draftYmd}
              onChange={(next) => setDraft(parseLocalDate(next))}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
            />
          </View>

          {/* Un solo botón, y dice el resultado. */}
          <Button
            label={`Usar ${relativeDateLabel(draftYmd, todayPeru()).toLowerCase()}`}
            size="lg"
            onPress={() => { onChange(draftYmd); onClose(); }}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.50)", justifyContent: "flex-end" },
  sheet: {
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerSide: { width: 64 },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  clearBtn: { width: 64, paddingVertical: 6, alignItems: "flex-start" },
  clearText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.danger },
  divider: { height: 0.5, backgroundColor: "rgba(244,241,236,0.10)", marginHorizontal: SPACING.lg },
  calendarFrame: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: "rgba(10,10,9,0.65)",
  },
});
