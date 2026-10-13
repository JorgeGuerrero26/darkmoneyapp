import { migrate, SCHEMA_VERSION } from "../schema";
import { createTestDriver } from "./helpers/node-sqlite-driver";

describe("base local", () => {
  it("migra a la versión actual y es idempotente", async () => {
    const db = createTestDriver();
    await migrate(db);
    await migrate(db);
    const row = await db.get<{ user_version: number }>("pragma user_version");
    expect(Number(row?.user_version)).toBe(SCHEMA_VERSION);
    const tables = await db.all<{ name: string }>("select name from sqlite_master where type = 'table' order by name");
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(["movements", "outbox", "inbox", "id_pool", "sync_cursors"]));
  });
});
