import { copyDatabase, hasUserTables } from "../db-copy";
import { bytesToHex, keyNameFor, sqlcipherKeyPragma } from "../db-key";
import { migrate } from "../schema";
import { enqueueOp, listSendable } from "../outbox";
import { createTestDriver } from "./helpers/node-sqlite-driver";

describe("copia completa de la base (de sin cifrar a cifrada)", () => {
  it("copia esquema, filas, índices y la cola de cambios sin enviar, y marca la copia como completa", async () => {
    const source = createTestDriver();
    await migrate(source);
    await source.run(`insert into accounts (id, workspace_id, updated_at, data, money_cents) values (1, 7, '2026-10-20T00:00:00Z', '{"name":"Efectivo"}', 10000)`);
    await source.transaction((tx) => enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 7, rowId: 55, fields: { description: "Café" } }));
    await source.transaction((tx) => enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 7, rowId: 56, fields: { description: "Pan" } }));

    const target = createTestDriver();
    expect(await hasUserTables(target)).toBe(false);
    const copied = await copyDatabase(source, target);
    expect(copied.tables).toBeGreaterThan(10);
    expect(copied.rows).toBe(3);

    expect(await hasUserTables(target)).toBe(true);
    const version = (await target.get<{ user_version: number }>("pragma user_version"))?.user_version;
    expect(Number(version)).toBeGreaterThan(0);
    expect(await target.get("select data from accounts where id = 1")).toEqual({ data: '{"name":"Efectivo"}' });
    // La cola sigue completa y en el mismo orden: nada de lo pendiente se pierde al cifrar.
    const queue = await listSendable(target, 7, 100, "9999-01-01T00:00:00.000Z");
    expect(queue.map((op) => op.rowId)).toEqual([55, 56]);
    // Y los índices también (si faltaran, las consultas locales serían lentas).
    const indexes = (await target.all<{ name: string }>("select name from sqlite_master where type = 'index' and name like 'outbox_%'")).map((row) => row.name);
    expect(indexes).toEqual(expect.arrayContaining(["outbox_status_idx", "outbox_row_idx"]));
  });

  it("la base copiada sigue funcionando: la cola continúa numerándose sin chocar", async () => {
    const source = createTestDriver();
    await migrate(source);
    await source.transaction((tx) => enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 1, rowId: 1, fields: {} }));
    const target = createTestDriver();
    await copyDatabase(source, target);
    await target.transaction((tx) => enqueueOp(tx, { table: "movements", kind: "insert", workspaceId: 1, rowId: 2, fields: {} }));
    const seqs = (await target.all<{ seq: number }>("select seq from outbox order by seq")).map((row) => Number(row.seq));
    expect(seqs).toEqual([1, 2]);
  });

  it("si la copia falla a medias no deja nada a medias: user_version sigue en 0", async () => {
    const source = createTestDriver();
    await migrate(source);
    // Una fila con una columna que la base destino no acepta provoca el fallo en medio de la copia.
    await source.run(`insert into accounts (id, workspace_id, updated_at, data) values (1, 1, 'x', '{}')`);
    const target = createTestDriver();
    await target.exec("create table accounts (id integer primary key)"); // esquema distinto → el create de la copia chocará
    await expect(copyDatabase(source, target)).rejects.toThrow();
    const version = (await target.get<{ user_version: number }>("pragma user_version"))?.user_version;
    expect(Number(version)).toBe(0);
  });
});

describe("llave de la base", () => {
  it("32 bytes se vuelven 64 caracteres hexadecimales", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
    expect(bytesToHex(new Uint8Array(32).fill(171))).toHaveLength(64);
  });

  it("el comando de SQLCipher usa la llave cruda y rechaza cualquier otra forma", () => {
    const key = "ab".repeat(32);
    expect(sqlcipherKeyPragma(key)).toBe(`pragma key = "x'${key}'"`);
    expect(() => sqlcipherKeyPragma("corta")).toThrow();
    expect(() => sqlcipherKeyPragma(`${"a".repeat(63)}'`)).toThrow(); // nada de comillas que rompan el comando
  });

  it("la llave se guarda con un nombre propio por usuario", () => {
    expect(keyNameFor("abc-123")).toBe("darkmoney-db-key-abc-123");
    expect(keyNameFor("../x")).not.toContain("/");
  });
});
