import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { supabase } from "../lib/supabase";
import { calendarDaysFromTodayLocal } from "../lib/subscription-helpers";

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Constants.isDevice) return null; // Won't work in simulator

  // Push tokens are not supported in Expo Go SDK 53+
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  if (isExpoGo) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

async function saveTokenToSupabase(userId: string, token: string) {
  if (!supabase) return;
  await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: userId, push_token: token, platform: Platform.OS, is_active: true },
      { onConflict: "user_id" },
    );
}

export type PushNotificationHandlers = {
  /** Toque en recordatorio local / push con data.type === obligation_share_invite */
  onObligationShareInviteTap?: (token: string) => void;
};

export function usePushNotifications(userId?: string, handlers?: PushNotificationHandlers) {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const onInviteTapRef = useRef(handlers?.onObligationShareInviteTap);
  onInviteTapRef.current = handlers?.onObligationShareInviteTap;

  const handleResponse = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.type === "obligation_share_invite" && typeof data.token === "string") {
      onInviteTapRef.current?.(data.token);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Register and save token
    void registerForPushNotifications().then((token) => {
      if (token) void saveTokenToSupabase(userId, token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Badge / invalidación en foreground si hiciera falta
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userId, handleResponse]);
}

// ── Schedule local reminders for upcoming subscriptions ──────────────────────

/**
 * Paridad con bandeja: activas; aviso si diffDays ≤ max(1, remindDaysBefore) y diffDays ≥ -1.
 */
export async function scheduleSubscriptionReminders(
  subscriptions: Array<{
    id: number;
    name: string;
    nextDueDate: string;
    remindDaysBefore: number;
  }>,
) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (String(notif.content.data?.type) === "subscription_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const now = new Date();

  for (const sub of subscriptions) {
    const diffDays = calendarDaysFromTodayLocal(sub.nextDueDate);
    const remindWindow = Math.max(1, sub.remindDaysBefore);
    if (diffDays > remindWindow || diffDays < -1) continue;

    const parts = sub.nextDueDate.split("-").map(Number);
    const dueDate =
      parts.length === 3 && !parts.some((n) => Number.isNaN(n))
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(sub.nextDueDate);

    const windowStart = new Date(dueDate);
    windowStart.setDate(windowStart.getDate() - remindWindow);
    windowStart.setHours(9, 0, 0, 0);

    const triggerDate = windowStart > now ? windowStart : new Date(now.getTime() + 60_000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Suscripción próxima a vencer",
        body: `"${sub.name}" vence el ${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}`,
        data: { type: "subscription_reminder", subscriptionId: sub.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  }
}
