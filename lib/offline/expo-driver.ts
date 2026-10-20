import { copyDatabase, hasUserTables } from "./db-copy";
import { deleteDatabaseKey, getOrCreateDatabaseKey, sqlcipherKeyPragma } from "./db-key";
import { serializeDriver, type RawSqlDriver, type SqlDriver, type SqlParam } from "./sql-driver";

/**
 * Adaptador de expo-sqlite para el motor offline.
 *
 * expo-sqlite pide su módulo nativo al evaluarse y LANZA si el binario no lo trae (un APK 1.0.x o
 * el IPA 1.0.8 que reciban este JS por OTA). Por eso se carga con require protegido, igual que
 * lib/speech-recognition-safe.ts: sin el módulo, el motor queda "no disponible" y la app sigue
 * funcionando como siempre.
 *
 * CIFRADO (SQLCipher). Los binarios compilados con `useSQLCipher` cifran la copia local con una llave aleatoria guardada en el
 * llavero del teléfono (db-key.ts). Los binarios anteriores no tienen SQLCipher: abren la base de siempre, sin cifrar. El mismo
 * JS sirve para los dos; se detecta con `pragma cipher_version`.
 */
type ExpoSqliteModule = typeof import("expo-sqlite");
type ExpoDb = Awaited<ReturnType<ExpoSqliteModule["openDatabaseAsync"]>>;

let cached: ExpoSqliteModule | null | undefined;
let databaseEncrypted = false;

/** ¿La copia local abierta ahora está cifrada? (Ajustes → Modo sin conexión lo muestra para poder comprobarlo.) */
export function isDatabaseEncrypted(): boolean {
  return databaseEncrypted;
}

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

/** La base CIFRADA del usuario: otro nombre, para que la migración desde la base sin cifrar no necesite renombrar archivos. */
export function encryptedDatabaseNameFor(userId: string): string {
  return `darkmoney-offline-enc-${userId.replace(/[^a-zA-Z0-9-]/g, "")}.db`;
}

function toDriver(db: ExpoDb): SqlDriver {
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

// WAL: lecturas de la UI sin esperar a que termine una escritura del motor.
const WAL = "pragma journal_mode = wal; pragma synchronous = normal;";

async function openPlain(sqlite: ExpoSqliteModule, name: string): Promise<SqlDriver> {
  const db = await sqlite.openDatabaseAsync(name);
  await db.execAsync(WAL);
  return toDriver(db);
}

/**
 * Abre la base cifrada con su llave. `null` = este binario no trae SQLCipher (la llave se ignora y la base quedaría sin cifrar):
 * quien llama usa entonces la base de siempre.
 */
async function openEncrypted(sqlite: ExpoSqliteModule, name: string, hexKey: string): Promise<ExpoDb | null> {
  const db = await sqlite.openDatabaseAsync(name);
  // La llave tiene que ser lo PRIMERO que se ejecuta sobre la conexión.
  await db.execAsync(sqlcipherKeyPragma(hexKey));
  const cipher = await db.getFirstAsync<{ cipher_version?: string }>("pragma cipher_version");
  if (!cipher?.cipher_version) {
    await db.closeAsync();
    return null;
  }
  return db;
}

async function dropDatabase(sqlite: ExpoSqliteModule, name: string): Promise<void> {
  try {
    await sqlite.deleteDatabaseAsync(name);
  } catch {
    // Si no existía o está en uso, no hay nada más que hacer.
  }
}

export async function openExpoDriver(userId: string): Promise<SqlDriver | null> {
  databaseEncrypted = false;
  const sqlite = loadExpoSqlite();
  if (!sqlite) return null;
  const plainName = databaseNameFor(userId);
  const encryptedName = encryptedDatabaseNameFor(userId);

  // Puede lanzar (llavero bloqueado tras reiniciar): el motor queda «no disponible» y no se abre otra base a escondidas.
  const key = await getOrCreateDatabaseKey(userId);
  if (!key) return openPlain(sqlite, plainName);

  let encrypted = await openEncrypted(sqlite, encryptedName, key);
  if (!encrypted) {
    // Binario sin SQLCipher: se abre la base de siempre y se quita el archivo cifrado vacío que acaba de crearse.
    await dropDatabase(sqlite, encryptedName);
    return openPlain(sqlite, plainName);
  }

  // ¿Se puede leer con esta llave? Si no (archivo restaurado en otro teléfono, o dañado) se descarta: la copia local es solo
  // un espejo del servidor y se vuelve a descargar.
  try {
    await encrypted.getFirstAsync("select count(*) as n from sqlite_master");
  } catch {
    await encrypted.closeAsync();
    await dropDatabase(sqlite, encryptedName);
    encrypted = await openEncrypted(sqlite, encryptedName, key);
    if (!encrypted) return openPlain(sqlite, plainName);
  }
  await encrypted.execAsync(WAL);
  let driver = toDriver(encrypted);

  // `user_version` 0 = base nueva o migración que quedó a medias.
  const version = Number((await driver.get<{ user_version: number }>("pragma user_version"))?.user_version ?? 0);
  if (version === 0) {
    if (await hasUserTables(driver)) {
      // Migración incompleta: se parte de cero.
      await driver.close();
      await dropDatabase(sqlite, encryptedName);
      const fresh = await openEncrypted(sqlite, encryptedName, key);
      if (!fresh) return openPlain(sqlite, plainName);
      await fresh.execAsync(WAL);
      driver = toDriver(fresh);
    }
    // Lo que hubiera sin cifrar (incluida la cola de cambios sin enviar) pasa entero a la base cifrada y luego se borra.
    const plain = toDriver(await sqlite.openDatabaseAsync(plainName));
    if (await hasUserTables(plain)) await copyDatabase(plain, driver);
    await plain.close();
    await dropDatabase(sqlite, plainName);
  }
  databaseEncrypted = true;
  return driver;
}

/** Borra la base de un usuario, cifrada o no, y su llave (al cerrar sesión: no deben quedar datos financieros en el teléfono). */
export async function deleteExpoDatabase(userId: string): Promise<void> {
  const sqlite = loadExpoSqlite();
  if (sqlite) {
    await dropDatabase(sqlite, databaseNameFor(userId));
    await dropDatabase(sqlite, encryptedDatabaseNameFor(userId));
  }
  await deleteDatabaseKey(userId);
}
