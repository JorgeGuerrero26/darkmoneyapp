import { migrate } from "../schema";
import {
  addInbox, backoffMs, countInbox, countOutbox, enqueueOp, listInbox, listSendable, markSending,
  newGroup, pendingRowIds, rebaseFollowingOps, releaseOps, resetStuckOps, resolveInbox, runLocalGroup,
} from "../outbox";
import { addPoolIds, idsToReserve, poolSize, takePoolId } from "../id-pool";
import { newOpId } from "../uuid";
import type { SqlDriver } from "../sql-driver";
import { createTestDriver } from "./helpers/node-sqlite-driver";

let db: SqlDriver;
beforeEach(async () => {
  db = createTestDriver();
  await migrate(db);
});

const enqueue = (kind: "insert" | "update" | "delete", rowId: number, fields: Record<string, unknown> = {}, base: string | null = null) =>
  db.transaction((tx) => enqueueOp(tx, { table: "movements", kind, workspaceId: 1, rowId, fields, baseUpdatedAt: base }));

const ops = () => listSendable(db, 1, 100, "9999-01-01T00:00:00.000Z");

describe("cola: fusión de operaciones de una misma fila", () => {
  it("insert + update = un insert con los campos fusionados", async () => {
    await enqueue("insert", 10, { description: "Café", source_amount: 5 });
    await enqueue("update", 10, { description: "Café doble" }, "2026-01-01T00:00:00.000Z");
    const list = await ops();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("insert");
    expect(list[0].fields).toEqual({ description: "Café doble", source_amount: 5 });
  });

  it("update + update = un update con la base del primero", async () => {
    await enqueue("update", 10, { description: "a" }, "2026-01-01T00:00:00.000Z");
    await enqueue("update", 10, { notes: "b" }, "2026-02-02T00:00:00.000Z");
    const list = await ops();
    expect(list).toHaveLength(1);
    expect(list[0].fields).toEqual({ description: "a", notes: "b" });
    expect(list[0].baseUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("insert + delete = nada (la fila nunca existió en el servidor)", async () => {
    await enqueue("insert", 10, { description: "x" });
    await enqueue("delete", 10);
    expect(await ops()).toHaveLength(0);
  });

  it("update + delete = un delete que conserva la base del update", async () => {
    await enqueue("update", 10, { description: "a" }, "2026-01-01T00:00:00.000Z");
    await enqueue("delete", 10, {}, "2026-03-03T00:00:00.000Z");
    const list = await ops();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("delete");
    expect(list[0].baseUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("filas distintas no se fusionan", async () => {
    await enqueue("update", 10, { description: "a" }, "2026-01-01T00:00:00.000Z");
    await enqueue("update", 11, { description: "b" }, "2026-01-01T00:00:00.000Z");
    expect(await ops()).toHaveLength(2);
  });

  it("una operación ya enviada no se toca: la nueva se añade detrás", async () => {
    await enqueue("insert", 10, { description: "a" });
    const [first] = await ops();
    await markSending(db, [first.opId]);
    await enqueue("update", 10, { description: "b" }, "2026-01-01T00:00:00.000Z");
    const sendable = await ops();
    expect(sendable).toHaveLength(1);
    expect(sendable[0].kind).toBe("update");
    expect(await countOutbox(db)).toBe(2);
  });

  it("respeta el orden en que se hicieron", async () => {
    await enqueue("insert", 3, { description: "tercero" });
    await enqueue("insert", 1, { description: "primero?" });
    await enqueue("insert", 2, { description: "segundo?" });
    expect((await ops()).map((op) => op.rowId)).toEqual([3, 1, 2]);
  });
});

describe("cola: reintentos", () => {
  it("rebase corrige la base de las ediciones siguientes pero no la de un insert", async () => {
    await enqueue("update", 10, { description: "a" }, "2026-01-01T00:00:00.000Z");
    await rebaseFollowingOps(db, "movements", 10, "2026-05-05T00:00:00.000Z");
    expect((await ops())[0].baseUpdatedAt).toBe("2026-05-05T00:00:00.000Z");
  });

  it("releaseOps devuelve la operación a la cola con espera creciente", async () => {
    await enqueue("update", 10, { description: "a" }, "2026-01-01T00:00:00.000Z");
    const [op] = await ops();
    await markSending(db, [op.opId]);
    const t0 = Date.parse("2026-06-01T00:00:00.000Z");
    await releaseOps(db, [op.opId], t0);
    expect(await listSendable(db, 1, 10, new Date(t0 + 1000).toISOString())).toHaveLength(0);
    const later = await listSendable(db, 1, 10, new Date(t0 + backoffMs(0) + 1).toISOString());
    expect(later).toHaveLength(1);
    expect(later[0].attempts).toBe(1);
  });

  it("el backoff crece y tiene tope de 5 minutos", () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(30)).toBe(300_000);
  });

  it("resetStuckOps rescata lo que quedó 'enviándose' tras un cierre brusco", async () => {
    await enqueue("insert", 10, { description: "a" });
    const [op] = await ops();
    await markSending(db, [op.opId]);
    expect(await ops()).toHaveLength(0);
    await resetStuckOps(db);
    expect(await ops()).toHaveLength(1);
  });

  it("pendingRowIds lista las filas con cambios sin resolver", async () => {
    await enqueue("update", 10, { description: "a" }, "x");
    await enqueue("insert", 12, { description: "b" });
    expect([...(await pendingRowIds(db, "movements"))].sort()).toEqual([10, 12]);
  });
});

describe("bandeja", () => {
  it("guarda, cuenta y resuelve entradas", async () => {
    await addInbox(db, { opId: newOpId(), table: "movements", rowId: 1, kind: "insert", status: "rejected", code: "forbidden", message: "no", summary: "Nuevo Café" });
    await addInbox(db, { opId: newOpId(), table: "movements", rowId: 2, kind: "update", status: "review", previous: { source_amount: 20 }, summary: "Edición" });
    expect(await countInbox(db)).toEqual({ rejected: 1, review: 1 });
    const list = await listInbox(db);
    expect(list).toHaveLength(2);
    expect(list.find((entry) => entry.status === "review")?.previous).toEqual({ source_amount: 20 });
    await resolveInbox(db, list[0].id);
    expect(await listInbox(db)).toHaveLength(1);
  });
});

describe("pool de IDs", () => {
  it("entrega cada ID una sola vez, de menor a mayor", async () => {
    await addPoolIds(db, 1, "movements", [30, 10, 20, 10]);
    expect(await poolSize(db, 1, "movements")).toBe(3);
    expect(await db.transaction((tx) => takePoolId(tx, 1, "movements"))).toBe(10);
    expect(await db.transaction((tx) => takePoolId(tx, 1, "movements"))).toBe(20);
    expect(await db.transaction((tx) => takePoolId(tx, 1, "movements"))).toBe(30);
    expect(await db.transaction((tx) => takePoolId(tx, 1, "movements"))).toBeNull();
  });

  it("decide cuántos pedir", () => {
    expect(idsToReserve(0)).toBe(200);
    expect(idsToReserve(49)).toBe(151);
    expect(idsToReserve(50)).toBe(0);
    expect(idsToReserve(500)).toBe(0);
  });
});

describe("op_id", () => {
  it("tiene formato UUID v4 y no se repite", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newOpId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("cola: grupos atómicos (Fase 5.1)", () => {
  const inGroup = (kind: "insert" | "update" | "delete", table: string, rowId: number, group: { id: string; size: number }, fields: Record<string, unknown> = {}) =>
    enqueueOp(db, { table, kind, workspaceId: 1, rowId, fields, group });

  it("las operaciones de un grupo no se fusionan con otras de la misma fila ni entre sí", async () => {
    await enqueue("insert", 10, { description: "suelta" });
    const group = newGroup(2);
    await inGroup("update", "movements", 10, group, { description: "del grupo" });
    await inGroup("insert", "movements", 11, group, { description: "otra" });
    const list = await ops();
    expect(list).toHaveLength(3);
    expect(list.filter((op) => op.groupId === group.id)).toHaveLength(2);
    expect(list[0].fields).toEqual({ description: "suelta" }); // la suelta no absorbió la del grupo
  });

  it("una edición posterior de una fila cuyo alta va en un grupo no se funde con ese grupo", async () => {
    const group = newGroup(2);
    await inGroup("insert", "movements", 20, group, { description: "pago" });
    await inGroup("insert", "movements", 21, group, { description: "otro" });
    await enqueue("update", 20, { description: "editado después" }, "2026-01-01T00:00:00.000Z");
    const list = await ops();
    expect(list).toHaveLength(3);
    expect(list[0].fields).toEqual({ description: "pago" });
    expect(list[2].kind).toBe("update");
  });

  it("un grupo cuenta como UN cambio pendiente", async () => {
    const group = newGroup(3);
    for (const id of [30, 31, 32]) await inGroup("insert", "movements", id, group, {});
    await enqueue("insert", 40, {});
    expect(await countOutbox(db, 1)).toBe(2);
    expect(await countOutbox(db)).toBe(2);
  });

  it("runLocalGroup revierte todo si se encola un número distinto de operaciones", async () => {
    await expect(
      runLocalGroup(db, 2, async (tx, group) => { await enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 1, rowId: 50, fields: {}, group }); }),
    ).rejects.toThrow("esperaba 2");
    expect(await ops()).toHaveLength(0);
  });

  it("runLocalGroup deja las dos operaciones juntas cuando todo sale bien", async () => {
    await runLocalGroup(db, 2, async (tx, group) => {
      await enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 1, rowId: 60, fields: {}, group });
      await enqueueOp(tx, { table: "subscriptions", kind: "update", workspaceId: 1, rowId: 7, fields: { next_due_date: "2026-11-01" }, baseUpdatedAt: "x", group });
    });
    const list = await ops();
    expect(list.map((op) => op.groupSize)).toEqual([2, 2]);
    expect(new Set(list.map((op) => op.groupId)).size).toBe(1);
  });

  it("el tamaño de un grupo va de 2 a 10", () => {
    expect(() => newGroup(1)).toThrow();
    expect(() => newGroup(11)).toThrow();
    expect(newGroup(10).size).toBe(10);
  });
});
