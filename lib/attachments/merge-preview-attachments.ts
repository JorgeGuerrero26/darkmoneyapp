import type { EntityAttachmentFile } from "../../services/queries/attachments";

export function mergePreviewAttachments(
  eventAttachments: EntityAttachmentFile[],
  movementAttachments: EntityAttachmentFile[],
): EntityAttachmentFile[] {
  const merged: EntityAttachmentFile[] = [];
  const seen = new Set<string>();
  for (const attachment of [...eventAttachments, ...movementAttachments]) {
    const key = attachment.fileName || attachment.filePath;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}
