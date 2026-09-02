import { useState } from "react";

import { DatePickerModal } from "./DatePickerModal";
import { FormOptionRow } from "./FormOptionRow";
import { relativeDateLabel } from "../../lib/calendar";
import { todayPeru } from "../../lib/date";

type Props = {
  label: string;
  /** Frase corta bajo la etiqueta, para lo que el nombre del campo no dice. */
  support?: string;
  /** `yyyy-MM-dd`, o "" si todavía no hay fecha. */
  value: string;
  onChange: (value: string) => void;
  /** Lo que dice la fila cuando no hay fecha, con palabras. */
  placeholder?: string;
  /** Permite dejarla vacía: la hoja ofrece "Quitar". */
  optional?: boolean;
  grouped?: boolean;
  last?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
};

/**
 * Una fecha como fila de tarjeta: enseña el día elegido y abre el calendario al tocarla.
 *
 * Cuatro formularios hacían esto con una fila que **desplegaba el campo de fecha debajo** —y ese
 * campo era otro disparador, así que había que tocar dos veces para ver un calendario, y el
 * formulario se reacomodaba bajo el dedo. Es la regla de la revisión 21: fila con chevrón abre
 * una hoja, nada se despliega hacia abajo.
 */
export function FormDateRow({
  label,
  support,
  value,
  onChange,
  placeholder = "Sin fecha",
  optional = false,
  grouped = false,
  last = false,
  minimumDate,
  maximumDate,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FormOptionRow
        label={label}
        support={support}
        value={value?.trim() ? relativeDateLabel(value, todayPeru()) : null}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        grouped={grouped}
        last={last}
      />
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
    </>
  );
}
