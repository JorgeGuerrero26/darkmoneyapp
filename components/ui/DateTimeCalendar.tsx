import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { format, parseISO } from "date-fns";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { dateShortcuts, monthGrid, monthTitle, WEEKDAY_INITIALS } from "../../lib/calendar";
import { todayPeru } from "../../lib/date";

type Props = {
  /** `yyyy-MM-dd`. */
  value: string;
  onChange: (date: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** La fila de hora al pie. Sin `time` no se dibuja: hay campos que son solo fecha. */
  time?: string | null;
  onPressTime?: () => void;
};

const DAY = 86_400_000;

function toDate(value: string) {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * El calendario del mockup AL, sin decidir cómo se presenta.
 *
 * Lo comparten la hoja en capa (`DateTimeSheet`, para formularios que ya son sheets) y el modal
 * de `DatePickerInput`, que es por donde pasan los otros seis formularios. **Un solo calendario
 * con dos marcos**: antes había tres —el modal de iOS con el nativo `inline`, el
 * `AndroidDarkDatePickerModal`, y el acordeón de movimientos— y cada uno se veía distinto.
 *
 * Lo que arregla, y estaba en los tres:
 *
 * - **"Septiembre 2026" cuatro veces**: subtítulo gris, título grande, dentro del calendario y
 *   otra vez implícito en las flechas. Y dos formas de cambiar de mes. Queda `‹ Septiembre 2026 ›`.
 * - **"Martes, 1 De Septiembre"**: *title case* inglés aplicado al español. Se va con la cabecera
 *   duplicada; el día elegido ya se ve marcado en la cuadrícula.
 * - **La menta**: el círculo del día era menta, que en esta app significa plata que entra. El día
 *   elegido va en hueso sólido con el número en tinta.
 */
export function DateTimeCalendar({
  value,
  onChange,
  minimumDate,
  maximumDate,
  time = null,
  onPressTime,
}: Props) {
  const [cursor, setCursor] = useState(() => toDate(value));

  // Al cambiar de mes con los atajos, el calendario sigue al valor.
  useEffect(() => {
    setCursor(toDate(value));
  }, [value]);

  const today = useMemo(() => todayPeru(), []);
  const shortcuts = useMemo(() => dateShortcuts(today), [today]);
  const weeks = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const isBlocked = (day: number) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    if (minimumDate && date.getTime() < minimumDate.getTime() - DAY + 1) return true;
    if (maximumDate && date.getTime() > maximumDate.getTime()) return true;
    return false;
  };

  const stepMonth = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <View style={styles.root}>
      {/* La fecha que uno corrige a mano casi siempre es una de estas tres. */}
      <View style={styles.shortcuts}>
        {shortcuts.map((shortcut) => {
          const active = shortcut.date === value;
          return (
            <TouchableOpacity
              key={shortcut.label}
              style={[styles.shortcut, active && styles.shortcutActive]}
              onPress={() => onChange(shortcut.date)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.shortcutText, active && styles.shortcutTextActive]}>
                {shortcut.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.monthRow}>
        <TouchableOpacity
          style={styles.monthStep}
          onPress={() => stepMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
        >
          <ChevronLeft size={18} color={COLORS.fog} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthTitle(cursor.getFullYear(), cursor.getMonth())}</Text>
        <TouchableOpacity
          style={styles.monthStep}
          onPress={() => stepMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
        >
          <ChevronRight size={18} color={COLORS.fog} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text key={`${initial}-${index}`} style={styles.weekday}>{initial}</Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day, dayIndex) => {
            if (day == null) return <View key={dayIndex} style={styles.day} />;
            const date = format(new Date(cursor.getFullYear(), cursor.getMonth(), day), "yyyy-MM-dd");
            const selected = date === value;
            const blocked = isBlocked(day);
            return (
              <TouchableOpacity
                key={dayIndex}
                style={styles.day}
                onPress={() => onChange(date)}
                disabled={blocked}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: blocked }}
              >
                <View style={[styles.dayCircle, selected && styles.dayCircleSelected]}>
                  <Text
                    style={[
                      styles.dayText,
                      selected && styles.dayTextSelected,
                      blocked && styles.dayTextBlocked,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {time != null && onPressTime ? (
        <TouchableOpacity
          style={styles.hourRow}
          onPress={onPressTime}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Hora: ${time}`}
        >
          <Text style={styles.hourLabel}>Hora</Text>
          <Text style={styles.hourValue}>{time}</Text>
          <ChevronRight size={16} color={COLORS.storm} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.sm },
  shortcuts: { flexDirection: "row", gap: SPACING.sm },
  shortcut: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Hueso, no menta: esto dice "esto es lo que tocaste", no "plata que entra". */
  shortcutActive: { borderColor: COLORS.ink, borderWidth: 1.5 },
  shortcutText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  shortcutTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.xs,
  },
  monthStep: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },

  weekRow: { flexDirection: "row", alignItems: "center" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  day: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleSelected: { backgroundColor: COLORS.ink },
  dayText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  dayTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: SURFACE.sheet },
  dayTextBlocked: { color: COLORS.textDisabled },

  hourRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 56,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  hourLabel: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.ink },
  hourValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
});
