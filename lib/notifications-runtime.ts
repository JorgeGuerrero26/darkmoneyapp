import Constants from "expo-constants";

type ExpoNotificationsModule = typeof import("expo-notifications");

let cachedModule: ExpoNotificationsModule | null | undefined;

export const isExpoGoNotificationsUnsupported = Constants.executionEnvironment === "storeClient";

export function getNotificationsModule(): ExpoNotificationsModule | null {
  if (isExpoGoNotificationsUnsupported) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require("expo-notifications") as ExpoNotificationsModule;
  } catch (error) {
    console.warn("[NotificationsRuntime] expo-notifications unavailable:", error);
    cachedModule = null;
  }
  return cachedModule;
}
