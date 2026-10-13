/**
 * SQLite en memoria para las pruebas del motor (node:sqlite, incluido en Node ≥ 22.5).
 * Sustituye a expo-sqlite, que necesita el teléfono.
 */
import { serializeDriver, type RawSqlDriver, type SqlDriver, type SqlParam } from "../../sql-driver";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any };

export function createTestDriver(): SqlDriver {
  const db = new DatabaseSync(":memory:");
  const raw: RawSqlDriver = {
    async exec(sql: string) {
      db.exec(sql);
    },
    async run(sql: string, params: SqlParam[] = []) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: SqlParam[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async close() {
      db.close();
    },
  };
  return serializeDriver(raw);
}
