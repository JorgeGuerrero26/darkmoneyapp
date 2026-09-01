import { format } from "date-fns";
import { es } from "date-fns/locale";

import { isoToDateStr, isoToTimeStr, parseDisplayDate, todayPeru } from "../../../lib/date";

type Input = {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUserId?: string | null;
  status?: string | null;
  /** Quién está mirando: decide si se dice "lo creaste" o "se creó". */
  currentUserId?: string | null;
};

/** "hoy, 12:21" · "ayer, 9:03" · "el 15 jul, 12:21". */
function when(iso: string) {
  const day = isoToDateStr(iso);
  const time = isoToTimeStr(iso);
  const today = todayPeru();
  if (day === today) return `hoy, ${time}`;
  const yesterday = new Date(parseDisplayDate(today).getTime() - 86_400_000);
  if (day === format(yesterday, "yyyy-MM-dd")) return `ayer, ${time}`;
  return `el ${format(parseDisplayDate(iso), "d MMM", { locale: es })}, ${time}`;
}

function isValid(iso?: string | null): iso is string {
  return Boolean(iso) && !Number.isNaN(new Date(iso as string).getTime());
}

/**
 * Cuándo se registró el movimiento, en una línea.
 *
 * Era una tarjeta "HISTORIAL" con dos filas y un autor: **"por Sistema"**, que era falso —el
 * chicle lo registró él— y sale de un `created_by` vacío en los movimientos que crea la propia
 * app. Debajo iba "ID: 1078", la clave de la base de datos, centrada al pie de la pantalla.
 *
 * Queda lo único que un usuario puede querer de ahí: cuándo lo creó, y si lo cambió después.
 */
export function movementAuditLine({
  createdAt,
  updatedAt,
  createdByUserId,
  status,
  currentUserId,
}: Input): string | null {
  if (!isValid(createdAt)) return null;

  const mine = Boolean(createdByUserId && currentUserId && createdByUserId === currentUserId);
  if (status === "voided" && isValid(updatedAt)) return `Anulado ${when(updatedAt)}`;

  const created = `${mine ? "Lo creaste" : "Se creó"} ${when(createdAt)}`;
  if (isValid(updatedAt) && updatedAt !== createdAt) return `${created} · editado ${when(updatedAt)}`;
  return created;
}
