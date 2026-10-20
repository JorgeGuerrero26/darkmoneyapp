import type { SqlExecutor, SqlDriver } from "./sql-driver";

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null };

/** Comillas de identificador SQL (los nombres vienen de sqlite_master, pero se escapan igual). */
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Copia COMPLETA de una base SQLite a otra vacía: esquema (tablas, índices, disparadores), todas las filas y `user_version`.
 *
 * Sirve para pasar la copia local del teléfono de una base sin cifrar a una cifrada (SQLCipher) sin perder nada, en
 * particular lo que todavía no se ha enviado al servidor (la cola de cambios). Todo ocurre en UNA transacción de la base
 * destino y `user_version` se escribe al final: si el proceso se corta a medias, la base destino queda con
 * `user_version = 0` y la próxima vez se vuelve a empezar de cero.
 *
 * Devuelve cuántas tablas y filas se copiaron.
 */
export async function copyDatabase(source: SqlExecutor, target: SqlDriver): Promise<{ tables: number; rows: number }> {
  const master = await source.all<MasterRow>(
    `select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' and sql is not null order by rowid`,
  );
  const version = Number((await source.get<{ user_version: number }>("pragma user_version"))?.user_version ?? 0);
  const tables = master.filter((row) => row.type === "table");
  const others = master.filter((row) => row.type !== "table"); // índices y disparadores, después de las tablas
  let rows = 0;

  await target.transaction(async (tx) => {
    for (const table of tables) await tx.exec(table.sql!);
    for (const table of tables) {
      const columns = (await source.all<{ name: string }>(`pragma table_info(${q(table.name)})`)).map((column) => column.name);
      if (columns.length === 0) continue;
      const names = columns.map(q).join(", ");
      const marks = columns.map(() => "?").join(", ");
      const data = await source.all<Record<string, string | number | null>>(`select ${names} from ${q(table.name)}`);
      for (const row of data) {
        await tx.run(`insert into ${q(table.name)} (${names}) values (${marks})`, columns.map((column) => row[column] ?? null));
        rows += 1;
      }
    }
    for (const other of others) await tx.exec(other.sql!);
    // Al final y sin parámetros: PRAGMA no admite enlaces. Marca la copia como completa.
    await tx.exec(`pragma user_version = ${Math.max(0, Math.floor(version))}`);
  });
  return { tables: tables.length, rows };
}

/** ¿Tiene alguna tabla propia? (una base recién creada no la tiene). */
export async function hasUserTables(db: SqlExecutor): Promise<boolean> {
  const row = await db.get<{ n: number }>(`select count(*) as n from sqlite_master where type = 'table' and name not like 'sqlite_%'`);
  return Number(row?.n ?? 0) > 0;
}
