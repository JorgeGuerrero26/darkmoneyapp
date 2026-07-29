export type StorageAttachmentObject = {
  key?: string | null;
  name?: string | null;
};

/**
 * Convierte el listado plano de Storage en contadores por entidad. `listV2`
 * normalmente entrega `key`; `name` queda como respaldo para servidores que
 * devuelvan la ruta completa ahi.
 */
export function countEntityAttachmentsById(
  rootPrefix: string,
  objects: readonly StorageAttachmentObject[],
): Record<number, number> {
  const normalizedRoot = rootPrefix.replace(/^\/+|\/+$/g, "");
  const marker = `${normalizedRoot}/`;
  const counts: Record<number, number> = {};

  for (const object of objects) {
    const rawPath = object.key ?? object.name ?? "";
    const normalizedPath = rawPath.replace(/^\/+/, "");
    let relativePath: string;

    if (normalizedPath.startsWith(marker)) {
      relativePath = normalizedPath.slice(marker.length);
    } else {
      // Algunas respuestas incluyen el bucket antes de la key del objeto.
      const markerIndex = normalizedPath.indexOf(`/${marker}`);
      if (markerIndex < 0) continue;
      relativePath = normalizedPath.slice(markerIndex + marker.length + 1);
    }

    const separatorIndex = relativePath.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === relativePath.length - 1) continue;

    const entityIdText = relativePath.slice(0, separatorIndex);
    if (!/^\d+$/.test(entityIdText)) continue;
    const entityId = Number(entityIdText);
    if (!Number.isSafeInteger(entityId) || entityId <= 0) continue;

    counts[entityId] = (counts[entityId] ?? 0) + 1;
  }

  return counts;
}
