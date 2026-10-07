import { Platform } from "react-native";
import Constants from "expo-constants";

import { supabase } from "../lib/supabase";
import { getNotificationsModule } from "../lib/notifications-runtime";
import { logWarn } from "../lib/error-logger";
import { classifyPushRegistrationError, type PushRegistrationResult } from "../lib/push-registration-errors";

const TOKEN_TIMEOUT_MS = 25_000;
let registration: Promise<PushRegistrationResult> | null = null;

async function requestPushRegistration(): Promise<PushRegistrationResult> {
  if (Constants.executionEnvironment === "storeClient") return { ok: false, reason: "expo_go" };
  const notifications = getNotificationsModule();
  if (!notifications) return { ok: false, reason: "module_unavailable" };

  let stage = "permissions";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Android requires the channel before requesting notification permission.
    if (Platform.OS === "android") {
      stage = "channel";
      await notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    stage = "permissions";
    const existing = await notifications.getPermissionsAsync();
    const permissions = existing.status === "granted" ? existing : await notifications.requestPermissionsAsync();
    if (permissions.status !== "granted") return { ok: false, reason: "permissions_denied", detail: permissions.status };

    stage = "token";
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId
      ?? "1290814f-9ea0-4f55-9973-3a3c32178cc5";
    // Do not time out the system permission dialog while the user is deciding.
    const token = await Promise.race([
      notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("Push registration timed out"), {
          code: "ERR_PUSH_REGISTRATION_TIMEOUT",
        })), TOKEN_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, token: token.data };
  } catch (error) {
    const result = classifyPushRegistrationError(error);
    logWarn("push-registration", "Push registration failed", {
      stage, reason: result.reason,
      detail: result.detail?.replace(/(?:Exponent|Expo)PushToken\[[^\]]*\]|\b[0-9a-f]{32,}\b/gi, "[redacted]").slice(0, 1000),
    });
    return result;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Settings and bootstrap share a single permission/token request. */
export function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!registration) {
    registration = requestPushRegistration().finally(() => { registration = null; });
  }
  return registration;
}

export async function savePushTokenToSupabase(userId: string, token: string): Promise<void> {
  if (!supabase) throw new Error("No se pudo conectar con DarkMoney para guardar la activación.");
  const { error } = await supabase.from("notification_preferences").upsert(
    { user_id: userId, push_token: token, platform: Platform.OS, is_active: true },
    { onConflict: "user_id" },
  );
  if (error) {
    logWarn("push-registration", "Push preference save failed", { code: error.code });
    throw error;
  }
}

/** Refresh an opted-in token without ever enabling push during app startup. */
export async function refreshEnabledPushToken(userId: string, isCancelled: () => boolean): Promise<void> {
  if (!supabase || isCancelled()) return;
  const { data, error } = await supabase.from("notification_preferences")
    .select("is_active").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data?.is_active !== true || isCancelled()) return;
  const result = await registerForPushNotifications();
  if (!result.ok || isCancelled()) return;
  // The user can disable push while token registration is pending. A conditional
  // update preserves that choice and never creates a preference row on startup.
  const { error: saveError } = await supabase.from("notification_preferences")
    .update({ push_token: result.token, platform: Platform.OS })
    .eq("user_id", userId).eq("is_active", true);
  if (saveError) throw saveError;
}
