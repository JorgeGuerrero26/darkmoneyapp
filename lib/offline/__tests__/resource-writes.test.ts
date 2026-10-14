import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createTestDriver } from "./helpers/node-sqlite-driver";
import { migrate, WRITABLE_RESOURCE_TABLES } from "../schema";
import { addPoolIds, poolSize } from "../id-pool";
import { createRowLocal, updateRowLocal, deleteRowLocal } from "../resource-writes";
import { listRowsLocal, getRowLocal } from "../resource-store";
import { getServerShapedRow, upsertMirrorRows, type ServerRow } from "../movement-store";
import { createMovementLocal } from "../movement-writes";
import { listSendable, countOutbox } from "../outbox";
import { exactCents } from "../money";
import type { SqlDriver } from "../sql-driver";

let db: SqlDriver;
const context = { workspaceId: 1, userId: "u1", table: "categories" as const };
beforeEach(async () => { db = createTestDriver(); await migrate(db); });
afterEach(async () => { await db.close(); });
const ops = () => listSendable(db, 1, 100, "9999-01-01T00:00:00Z");
const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, workspace_id: 1, updated_at: "2026-01-01T00:00:00Z", ...extra }) as ServerRow;

it("usa solo IDs reservados y fusiona ediciones del recurso sin cambiar el op_id", async () => {
  await addPoolIds(db, 1, "categories", [77]);
  const created = await createRowLocal(db, { ...context, fields: { name: "Comida" } });
  expect(created?.id).toBe(77);
  const first = (await ops())[0];
  await updateRowLocal(db, { ...context, id: 77, fields: { name: "Alimentación" } });
  expect((await ops())[0].opId).toBe(first.opId);
  expect((await ops())[0].fields.name).toBe("Alimentación");
  expect(await poolSize(db, 1, "categories")).toBe(0);
  expect(await createRowLocal(db, { ...context, fields: { name: "Sin ID" } })).toBeNull();
  expect(await countOutbox(db)).toBe(1);
});

it("un fallo local revierte también el consumo del ID", async () => {
  await addPoolIds(db, 1, "categories", [7]);
  const fields: Record<string, unknown> = {}; fields.circular = fields;
  await expect(createRowLocal(db, { ...context, fields })).rejects.toThrow();
  expect(await poolSize(db, 1, "categories")).toBe(1);
  expect(await countOutbox(db)).toBe(0);
});

it("no lee ni edita una fila de otro workspace o la meta de otro usuario", async () => {
  await upsertMirrorRows(db, "categories", [row(2, { workspace_id: 2, name: "Ajena" })]);
  expect(await updateRowLocal(db, { ...context, id: 2, fields: { name: "Cambio" } })).toBeNull();
  await upsertMirrorRows(db, "workspace_financial_goals", [row(3, { user_id: "u2", monthly_savings_target: "100" })]);
  expect(await listRowsLocal(db, "workspace_financial_goals", 1, "u1")).toEqual([]);
  expect(await getRowLocal(db, "workspace_financial_goals", 1, 3, "u1")).toBeNull();
  expect(await deleteRowLocal(db, { ...context, table: "workspace_financial_goals", id: 3 })).toBe(false);
});

it("guarda dinero exacto como texto y solo centavos enteros como columna indexada", async () => {
  await addPoolIds(db, 1, "budgets", [4]);
  const budget = await createRowLocal(db, { ...context, table: "budgets", fields: { limit_amount: "1234.50" } });
  expect(budget?.limit_amount).toBe("1234.50");
  expect(await db.get("select money_cents,typeof(money_cents) kind from budgets where id=4")).toEqual({ money_cents: 123450, kind: "integer" });
  expect(exactCents("1.2300")).toBe(123);
  expect(exactCents("1.2301")).toBeNull();
  await expect(updateRowLocal(db, { ...context, table: "budgets", id: 4, fields: { limit_amount: "1.2301" } })).rejects.toThrow("fracción de centavo");
});

it("las ocurrencias preservan todos los decimales y nunca entran al escritor", async () => {
  await upsertMirrorRows(db, "recurring_income_occurrences", [row(9, { amount: "90000000000000.1234" })]);
  const record = await getServerShapedRow(db, "recurring_income_occurrences", 9);
  expect(record?.amount).toBe("90000000000000.1234");
  expect((await db.get<{ money_cents: number | null }>("select money_cents from recurring_income_occurrences"))?.money_cents).toBeNull();
  await expect(updateRowLocal(db, { ...context, table: "recurring_income_occurrences" as never, id: 9, fields: { amount: 5 } })).rejects.toThrow("solo lectura");
  expect(await countOutbox(db)).toBe(0);
});

