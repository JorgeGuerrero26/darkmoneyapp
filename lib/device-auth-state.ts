import * as SecureStore from "expo-secure-store";

export const SECURE_EMAIL_KEY = "darkmoney_bio_email";
export const SECURE_PASS_KEY = "darkmoney_bio_password";
export const REMEMBER_EMAIL_KEY = "darkmoney_remember_email";
export const REMEMBER_PASS_KEY = "darkmoney_remember_password";
export const REMEMBER_FLAG_KEY = "darkmoney_remember_me";

export async function hasSavedAuthOnDevice(): Promise<boolean> {
  try {
    const [bioEmail, rememberFlag, rememberedEmail] = await Promise.all([
      SecureStore.getItemAsync(SECURE_EMAIL_KEY),
      SecureStore.getItemAsync(REMEMBER_FLAG_KEY),
      SecureStore.getItemAsync(REMEMBER_EMAIL_KEY),
    ]);

    return Boolean(bioEmail) || (rememberFlag === "true" && Boolean(rememberedEmail));
  } catch {
    return false;
  }
}
