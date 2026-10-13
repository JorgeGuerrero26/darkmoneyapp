import { serializeDriver, type RawSqlDriver, type SqlDriver, type SqlParam } from "./sql-driver";

/**
 * Adaptador de expo-sqlite para el motor offline.
 *
 * expo-sqlite pide su módulo nativo al evaluarse y LANZA si el binario no lo trae (un APK 1.0.x o
 * el IPA 1.0.8 que reciban este JS por OTA). Por eso se carga con require protegido, igual que
 * lib/speech-recognition-safe.ts: sin el módulo, el motor queda "no disponible" y la app sigue
 * funcionando como siempre.
 */
type ExpoSqliteModule = typeof import("expo-sqlite");

let cached: ExpoSqliteModule | null | undefined;

export function loadExpoSqlite(): ExpoSqliteModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-sqlite") as ExpoSqliteModule;
    cached = typeof mod?.openDatabaseAsync === "function" ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isSqliteAvailable(): boolean {
  return loadExpoSqlite() !== null;
}

/** Una base por usuario: cambiar de cuenta en el mismo teléfono nunca mezcla datos. */
export function databaseNameFor(userId: string): string {
  return `darkmoney-offline-${userId.replace(/[^a-zA-Z0-9-]/g, "")}.db`;
}

export async function openExpoDriver(name: string): Promise<SqlDriver | null> {
  const sqlite = loadExpoSqlite();
  if (!sqlite) return null;
  const db = await sqlite.openDatabaseAsync(name);
  // WAL: lecturas de la UI sin esperar a que termine una escritura del motor.
  await db.execAsync("pragma journal_mode = wal; pragma synchronous = normal;");

  const raw: RawSqlDriver = {
    exec: (sql) => db.execAsync(sql),
    async run(sql: string, params: SqlParam[] = []) {
      const result = await db.runAsync(sql, params);
      return { changes: result.changes };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
    async get<T>(sql: string, params: SqlParam[] = []) {
      return (await db.getFirstAsync<T>(sql, params)) ?? null;
    },
    close: () => db.closeAsync(),
  };
  return serializeDriver(raw);
}

/** Borra la base de un usuario (al cerrar sesión: no deben quedar datos financieros en el teléfono). */
export async function deleteExpoDatabase(name: string): Promise<void> {
  const sqlite = loadExpoSqlite();
  if (!sqlite) return;
  try {
    await sqlite.deleteDatabaseAsync(name);
  } catch {
    // Si no existía o está en uso, no hay nada más que hacer.
  }
}
