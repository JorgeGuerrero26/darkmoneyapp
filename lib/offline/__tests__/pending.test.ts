import { describePendingChange, describeSyncLine } from "../status-copy";
import { listPendingChanges, pendingRowTimes } from "../pending";
import { createRowLocal, deleteRowLocal, updateRowLocal } from "../resource-writes";
import { createMovementLocal } from "../movement-writes";
import { addPoolIds } from "../id-pool";
import { migrate } from "../schema";
import type { OfflineState } from "../runtime";
import { createTestDriver } from "./helpers/node-sqlite-driver";

const WS = 1;
const USER = "00000000-0000-0000-0000-00000000000a";

async function setup() {
  const db = createTestDriver();
  await migrate(db);
  for (const table of ["movements", "accounts", "categories"]) await addPoolIds(db, WS, table, [100, 101, 102, 103, 104, 105]);
  return db;
}

const base: OfflineState = {
  availability: "ready", online: true, syncing: false, hydrated: true, workspaceId: WS, pending: 0, sendingTotal: 0,
  rejected: 0, review: 0, lastSyncAt: null, lastError: null,
};

describe("cambios pendientes", () => {
  it("lista lo guardado sin enviar, lo más reciente primero, con el nombre de lo que cambió", async () => {
    const db = await setup();
    await createRowLocal(db, { workspaceId: WS, userId: USER, table: "accounts", fields: { name: "Cuenta prueba" }, nowIso: "2026-10-14T10:00:00.000Z" });
    await createMovementLocal(db, {
      workspaceId: WS, userId: USER, nowIso: "2026-10-14T10:05:00.000Z",
      fields: { movement_type: "expense", status: "posted", occurred_at: "2026-10-14T10:05:00.000Z", description: "Café", notes: null,
        source_account_id: 100, source_amount: 5, destination_account_id: null, destination_amount: null, fx_rate: null, category_id: null,
        spend_type_id: null, counterparty_id: null, obligation_id: null, subscription_id: null, metadata: {}, client_dedupe_key: "k1" },
    });
    const changes = await listPendingChanges(db);
    expect(changes.map((change) => [change.table, change.kind, change.label])).toEqual([
      ["movements", "insert", "Café"],
      ["accounts", "insert", "Cuenta prueba"],
    ]);
    expect(changes[0].createdAt).toBe("2026-10-14T10:05:00.000Z");
  });

  it("una edición dice qué campos cambió y un borrado se cuenta aunque la fila ya no exista", async () => {
    const db = await setup();
    const created = (await createRowLocal(db, { workspaceId: WS, userId: USER, table: "categories", fields: { name: "Comida" }, nowIso: "2026-10-14T10:00:00.000Z" }))!;
    // Simula que el servidor ya la confirmó para que edición y borrado no se fusionen con el alta.
    await db.run("delete from outbox");
    await updateRowLocal(db, { workspaceId: WS, userId: USER, table: "categories", id: created.id, fields: { name: "Comida y bebida", color: "#fff" }, nowIso: "2026-10-14T11:00:00.000Z" });
    const [edit] = await listPendingChanges(db);
    expect(edit).toMatchObject({ kind: "update", label: "Comida y bebida" });
    expect(edit.changedFields.sort()).toEqual(["color", "name"]);
    await db.run("delete from outbox");
    await deleteRowLocal(db, { workspaceId: WS, userId: USER, table: "categories", id: created.id, nowIso: "2026-10-14T12:00:00.000Z" });
    const [gone] = await listPendingChanges(db);
    expect(gone).toMatchObject({ kind: "delete", label: null });
  });

  it("da la hora de cada fila pendiente de una tabla para marcarla en su lista", async () => {
    const db = await setup();
    const row = (await createRowLocal(db, { workspaceId: WS, userId: USER, table: "accounts", fields: { name: "A" }, nowIso: "2026-10-14T09:00:00.000Z" }))!;
    expect(await pendingRowTimes(db, WS, "accounts")).toEqual([{ id: row.id, at: "2026-10-14T09:00:00.000Z" }]);
    expect(await pendingRowTimes(db, WS, "movements")).toEqual([]);
    expect(await pendingRowTimes(db, 2, "accounts")).toEqual([]);
  });
});

describe("línea de estado del encabezado (Revisión 54)", () => {
  it("con todo al día no dice nada: se ve 'Actualizado hace…'", () => {
    expect(describeSyncLine(base)).toBeNull();
    expect(describeSyncLine({ ...base, availability: "disabled" })).toBeNull();
  });

  it("sin conexión: dorado, con los pendientes y se puede tocar", () => {
    expect(describeSyncLine({ ...base, online: false, pending: 3 })).toEqual({ kind: "offline", text: "Sin conexión · 3 por enviar", tappable: true });
    expect(describeSyncLine({ ...base, online: false })).toEqual({ kind: "offline", text: "Sin conexión", tappable: true });
  });

  it("al volver internet: 'Enviando 2 de 3…' y no se toca", () => {
    expect(describeSyncLine({ ...base, syncing: true, sendingTotal: 3, pending: 2 })).toEqual({ kind: "sending", text: "Enviando 2 de 3…", tappable: false });
    expect(describeSyncLine({ ...base, syncing: true, sendingTotal: 3, pending: 3 })?.text).toBe("Enviando 1 de 3…");
    expect(describeSyncLine({ ...base, syncing: true, sendingTotal: 3, pending: 1 })?.text).toBe("Enviando 3 de 3…");
  });

  it("si algo falla: rojo 'necesita revisión', y no desaparece hasta resolverlo", () => {
    expect(describeSyncLine({ ...base, rejected: 1 })).toEqual({ kind: "review", text: "1 cambio necesita revisión", tappable: true });
    expect(describeSyncLine({ ...base, rejected: 1, review: 1 })?.text).toBe("2 cambios necesitan revisión");
    expect(describeSyncLine({ ...base, rejected: 1, online: false, pending: 2 })?.kind).toBe("review");
  });

  it("con internet y pendientes sin ciclo en curso (reintento): 'N por enviar'", () => {
    expect(describeSyncLine({ ...base, pending: 2 })).toEqual({ kind: "pending", text: "2 por enviar", tappable: true });
  });
});

describe("texto de cada cambio", () => {
  it("concuerda género y dice qué se editó", () => {
    expect(describePendingChange({ table: "movements", kind: "insert", changedFields: [], label: "Café" })).toEqual({ title: "Nuevo movimiento · Café", detail: null });
    expect(describePendingChange({ table: "accounts", kind: "insert", changedFields: [], label: null })).toEqual({ title: "Nueva cuenta", detail: null });
    expect(describePendingChange({ table: "accounts", kind: "update", changedFields: ["name", "color"], label: "Principal" })).toEqual({
      title: "Cuenta editada · Principal", detail: "nombre, color",
    });
    expect(describePendingChange({ table: "categories", kind: "delete", changedFields: [], label: null }).title).toBe("Categoría borrada");
    expect(describePendingChange({ table: "budgets", kind: "delete", changedFields: [], label: "Comida" }).title).toBe("Presupuesto borrado · Comida");
  });
});
