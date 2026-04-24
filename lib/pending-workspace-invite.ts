import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_TOKEN_KEY = "darkmoney_pending_workspace_invite_token";

export async function setPendingWorkspaceInviteToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_TOKEN_KEY, token.trim());
}

export async function getPendingWorkspaceInviteToken(): Promise<string | null> {
  const value = await AsyncStorage.getItem(PENDING_TOKEN_KEY);
  return value?.trim() || null;
}

export async function clearPendingWorkspaceInviteToken(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_TOKEN_KEY);
}
