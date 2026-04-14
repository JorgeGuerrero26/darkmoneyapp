import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

const BUCKET = "avatars";

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const path = `${userId}/avatar.jpg`;

  // Copy to cache first so FileSystem can always read it (handles content:// URIs on Android)
  const cacheUri = `${FileSystem.cacheDirectory}avatar_tmp.jpg`;
  await FileSystem.copyAsync({ from: uri, to: cacheUri });

  const base64 = await FileSystem.readAsStringAsync(cacheUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Append timestamp to bust CDN cache after re-upload
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function deleteAvatarFile(userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const path = `${userId}/avatar.jpg`;
  await supabase.storage.from(BUCKET).remove([path]);
}
