import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_TOKEN_KEY = "darkmoney_pending_obligation_invite_token";

/** Guarda el token del enlace para retomar tras login / onboarding. */
export async function setPendingObligationInviteToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_TOKEN_KEY, token.trim());
}

export async function getPendingObligationInviteToken(): Promise<string | null> {
  const v = await AsyncStorage.getItem(PENDING_TOKEN_KEY);
  return v?.trim() || null;
}

export async function clearPendingObligationInviteToken(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_TOKEN_KEY);
}
