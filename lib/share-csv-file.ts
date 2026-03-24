import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

function sanitizeFileName(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "_");
  return base.endsWith(".csv") ? base : `${base}.csv`;
}

/**
 * Exporta CSV como archivo real (compartir / guardar en archivos), no como texto en el portapapeles.
 */
export async function shareCsvAsFile(csvContent: string, fileName: string): Promise<void> {
  const safeName = sanitizeFileName(fileName);

  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new ExpoFile(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(csvContent, { encoding: "utf8" });

  const uri = file.uri;
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "text/csv",
      dialogTitle: "Exportar CSV",
      UTI: "public.comma-separated-values-text",
    });
    return;
  }

  await Share.share({
    url: uri,
    title: safeName,
  });
}
