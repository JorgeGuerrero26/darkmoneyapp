import { parseFormAmountInput } from "../../../lib/form-field-rules";
/**
 * Cambios de monto programados de un ingreso fijo: "desde enero gano 5.000".
 *
 * RN-free. Vive en la base como `[{effective_date, amount}]` y en la app como
 * `[{effectiveDate, amount}]`; este módulo es el único que conoce las dos formas.
 * `amount` es lo que LLEGA a la cuenta (neto), igual que el monto del ingreso: la app no
 * calcula retenciones.
 */
export type ScheduledChange = { effectiveDate: string; amount: number };
export type ScheduledChangeRow = { effective_date: string; amount: number };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function valid(change: ScheduledChange): boolean {
  return YMD.test(change.effectiveDate) && Number.isFinite(change.amount) && change.amount > 0;
}

/** Más viejo primero, y una sola entrada por fecha (la última escrita gana). */
export function normalizeScheduledChanges(changes: readonly ScheduledChange[] | null | undefined): ScheduledChange[] {
  const byDate = new Map<string, ScheduledChange>();
  for (const change of changes ?? []) {
    if (valid(change)) byDate.set(change.effectiveDate, { effectiveDate: change.effectiveDate, amount: change.amount });
  }
  return [...byDate.values()].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/** Lo que llega de la base (jsonb) → lo que usa la app. Lo ilegible se descarta, no rompe. */
export function parseScheduledChanges(raw: unknown): ScheduledChange[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledChange[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    out.push({ effectiveDate: String(r.effective_date ?? ""), amount: Number(r.amount) });
  }
  return normalizeScheduledChanges(out);
}

/** Lo que usa la app → lo que se guarda. */
export function toScheduledChangesRows(changes: readonly ScheduledChange[] | null | undefined): ScheduledChangeRow[] {
  return normalizeScheduledChanges(changes).map((c) => ({ effective_date: c.effectiveDate, amount: c.amount }));
}

/** Los que todavía no rigen (fecha posterior a hoy): lo que el detalle muestra como "próximos". */
export function upcomingScheduledChanges(changes: readonly ScheduledChange[], todayIso: string): ScheduledChange[] {
  return normalizeScheduledChanges(changes).filter((c) => c.effectiveDate > todayIso);
}

/** Lo que se teclea en el formulario: fecha y monto como texto, con una llave para la lista. */
export type ScheduledChangeDraft = { key: string; date: string; amount: string };

export function toChangeDrafts(changes: readonly ScheduledChange[] | null | undefined): ScheduledChangeDraft[] {
  return normalizeScheduledChanges(changes).map((c, index) => ({
    key: `sc-${index}`,
    date: c.effectiveDate,
    amount: String(c.amount),
  }));
}

/** Del formulario a lo que se guarda. Las filas a medias (sin fecha o sin monto) se descartan. */
export function collectChanges(drafts: readonly ScheduledChangeDraft[]): ScheduledChange[] {
  return normalizeScheduledChanges(
    drafts.map((d) => ({ effectiveDate: d.date.trim(), amount: parseFormAmountInput(d.amount) ?? Number.NaN })),
  );
}
