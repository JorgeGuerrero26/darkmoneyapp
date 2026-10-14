import { offlineRuntime } from "./instance";
import type { MirroredTable } from "./schema";

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "");
const num = (value: unknown) => Number(value ?? 0);

/**
 * Mismo orden que las consultas del snapshot al servidor (`.order(...)`), para que la lista no se
 * reordene al pasar de la copia del servidor a la local.
 */
const ORDER: Partial<Record<MirroredTable, (a: Row, b: Row) => number>> = {
  accounts: (a, b) => num(a.sort_order) - num(b.sort_order),
  categories: (a, b) => num(a.sort_order) - num(b.sort_order) || text(a.name).localeCompare(text(b.name)),
  counterparties: (a, b) =>
    Number(Boolean(a.is_archived)) - Number(Boolean(b.is_archived)) ||
    Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
    text(a.name).localeCompare(text(b.name)),
  subscriptions: (a, b) => text(a.next_due_date).localeCompare(text(b.next_due_date)),
  recurring_income: (a, b) => text(a.next_expected_date).localeCompare(text(b.next_expected_date)),
};

/**
 * Filas de una tabla desde la base local cuando está lista y descargada; si no, las del servidor
 * tal cual. La copia local = servidor + lo que todavía no se envió, así que un refetch no hace
 * "desaparecer" lo recién creado (el servidor aún no lo conoce).
 */
export async function withLocalRows<T>(workspaceId: number, table: MirroredTable, serverRows: T[]): Promise<T[]> {
  try {
    const local = await offlineRuntime.listRows(workspaceId, table);
    if (!local) return serverRows;
    const compare = ORDER[table];
    const rows = [...local] as Row[];
    if (compare) rows.sort(compare);
    return rows as unknown as T[];
  } catch {
    return serverRows;
  }
}
