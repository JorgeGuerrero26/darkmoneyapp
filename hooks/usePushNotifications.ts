import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { supabase } from "../lib/supabase";

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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

export function usePushNotifications(userId?: string) {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Register and save token
    void registerForPushNotifications().then((token) => {
      if (token) void saveTokenToSupabase(userId, token);
    });

    // Listen for notifications received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Could update badge count here if needed
    });

    // Listen for user tapping a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // Could navigate to specific screen based on notification data
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userId]);
}

// ── Schedule local reminders for upcoming subscriptions ──────────────────────

export async function scheduleSubscriptionReminders(
  subscriptions: Array<{
    id: number;
    name: string;
    nextDueDate: string;
    remindDaysBefore: number;
  }>,
) {
  // Cancel all previous subscription reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (String(notif.content.data?.type) === "subscription_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const now = new Date();

  for (const sub of subscriptions) {
    if (sub.remindDaysBefore <= 0) continue;

    const dueDate = new Date(sub.nextDueDate);
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - sub.remindDaysBefore);
    reminderDate.setHours(9, 0, 0, 0); // 9 AM

    if (reminderDate <= now) continue; // already passed

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Suscripción próxima a vencer",
        body: `"${sub.name}" vence el ${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}`,
        data: { type: "subscription_reminder", subscriptionId: sub.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
    });
  }
}
