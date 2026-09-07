import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { isAuthLikeError } from "./auth-error";
import { appendBounded, MAX_PENDING_LOGS } from "./log-queue";
import { supabase } from "./supabase";

type LogLevel = "error" | "warn" | "info";
type LogContext = Record<string, unknown> | undefined;

const APP_VERSION =
  (Constants?.expoConfig?.version as string | undefined) ?? null;

const MAX_MESSAGE_LEN = 1000;

const PENDING_KEY = "dm.pending-error-logs.v1";

type LogRow = {
  user_id: string | null;
  level: LogLevel;
  source: string;
  message: string;
  context: LogContext | null;
  app_version: string | null;
  platform: string;
  /** Explícito: si la fila espera en cola, la hora que vale es la del fallo, no la del envío. */
  created_at: string;
};

let pending: LogRow[] | null = null;

/**
 * Los apuntados en la cola se hacen de uno en uno.
 *
 * Los fallos llegan en ráfaga —once en veinte segundos el 2026-09-06—, y leer la cola, añadir y
 * guardarla no es atómico: dos registros a la vez leen la misma lista y el segundo pisa al
 * primero. Perder líneas justo en la ráfaga es perder el episodio entero, que es lo único que
 * esta cola existe para conservar.
 */
let chain: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

async function loadPending(): Promise<LogRow[]> {
  if (pending) return pending;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    pending = raw ? (JSON.parse(raw) as LogRow[]) : [];
  } catch {
    pending = [];
  }
  return pending;
}

async function savePending(rows: LogRow[]): Promise<void> {
  pending = rows;
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // El disco lleno no puede tumbar el registro de errores.
  }
}

/**
 * Escribe la fila, y si la rechazan por sesión la reescribe sin dueño.
 *
 * La política de la tabla acepta `user_id IS NULL OR user_id = auth.uid()`. Con el token a
 * medio renovar, `auth.uid()` no coincide y la fila con dueño se rechaza — justo cuando lo que
 * se está intentando registrar es, casi siempre, ese mismo problema de sesión. Sin dueño entra
 * siempre: se pierde de quién era el error, que en esta app es un dato que ya se sabe, y se
 * gana el error, que es el que no se tenía.
 */
async function insertRow(row: LogRow): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("app_error_logs").insert(row);
    if (!error) return true;
    if (row.user_id && isAuthLikeError(error.message ?? "")) {
      const { error: anonError } = await supabase
        .from("app_error_logs")
        .insert({ ...row, user_id: null });
      return !anonError;
    }
    return false;
  } catch {
    return false;
  }
}

/** getSession() es local (AsyncStorage) pero puede colgar si AuthRefresh está bloqueado. */
async function resolveUserId(): Promise<string | null> {
  if (!supabase) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 1500);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!result) return null;
    return result.data?.session?.user?.id ?? null;
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/** Vacía la cola aprovechando que hay red. Lo que siga sin entrar se queda para la próxima. */
function flushPending(): Promise<void> {
  return serialize(async () => {
    const queue = await loadPending();
    if (queue.length === 0) return;
    const quedan: LogRow[] = [];
    for (const row of queue) {
      if (!(await insertRow(row))) quedan.push(row);
    }
    if (quedan.length !== queue.length) await savePending(quedan);
  });
}

async function send(
  level: LogLevel,
  source: string,
  message: string,
  context?: LogContext,
): Promise<void> {
  const consoleFn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[${source}] ${message}`, context ?? "");

  if (!supabase) return;

  const row: LogRow = {
    user_id: await resolveUserId(),
    level,
    source,
    message: message.slice(0, MAX_MESSAGE_LEN),
    context: context ?? null,
    app_version: APP_VERSION,
    platform: Platform.OS,
    created_at: new Date().toISOString(),
  };

  if (await insertRow(row)) {
    // Solo se intenta vaciar la cola cuando consta que la red responde: si no, cada registro
    // nuevo arrastraría cuarenta intentos condenados a fallar.
    await flushPending();
    return;
  }

  /* Antes esto era un `catch {}` vacío con el comentario "ya quedó en console". Pero la consola
     no existe en un teléfono que no está enchufado a nadie, así que el registro se quedaba ciego
     justo en los cortes de red y de sesión — que son los que hay que investigar. El fallo al
     guardar del 2026-09-06 no dejó ni una línea por esto. */
  await serialize(async () => savePending(appendBounded(await loadPending(), row, MAX_PENDING_LOGS)));
}

export function logError(source: string, message: string, context?: LogContext): void {
  void send("error", source, message, context);
}

export function logWarn(source: string, message: string, context?: LogContext): void {
  void send("warn", source, message, context);
}

export function logInfo(source: string, message: string, context?: LogContext): void {
  void send("info", source, message, context);
}
