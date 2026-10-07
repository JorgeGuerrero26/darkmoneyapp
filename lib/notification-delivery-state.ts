/** Saved topic preferences apply only when this device can receive push. */
export function notificationDeliveryState(preferences?: {
  pushEnabled: boolean;
  pushToken: string | null;
  dailyDigestEnabled: boolean;
  predictiveAlertsEnabled: boolean;
} | null) {
  const pushReady = preferences?.pushEnabled === true && Boolean(preferences.pushToken?.trim());
  return {
    pushReady,
    dailyDigestActive: pushReady && preferences?.dailyDigestEnabled === true,
    predictiveAlertsActive: pushReady && preferences?.predictiveAlertsEnabled === true,
  };
}
