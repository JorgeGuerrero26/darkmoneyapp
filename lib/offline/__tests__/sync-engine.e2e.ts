/**
 * Motor de sync de punta a punta: dos "teléfonos" (SQLite en memoria) contra el servidor real de la
 * Fase 1 (PostgreSQL local con las migraciones de producción). Lo que NO cubre: el teléfono real,
 * la red real ni expo-sqlite — eso se prueba en dispositivo (docs/OFFLINE_DEVICE_TEST.md).
 *
 * Se ejecuta con node --test (npm run test:offline-e2e), no con Jest: ver helpers/expect.ts.
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "./helpers/expect";
import { countInbox, countOutbox, listInbox, listSendable } from "../outbox";
import { listMovementRecords, computeAccountBalances, getServerShapedRow } from "../movement-store";
import { createMovementLocal, deleteMovementLocal, updateMovementLocal } from "../movement-writes";
import { createRowLocal, deleteRowLocal, updateRowLocal } from "../resource-writes";
import { upsertMirrorRows } from "../movement-store";
import { poolSize } from "../id-pool";
import { SyncEngine } from "../sync-engine";
import type { PushResult, SyncTransport } from "../sync-types";
import { createTestDriver } from "./helpers/node-sqlite-driver";
import { createTestServer, type TestServer } from "./helpers/pglite-server";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";
const WS = 1;

let server: TestServer;
let clock = Date.parse("2026-10-12T12:00:00.000Z");
const tick = (ms: number) => { clock += ms; };

beforeEach(async () => {
  clock = Date.parse("2026-10-12T12:00:00.000Z");
  server = await createTestServer();
  await server.addMember(WS, USER_A);
  await server.addMember(WS, USER_B);
  await server.admin.exec(`
    insert into accounts (workspace_id, name, currency_code, opening_balance) values (1, 'Efectivo', 'PEN', 100), (1, 'Banco', 'PEN', 500);
    insert into categories (workspace_id, name) values (1, 'Comida');
    insert into counterparties (workspace_id, name) values (1, 'Juan');
  `);
});
afterEach(async () => {
  await server.close();
});

type Hooks = { failAll?: () => boolean; failPush?: () => boolean; tamper?: (results: PushResult[]) => PushResult[] };

function device(userId: string, hooks: Hooks = {}) {
  const db = createTestDriver();
  const base = server.transportFor(userId, hooks);
  const transport: SyncTransport = {
    ...base,
    async pushBatch(ops) {
      const results = await base.pushBatch(ops);
      return hooks.tamper ? hooks.tamper(results) : results;
    },
  };
  const engine = new SyncEngine({ db, transport, now: () => clock });
  return { db, engine, userId, hooks };
}
type Device = ReturnType<typeof device>;

describe("núcleo de recursos (Fase 3.2)", () => {
  it("categoría → movimiento → borrado offline conserva orden y SET NULL en ambos lados", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    const category = await createRowLocal(a.db, { workspaceId: WS, userId: USER_A, table: "categories", fields: { name: "Temporal" } });
    expect(category).not.toBeNull();
    const movement = await create(a, "Con categoría nueva", 12, { category_id: category!.id });
    await deleteRowLocal(a.db, { workspaceId: WS, userId: USER_A, table: "categories", id: category!.id });
    const report = await a.engine.syncNow(WS);
    if (report.rejected) throw new Error(JSON.stringify((await listInbox(a.db)).map(entry => ({ code: entry.code, message: entry.message }))));
    expect(report.rejected).toBe(0);
    expect(report.applied).toBe(3);
    expect((await getServerShapedRow(a.db, "movements", movement!.id))?.category_id).toBeNull();
    expect((await server.admin.query<{ category_id: number | null }>("select category_id from movements where id=$1", [movement!.id])).rows[0].category_id).toBeNull();
  });

  it("un borrado RESTRICT rechazado restaura también los hijos que habían perdido la referencia", async () => {
    await server.admin.exec(`create table obligations(id bigint primary key,counterparty_id bigint references counterparties(id) on delete restrict);
      insert into obligations values(1,1);
      insert into movements(workspace_id,movement_type,status,occurred_at,description,source_account_id,source_amount,counterparty_id)
      values(1,'expense','posted',now(),'Con contacto',1,5,1);
      update movements set updated_at=now()-interval '1 day';`);
    const a = device(USER_A); await a.engine.syncNow(WS);
    await deleteRowLocal(a.db, { workspaceId: WS, userId: USER_A, table: "counterparties", id: 1 });
    expect((await localList(a))[0].counterpartyId).toBeNull();
    const report = await a.engine.syncNow(WS);
    expect(report.rejected).toBe(1);
    expect((await localList(a))[0].counterpartyId).toBe(1);
    expect((await listInbox(a.db))[0]).toMatchObject({ code: "dependency" });
  });

  it("servidor anterior: una tabla ausente del contrato no se considera vacía ni lista", async () => {
    await server.close(); server = await createTestServer({ phase3: false }); await server.addMember(WS, USER_A);
    const a = device(USER_A); await a.engine.start();
    await upsertMirrorRows(a.db, "recurring_income_occurrences", [{ id: 77, workspace_id: WS, updated_at: "2026-10-13T00:00:00Z", amount: "1.2345" }]);
    const result = await a.engine.syncNow(WS);
    expect(result.error).toBeNull();
    expect(await a.engine.isTableHydrated(WS, "recurring_income_occurrences")).toBe(false);
    expect((await getServerShapedRow(a.db, "recurring_income_occurrences", 77))?.amount).toBe("1.2345");
    expect(await a.engine.isTableHydrated(WS, "subscription_occurrences")).toBe(false);
  });
});

describe("servidor de ocurrencias de solo lectura (Fase 3.1)", () => {
  it("la migración es idempotente y conserva cuatro decimales como texto", async () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/202610130001_sync_readonly_occurrences.sql"), "utf8");
    await server.admin.exec(sql);
    await server.admin.exec(`insert into recurring_income (workspace_id,name) values (1,'Ingreso');
      insert into recurring_income_occurrences (workspace_id,recurring_income_id,expected_date,amount,currency_code,status)
      values(1,1,'2026-10-13',90000000000000.1234,'PEN','on_time');`);
    const transport = server.transportFor(USER_A);
    const pull = await transport.pullChanges(WS, {}, ["recurring_income_occurrences"], 1);
    expect(pull.tables.recurring_income_occurrences.rows[0].amount).toBe("90000000000000.1234");
    const denied = await transport.pushBatch([{ op_id: randomUUID(), table: "recurring_income_occurrences", kind: "delete",
      workspace_id: WS, row_id: 1, fields: {}, base_updated_at: null }]);
    expect(denied[0].status).toBe("rejected");
    expect((await server.admin.query("select id from recurring_income_occurrences")).rows).toHaveLength(1);
    await server.admin.exec("update recurring_income_occurrences set notes='Cambio', updated_at='2000-01-01';");
    const touched = (await server.admin.query<{ updated: string }>("select updated_at::text updated from recurring_income_occurrences")).rows[0].updated;
    expect(touched.startsWith("2000")).toBe(false);
  });

  it("lee el historial por el padre con paginación, IDs vigentes y aislamiento por workspace", async () => {
    await server.admin.exec(`insert into subscriptions(workspace_id,name) values(1,'Propia'),(2,'Ajena');
      insert into subscription_occurrences(subscription_id,due_date,expected_amount)
      values(1,'2026-10-13',12.50),(1,'2026-11-13',15),(2,'2026-10-13',99);`);
    const read = (cursor: unknown) => server.asUser(USER_A, async () => (await server.db.query<{ r: any }>(
      "select pull_subscription_occurrences($1,$2::jsonb,1) r", [WS, JSON.stringify(cursor)],
    )).rows[0].r);
    const first = await read({});
    expect(first.has_more).toBe(true);
    expect(first.rows[0].expected_amount).toBe("12.50");
    expect(first.live_ids).toHaveLength(2);
    const second = await read(first.next);
    expect(second.has_more).toBe(false);
    expect(second.rows[0].workspace_id).toBe(WS);
    const registry = (await server.admin.query("select * from sync_tables where table_name='subscription_occurrences'")).rows;
    expect(registry).toHaveLength(0);
    let blocked = false;
    try { await server.asUser(USER_A, () => server.db.query("select pull_subscription_occurrences(2)")); }
    catch { blocked = true; }
    expect(blocked).toBe(true);
    await server.admin.exec("delete from subscriptions where id=1;");
    expect((await read({})).live_ids).toHaveLength(0);
  });
});

describe("verificación de operaciones compuestas (Fase 3.0)", () => {
  it("el lote puede aplicar un movimiento aunque rechace la edición anterior del padre", async () => {
    // El fixture de Fase 1 simplifica los catálogos; aquí se añade el CHECK verificado en producción.
    // Se prueba el contrato de push_batch, no la paridad de los triggers de suscripciones.
    await server.admin.exec(`alter table subscriptions add column amount numeric(14,2) check (amount > 0);
      alter table subscriptions add column next_due_date date;`);
    const transport = server.transportFor(USER_A);
    const [subscriptionId] = await transport.reserveIds(WS, "subscriptions", 1);
    const [movementId] = await transport.reserveIds(WS, "movements", 1);
    const created = await transport.pushBatch([{ op_id: randomUUID(), table: "subscriptions", kind: "insert",
      workspace_id: WS, row_id: subscriptionId, fields: { name: "Prueba", amount: 25, next_due_date: "2026-10-13" }, base_updated_at: null }]);
    expect(created[0].status).toBe("applied");
    const ops = [
      { op_id: randomUUID(), table: "subscriptions", kind: "update" as const, workspace_id: WS, row_id: subscriptionId,
        fields: { amount: -1, next_due_date: "2026-11-13" }, base_updated_at: created[0].row!.updated_at },
      { op_id: randomUUID(), table: "movements", kind: "insert" as const, workspace_id: WS, row_id: movementId,
        fields: expense("Pago compuesto", 25, { subscription_id: subscriptionId }), base_updated_at: null },
    ];
    const results = await transport.pushBatch(ops);
    expect(results.map(result => result.status)).toEqual(["rejected", "applied"]);
    expect(results[0].code).toBe("check_violation");
    expect((await server.admin.query<{ due: string }>("select next_due_date::text due from subscriptions where id=$1", [subscriptionId])).rows[0].due).toBe("2026-10-13");
    expect(await serverRows()).toHaveLength(1);
    const replay = await transport.pushBatch(ops);
    expect(replay[1].replayed).toBe(true);
    expect(await serverRows()).toHaveLength(1);
  });

  it("poner el movimiento primero tampoco impide avanzar la próxima llegada después de su rechazo", async () => {
    await server.admin.exec("alter table recurring_income add column next_expected_date date;");
    const transport = server.transportFor(USER_A);
    const [incomeId] = await transport.reserveIds(WS, "recurring_income", 1);
    const [movementId] = await transport.reserveIds(WS, "movements", 1);
    const created = await transport.pushBatch([{ op_id: randomUUID(), table: "recurring_income", kind: "insert",
      workspace_id: WS, row_id: incomeId, fields: { name: "Prueba", next_expected_date: "2026-10-13" }, base_updated_at: null }]);
    expect(created[0].status).toBe("applied");
    const results = await transport.pushBatch([
      { op_id: randomUUID(), table: "movements", kind: "insert", workspace_id: WS, row_id: movementId,
        fields: expense("Movimiento con cuenta eliminada", 25, { source_account_id: 999999 }), base_updated_at: null },
      { op_id: randomUUID(), table: "recurring_income", kind: "update", workspace_id: WS, row_id: incomeId,
        fields: { next_expected_date: "2026-11-13" }, base_updated_at: created[0].row!.updated_at },
    ]);
    expect(results.map(result => result.status)).toEqual(["rejected", "applied"]);
    expect(results[0].code).toBe("dependency");
    expect(await serverRows()).toHaveLength(0);
    expect((await server.admin.query<{ due: string }>("select next_expected_date::text due from recurring_income where id=$1", [incomeId])).rows[0].due).toBe("2026-11-13");
  });
});

const expense = (description: string, amount: number, extra: Record<string, unknown> = {}) => ({
  movement_type: "expense", status: "posted", occurred_at: new Date(clock).toISOString(), description, notes: null,
  source_account_id: 1, source_amount: amount, destination_account_id: null, destination_amount: null, fx_rate: null,
  category_id: null, spend_type_id: null, counterparty_id: null, obligation_id: null, subscription_id: null,
  metadata: {}, client_dedupe_key: null, ...extra,
});

const create = (d: Device, description: string, amount: number, extra: Record<string, unknown> = {}) =>
  createMovementLocal(d.db, { workspaceId: WS, userId: d.userId, fields: expense(description, amount, extra), nowIso: new Date(clock).toISOString() });

const serverRows = async () =>
  (await server.admin.query<{ id: string; description: string; source_amount: string; created_by_user_id: string | null; updated_by_user_id: string | null }>(
    "select id::text, description, source_amount::text, created_by_user_id, updated_by_user_id from movements order by movements.id",
  )).rows;

const localList = async (d: Device) => (await listMovementRecords(d.db, WS, {}, 0, 500)).data;

describe("primera sincronización", () => {
  it("descarga el espejo, repone IDs y marca la base como lista", async () => {
    const a = device(USER_A);
    expect(await a.engine.isHydrated(WS)).toBe(false);
    const report = await a.engine.syncNow(WS);
    expect(report.error).toBeNull();
    expect(report.hydrated).toBe(true);
    expect(await a.engine.isHydrated(WS)).toBe(true);
    expect(await poolSize(a.db, WS, "movements")).toBe(200);
    const balances = await computeAccountBalances(a.db, WS);
    expect(balances.map((b) => b.currentBalance).sort((x, y) => x - y)).toEqual([100, 500]);
  });
});

describe("registrar sin conexión y sincronizar", () => {
  it("diez movimientos sin red: instantáneos, y al volver la red llegan todos una sola vez", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS); // hidratar y reponer IDs con red

    let online = false;
    a.hooks.failAll = () => !online;

    for (let i = 1; i <= 10; i++) expect(await create(a, `Gasto ${i}`, i)).not.toBeNull();
    expect(await countOutbox(a.db)).toBe(10);
    expect((await localList(a)).map((r) => r.description)).toContain("Gasto 10");
    // El saldo local ya refleja los diez (1+2+...+10 = 55), sin haber tocado el servidor.
    const cash = (await computeAccountBalances(a.db, WS)).find((b) => b.currentBalance === 45);
    expect(cash).toBeDefined();
    expect(await serverRows()).toHaveLength(0);

    // Sin red: el ciclo falla pero no pierde nada.
    const offline = await a.engine.syncNow(WS);
    expect(offline.error).not.toBeNull();
    expect(await countOutbox(a.db)).toBe(10);

    // Vuelve la red (y pasa el tiempo de espera del reintento).
    online = true;
    tick(10 * 60_000);
    const report = await a.engine.syncNow(WS);
    expect(report.error).toBeNull();
    expect(report.applied).toBe(10);
    expect(await countOutbox(a.db)).toBe(0);

    const rows = await serverRows();
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.created_by_user_id === USER_A)).toBe(true);
    const localIds = (await localList(a)).map((r) => r.id).sort((x, y) => x - y);
    expect(localIds).toEqual(rows.map((r) => Number(r.id)));
  });

  it("si el servidor aplicó el lote pero la respuesta se perdió, el reintento no duplica", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    let lose = true;
    // El servidor recibe y aplica; el teléfono nunca ve la respuesta.
    const original = a.engine as unknown as { transport: SyncTransport };
    const realPush = original.transport.pushBatch.bind(original.transport);
    original.transport.pushBatch = async (ops) => {
      const results = await realPush(ops);
      if (lose) throw new Error("Network request failed");
      return results;
    };

    await create(a, "Almuerzo", 25);
    await create(a, "Taxi", 12);
    const first = await a.engine.syncNow(WS);
    expect(first.error).not.toBeNull();
    expect(await serverRows()).toHaveLength(2); // llegaron
    expect(await countOutbox(a.db)).toBe(2); // pero el teléfono no lo sabe

    lose = false;
    tick(10 * 60_000);
    const second = await a.engine.syncNow(WS);
    expect(second.error).toBeNull();
    expect(await countOutbox(a.db)).toBe(0);
    expect(await serverRows()).toHaveLength(2); // sin duplicados
    const replayed = (await server.admin.query<{ n: string }>("select count(*)::text n from sync_applied_ops")).rows[0].n;
    expect(Number(replayed)).toBe(2);
  });

  it("fusiona alta + edición + borrado antes de enviar", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    const row = (await create(a, "Se corrige", 10))!;
    await updateMovementLocal(a.db, { workspaceId: WS, userId: USER_A, id: row.id, fields: { description: "Corregido", source_amount: 11 } });
    expect(await countOutbox(a.db)).toBe(1); // un solo insert, ya corregido
    const other = (await create(a, "Se borra", 5))!;
    await deleteMovementLocal(a.db, { workspaceId: WS, id: other.id });
    expect(await countOutbox(a.db)).toBe(1); // el insert + delete se anuló

    await a.engine.syncNow(WS);
    const rows = await serverRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "Corregido", source_amount: "11.00" });
  });

  it("al agotarse el bloque de IDs no inventa uno: devuelve null para caer al camino online", async () => {
    const a = device(USER_A);
    // Sin sincronizar nunca no hay IDs reservados.
    await a.engine.start();
    expect(await create(a, "Sin IDs", 1)).toBeNull();
    expect(await countOutbox(a.db)).toBe(0);
    expect(await localList(a)).toHaveLength(0);
  });
});

describe("dos dispositivos", () => {
  it("un movimiento creado por A aparece en B, y su borrado también", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const row = (await create(a, "Compartido", 30))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    expect((await localList(b)).map((r) => r.description)).toEqual(["Compartido"]);

    await deleteMovementLocal(a.db, { workspaceId: WS, id: row.id });
    await a.engine.syncNow(WS);
    tick(6 * 60_000); // la reconciliación de borrados corre cada 5 min
    await b.engine.syncNow(WS);
    expect(await localList(b)).toHaveLength(0);
  });

  it("edición con base vieja sobre un monto cambiado por otra persona: aplica y queda en la bandeja para revisar", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const row = (await create(a, "Mercado", 20))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    // B corrige el monto y sincroniza. A, sin enterarse, también lo cambia (sin red).
    tick(1000);
    await updateMovementLocal(b.db, { workspaceId: WS, userId: USER_B, id: row.id, fields: { source_amount: 25 } });
    await b.engine.syncNow(WS);
    await updateMovementLocal(a.db, { workspaceId: WS, userId: USER_A, id: row.id, fields: { source_amount: 99 } });
    const report = await a.engine.syncNow(WS);

    expect(report.review).toBe(1);
    expect((await serverRows())[0].source_amount).toBe("99.00"); // se aplicó
    const inbox = await listInbox(a.db);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ status: "review", kind: "update" });
    expect(Number((inbox[0].previous as { source_amount: number }).source_amount)).toBe(25); // lo que se pisó
  });

  it("edición de un campo no monetario sobre otro cambio: se fusiona sin molestar", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const row = (await create(a, "Cena", 40))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    tick(1000);
    await updateMovementLocal(b.db, { workspaceId: WS, userId: USER_B, id: row.id, fields: { source_amount: 45 } });
    await b.engine.syncNow(WS);
    await updateMovementLocal(a.db, { workspaceId: WS, userId: USER_A, id: row.id, fields: { description: "Cena con amigos" } });
    const report = await a.engine.syncNow(WS);
    expect(report.review).toBe(0);
    expect(await countInbox(a.db)).toEqual({ rejected: 0, review: 0 });
    expect((await serverRows())[0]).toMatchObject({ description: "Cena con amigos", source_amount: "45.00" });
    // Y A termina viendo el monto de B.
    expect((await localList(a))[0].sourceAmount).toBe(45);
  });

  it("editar algo que otro ya borró: se rechaza, se avisa y la fila deja de estar en local", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const row = (await create(a, "Fantasma", 9))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    await deleteMovementLocal(b.db, { workspaceId: WS, id: row.id });
    await b.engine.syncNow(WS);
    await updateMovementLocal(a.db, { workspaceId: WS, userId: USER_A, id: row.id, fields: { description: "Editado tarde" } });
    const report = await a.engine.syncNow(WS);

    expect(report.rejected).toBe(1);
    const inbox = await listInbox(a.db);
    expect(inbox[0]).toMatchObject({ status: "rejected", code: "row_not_found" });
    expect(await localList(a)).toHaveLength(0); // la reconciliación de borrados la quitó
    expect(await countOutbox(a.db)).toBe(0);
  });

  it("la misma clave de dedupe desde dos dispositivos: queda UNA fila y el segundo adopta la del servidor", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    await create(a, "Suscripción", 15, { client_dedupe_key: "suggestion:77" });
    await create(b, "Suscripción", 15, { client_dedupe_key: "suggestion:77" });
    await a.engine.syncNow(WS);
    const report = await b.engine.syncNow(WS);
    expect(report.error).toBeNull();
    expect(await serverRows()).toHaveLength(1);
    const rowsB = await localList(b);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].id).toBe(Number((await serverRows())[0].id));
    expect(await countOutbox(b.db)).toBe(0);
  });

  it("los cambios locales sin enviar no los pisa una descarga", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const row = (await create(a, "Original", 10))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    tick(1000);
    await updateMovementLocal(b.db, { workspaceId: WS, userId: USER_B, id: row.id, fields: { description: "Versión de B" } });
    await b.engine.syncNow(WS);
    await updateMovementLocal(a.db, { workspaceId: WS, userId: USER_A, id: row.id, fields: { notes: "nota local de A" } });

    // A sin red: puede descargar pero no enviar. Su edición local no debe desaparecer.
    a.hooks.failPush = () => true;
    await a.engine.syncNow(WS);
    const mine = await getServerShapedRow(a.db, "movements", row.id);
    expect(mine?.notes).toBe("nota local de A");
    expect(mine?.description).toBe("Original"); // la descarga no tocó la fila con cambios pendientes

    a.hooks.failPush = undefined;
    tick(10 * 60_000);
    await a.engine.syncNow(WS);
    expect((await serverRows())[0].description).toBe("Versión de B");
    const final = await getServerShapedRow(a.db, "movements", row.id);
    expect(final?.notes).toBe("nota local de A");
    expect(final?.description).toBe("Versión de B");
  });
});

describe("rechazos y reintentos", () => {
  it("un alta que el servidor rechaza (cuenta inexistente) va a la bandeja y no queda en la lista", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    await create(a, "Con cuenta rota", 5, { source_account_id: 424242 });
    await create(a, "Buena", 6);
    const report = await a.engine.syncNow(WS);
    expect(report.rejected).toBe(1);
    expect(report.applied).toBe(1); // una operación fallida no frena a las demás
    const inbox = await listInbox(a.db);
    expect(inbox[0]).toMatchObject({ status: "rejected", code: "dependency" });
    expect(inbox[0].summary).toContain("Con cuenta rota");
    expect((await localList(a)).map((r) => r.description)).toEqual(["Buena"]);
    expect(await countOutbox(a.db)).toBe(0);
  });

  it("un rechazo transitorio (timeout del servidor) vuelve a la cola, no a la bandeja", async () => {
    let transient = true;
    const a = device(USER_A, {
      tamper: (results) =>
        transient ? results.map((r) => ({ ...r, status: "rejected", code: "error", sqlstate: "57014", message: "canceling statement" }) as PushResult) : results,
    });
    await a.engine.syncNow(WS);
    await create(a, "Reintentable", 8);
    const first = await a.engine.syncNow(WS);
    expect(first.retried).toBe(1);
    expect(await countInbox(a.db)).toEqual({ rejected: 0, review: 0 });
    expect(await countOutbox(a.db)).toBe(1);

    transient = false;
    tick(10 * 60_000);
    await a.engine.syncNow(WS);
    expect(await countOutbox(a.db)).toBe(0);
    expect(await serverRows()).toHaveLength(1);
  });

  it("el reintento espera: no vuelve a salir antes de tiempo", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    await create(a, "Espera", 3);
    a.hooks.failPush = () => true;
    await a.engine.syncNow(WS);
    expect(await listSendable(a.db, WS, 10, new Date(clock + 1000).toISOString())).toHaveLength(0);
    expect(await listSendable(a.db, WS, 10, new Date(clock + 60_000).toISOString())).toHaveLength(1);
  });

  it("varias peticiones de sync a la vez se agrupan en un solo ciclo más una repetición", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    await create(a, "Concurrente", 4);
    const [r1, r2, r3] = await Promise.all([a.engine.syncNow(WS), a.engine.syncNow(WS), a.engine.syncNow(WS)]);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    await new Promise((resolve) => setTimeout(resolve, 500)); // deja correr la repetición agendada
    expect(await serverRows()).toHaveLength(1);
  });
});

describe("descarga a escala", () => {
  it("pagina más de mil filas y no se pierde ninguna", async () => {
    await server.admin.exec(`
      insert into movements (workspace_id, movement_type, status, occurred_at, description, source_account_id, source_amount)
      select 1, 'expense', 'posted', now() - (g || ' minutes')::interval, 'bulk ' || g, 1, 1 from generate_series(1, 2500) g;
    `);
    const a = device(USER_A);
    const report = await a.engine.syncNow(WS);
    expect(report.error).toBeNull();
    expect(await localList(a)).toHaveLength(500); // la lista local entrega páginas; pedimos 500
    const total = await a.db.get<{ n: number }>("select count(*) as n from movements");
    expect(Number(total?.n)).toBe(2500);
  });

  it("sincronizar sin cambios no vuelve a descargar filas viejas (cursor con solape)", async () => {
    await server.admin.exec(`
      insert into movements (workspace_id, movement_type, status, occurred_at, description, source_account_id, source_amount)
      select 1, 'expense', 'posted', now(), 'viejo ' || g, 1, 1 from generate_series(1, 30) g;
      update movements set updated_at = now() - interval '1 day';
    `);
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    const again = await a.engine.syncNow(WS);
    expect(again.pulledRows).toBe(0);
  });
});

describe("catálogos sin conexión de punta a punta (Fase 3.6)", () => {
  const named = (d: Device, table: "categories" | "counterparties" | "budgets" | "spend_types" | "movement_templates", name: string) =>
    createRowLocal(d.db, { workspaceId: WS, userId: d.userId, table, fields: { name }, nowIso: new Date(clock).toISOString() });
  const serverCount = async (table: string, name: string) =>
    Number((await server.admin.query<{ n: string }>(`select count(*)::text n from ${table} where name = $1`, [name])).rows[0].n);

  it("varios catálogos creados sin red llegan al servidor una sola vez y otro dispositivo los baja", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    await named(a, "categories", "Mascotas");
    await named(a, "counterparties", "Veterinaria");
    await named(a, "budgets", "Tope mensual");
    await named(a, "spend_types", "Deseo");
    await named(a, "movement_templates", "Croquetas");
    expect(await countOutbox(a.db)).toBe(5);

    const report = await a.engine.syncNow(WS);
    expect(report.rejected).toBe(0);
    expect(report.applied).toBe(5);
    expect(await countOutbox(a.db)).toBe(0);
    for (const [table, name] of [
      ["categories", "Mascotas"], ["counterparties", "Veterinaria"], ["budgets", "Tope mensual"],
      ["spend_types", "Deseo"], ["movement_templates", "Croquetas"],
    ] as const) expect(await serverCount(table, name)).toBe(1);

    await b.engine.syncNow(WS);
    const seen = async (table: "categories" | "counterparties" | "budgets" | "spend_types" | "movement_templates") =>
      (await b.db.all<{ data: string }>(`select data from ${table} where workspace_id = ?`, [WS])).map((row) => JSON.parse(row.data).name);
    expect(await seen("categories")).toContain("Mascotas");
    expect(await seen("counterparties")).toContain("Veterinaria");
    expect(await seen("budgets")).toContain("Tope mensual");
    expect(await seen("spend_types")).toContain("Deseo");
    expect(await seen("movement_templates")).toContain("Croquetas");
  });

  it("si la respuesta se pierde, el reintento de un catálogo no lo duplica", async () => {
    const a = device(USER_A);
    await a.engine.syncNow(WS);
    let lose = true;
    const transport = (a.engine as unknown as { transport: SyncTransport }).transport;
    const realPush = transport.pushBatch.bind(transport);
    transport.pushBatch = async (ops) => {
      const results = await realPush(ops);
      if (lose) throw new Error("Network request failed");
      return results;
    };
    await named(a, "categories", "Viajes");
    expect((await a.engine.syncNow(WS)).error).not.toBeNull();
    expect(await serverCount("categories", "Viajes")).toBe(1);

    lose = false;
    tick(10 * 60_000);
    expect((await a.engine.syncNow(WS)).error).toBeNull();
    expect(await countOutbox(a.db)).toBe(0);
    expect(await serverCount("categories", "Viajes")).toBe(1);
  });

  it("renombrar lo que otra persona ya borró: se rechaza, se avisa y deja de verse en local", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const category = (await named(a, "categories", "Efímera"))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    await deleteRowLocal(b.db, { workspaceId: WS, userId: USER_B, table: "categories", id: category.id });
    await b.engine.syncNow(WS);
    await updateRowLocal(a.db, { workspaceId: WS, userId: USER_A, table: "categories", id: category.id, fields: { name: "Renombrada tarde" } });
    const report = await a.engine.syncNow(WS);

    expect(report.rejected).toBe(1);
    expect((await listInbox(a.db))[0]).toMatchObject({ status: "rejected", code: "row_not_found" });
    expect(await getServerShapedRow(a.db, "categories", category.id)).toBeNull();
    expect(await countOutbox(a.db)).toBe(0);
  });

  it("dos personas renombran lo mismo: gana el último en llegar y nadie se queda con datos distintos", async () => {
    const a = device(USER_A);
    const b = device(USER_B);
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);
    const category = (await named(a, "categories", "Original"))!;
    await a.engine.syncNow(WS);
    await b.engine.syncNow(WS);

    await updateRowLocal(a.db, { workspaceId: WS, userId: USER_A, table: "categories", id: category.id, fields: { name: "De A" } });
    await updateRowLocal(b.db, { workspaceId: WS, userId: USER_B, table: "categories", id: category.id, fields: { name: "De B" } });
    await a.engine.syncNow(WS);
    tick(60_000);
    await b.engine.syncNow(WS);
    tick(60_000);
    await a.engine.syncNow(WS);

    const onServer = (await server.admin.query<{ name: string }>("select name from categories where id = $1", [category.id])).rows[0].name;
    expect(onServer).toBe("De B");
    expect((await getServerShapedRow(a.db, "categories", category.id))?.name).toBe("De B");
    expect((await getServerShapedRow(b.db, "categories", category.id))?.name).toBe("De B");
    expect(await countInbox(a.db)).toEqual({ rejected: 0, review: 0 }); // catálogos: sin revisión de montos
  });
});
