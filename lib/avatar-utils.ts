import { supabase } from "./supabase";

const BUCKET = "avatars";

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const response = await fetch(uri);
  const blob = await response.blob();

  const path = `${userId}/avatar.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
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
