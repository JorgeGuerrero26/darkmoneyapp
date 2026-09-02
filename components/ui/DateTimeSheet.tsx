import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { format, parseISO } from "date-fns";

import { Button } from "./Button";
import { InlineFormSheet } from "./InlineFormSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { dateShortcuts, dateTimeLabel, monthGrid, monthTitle, WEEKDAY_INITIALS } from "../../lib/calendar";
import { todayPeru } from "../../lib/date";

type Props = {
  visible: boolean;
  /** `yyyy-MM-dd`. */
  date: string;
  /** `HH:mm`, o `null` si este campo no lleva hora. */
  time?: string | null;
  minimumDate?: Date;
  maximumDate?: Date;
  onConfirm: (next: { date: string; time: string | null }) => void;
  onBack: () => void;
};

const DAY = 86_400_000;

function toDate(value: string) {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function timeToDate(value: string | null) {
  const date = new Date();
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (match) date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function dateToTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Elegir fecha y hora, en una sola hoja.
 *
 * **La regla que la trae** (revisión 21): una fila con chevrón abre una hoja; **nada se despliega
 * hacia abajo dentro del formulario**. La fila "Fecha y hora" revelaba dos campos —FECHA y HORA—
 * y cada uno abría *su* selector: tres representaciones del mismo dato apiladas y dos toques de
 * más antes de ver un calendario. Y un acordeón dentro de una hoja reacomoda el formulario bajo
 * el dedo, así que uno pierde de vista dónde estaba; una hoja propia no mueve nada de lo que
 * había debajo.
 *
 * **Fecha y hora son un dato, no dos.** La fila los enseña juntos —"Hoy, 16:07"—, así que la hoja
 * los resuelve juntos: calendario arriba, la hora como fila al pie, y **un solo botón** que dice
 * lo que va a pasar. Antes eran dos maneras distintas de cerrar en campos hermanos: "✓ Listo"
 * arriba en fecha, "Cancelar / Confirmar" abajo en hora.
 *
 * **Y tres atajos**, porque la fecha que uno corrige a mano casi siempre es hoy, ayer o anteayer.
 */
export function DateTimeSheet({
  visible,
  date,
  time = null,
  minimumDate,
  maximumDate,
  onConfirm,
  onBack,
}: Props) {
  const [draftDate, setDraftDate] = useState(date);
  const [draftTime, setDraftTime] = useState<string | null>(time);
  const [cursor, setCursor] = useState(() => toDate(date));
  const [hourOpen, setHourOpen] = useState(false);
  const [hourDraft, setHourDraft] = useState<Date>(() => timeToDate(time));

  // Cada apertura parte del valor que el campo tiene hoy, no del que se miró la última vez.
  useEffect(() => {
    if (!visible) return;
    setDraftDate(date);
    setDraftTime(time);
    setCursor(toDate(date));
    setHourOpen(false);
  }, [date, time, visible]);

  const today = useMemo(() => todayPeru(), []);
  const shortcuts = useMemo(() => dateShortcuts(today), [today]);
  const weeks = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const isBlocked = (day: number) => {
    const value = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    if (minimumDate && value.getTime() < minimumDate.getTime() - DAY + 1) return true;
    if (maximumDate && value.getTime() > maximumDate.getTime()) return true;
    return false;
  };

  const stepMonth = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <InlineFormSheet
      visible={visible}
      title={draftTime != null ? "Fecha y hora" : "Fecha"}
      onBack={onBack}
      height="88%"
      footer={
        <Button
          label={`Usar ${dateTimeLabel(draftDate, draftTime, today).toLowerCase()}`}
          size="lg"
          onPress={() => onConfirm({ date: draftDate, time: draftTime })}
        />
      }
    >
      <View style={styles.shortcuts}>
        {shortcuts.map((shortcut) => {
          const active = shortcut.date === draftDate;
          return (
            <TouchableOpacity
              key={shortcut.label}
              style={[styles.shortcut, active && styles.shortcutActive]}
              onPress={() => {
                setDraftDate(shortcut.date);
                setCursor(toDate(shortcut.date));
              }}
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

      {/* Una sola cabecera. El mes salía cuatro veces —subtítulo, título grande, dentro del
          calendario y otra vez implícito en las flechas— y había dos formas de cambiarlo. */}
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
            const value = format(new Date(cursor.getFullYear(), cursor.getMonth(), day), "yyyy-MM-dd");
            const selected = value === draftDate;
            const blocked = isBlocked(day);
            return (
              <TouchableOpacity
                key={dayIndex}
                style={styles.day}
                onPress={() => setDraftDate(value)}
                disabled={blocked}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: blocked }}
              >
                {/* El día elegido, en hueso sólido con el número en tinta. En menta se leía como
                    plata que entra, y esto no es una cifra: es "esto es lo que tocaste". */}
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

      {draftTime != null ? (
        <TouchableOpacity
          style={styles.hourRow}
          onPress={() => {
            setHourDraft(timeToDate(draftTime));
            setHourOpen(true);
          }}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Hora: ${draftTime}`}
        >
          <Text style={styles.hourLabel}>Hora</Text>
          <Text style={styles.hourValue}>{draftTime}</Text>
          <ChevronRight size={16} color={COLORS.storm} />
        </TouchableOpacity>
      ) : null}

      {/* La hora también en hoja, por la misma regla: el chevrón de arriba prometía llevar a algún
          sitio. Android abre su reloj nativo, que ya es una capa propia. */}
      {hourOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={hourDraft}
          mode="time"
          is24Hour
          display="clock"
          onChange={(event: DateTimePickerEvent, picked?: Date) => {
            setHourOpen(false);
            if (event.type === "set" && picked) setDraftTime(dateToTime(picked));
          }}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <InlineFormSheet
          visible={hourOpen}
          title="Hora"
          onBack={() => setHourOpen(false)}
          height="52%"
          footer={
            <Button
              label={`Usar ${dateToTime(hourDraft)}`}
              size="lg"
              onPress={() => {
                setDraftTime(dateToTime(hourDraft));
                setHourOpen(false);
              }}
            />
          }
        >
          <DateTimePicker
            value={hourDraft}
            mode="time"
            is24Hour
            display="spinner"
            themeVariant="dark"
            onChange={(_event, picked?: Date) => {
              if (picked) setHourDraft(picked);
            }}
          />
        </InlineFormSheet>
      ) : null}
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
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
  shortcutActive: { borderColor: COLORS.ink, borderWidth: 1.5 },
  shortcutText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  shortcutTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
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
  day: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 3 },
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
    marginTop: SPACING.md,
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
