import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const STORAGE_PREFIX = "darkmoney_scheduled_invite_notif_id:";

function storageKey(token: string) {
  return `${STORAGE_PREFIX}${token}`;
}

/** Recuerdo local (bandeja del sistema) si el usuario pospone aceptar. */
export async function scheduleObligationInviteDeferredReminder(
  token: string,
  delaySeconds = 3600,
): Promise<void> {
  const existing = await AsyncStorage.getItem(storageKey(token));
  if (existing) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing);
    } catch {
      /* ignore */
    }
  }

  const when = new Date(Date.now() + Math.max(30, delaySeconds) * 1000);

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Invitación pendiente",
      body: "Tienes una obligación compartida por aceptar. Ábrela desde la app.",
      data: { type: "obligation_share_invite", token },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  });

  await AsyncStorage.setItem(storageKey(token), id);
}

export async function cancelObligationInviteScheduledReminder(token: string): Promise<void> {
  const existing = await AsyncStorage.getItem(storageKey(token));
  if (!existing) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(existing);
  } catch {
    /* ignore */
  }
  await AsyncStorage.removeItem(storageKey(token));
}
