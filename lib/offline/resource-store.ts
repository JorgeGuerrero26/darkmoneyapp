import { getServerShapedRow, upsertMirrorRows, deleteMirrorRows, type ServerRow } from "./movement-store";
import { assertWritableMoney } from "./money";
import { isMirroredTable, type MirroredTable } from "./schema";
import type { SqlExecutor } from "./sql-driver";

/** Nunca leer metas ajenas aunque compartan workspace; la base ya está separada por usuario. */
export async function listRowsLocal(db: SqlExecutor, table: MirroredTable, workspaceId: number, userId: string): Promise<ServerRow[]> {
  if (!isMirroredTable(table)) throw new Error("Tabla no disponible sin conexión.");
  const rows = await db.all<{ data: string }>(`select data from ${table} where workspace_id = ? order by id`, [workspaceId]);
  return rows.map(row => JSON.parse(row.data) as ServerRow)
    .filter(row => table !== "workspace_financial_goals" || row.user_id === userId);
}

export async function getRowLocal(db: SqlExecutor, table: MirroredTable, workspaceId: number, id: number, userId: string): Promise<ServerRow | null> {
  const row = await getServerShapedRow(db, table, id);
  return row?.workspace_id === workspaceId && (table !== "workspace_financial_goals" || row.user_id === userId) ? row : null;
}

export function hasFractionalMoney(row: ServerRow): boolean {
  try { assertWritableMoney(row); return false; } catch { return true; }
}

/** Relaciones verificadas en 3.0; las obligaciones todavía no son parte del espejo. */
const REFERENCES: Array<[MirroredTable, string, MirroredTable, "null" | "cascade"]> = [
  ["budgets", "account_id", "accounts", "null"], ["budgets", "category_id", "categories", "null"],
  ["budgets", "spend_type_id", "spend_types", "null"], ["categories", "parent_id", "categories", "null"],
  ["categories", "default_spend_type_id", "spend_types", "null"], ["counterparty_roles", "counterparty_id", "counterparties", "cascade"],
  ["movement_templates", "source_account_id", "accounts", "null"], ["movement_templates", "destination_account_id", "accounts", "null"],
  ["movement_templates", "category_id", "categories", "null"], ["movement_templates", "counterparty_id", "counterparties", "null"],
  ["movements", "source_account_id", "accounts", "null"], ["movements", "destination_account_id", "accounts", "null"],
  ["movements", "category_id", "categories", "null"], ["movements", "counterparty_id", "counterparties", "null"],
  ["movements", "spend_type_id", "spend_types", "null"], ["movements", "subscription_id", "subscriptions", "null"],
  ["recurring_income", "account_id", "accounts", "null"], ["recurring_income", "category_id", "categories", "null"],
  ["recurring_income", "payer_party_id", "counterparties", "null"], ["subscriptions", "account_id", "accounts", "null"],
  ["subscriptions", "category_id", "categories", "null"], ["subscriptions", "vendor_party_id", "counterparties", "null"],
  ["recurring_income_occurrences", "recurring_income_id", "recurring_income", "cascade"],
  ["subscription_occurrences", "subscription_id", "subscriptions", "cascade"], ["obligations", "settlement_account_id", "accounts", "null"],
  ["recurring_income_occurrences", "movement_id", "movements", "null"], ["subscription_occurrences", "movement_id", "movements", "null"],
];

/** Efectos derivados del borrado del padre; no son escrituras directas de un historial readonly. */
export async function applyMirrorDeleteRelations(db: SqlExecutor, table: MirroredTable, ids: number[]): Promise<void> {
  for (const [child, column, parent, action] of REFERENCES) {
    if (parent !== table) continue;
    for (const id of ids) {
      const matches = await db.all<{ data: string }>(`select data from ${child} where json_extract(data, '$.${column}') = ?`, [id]);
      const rows = matches.map(row => JSON.parse(row.data) as ServerRow);
      if (action === "cascade") await deleteMirrorRows(db, child, rows.map(row => row.id));
      else await upsertMirrorRows(db, child, rows.map(row => ({ ...row, [column]: null })));
    }
  }
}
