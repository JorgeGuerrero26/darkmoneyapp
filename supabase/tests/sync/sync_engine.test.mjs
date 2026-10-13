// Pruebas de las migraciones del motor offline (202610120001..3) sobre un PostgreSQL local (PGlite).
// No toca ninguna base real. Ejecutar:
//   npm i --no-save @electric-sql/pglite      (no modifica package.json)
//   node supabase/tests/sync/sync_engine.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "migrations");
const migrations = [
  "202610120001_sync_foundation.sql",
  "202610120002_sync_reserve_and_pull.sql",
  "202610120003_sync_push_batch.sql",
];

const A = "00000000-0000-0000-0000-00000000000a"; // miembro de ws 1
const B = "00000000-0000-0000-0000-00000000000b"; // miembro de ws 1 (otra persona)
const C = "00000000-0000-0000-0000-00000000000c"; // miembro solo de ws 2

const db = new PGlite();
let passed = 0;
let failed = 0;
const check = (name, ok, extra) => {
  if (ok) { passed++; console.log("PASS", name); }
  else { failed++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
};

async function asUser(uid) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec("set role authenticated");
}
async function asAdmin() { await db.exec("reset role"); }
const rpc = async (sql, params) => (await db.query(sql, params)).rows[0];
const expectError = async (name, sql, params, code) => {
  try { await db.query(sql, params); check(name, false, "no lanzó error"); }
  catch (e) { check(name, e.code === code || String(e.message).includes(code), { code: e.code, message: e.message }); }
};

