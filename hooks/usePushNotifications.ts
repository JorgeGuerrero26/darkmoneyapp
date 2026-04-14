import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";

import { supabase } from "../lib/supabase";
import { calendarDaysFromTodayLocal } from "../lib/subscription-helpers";
import { getNotificationsModule } from "../lib/notifications-runtime";

type ExpoNotificationResponse = import("expo-notifications").NotificationResponse;
type ExpoEventSubscription = import("expo-notifications").EventSubscription;

const Notifications = getNotificationsModule();

// Configure how notifications are displayed when app is in foreground
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function registerForPushNotifications(): Promise<string | null> {
  console.log("[PushNotifications] isDevice:", Constants.isDevice, "executionEnv:", Constants.executionEnvironment);
  if (!Constants.isDevice) {
    console.warn("[PushNotifications] Not a real device, skipping.");
    return null;
  }

  const isExpoGo = Constants.executionEnvironment === "storeClient";
  if (isExpoGo) {
    console.warn("[PushNotifications] Expo Go detected, skipping.");
    return null;
  }
  if (!Notifications) {
    console.warn("[PushNotifications] Notifications module unavailable.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log("[PushNotifications] existing permission status:", existingStatus);
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log("[PushNotifications] requested permission, got:", finalStatus);
  }

  if (finalStatus !== "granted") {
    console.warn("[PushNotifications] Permission not granted:", finalStatus);
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const PROJECT_ID = "1290814f-9ea0-4f55-9973-3a3c32178cc5";
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      PROJECT_ID;
    console.log("[PushNotifications] using projectId:", projectId);
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log("[PushNotifications] got token:", token);
    return token;
  } catch (error) {
    console.warn("[PushNotifications] token registration failed:", error);
    return null;
  }
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
  /** Toque en notificación con data.type === "obligation_share_invite" */
  onObligationShareInviteTap?: (token: string) => void;
  /** Toque en notificación con data.type === "subscription_reminder" */
  onSubscriptionReminderTap?: (subscriptionId: number) => void;
  /** Toque en notificación con data.type === "obligation_reminder" */
  onObligationReminderTap?: (obligationId: number) => void;
  onRecurringIncomeReminderTap?: (recurringIncomeId: number) => void;
};

export function usePushNotifications(userId?: string, handlers?: PushNotificationHandlers) {
  const notificationListener = useRef<ExpoEventSubscription | null>(null);
  const responseListener = useRef<ExpoEventSubscription | null>(null);
  const onInviteTapRef = useRef(handlers?.onObligationShareInviteTap);
  const onSubTapRef = useRef(handlers?.onSubscriptionReminderTap);
  const onObTapRef = useRef(handlers?.onObligationReminderTap);
  const onRecurringTapRef = useRef(handlers?.onRecurringIncomeReminderTap);
  onInviteTapRef.current = handlers?.onObligationShareInviteTap;
  onSubTapRef.current = handlers?.onSubscriptionReminderTap;
  onObTapRef.current = handlers?.onObligationReminderTap;
  onRecurringTapRef.current = handlers?.onRecurringIncomeReminderTap;

  const handleResponse = useCallback((response: ExpoNotificationResponse) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;

    if (data.type === "obligation_share_invite" && typeof data.token === "string") {
      onInviteTapRef.current?.(data.token);
    } else if (data.type === "subscription_reminder" && typeof data.subscriptionId === "number") {
      onSubTapRef.current?.(data.subscriptionId);
    } else if (data.type === "obligation_reminder" && typeof data.obligationId === "number") {
      onObTapRef.current?.(data.obligationId);
    } else if (data.type === "recurring_income_reminder" && typeof data.recurringIncomeId === "number") {
      onRecurringTapRef.current?.(data.recurringIncomeId);
    }
  }, []);

  useEffect(() => {
    if (!userId || !Notifications) return;
    let cancelled = false;

    // Register and save token
    void (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!cancelled && token) {
          await saveTokenToSupabase(userId, token);
        }
      } catch (error) {
        console.warn("[PushNotifications] bootstrap failed:", error);
      }
    })();

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Badge / invalidación en foreground si hiciera falta
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      cancelled = true;
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
  if (!Notifications) return;
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

// ── Schedule local reminders for upcoming/overdue obligations ─────────────────

/**
 * Cancela todas las obligation_reminder programadas y las regenera.
 * Ventana de alerta: dueDate dentro de los próximos 7 días o ya vencida
 * (hasta 30 días de retraso). Disparo: 9:00 AM del día inicio de ventana,
 * o en 1 minuto si ya pasó esa hora.
 */
export async function scheduleObligationReminders(
  obligations: Array<{
    id: number;
    title: string;
    dueDate: string;
    pendingAmount: number;
    currencyCode: string;
  }>,
) {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (String(notif.content.data?.type) === "obligation_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const now = new Date();

  for (const ob of obligations) {
    if (!ob.dueDate) continue;

    const diffDays = calendarDaysFromTodayLocal(ob.dueDate);
    // Alerta: vence en los próximos 7 días o vencida hace menos de 30 días
    if (diffDays > 7 || diffDays < -30) continue;

    const parts = ob.dueDate.split("-").map(Number);
    const dueDate =
      parts.length === 3 && !parts.some((n) => Number.isNaN(n))
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(ob.dueDate);

    let title: string;
    let body: string;
    if (diffDays < 0) {
      title = "Obligación vencida";
      body = `"${ob.title}" venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`;
    } else if (diffDays === 0) {
      title = "Obligación vence hoy";
      body = `"${ob.title}" vence hoy. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`;
    } else {
      title = "Obligación próxima a vencer";
      body = `"${ob.title}" vence el ${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`;
    }

    // Disparar a las 9:00 AM del primer día del período de alerta (7 días antes),
    // o en 1 minuto si esa hora ya pasó.
    const windowStart = new Date(dueDate);
    windowStart.setDate(windowStart.getDate() - 7);
    windowStart.setHours(9, 0, 0, 0);
    const triggerDate = windowStart > now ? windowStart : new Date(now.getTime() + 60_000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: "obligation_reminder", obligationId: ob.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  }
}

export async function scheduleRecurringIncomeReminders(
  incomes: Array<{
    id: number;
    name: string;
    nextExpectedDate: string;
    remindDaysBefore: number;
  }>,
) {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (String(notif.content.data?.type) === "recurring_income_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const now = new Date();
  for (const income of incomes) {
    const diffDays = calendarDaysFromTodayLocal(income.nextExpectedDate);
    const remindWindow = Math.max(1, income.remindDaysBefore);
    if (diffDays > remindWindow || diffDays < -1) continue;

    const parts = income.nextExpectedDate.split("-").map(Number);
    const expectedDate =
      parts.length === 3 && !parts.some((n) => Number.isNaN(n))
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(income.nextExpectedDate);

    const windowStart = new Date(expectedDate);
    windowStart.setDate(windowStart.getDate() - remindWindow);
    windowStart.setHours(9, 0, 0, 0);
    const triggerDate = windowStart > now ? windowStart : new Date(now.getTime() + 60_000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Ingreso fijo próximo",
        body: `"${income.name}" se espera para el ${expectedDate.toLocaleDateString("es", { day: "numeric", month: "long" })}`,
        data: { type: "recurring_income_reminder", recurringIncomeId: income.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  }
}
