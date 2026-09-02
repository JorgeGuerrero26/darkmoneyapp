import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { Button } from "./Button";
import { DateTimeCalendar } from "./DateTimeCalendar";
import { InlineFormSheet } from "./InlineFormSheet";
import { dateTimeLabel } from "../../lib/calendar";
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
 * Elegir fecha y hora, en una sola hoja en capa.
 *
 * **La regla que la trae** (revisión 21): una fila con chevrón abre una hoja; **nada se despliega
 * hacia abajo dentro del formulario**. La fila "Fecha y hora" revelaba dos campos —FECHA y HORA—
 * y cada uno abría *su* selector: tres representaciones del mismo dato apiladas y dos toques de
 * más antes de ver un calendario. Y un acordeón dentro de una hoja reacomoda el formulario bajo
 * el dedo, así que uno pierde de vista dónde estaba.
 *
 * **Fecha y hora son un dato, no dos.** La fila los enseña juntos —"Hoy, 16:07"—, así que la hoja
 * los resuelve juntos: calendario arriba, la hora como fila al pie, y **un solo botón** que dice
 * lo que va a pasar. Antes eran dos maneras distintas de cerrar en campos hermanos: "✓ Listo"
 * arriba en fecha, "Cancelar / Confirmar" abajo en hora.
 *
 * Esta es la variante en capa, para los formularios que **ya son un sheet**. La otra —el modal de
 * `DatePickerInput`— enmarca el mismo `DateTimeCalendar`.
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
  const [hourOpen, setHourOpen] = useState(false);
  const [hourDraft, setHourDraft] = useState<Date>(() => timeToDate(time));

  // Cada apertura parte del valor que el campo tiene hoy, no del que se miró la última vez.
  useEffect(() => {
    if (!visible) return;
    setDraftDate(date);
    setDraftTime(time);
    setHourOpen(false);
  }, [date, time, visible]);

  const today = useMemo(() => todayPeru(), []);

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
      <DateTimeCalendar
        value={draftDate}
        onChange={setDraftDate}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        time={draftTime}
        onPressTime={() => {
          setHourDraft(timeToDate(draftTime));
          setHourOpen(true);
        }}
      />

      {/* La hora también en hoja, por la misma regla: su chevrón prometía llevar a algún sitio.
          Android abre su reloj nativo, que ya es una capa propia. */}
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