// ---- Entorno mínimo equivalente a Supabase + las tablas sincronizables ----
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
insert into public.workspace_members values (1, '${A}'), (1, '${B}'), (2, '${C}');
`);

const stub = async (t, extra = "") => {
  await db.exec(`
    create table public.${t} (
      id bigint generated always as identity primary key,
      workspace_id bigint not null,
      name text not null default '',
      created_by_user_id uuid, updated_by_user_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      ${extra});
    alter table public.${t} enable row level security;
    create policy ${t}_sel on public.${t} for select to authenticated using (public.is_workspace_member(workspace_id));
    create policy ${t}_ins on public.${t} for insert to authenticated with check (public.is_workspace_member(workspace_id));
    create policy ${t}_upd on public.${t} for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
    create policy ${t}_del on public.${t} for delete to authenticated using (public.is_workspace_member(workspace_id));
    grant select, insert, update, delete on public.${t} to authenticated;
    create trigger trg_${t}_updated_at before update on public.${t} for each row execute function public.set_updated_at();`);
};
await stub("accounts");
await stub("categories");
await stub("counterparties");
await stub("counterparty_roles");
await stub("spend_types");
await stub("budgets");
await stub("subscriptions");
await stub("recurring_income");
await stub("movement_templates");
await stub("workspace_financial_goals");
await stub("movements", `,
  movement_type text not null default 'expense', status text not null default 'posted',
  occurred_at timestamptz not null default now(), description text not null default '',
  source_account_id bigint references public.accounts(id) on delete set null,
  destination_account_id bigint references public.accounts(id) on delete set null,
  source_amount numeric(14,2), destination_amount numeric(14,2), fx_rate numeric(18,8),
  metadata jsonb not null default '{}', client_dedupe_key text`);
await db.exec("create unique index movements_dedupe_uq on public.movements(workspace_id, client_dedupe_key) where client_dedupe_key is not null");
// spend_types y movement_templates en producción NO tienen el trigger: la migración lo crea.
await db.exec("drop trigger trg_spend_types_updated_at on public.spend_types; drop trigger trg_movement_templates_updated_at on public.movement_templates;");

for (const m of migrations) await db.exec(readFileSync(join(migrationsDir, m), "utf8"));
// Re-ejecutar debe ser inocuo (las migraciones son idempotentes).
for (const m of migrations) await db.exec(readFileSync(join(migrationsDir, m), "utf8"));
check("migraciones aplican dos veces sin error", true);

const trg = await rpc("select count(*)::int n from pg_trigger where tgname in ('trg_spend_types_updated_at','trg_movement_templates_updated_at')");
check("triggers updated_at creados en spend_types y movement_templates", trg.n === 2, trg);

// ---- reserve_ids ----
await asUser(A);
const ids = (await rpc("select public.reserve_ids(1, 'movements', 5) ids")).ids;
check("reserve_ids devuelve 5 ids distintos", Array.isArray(ids) && new Set(ids).size === 5, ids);
await expectError("reserve_ids: no miembro -> 42501", "select public.reserve_ids(2, 'movements', 5)", [], "42501");
await expectError("reserve_ids: tabla no sincronizable -> 22023", "select public.reserve_ids(1, 'profiles', 5)", [], "22023");
await expectError("reserve_ids: 501 ids -> 22023", "select public.reserve_ids(1, 'movements', 501)", [], "22023");
await asAdmin(); await db.exec("select set_config('request.jwt.claim.sub', '', false)"); await db.exec("set role authenticated");
await expectError("reserve_ids: sin sesión -> 28000", "select public.reserve_ids(1, 'movements', 5)", [], "28000");

// ---- push_batch ----
const uuid = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;
const push = async (ops) => (await rpc("select public.push_batch($1::jsonb) r", [JSON.stringify(ops)])).r;
const op = (n, o) => ({ op_id: uuid(n), table: "movements", workspace_id: 1, ...o });

await asUser(A);
const accId = (await rpc("select public.reserve_ids(1, 'accounts', 2) ids")).ids;
const mv = (await rpc("select public.reserve_ids(1, 'movements', 20) ids")).ids;

let r = await push([
  op(1, { table: "accounts", kind: "insert", row_id: accId[0], fields: { name: "Efectivo" } }),
  op(2, { kind: "insert", row_id: mv[0], fields: { description: "Café", source_account_id: accId[0], source_amount: 12.5, created_by_user_id: B, updated_at: "2000-01-01" } }),
]);
check("insert de cuenta y movimiento con ids reservados: applied", r[0].status === "applied" && r[1].status === "applied", r);
check("el id del servidor es el id reservado", Number(r[1].row.id) === Number(mv[0]), r[1].row);
check("created_by_user_id lo pone el servidor (ignora el del cliente)", r[1].row.created_by_user_id === A, r[1].row);
check("updated_at lo pone el servidor (ignora el del cliente)", !String(r[1].row.updated_at).startsWith("2000"), r[1].row.updated_at);

r = await push([op(2, { kind: "insert", row_id: mv[0], fields: { description: "Café" } })]);
check("reintento con el mismo op_id: replayed y sin duplicar", r[0].status === "applied" && r[0].replayed === true, r);
const cnt = await rpc("select count(*)::int n from public.movements");
check("sigue habiendo 1 movimiento", cnt.n === 1, cnt);

r = await push([op(3, { kind: "insert", row_id: mv[1], fields: { description: "x", columna_inventada: 1 } })]);
check("columna desconocida: rejected unknown_column", r[0].status === "rejected" && r[0].code === "unknown_column", r);

r = await push([op(4, { kind: "insert", row_id: mv[2], workspace_id: 2, fields: { description: "ajeno" } })]);
check("insert en workspace ajeno: rejected forbidden", r[0].status === "rejected" && r[0].code === "forbidden", r);

r = await push([op(5, { table: "profiles", kind: "insert", row_id: 1, fields: {} })]);
check("tabla no registrada: rejected invalid_op", r[0].status === "rejected" && r[0].code === "invalid_op", r);

r = await push([
  op(6, { kind: "insert", row_id: mv[3], fields: { description: "Dedupe", client_dedupe_key: "k1", source_amount: 5 } }),
  op(7, { kind: "insert", row_id: mv[4], fields: { description: "Dedupe 2", client_dedupe_key: "k1", source_amount: 5 } }),
]);
check("dedupe: primer insert applied", r[0].status === "applied", r[0]);
check("dedupe: segundo con la misma clave -> noop con la fila existente", r[1].status === "noop" && Number(r[1].row.id) === Number(mv[3]), r[1]);

r = await push([
  op(8, { kind: "insert", row_id: mv[5], fields: { description: "FK rota", source_account_id: 999999 } }),
  op(9, { kind: "insert", row_id: mv[6], fields: { description: "Sigue" } }),
]);
check("un fallo (FK) no aborta el resto del lote", r[0].status === "rejected" && r[0].code === "dependency" && r[1].status === "applied", r);

// ---- update / conflictos ----
const row = (await rpc("select * from public.movements where id = $1", [mv[0]]));
r = await push([op(10, { kind: "update", row_id: mv[0], base_updated_at: row.updated_at, fields: { description: "Café doble" } })]);
check("update sin conflicto: applied", r[0].status === "applied" && r[0].row.description === "Café doble", r);
check("update fija updated_by_user_id", r[0].row.updated_by_user_id === A, r[0].row);

// B (otra persona) edita el monto del movimiento confirmado
await asUser(B);
const bPush = async (ops) => (await rpc("select public.push_batch($1::jsonb) r", [JSON.stringify(ops)])).r;
await bPush([op(11, { kind: "update", row_id: mv[0], base_updated_at: r[0].row.updated_at, fields: { source_amount: 20 } })]);
// A edita sin haber visto el cambio de B (base vieja)
await asUser(A);
r = await push([op(12, { kind: "update", row_id: mv[0], base_updated_at: row.updated_at, fields: { description: "Solo texto" } })]);
check("base vieja + campo no monetario: merged (último escritor por campo)", r[0].status === "merged", r);
check("merged conserva el monto que puso la otra persona", Number(r[0].row.source_amount) === 20, r[0].row);
r = await push([op(13, { kind: "update", row_id: mv[0], base_updated_at: row.updated_at, fields: { source_amount: 99 } })]);
check("base vieja + monto de movimiento confirmado: review", r[0].status === "review", r);
check("review devuelve previous con el monto sustituido", Number(r[0].previous.source_amount) === 20, r[0].previous);
check("review igualmente aplica el cambio", Number(r[0].row.source_amount) === 99, r[0].row);

// Contrato del cliente: tomar la base de la respuesta anterior evita falsos positivos...
const fresh = (await rpc("select updated_at from public.movements where id = $1", [mv[0]])).updated_at;
r = await push([op(14, { kind: "update", row_id: mv[0], base_updated_at: fresh, fields: { source_amount: 50 } })]);
check("edición con base fresca: applied", r[0].status === "applied", r);
r = await push([op(15, { kind: "update", row_id: mv[0], base_updated_at: r[0].row.updated_at, fields: { source_amount: 60 } })]);
check("edición encadenada con la base de la respuesta anterior: applied (sin falso positivo)", r[0].status === "applied", r);
// ...y sin ese contrato, con montos se prefiere revisar de más que perder un conflicto.
r = await push([op(25, { kind: "update", row_id: mv[0], base_updated_at: fresh, fields: { source_amount: 61 } })]);
check("base vieja propia + monto: review (conservador)", r[0].status === "review", r);

r = await push([op(16, { kind: "update", row_id: mv[0], fields: {} })]);
check("update sin campos: noop", r[0].status === "noop", r);
r = await push([op(17, { kind: "update", row_id: 999999, fields: { description: "fantasma" } })]);
check("update de fila inexistente: rejected row_not_found", r[0].status === "rejected" && r[0].code === "row_not_found", r);
r = await push([op(18, { kind: "update", row_id: mv[0], fields: { workspace_id: 2, description: "mover" } })]);
const afterMove = await rpc("select workspace_id from public.movements where id = $1", [mv[0]]);
check("workspace_id no se puede cambiar por update", Number(afterMove.workspace_id) === 1, afterMove);
r = await push([op(19, { kind: "update", row_id: mv[0], workspace_id: 2, fields: { description: "x" } })]);
check("update con workspace_id distinto al de la fila: rejected invalid_op", r[0].status === "rejected" && r[0].code === "invalid_op", r);

// ---- delete ----
const cur = (await rpc("select updated_at from public.movements where id = $1", [mv[6]])).updated_at;
await asUser(B);
await bPush([op(20, { kind: "update", row_id: mv[6], fields: { description: "B editó" } })]);
await asUser(A);
r = await push([op(21, { kind: "delete", row_id: mv[6], base_updated_at: cur })]);
check("borrar una fila editada por otro desde la base: rejected edited_since", r[0].status === "rejected" && r[0].code === "edited_since", r);
r = await push([op(22, { kind: "delete", row_id: mv[6] })]);
check("borrar sin base: applied", r[0].status === "applied", r);
r = await push([op(23, { kind: "delete", row_id: mv[6] })]);
check("borrar lo ya borrado: noop", r[0].status === "noop", r);
r = await push([op(24, { kind: "delete", row_id: accId[0] , table: "accounts" })]);
check("borrar cuenta referenciada: applied (FK set null)", r[0].status === "applied", r);
const orphan = await rpc("select source_account_id from public.movements where id = $1", [mv[0]]);
check("el movimiento queda con cuenta null (set null)", orphan.source_account_id === null, orphan);

await expectError("push_batch: más de 200 ops -> 54000", "select public.push_batch($1::jsonb)", [JSON.stringify(Array.from({ length: 201 }, (_, i) => op(1000 + i, { kind: "delete", row_id: 1 })))], "54000");
await expectError("push_batch: no es arreglo -> 22023", "select public.push_batch('{}'::jsonb)", [], "22023");

// ---- pull_changes ----
await asUser(A);
const more = (await rpc("select public.reserve_ids(1, 'movements', 10) ids")).ids;
await push(more.map((id, i) => op(100 + i, { kind: "insert", row_id: id, fields: { description: "m" + i } })));
const total = (await rpc("select count(*)::int n from public.movements where workspace_id = 1")).n;

let cursors = {};
let pulled = [];
let pages = 0;
for (;;) {
  const res = (await rpc("select public.pull_changes(1, $1::jsonb, array['movements'], 3) r", [JSON.stringify(cursors)])).r;
  const t = res.tables.movements;
  pulled = pulled.concat(t.rows.map((x) => Number(x.id)));
  cursors = { movements: t.next };
  pages++;
  if (!t.has_more) break;
  if (pages > 50) break;
}
check("pull paginado (limite 3) trae todos los movimientos sin repetir", pulled.length === total && new Set(pulled).size === total, { total, got: pulled.length });
check("pull con limite 3 requiere varias páginas", pages > 1, pages);

// Pull incremental: el cursor queda 2 min atrás; una fila editada después aparece
await db.exec("reset role");
await db.exec("alter table public.movements disable trigger trg_movements_updated_at");
await db.exec("update public.movements set updated_at = now() - interval '1 day' where workspace_id = 1");
await db.exec("alter table public.movements enable trigger trg_movements_updated_at");
await asUser(A);
const full = (await rpc("select public.pull_changes(1, '{}'::jsonb, array['movements'], 1000) r")).r.tables.movements;
const since = full.next;
check("tras completar, el cursor no supera ahora - solape (2 min)", new Date(since.since).getTime() <= Date.now() - 119_000, since);
await push([op(300, { kind: "update", row_id: more[0], fields: { description: "cambió" } })]);
const inc = (await rpc("select public.pull_changes(1, $1::jsonb, array['movements'], 1000) r", [JSON.stringify({ movements: since })])).r.tables.movements;
const incIds = inc.rows.map((x) => Number(x.id));
check("pull incremental trae la fila editada", incIds.includes(Number(more[0])), incIds);
check("pull incremental NO trae filas antiguas sin cambios", incIds.length === 1, incIds);

const live = (await rpc("select public.sync_live_ids(1, array['movements']) r")).r;
check("sync_live_ids lista los ids vigentes", live.ids.movements.length === total && !live.ids.movements.includes(Number(mv[6])), live.ids.movements);

// ---- aislamiento / seguridad ----
await expectError("pull_changes: no miembro -> 42501", "select public.pull_changes(2, '{}'::jsonb)", [], "42501");
await asUser(C);
await expectError("usuario de otro workspace no puede pullear ws 1 -> 42501", "select public.pull_changes(1, '{}'::jsonb)", [], "42501");
r = (await rpc("select public.push_batch($1::jsonb) r", [JSON.stringify([op(400, { kind: "update", row_id: more[1], fields: { description: "hack" } })])])).r;
check("usuario ajeno no puede editar filas de ws 1 (row_not_found, RLS)", r[0].status === "rejected" && r[0].code === "row_not_found", r);
r = (await rpc("select public.push_batch($1::jsonb) r", [JSON.stringify([op(401, { kind: "delete", row_id: more[1] })])])).r;
check("usuario ajeno no puede borrar filas de ws 1 (rejected forbidden)", r[0].status === "rejected" && r[0].code === "forbidden", r);
const still = await (async () => { await asAdmin(); return rpc("select count(*)::int n from public.movements where id = $1", [more[1]]); })();
check("la fila sigue existiendo tras el intento ajeno", still.n === 1, still);
await asUser(C);
await expectError("authenticated no puede escribir en sync_tables", "insert into public.sync_tables(table_name, tier) values ('profiles', 1)", [], "42501");
await expectError("authenticated no puede purgar sync_applied_ops", "select public.sync_purge_applied_ops()", [], "42501");
const leaked = await rpc("select count(*)::int n from public.sync_applied_ops");
check("sync_applied_ops: usuario C no ve las ops de A/B (RLS)", leaked.n === 0, leaked);

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
