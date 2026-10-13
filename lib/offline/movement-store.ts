import { applyMovementFilters, type MovementFilters } from "../../features/movements/lib/filters";
import type { MovementRecord } from "../../types/domain";
import { isMirroredTable, type MirroredTable } from "./schema";
import type { SqlExecutor, SqlParam } from "./sql-driver";
import { SqlFilterBuilder } from "./sql-filter-builder";

/** Fila tal como la devuelve el servidor (`to_jsonb`): nombres de columna de la base. */
export type ServerRow = Record<string, unknown> & { id: number; workspace_id: number; updated_at: string };

export function toCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  return Math.round(Number(value) * 100);
}

/** Normaliza a ISO UTC con milisegundos: comparar el texto es comparar el instante. */
export function normalizeIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

export async function upsertMovementRows(db: SqlExecutor, rows: ServerRow[]): Promise<void> {
  for (const row of rows) {
    const description = typeof row.description === "string" ? row.description : "";
    await db.run(
      `insert or replace into movements
       (id, workspace_id, movement_type, status, occurred_at, description, description_lc,
        source_account_id, destination_account_id, category_id, counterparty_id,
        source_cents, destination_cents, updated_at, data)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(row.id),
        Number(row.workspace_id),
        String(row.movement_type),
        String(row.status),
        normalizeIso(row.occurred_at),
        description,
        description.toLowerCase(),
        row.source_account_id == null ? null : Number(row.source_account_id),
        row.destination_account_id == null ? null : Number(row.destination_account_id),
        row.category_id == null ? null : Number(row.category_id),
        row.counterparty_id == null ? null : Number(row.counterparty_id),
        toCents(row.source_amount),
        toCents(row.destination_amount),
        String(row.updated_at),
        JSON.stringify(row),
      ],
    );
  }
}

export async function upsertMirrorRows(db: SqlExecutor, table: MirroredTable, rows: ServerRow[]): Promise<void> {
  if (table === "movements") return upsertMovementRows(db, rows);
  for (const row of rows) {
    await db.run(`insert or replace into ${table} (id, workspace_id, updated_at, data) values (?, ?, ?, ?)`, [
      Number(row.id),
      Number(row.workspace_id),
      String(row.updated_at),
      JSON.stringify(row),
    ]);
  }
}

export async function deleteMirrorRows(db: SqlExecutor, table: string, ids: number[]): Promise<void> {
  if (!isMirroredTable(table)) throw new Error(`Tabla no reflejada en local: ${table}`);
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200);
    await db.run(`delete from ${table} where id in (${chunk.map(() => "?").join(", ")})`, chunk);
  }
}

export async function localIds(db: SqlExecutor, table: string, workspaceId: number): Promise<number[]> {
  if (!isMirroredTable(table)) throw new Error(`Tabla no reflejada en local: ${table}`);
  const rows = await db.all<{ id: number }>(`select id from ${table} where workspace_id = ?`, [workspaceId]);
  return rows.map((row) => Number(row.id));
}

export async function getServerShapedRow(db: SqlExecutor, table: string, id: number): Promise<ServerRow | null> {
  if (!isMirroredTable(table)) throw new Error(`Tabla no reflejada en local: ${table}`);
  const row = await db.get<{ data: string }>(`select data from ${table} where id = ?`, [id]);
  return row ? (JSON.parse(row.data) as ServerRow) : null;
}

// ─── Lectura: MovementRecord ─────────────────────────────────────────────────────────────────

type AccountSide = { name: string | null; currency: string | null };

function mapRecord(
  row: ServerRow,
  source: AccountSide,
  destination: AccountSide,
  names: { category: string; counterparty: string },
  detail: boolean,
): MovementRecord {
  // Mismas expresiones que fetchMovementsPage / useMovementQuery (services/queries/movements.ts),
  // incluido que un monto 0 se lee como null: la pantalla ya cuenta con ese comportamiento.
  const record: MovementRecord = {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    movementType: row.movement_type as MovementRecord["movementType"],
    status: row.status as MovementRecord["status"],
    description: row.description as string,
    notes: (row.notes as string | null) ?? null,
    category: names.category,
    categoryId: (row.category_id as number | null) ?? null,
    spendTypeId: (row.spend_type_id as number | null) ?? null,
    counterparty: names.counterparty,
    counterpartyId: (row.counterparty_id as number | null) ?? null,
    occurredAt: row.occurred_at as string,
    sourceAccountId: (row.source_account_id as number | null) ?? null,
    sourceAccountName: source.name,
    sourceCurrencyCode: source.currency,
    sourceAmount: row.source_amount ? Number(row.source_amount) : null,
    destinationAccountId: (row.destination_account_id as number | null) ?? null,
    destinationAccountName: destination.name,
    destinationCurrencyCode: destination.currency,
    destinationAmount: row.destination_amount ? Number(row.destination_amount) : null,
    fxRate: row.fx_rate ? Number(row.fx_rate) : null,
    obligationId: (row.obligation_id as number | null) ?? null,
    subscriptionId: (row.subscription_id as number | null) ?? null,
    metadata: (row.metadata as MovementRecord["metadata"]) ?? null,
  };
  if (detail) {
    record.createdAt = (row.created_at as string | null) ?? null;
    record.updatedAt = (row.updated_at as string | null) ?? null;
    record.createdByUserId = (row.created_by_user_id as string | null) ?? null;
    record.updatedByUserId = (row.updated_by_user_id as string | null) ?? null;
  }
  return record;
}

type JoinedRow = {
  data: string;
  s_name: string | null;
  s_cur: string | null;
  d_name: string | null;
  d_cur: string | null;
  c_name: string | null;
  p_name: string | null;
};

const SELECT_JOINED = `
  select m.data as data,
    json_extract(sa.data, '$.name') as s_name, json_extract(sa.data, '$.currency_code') as s_cur,
    json_extract(da.data, '$.name') as d_name, json_extract(da.data, '$.currency_code') as d_cur,
    json_extract(c.data, '$.name') as c_name, json_extract(p.data, '$.name') as p_name
  from movements m
  left join accounts sa on sa.id = m.source_account_id
  left join accounts da on da.id = m.destination_account_id
  left join categories c on c.id = m.category_id
  left join counterparties p on p.id = m.counterparty_id`;

function fromJoined(row: JoinedRow, detail: boolean): MovementRecord {
  return mapRecord(
    JSON.parse(row.data) as ServerRow,
    { name: row.s_name, currency: row.s_cur },
    { name: row.d_name, currency: row.d_cur },
    // La lista del servidor deja category/counterparty vacíos (las pantallas los resuelven con el
    // snapshot); el detalle sí trae los nombres.
    { category: detail ? (row.c_name ?? "") : "", counterparty: detail ? (row.p_name ?? "") : "" },
    detail,
  );
}

export type LocalMovementPage = { data: MovementRecord[]; hasMore: boolean; nextPage: number };

export async function listMovementRecords(
  db: SqlExecutor,
  workspaceId: number,
  filters: MovementFilters,
  page: number,
  pageSize: number,
): Promise<LocalMovementPage> {
  const builder = applyMovementFilters(new SqlFilterBuilder("m"), filters);
  const where = builder.where();
  const sql = `${SELECT_JOINED}
    where m.workspace_id = ?${where.sql}
    order by m.occurred_at desc, m.id desc limit ? offset ?`;
  const params: SqlParam[] = [workspaceId, ...where.params, pageSize, page * pageSize];
  const rows = await db.all<JoinedRow>(sql, params);
  const data = rows.map((row) => fromJoined(row, false));
  return { data, hasMore: data.length === pageSize, nextPage: page + 1 };
}

export async function getMovementRecord(db: SqlExecutor, id: number): Promise<MovementRecord | null> {
  const row = await db.get<JoinedRow>(`${SELECT_JOINED} where m.id = ?`, [id]);
  return row ? fromJoined(row, true) : null;
}

// ─── Saldos ──────────────────────────────────────────────────────────────────────────────────

export type LocalAccountBalance = {
  accountId: number;
  totalIn: number;
  totalOut: number;
  currentBalance: number;
};

/**
 * Saldo por cuenta: apertura + entradas − salidas de los movimientos `posted`.
 * Misma regla que `v_account_balances`; comparada contra el servidor en la prueba de paridad.
 * Se calcula en centavos enteros y se devuelve en unidades.
 */
export async function computeAccountBalances(db: SqlExecutor, workspaceId: number): Promise<LocalAccountBalance[]> {
  const accounts = await db.all<{ id: number; data: string }>(`select id, data from accounts where workspace_id = ?`, [
    workspaceId,
  ]);
  const incoming = await db.all<{ id: number; total: number | null }>(
    `select destination_account_id as id, sum(destination_cents) as total from movements
     where workspace_id = ? and status = 'posted' and destination_account_id is not null group by 1`,
    [workspaceId],
  );
  const outgoing = await db.all<{ id: number; total: number | null }>(
    `select source_account_id as id, sum(source_cents) as total from movements
     where workspace_id = ? and status = 'posted' and source_account_id is not null group by 1`,
    [workspaceId],
  );
  const inById = new Map(incoming.map((row) => [Number(row.id), Number(row.total ?? 0)]));
  const outById = new Map(outgoing.map((row) => [Number(row.id), Number(row.total ?? 0)]));

  return accounts.map((account) => {
    const id = Number(account.id);
    const opening = toCents((JSON.parse(account.data) as ServerRow).opening_balance) ?? 0;
    const totalIn = inById.get(id) ?? 0;
    const totalOut = outById.get(id) ?? 0;
    return {
      accountId: id,
      totalIn: totalIn / 100,
      totalOut: totalOut / 100,
      currentBalance: (opening + totalIn - totalOut) / 100,
    };
  });
}
