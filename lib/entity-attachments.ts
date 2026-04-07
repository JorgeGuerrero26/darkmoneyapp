import { SUPABASE_STORAGE_BUCKET } from "../constants/config";
import { supabase } from "./supabase";

export type AttachmentEntityType = "movement" | "obligation-event";

export type AttachmentLike = {
  storagePath?: string;
  isUploading?: boolean;
};

type AttachmentTarget = {
  workspaceId: number;
  entityType: AttachmentEntityType;
  entityId: number;
};

function entityFolder(entityType: AttachmentEntityType): string {
  return entityType;
}

export function buildEntityAttachmentDir(
  workspaceId: number,
  entityType: AttachmentEntityType,
  entityId: number,
): string {
  return `${workspaceId}/${entityFolder(entityType)}/${entityId}`;
}

export function buildEntityAttachmentDraftDir(
  workspaceId: number,
  entityType: AttachmentEntityType,
  draftKey: string,
): string {
  return `${workspaceId}/${entityFolder(entityType)}/draft/${draftKey}`;
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? `file-${Date.now()}`;
}

export function attachmentFileNameFromPath(path: string): string {
  return fileNameFromPath(path);
}

export async function listEntityAttachmentPaths(
  workspaceId: number,
  entityType: AttachmentEntityType,
  entityId: number,
): Promise<string[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const folderPath = buildEntityAttachmentDir(workspaceId, entityType, entityId);
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .list(folderPath, { limit: 40 });

  if (error) throw new Error(error.message ?? "No se pudieron cargar los comprobantes.");

  return (data ?? [])
    .filter((item) => Boolean(item.name) && !item.name.endsWith("/"))
    .map((item) => `${folderPath}/${item.name}`);
}

export async function removeStoragePaths(paths: string[]): Promise<void> {
  if (!supabase || paths.length === 0) return;
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(paths);
  if (error) throw new Error(error.message ?? "No se pudieron eliminar los comprobantes.");
}

export async function removeAttachmentFile(params: {
  filePath: string;
  mirrorTargets?: AttachmentTarget[];
}): Promise<void> {
  const fileName = attachmentFileNameFromPath(params.filePath);
  const mirrorPaths = (params.mirrorTargets ?? []).map(
    (target) =>
      `${buildEntityAttachmentDir(target.workspaceId, target.entityType, target.entityId)}/${fileName}`,
  );
  await removeStoragePaths([params.filePath, ...mirrorPaths]);
}

async function copyStorageFile(fromPath: string, toPath: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no disponible.");
  if (fromPath === toPath) return;
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).copy(fromPath, toPath);
  if (error) throw new Error(error.message ?? "No se pudo copiar el comprobante.");
}

export async function promoteDraftAttachmentsToEntity(params: {
  attachments: AttachmentLike[];
  workspaceId: number;
  entityType: AttachmentEntityType;
  entityId: number;
  mirrorTargets?: AttachmentTarget[];
}): Promise<void> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const persistedPaths = params.attachments
    .filter((attachment) => attachment.storagePath && !attachment.isUploading)
    .map((attachment) => attachment.storagePath as string);

  if (persistedPaths.length === 0) return;

  const primaryBasePath = buildEntityAttachmentDir(
    params.workspaceId,
    params.entityType,
    params.entityId,
  );
  const mirrorTargets = params.mirrorTargets ?? [];

  const draftPathsToRemove: string[] = [];
  for (const sourcePath of persistedPaths) {
    const fileName = fileNameFromPath(sourcePath);
    const primaryPath = `${primaryBasePath}/${fileName}`;
    const isDraftPath = sourcePath.includes(`/${entityFolder(params.entityType)}/draft/`);
    const sourceForMirrors = sourcePath === primaryPath ? sourcePath : primaryPath;

    if (sourcePath !== primaryPath) {
      await copyStorageFile(sourcePath, primaryPath);
    }
    for (const target of mirrorTargets) {
      const targetBasePath = buildEntityAttachmentDir(
        target.workspaceId,
        target.entityType,
        target.entityId,
      );
      const mirrorPath = `${targetBasePath}/${fileName}`;
      // Remove existing mirror file first — Supabase copy() doesn't support overwrite
      await removeStoragePaths([mirrorPath]);
      await copyStorageFile(sourceForMirrors, mirrorPath);
    }
    if (isDraftPath) {
      draftPathsToRemove.push(sourcePath);
    }
  }

  if (draftPathsToRemove.length > 0) {
    await removeStoragePaths(draftPathsToRemove);
  }
}

export async function syncEntityAttachments(params: {
  sourceWorkspaceId: number;
  sourceEntityType: AttachmentEntityType;
  sourceEntityId: number;
  targetWorkspaceId: number;
  targetEntityType: AttachmentEntityType;
  targetEntityId: number;
}): Promise<void> {
  const sourcePaths = await listEntityAttachmentPaths(
    params.sourceWorkspaceId,
    params.sourceEntityType,
    params.sourceEntityId,
  );
  const targetPaths = await listEntityAttachmentPaths(
    params.targetWorkspaceId,
    params.targetEntityType,
    params.targetEntityId,
  );

  if (targetPaths.length > 0) {
    await removeStoragePaths(targetPaths);
  }

  if (sourcePaths.length === 0) return;

  const targetBasePath = buildEntityAttachmentDir(
    params.targetWorkspaceId,
    params.targetEntityType,
    params.targetEntityId,
  );
  for (const sourcePath of sourcePaths) {
    const fileName = fileNameFromPath(sourcePath);
    await copyStorageFile(sourcePath, `${targetBasePath}/${fileName}`);
  }
}

export async function promoteDraftAttachmentsToEvent(params: {
  attachments: AttachmentLike[];
  workspaceId: number;
  eventId: number;
  movementId?: number | null;
}): Promise<void> {
  await promoteDraftAttachmentsToEntity({
    attachments: params.attachments,
    workspaceId: params.workspaceId,
    entityType: "obligation-event",
    entityId: params.eventId,
    mirrorTargets:
      params.movementId != null
        ? [{ workspaceId: params.workspaceId, entityType: "movement", entityId: params.movementId }]
        : [],
  });
}

export async function mirrorObligationEventAttachmentsToMovement(params: {
  workspaceId: number;
  eventId: number;
  movementId: number;
  targetWorkspaceId?: number;
}): Promise<void> {
  await syncEntityAttachments({
    sourceWorkspaceId: params.workspaceId,
    sourceEntityType: "obligation-event",
    sourceEntityId: params.eventId,
    targetWorkspaceId: params.targetWorkspaceId ?? params.workspaceId,
    targetEntityType: "movement",
    targetEntityId: params.movementId,
  });
}

export async function mirrorMovementAttachmentsToObligationEvent(params: {
  workspaceId: number;
  movementId: number;
  eventId: number;
  targetWorkspaceId?: number;
}): Promise<void> {
  await syncEntityAttachments({
    sourceWorkspaceId: params.workspaceId,
    sourceEntityType: "movement",
    sourceEntityId: params.movementId,
    targetWorkspaceId: params.targetWorkspaceId ?? params.workspaceId,
    targetEntityType: "obligation-event",
    targetEntityId: params.eventId,
  });
}
