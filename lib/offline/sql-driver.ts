/**
 * Acceso a SQLite del motor offline, independiente de la librería.
 *
 * En la app lo implementa expo-sqlite (expo-driver.ts); en las pruebas, node:sqlite. El motor y
 * los almacenes solo conocen estas interfaces, así que toda su lógica se prueba sin teléfono.
 */
export type SqlParam = string | number | null;

/** Lo que pueden usar los almacenes: sirve igual dentro y fuera de una transacción. */
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

export interface SqlDriver extends SqlExecutor {
  /**
   * Ejecuta `fn` en una transacción exclusiva: nadie más toca la base hasta que termina.
   * Dentro hay que usar el `tx` recibido (usar el driver desde dentro se queda esperando a sí mismo).
   * Si `fn` lanza, se revierte todo.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Lo mínimo que tiene que dar una librería concreta; `serializeDriver` pone el orden y las transacciones. */
export interface RawSqlDriver extends SqlExecutor {
  close(): Promise<void>;
}

/**
 * expo-sqlite no aísla una transacción de otras consultas que lleguen mientras corre
 * (las mezcla dentro). Para que un `transaction` sea de verdad atómico, todo el acceso pasa por
 * una sola cola: las operaciones sueltas esperan su turno y una transacción retiene la cola
 * entera hasta confirmar o revertir.
 */
export function serializeDriver(raw: RawSqlDriver): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };

  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    all: <T>(sql: string, params?: SqlParam[]) => enqueue(() => raw.all<T>(sql, params)),
    get: <T>(sql: string, params?: SqlParam[]) => enqueue(() => raw.get<T>(sql, params)),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        await raw.exec("begin immediate");
        try {
          const value = await fn(raw);
          await raw.exec("commit");
          return value;
        } catch (error) {
          try {
            await raw.exec("rollback");
          } catch {
            // Si el rollback falla, el error original es el que importa.
          }
          throw error;
        }
      }),
    close: () => enqueue(() => raw.close()),
  };
}
