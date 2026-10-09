import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

// A successful Metro command can still export an empty Router context. Verify the
// shipped artifact, rather than relying on the bundler's exit code alone.
export const REQUIRED_OTA_SOURCES = [
  "app/_layout.tsx",
  "app/(app)/_layout.tsx",
  "app/(app)/dashboard.tsx",
  "app/(app)/movements.tsx",
  "app/(app)/accounts.tsx",
  "app/(app)/notifications.tsx",
  "app/account/[id].tsx",
  "app/movement/[id].tsx",
  "features/detected-movements/components/DetectedMovementCard.tsx",
];
export const REQUIRED_OTA_FONTS = ["Archivo_400Regular", "IBMPlexSans_400Regular"];

function sourcesOf(map) {
  return [
    ...(map.sources ?? []),
    ...(map.sections ?? []).flatMap((section) => sourcesOf(section.map)),
  ].map((source) => source.replaceAll("\\", "/"));
}

export function validateOtaExport(directory) {
  const root = resolve(directory);
  function exportedFile(relative) {
    if (typeof relative !== "string") throw new Error("OTA: falta la ruta de un archivo.");
    const file = resolve(root, relative.replaceAll("\\", "/"));
    if (!file.startsWith(root + sep)) throw new Error(`OTA: ruta fuera de la exportación: ${relative}`);
    if (!statSync(file).isFile() || statSync(file).size === 0) {
      throw new Error(`OTA: archivo vacío o inválido: ${relative}`);
    }
    return file;
  }
  const metadata = JSON.parse(readFileSync(exportedFile("metadata.json"), "utf8"));
  const assetMap = JSON.parse(readFileSync(exportedFile("assetmap.json"), "utf8"));
  const results = [];

  for (const platform of ["ios", "android"]) {
    const entry = metadata.fileMetadata?.[platform];
    if (!entry) throw new Error(`OTA: falta la plataforma ${platform}.`);
    exportedFile(entry.bundle);
    const map = JSON.parse(readFileSync(exportedFile(entry.bundle + ".map"), "utf8"));
    const sources = sourcesOf(map);
    const missing = REQUIRED_OTA_SOURCES.filter(
      (required) => !sources.some((source) => source === required || source.endsWith("/" + required)),
    );
    if (missing.length) throw new Error(`OTA ${platform}: faltan pantallas/componentes: ${missing.join(", ")}`);

    const assets = entry.assets ?? [];
    for (const asset of assets) exportedFile(asset.path);
    const fontHashes = new Set(
      assets.filter((asset) => asset.ext === "ttf").map((asset) => asset.path.replaceAll("\\", "/").split("/").at(-1)),
    );
    for (const name of REQUIRED_OTA_FONTS) {
      const font = Object.values(assetMap).find((asset) => asset.type === "ttf" && asset.name === name);
      if (!font?.fileHashes?.length || !font.fileHashes.every((hash) => fontHashes.has(hash))) {
        throw new Error(`OTA ${platform}: falta la fuente ${name} en los recursos publicados.`);
      }
    }
    results.push({ platform, sources: sources.length, fonts: fontHashes.size, assets: assets.length });
  }
  return results;
}
