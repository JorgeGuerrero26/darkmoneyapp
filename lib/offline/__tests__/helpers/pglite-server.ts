/**
 * "Servidor" para las pruebas del motor: PostgreSQL local (PGlite) con las MIGRACIONES REALES de la
 * Fase 1 (supabase/migrations/20261012000*). El motor habla con él por la misma interfaz
 * (`SyncTransport`) que usa contra Supabase, así que la prueba cubre el contrato de punta a punta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PullCursor, PushOp, PushResult, PullResponse, SyncTransport } from "../../sync-types";

const MIGRATIONS = [
  "202610120001_sync_foundation.sql",
  "202610120002_sync_reserve_and_pull.sql",
  "202610120003_sync_push_batch.sql",
];
const PHASE3_MIGRATION = "202610130001_sync_readonly_occurrences.sql";
const PHASE4_MIGRATION = "202610140001_sync_obligations.sql";
const PHASE5_GROUPS_MIGRATION = "202610150003_sync_push_batch_groups.sql";
const PHASE5_INCOME_MIGRATION = "202610160001_sync_income_occurrences_writable.sql";
// Los scripts npm corren desde la raíz del repo (el archivo se ejecuta ya compilado en .tmp).
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export type TestServer = Awaited<ReturnType<typeof createTestServer>>;

export async function createTestServer(options: { phase3?: boolean; phase4?: boolean; groups?: boolean } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.workspace_members (workspace_id bigint, user_id uuid);
    grant select on public.workspace_members to authenticated;
    create function public.is_workspace_member(ws_id bigint) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.workspace_members wm where wm.workspace_id = ws_id and wm.user_id = auth.uid()) $$;
    grant execute on function public.is_workspace_member(bigint) to authenticated;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  `);

  const table = async (name: string, extra = "") => {
    await db.exec(`
      create table public.${name} (
        id bigint generated always as identity primary key,
        workspace_id bigint not null,
        name text not null default '',
        created_by_user_id uuid, updated_by_user_id uuid,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
        ${extra});
      alter table public.${name} enable row level security;
      create policy ${name}_sel on public.${name} for select to authenticated using (public.is_workspace_member(workspace_id));
      create policy ${name}_ins on public.${name} for insert to authenticated with check (public.is_workspace_member(workspace_id));
      create policy ${name}_upd on public.${name} for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
      create policy ${name}_del on public.${name} for delete to authenticated using (public.is_workspace_member(workspace_id));
      grant select, insert, update, delete on public.${name} to authenticated;
      create trigger trg_${name}_updated_at before update on public.${name} for each row execute function public.set_updated_at();`);
  };
  await table("accounts", `, type text not null default 'cash', currency_code text not null default 'PEN', opening_balance numeric(14,2) not null default 0`);
  await table("categories");
  await table("counterparties");
  for (const name of [
    "counterparty_roles", "spend_types", "budgets", "subscriptions", "recurring_income", "movement_templates", "workspace_financial_goals",
  ]) await table(name);
  await table(
    "movements",
    `, movement_type text not null, status text not null default 'posted', occurred_at timestamptz not null,
       description text not null default '', notes text,
       source_account_id bigint references public.accounts(id) on delete set null,
       destination_account_id bigint references public.accounts(id) on delete set null,
       source_amount numeric(14,2), destination_amount numeric(14,2), fx_rate numeric(18,8),
       category_id bigint references public.categories(id) on delete set null, spend_type_id bigint,
       counterparty_id bigint references public.counterparties(id) on delete set null,
       obligation_id bigint, subscription_id bigint, metadata jsonb not null default '{}', client_dedupe_key text`,
  );
  // Obligaciones como en producción: contactos RESTRICT, cuenta de liquidación SET NULL, enums como texto.
  await table(
    "obligations",
    `, title text not null default '', direction text not null default 'receivable', origin_type text not null default 'manual',
       status text not null default 'active',
       counterparty_id bigint not null references public.counterparties(id) on delete restrict,
       settlement_account_id bigint references public.accounts(id) on delete set null,
       currency_code text not null default 'PEN', principal_amount numeric(18,2) not null default 0,
       start_date date not null default current_date, due_date date, installment_amount numeric(18,2), installment_count integer,
       interest_rate numeric, description text, notes text, client_dedupe_key text, payment_plan jsonb`,
  );
  await db.exec(`create unique index obligations_dedupe_uq on public.obligations(workspace_id, client_dedupe_key) where client_dedupe_key is not null`);
  await db.exec("create unique index movements_dedupe_uq on public.movements(workspace_id, client_dedupe_key) where client_dedupe_key is not null");
  await db.exec("drop trigger trg_spend_types_updated_at on public.spend_types; drop trigger trg_movement_templates_updated_at on public.movement_templates;");
  await db.exec(`
    create table recurring_income_occurrences (
      id bigint generated always as identity primary key, workspace_id bigint not null,
      recurring_income_id bigint not null references recurring_income(id) on delete cascade,
      expected_date date not null, actual_date date, amount numeric(18,4) not null,
      currency_code text not null, movement_id bigint references movements(id) on delete set null,
      status text not null, notes text, created_at timestamptz not null default now());
    alter table recurring_income_occurrences enable row level security;
    create policy income_occ_sel on recurring_income_occurrences for select to authenticated using (is_workspace_member(workspace_id));
    create policy income_occ_ins on recurring_income_occurrences for insert to authenticated with check (is_workspace_member(workspace_id));
    create policy income_occ_upd on recurring_income_occurrences for update to authenticated using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
    create policy income_occ_del on recurring_income_occurrences for delete to authenticated using (is_workspace_member(workspace_id));
    grant select, insert, update, delete on recurring_income_occurrences to authenticated;
    create table subscription_occurrences (
      id bigint generated always as identity primary key,
      subscription_id bigint not null references subscriptions(id) on delete cascade,
      due_date date not null, expected_amount numeric(14,2) not null, status text not null default 'scheduled',
      movement_id bigint references movements(id) on delete set null, paid_at timestamptz, notes text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(subscription_id, due_date));
    alter table subscription_occurrences enable row level security;
    create policy sub_occ_sel on subscription_occurrences for select to authenticated using (
      exists(select 1 from subscriptions s where s.id = subscription_id and is_workspace_member(s.workspace_id)));
    grant select on subscription_occurrences to authenticated;
  `);
  for (const file of MIGRATIONS) await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  if (options.phase3 !== false) await db.exec(readFileSync(join(MIGRATIONS_DIR, PHASE3_MIGRATION), "utf8"));
  if (options.phase4 !== false) await db.exec(readFileSync(join(MIGRATIONS_DIR, PHASE4_MIGRATION), "utf8"));
  if (options.groups !== false) await db.exec(readFileSync(join(MIGRATIONS_DIR, PHASE5_GROUPS_MIGRATION), "utf8"));
  if (options.groups !== false) await db.exec(readFileSync(join(MIGRATIONS_DIR, PHASE5_INCOME_MIGRATION), "utf8"));

  // Una sola conexión: cada llamada fija usuario + rol y los restablece, bajo un candado.
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };

  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return exclusive(async () => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      await db.exec("set role authenticated");
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
      }
    });
  }

  const call = async <T>(userId: string, sql: string, params: unknown[]): Promise<T> =>
    asUser(userId, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);

  function transportFor(userId: string, hooks: { failPush?: () => boolean; failAll?: () => boolean } = {}): SyncTransport {
    const guard = () => {
      if (hooks.failAll?.()) throw new Error("Network request failed");
    };
    return {
      async pullSubscriptionOccurrences(workspaceId, cursor, limit) {
        guard();
        if (options.phase3 === false) return null;
        return call(userId, "select pull_subscription_occurrences($1,$2::jsonb,$3) r", [workspaceId, JSON.stringify(cursor), limit]);
      },
      async reserveIds(workspaceId, tableName, count) {
        guard();
        return (await call<number[]>(userId, "select public.reserve_ids($1, $2, $3) as r", [workspaceId, tableName, count])).map(Number);
      },
      async pullChanges(workspaceId, cursors: Record<string, PullCursor>, tables, limit) {
        guard();
        return call<PullResponse>(userId, "select public.pull_changes($1, $2::jsonb, $3::text[], $4) as r", [
          workspaceId,
          JSON.stringify(cursors),
          [...tables],
          limit,
        ]);
      },
      async liveIds(workspaceId, tables) {
        guard();
        const result = await call<{ ids: Record<string, number[]> }>(userId, "select public.sync_live_ids($1, $2::text[]) as r", [
          workspaceId,
          [...tables],
        ]);
        return result.ids;
      },
      async pushBatch(ops: PushOp[]) {
        guard();
        if (hooks.failPush?.()) throw new Error("Network request failed");
        return call<PushResult[]>(userId, "select public.push_batch($1::jsonb) as r", [JSON.stringify(ops)]);
      },
    };
  }

  return {
    db,
    transportFor,
    asUser,
    /** Como el dueño de la base (sin RLS): para preparar y comprobar datos. */
    admin: {
      query: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => exclusive(() => db.query<T>(sql, params)),
      exec: (sql: string) => exclusive(() => db.exec(sql)),
    },
    async addMember(workspaceId: number, userId: string) {
      await exclusive(() => db.query("insert into public.workspace_members values ($1, $2)", [workspaceId, userId]));
    },
    async close() {
      await db.close();
    },
  };
}
