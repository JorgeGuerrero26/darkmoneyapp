import { memo } from "react";
import { StyleSheet, Text } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
import { isoToDateStr, isoToTimeStr, parseDisplayDate, todayPeru } from "../../../../lib/date";

type Props = {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  status?: string | null;
  /** Quién está mirando la pantalla: decide si se dice "lo creaste" o "se creó". */
  currentUserId?: string | null;
};

/** "hoy a las 12:21", "ayer a las 9:03", "el 15 jul a las 12:21". */
function when(iso: string) {
  const day = isoToDateStr(iso);
  const time = isoToTimeStr(iso);
  const today = todayPeru();
  if (day === today) return `hoy a las ${time}`;
  const yesterday = new Date(parseDisplayDate(today).getTime() - 86_400_000);
  if (day === format(yesterday, "yyyy-MM-dd")) return `ayer a las ${time}`;
  return `el ${format(parseDisplayDate(iso), "d MMM", { locale: es })} a las ${time}`;
}

function isValid(iso?: string | null): iso is string {
  return Boolean(iso) && !Number.isNaN(new Date(iso as string).getTime());
}

/**
 * Cuándo se registró el movimiento, en una línea gris.
 *
 * Era una tarjeta "HISTORIAL" con dos filas y un autor: **"por Sistema"**, que era falso —el
 * chicle lo registró él— y sale de un `created_by` vacío en los movimientos que crea la propia
 * app. Debajo iba "ID: 1078", la clave de la base de datos, centrada al pie de la pantalla.
 *
 * Queda lo único que un usuario puede querer de ahí: cuándo lo creó, y si lo editó después.
 */
export const MovementAuditLog = memo(function MovementAuditLog({
  createdAt,
  updatedAt,
  createdByUserId,
  status,
  currentUserId,
}: Props) {
  if (!isValid(createdAt)) return null;

  const mine = Boolean(createdByUserId && currentUserId && createdByUserId === currentUserId);
  const parts = [`${mine ? "Lo creaste" : "Se creó"} ${when(createdAt)}.`];

  if (isValid(updatedAt) && updatedAt !== createdAt) {
    parts.push(status === "voided" ? `Anulado ${when(updatedAt)}.` : `Editado ${when(updatedAt)}.`);
  }

  return <Text style={styles.line}>{parts.join(" ")}</Text>;
});

const styles = StyleSheet.create({
  line: {
    marginTop: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