it("aplica SET NULL y conserva el orden padre → movimiento → borrado del padre", async () => {
  await addPoolIds(db, 1, "categories", [10]);
  await addPoolIds(db, 1, "movements", [20]);
  await createRowLocal(db, { ...context, fields: { name: "Temporal" } });
  await createMovementLocal(db, { workspaceId: 1, userId: "u1", fields: { movement_type: "expense", status: "posted", occurred_at: "2026-10-13T12:00:00Z", source_amount: 12.5, category_id: 10 } });
  await deleteRowLocal(db, { ...context, id: 10 });
  expect((await ops()).map(op => [op.table, op.kind])).toEqual([["categories", "insert"], ["movements", "insert"], ["categories", "delete"]]);
  expect((await getServerShapedRow(db, "movements", 20))?.category_id).toBeNull();
});

it("el borrado del padre limpia historiales readonly por CASCADE", async () => {
  await upsertMirrorRows(db, "recurring_income", [row(1, { amount: "10.00" })]);
  await upsertMirrorRows(db, "recurring_income_occurrences", [row(2, { recurring_income_id: 1, amount: "10.0000" })]);
  await deleteRowLocal(db, { ...context, table: "recurring_income", id: 1 });
  expect(await listRowsLocal(db, "recurring_income_occurrences", 1, "u1")).toEqual([]);
  expect((await ops()).map(op => op.table)).toEqual(["recurring_income"]);
});

it("rechaza tablas fuera de la lista cerrada", async () => {
  await expect(createRowLocal(db, { ...context, table: "categories; drop table movements" as never, fields: {} })).rejects.toThrow();
  expect(await countOutbox(db)).toBe(0);
});

it.each(WRITABLE_RESOURCE_TABLES)("el escritor genérico crea, edita y borra %s con su pool", async table => {
  await addPoolIds(db, 1, table, [88]);
  const created = await createRowLocal(db, { ...context, table, fields: { notes: "Inicial" } });
  expect(created?.id).toBe(88);
  if (table === "workspace_financial_goals") expect(created?.user_id).toBe("u1");
  if (table === "movement_templates") expect(created).not.toHaveProperty("updated_by_user_id");
  expect((await updateRowLocal(db, { ...context, table, id: 88, fields: { notes: "Editada", workspace_id: 2, user_id: "u2" } }))?.notes).toBe("Editada");
  expect((await ops())[0].fields).not.toHaveProperty("workspace_id");
  expect(await deleteRowLocal(db, { ...context, table, id: 88 })).toBe(true);
  expect(await getRowLocal(db, table, 1, 88, "u1")).toBeNull();
  expect((await ops()).map(op => op.kind)).toEqual(["insert", "delete"]);
});

it("una definición con fracciones dentro de descuentos es readonly, sin redondear", async () => {
  await upsertMirrorRows(db, "recurring_income", [row(55, { amount: "100.00", deductions: [{ name: "Ajuste", amount: "0.001" }] })]);
  await expect(updateRowLocal(db, { ...context, table: "recurring_income", id: 55, fields: { notes: "Cambio" } })).rejects.toThrow("fracción de centavo");
  await expect(deleteRowLocal(db, { ...context, table: "recurring_income", id: 55 })).rejects.toThrow("fracción de centavo");
  expect(await countOutbox(db)).toBe(0);
});

it("no sustituye el borrado online de suscripción con pagos por un borrado distinto", async () => {
  await upsertMirrorRows(db, "subscriptions", [row(44, { amount: "10.00" })]);
  await upsertMirrorRows(db, "movements", [row(33, { subscription_id: 44, source_amount: 10, movement_type: "expense", status: "posted", occurred_at: "2026-10-01T00:00:00Z" })]);
  await expect(deleteRowLocal(db, { ...context, table: "subscriptions", id: 44 })).rejects.toThrow("Necesitas internet");
  expect(await countOutbox(db)).toBe(0);
  expect(await getRowLocal(db, "subscriptions", 1, 44, "u1")).not.toBeNull();
});

it("migra una base v1 con datos a v2 sin cambiar el SQL publicado", async () => {
  const source = readFileSync(join(process.cwd(), "lib/offline/schema.ts"), "utf8").replace(/\r\n/g, "\n");
  const v1 = /const MIGRATIONS: string\[\] = \[\s*`([\s\S]*?)`,/.exec(source)![1];
  const legacy = createTestDriver();
  try {
    await legacy.exec(v1); await legacy.exec("pragma user_version=1");
    await legacy.run("insert into accounts(id,workspace_id,updated_at,data) values(1,1,'2026-01-01',?)", [JSON.stringify(row(1, { name: "Existente", opening_balance: 10 }))]);
    await migrate(legacy);
    expect((await legacy.get<{ user_version: number }>("pragma user_version"))?.user_version).toBe(2);
    expect((await getServerShapedRow(legacy, "accounts", 1))?.name).toBe("Existente");
    expect((await getServerShapedRow(legacy, "accounts", 1))?.opening_balance).toBe("10");
    expect((await legacy.get<{ money_cents: number }>("select money_cents from accounts where id=1"))?.money_cents).toBe(1000);
    expect(createHash("sha256").update(v1).digest("hex")).toBe("d86d60c5cd965993a62dc23b98a03245899f360fc3376466bd4bef94d6a392a7");
  } finally { await legacy.close(); }
});
