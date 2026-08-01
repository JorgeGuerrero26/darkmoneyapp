import { File as ExpoFile, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

function sanitizeFileName(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "_");
  return base.endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * Renderiza HTML a PDF (expo-print) y abre el share sheet del sistema con un
 * nombre de archivo legible. Mismo patrón que lib/share-csv-file.ts: archivo
 * real en cache, no texto en el portapapeles.
 */
export async function sharePdfFromHtml(html: string, fileName: string, dialogTitle: string): Promise<void> {
  const safeName = sanitizeFileName(fileName);

  const { uri: tempUri } = await Print.printToFileAsync({ html });

  // printToFileAsync devuelve un nombre aleatorio; moverlo para que el receptor
  // vea "Reporte_...pdf" y no "Print-abc123.pdf".
  let shareUri = tempUri;
  try {
    const target = new ExpoFile(Paths.cache, safeName);
    if (target.exists) target.delete();
    new ExpoFile(tempUri).move(target);
    shareUri = target.uri;
  } catch {
    // Si el move falla, compartir el temporal: feo pero funcional.
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      dialogTitle,
      UTI: "com.adobe.pdf",
    });
    return;
  }

  await Share.share(
    Platform.OS === "ios" ? { url: shareUri, title: safeName } : { message: shareUri, title: safeName },
  );
}
