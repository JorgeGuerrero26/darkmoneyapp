import { Platform } from "react-native";
import Constants from "expo-constants";

import { supabase } from "./supabase";

type LogLevel = "error" | "warn" | "info";
type LogContext = Record<string, unknown> | undefined;

const APP_VERSION =
  (Constants?.expoConfig?.version as string | undefined) ?? null;

const MAX_MESSAGE_LEN = 1000;

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

  try {
    const userId = await resolveUserId();
    await supabase.from("app_error_logs").insert({
      user_id: userId,
      level,
      source,
      message: message.slice(0, MAX_MESSAGE_LEN),
      context: context ?? null,
      app_version: APP_VERSION,
      platform: Platform.OS,
    });
  } catch {
    // best-effort: si el insert falla, ya quedó en console.
  }
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
