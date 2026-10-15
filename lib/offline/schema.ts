import type { SqlDriver } from "./sql-driver";
import { exactCents, mirrorMoney } from "./money";

/** Tablas del servidor que se reflejan en local. Lista cerrada: se interpola en SQL. */
export const WRITABLE_RESOURCE_TABLES = ["accounts", "categories", "counterparties", "counterparty_roles", "spend_types",
  "budgets", "subscriptions", "recurring_income", "movement_templates", "workspace_financial_goals", "obligations"] as const;
export type WritableResourceTable = (typeof WRITABLE_RESOURCE_TABLES)[number];
export const DIRECT_MIRRORED_TABLES = ["movements", ...WRITABLE_RESOURCE_TABLES, "recurring_income_occurrences"] as const;
export const MIRRORED_TABLES = [...DIRECT_MIRRORED_TABLES, "subscription_occurrences"] as const;
export type MirroredTable = (typeof MIRRORED_TABLES)[number];

export function isWritableResourceTable(value: string): value is WritableResourceTable {
  return (WRITABLE_RESOURCE_TABLES as readonly string[]).includes(value);
}

export function isMirroredTable(value: string): value is MirroredTable {
  return (MIRRORED_TABLES as readonly string[]).includes(value);
}

/**
 * Migraciones de la base local, en orden. El número de versión vive en `PRAGMA user_version`.
 * Nunca se edita una migración ya publicada: se añade otra al final.
 *
 * Dinero: los montos de `movements` se guardan también en centavos enteros (`*_cents`) para
 * sumar y comparar sin errores de coma flotante; la fila completa del servidor queda en `data`.
 */
const MIGRATIONS: string[] = [
  `
  create table meta (key text primary key, value text not null);

  create table movements (
    id integer primary key,
    workspace_id integer not null,
    movement_type text not null,
    status text not null,
    occurred_at text not null,
    description text not null default '',
    description_lc text not null default '',
    source_account_id integer,
    destination_account_id integer,
    category_id integer,
    counterparty_id integer,
    source_cents integer,
    destination_cents integer,
    updated_at text not null,
    data text not null
  );
  create index movements_ws_date_idx on movements (workspace_id, occurred_at desc, id desc);
  create index movements_source_idx on movements (source_account_id);
  create index movements_destination_idx on movements (destination_account_id);

  create table accounts (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null);
  create table categories (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null);
  create table counterparties (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null);

  create table outbox (
    seq integer primary key autoincrement,
    op_id text not null unique,
    table_name text not null,
    kind text not null,
    workspace_id integer not null,
    row_id integer not null,
    fields text not null default '{}',
    base_updated_at text,
    created_at text not null,
    attempts integer not null default 0,
    next_attempt_at text,
    status text not null default 'pending'
  );
  create index outbox_status_idx on outbox (status, seq);
  create index outbox_row_idx on outbox (table_name, row_id);

  create table sync_cursors (
    workspace_id integer not null,
    table_name text not null,
    since text,
    after_id integer not null default 0,
    primary key (workspace_id, table_name)
  );

  create table id_pool (
    workspace_id integer not null,
    table_name text not null,
    id integer not null,
    primary key (workspace_id, table_name, id)
  );

  create table inbox (
    id integer primary key autoincrement,
    op_id text not null,
    table_name text not null,
    row_id integer,
    kind text not null,
    status text not null,
    code text,
    message text,
    previous text,
    summary text,
    created_at text not null,
    resolved integer not null default 0
  );
  create index inbox_open_idx on inbox (resolved, id);
  `,
  `
  -- v2: sin tocar el texto de la migracion v1.
  alter table accounts add column money_cents integer;
  alter table categories add column money_cents integer;
  alter table counterparties add column money_cents integer;
  create table counterparty_roles (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index counterparty_roles_ws_idx on counterparty_roles (workspace_id, updated_at, id);
  create table spend_types (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index spend_types_ws_idx on spend_types (workspace_id, updated_at, id);
  create table budgets (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index budgets_ws_idx on budgets (workspace_id, updated_at, id);
  create table subscriptions (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index subscriptions_ws_idx on subscriptions (workspace_id, updated_at, id);
  create table recurring_income (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index recurring_income_ws_idx on recurring_income (workspace_id, updated_at, id);
  create table movement_templates (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index movement_templates_ws_idx on movement_templates (workspace_id, updated_at, id);
  create table workspace_financial_goals (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index workspace_financial_goals_ws_idx on workspace_financial_goals (workspace_id, updated_at, id);
  create table recurring_income_occurrences (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index recurring_income_occurrences_ws_idx on recurring_income_occurrences (workspace_id, updated_at, id);
  create table subscription_occurrences (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index subscription_occurrences_ws_idx on subscription_occurrences (workspace_id, updated_at, id);
  create index sub_occ_parent_idx on subscription_occurrences (json_extract(data, '$.subscription_id'));
  `,
  `
  -- v3 (Fase 4): obligaciones como definiciones sincronizables. Los eventos/pagos no se reflejan.
  create table obligations (id integer primary key, workspace_id integer not null, updated_at text not null, data text not null, money_cents integer);
  create index obligations_ws_idx on obligations (workspace_id, updated_at, id);
  create index obligations_counterparty_idx on obligations (json_extract(data, '$.counterparty_id'));
  `,
  `
  -- v4 (Fase 5.1): operaciones atómicas de grupo. Las que comparten group_id viajan y se aplican todas o ninguna.
  alter table outbox add column group_id text;
  alter table outbox add column group_size integer;
  create index outbox_group_idx on outbox (group_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDriver): Promise<void> {
  const row = await db.get<{ user_version: number }>("pragma user_version");
  const current = Number(row?.user_version ?? 0);
  if (current > SCHEMA_VERSION) {
    // Una versión futura de la app dejó la base más nueva que este código: no tocarla.
    throw new Error(`La base local es más nueva (v${current}) que la app (v${SCHEMA_VERSION}).`);
  }
  for (let version = current; version < SCHEMA_VERSION; version++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[version]);
      if (version === 1) {
        // Las cuentas ya descargadas por v1 también deben conservar sus montos como texto.
        const accounts = await tx.all<{ id: number; data: string }>("select id,data from accounts");
        for (const account of accounts) {
          const row = mirrorMoney(JSON.parse(account.data));
          await tx.run("update accounts set data=?,money_cents=? where id=?", [JSON.stringify(row), exactCents(row.opening_balance), account.id]);
        }
      }
      await tx.exec(`pragma user_version = ${version + 1}`);
    });
  }
}
