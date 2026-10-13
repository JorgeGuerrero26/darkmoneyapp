import { filterDateFrom, isoToDateStr } from "../../../lib/date";

/** Half-open calendar day in Peru, independent of the device's timezone. */
export function detectionDuplicateBounds(occurredAt: string) {
  if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("Revisa la fecha para comprobar coincidencias.");
  const from = new Date(filterDateFrom(isoToDateStr(occurredAt))).toISOString();
  return { from, to: new Date(Date.parse(from) + 86400000).toISOString() };
}
