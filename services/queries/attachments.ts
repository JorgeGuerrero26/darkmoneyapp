import { useQuery } from "@tanstack/react-query";

import { SUPABASE_STORAGE_BUCKET } from "../../constants/config";
import {
  buildEntityAttachmentDir,
  type AttachmentEntityType,
} from "../../lib/entity-attachments";
import { supabase } from "../../lib/supabase";

export type EntityAttachmentFile = {
  filePath: string;
  fileName: string;
  signedUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MovementAttachmentFile = EntityAttachmentFile;
export type EntityAttachmentCounts = Record<number, number>;

async function fetchEntityAttachments(
  workspaceId: number,
  entityType: AttachmentEntityType,
  entityId: number,
): Promise<EntityAttachmentFile[]> {
  if (!supabase) throw new Error("Supabase no esta configurado.");

  const folderPath = buildEntityAttachmentDir(workspaceId, entityType, entityId);
  const { data: files, error: listError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .list(folderPath, { limit: 20 });

  if (listError) throw listError;

  const visibleFiles = (files ?? [])
    .filter((item) => item.name && !item.name.endsWith("/"))
    .sort((a, b) => {
      const aTime = a.updated_at ?? a.created_at ?? "";
      const bTime = b.updated_at ?? b.created_at ?? "";
      return bTime.localeCompare(aTime) || b.name.localeCompare(a.name);
    });

  if (visibleFiles.length === 0) return [];

  const filePaths = visibleFiles.map((item) => `${folderPath}/${item.name}`);
  const { data: signedUrls, error: signedError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrls(filePaths, 60 * 60);

  if (signedError) throw signedError;

  return visibleFiles
    .map((item, index): EntityAttachmentFile | null => {
      const signedUrl = signedUrls?.[index]?.signedUrl;
      if (!signedUrl) return null;
      return {
        filePath: filePaths[index],
        fileName: item.name,
        signedUrl,
        mimeType: item.metadata?.mimetype ?? null,
        sizeBytes: item.metadata?.size ? Number(item.metadata.size) : null,
        createdAt: item.created_at ?? null,
        updatedAt: item.updated_at ?? null,
      };
    })
    .filter((item): item is EntityAttachmentFile => item !== null);
}

async function fetchEntityAttachmentCounts(
  workspaceId: number,
  entityType: AttachmentEntityType,
  entityIds: number[],
): Promise<EntityAttachmentCounts> {
  if (!supabase) throw new Error("Supabase no esta configurado.");
  const client = supabase;
  if (entityIds.length === 0) return {};

  const counts = await Promise.all(
    entityIds.map(async (entityId) => {
      const folderPath = buildEntityAttachmentDir(workspaceId, entityType, entityId);
      const { data: files, error } = await client.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .list(folderPath, { limit: 20 });
      if (error) {
        return [entityId, 0] as const;
      }
      const visibleCount = (files ?? []).filter((item) => item.name && !item.name.endsWith("/")).length;
      return [entityId, visibleCount] as const;
    }),
  );

  return Object.fromEntries(counts);
}

export function useEntityAttachmentsQuery(
  workspaceId?: number | null,
  entityType?: AttachmentEntityType | null,
  entityId?: number | null,
) {
  return useQuery({
    queryKey: ["entity-attachments", workspaceId ?? null, entityType ?? null, entityId ?? null],
    queryFn: async (): Promise<EntityAttachmentFile[]> => {
      if (!workspaceId || !entityType || !entityId) return [];
      return fetchEntityAttachments(workspaceId, entityType, entityId);
    },
    enabled: Boolean(workspaceId && entityType && entityId),
    staleTime: 30_000,
  });
}

export function useObligationEventAttachmentsQuery(
  workspaceId?: number | null,
  eventId?: number | null,
) {
  return useEntityAttachmentsQuery(workspaceId, "obligation-event", eventId);
}

export function useObligationEventAttachmentCountsQuery(
  workspaceId?: number | null,
  eventIds?: number[] | null,
) {
  const normalizedIds = (eventIds ?? []).filter((value) => Number.isFinite(value) && value > 0);
  return useQuery({
    queryKey: ["entity-attachment-counts", workspaceId ?? null, "obligation-event", normalizedIds.join(",")],
    queryFn: async (): Promise<EntityAttachmentCounts> => {
      if (!workspaceId || normalizedIds.length === 0) return {};
      return fetchEntityAttachmentCounts(workspaceId, "obligation-event", normalizedIds);
    },
    enabled: Boolean(workspaceId && normalizedIds.length > 0),
    staleTime: 30_000,
  });
}

export function useMovementAttachmentCountsQuery(
  workspaceId?: number | null,
  movementIds?: number[] | null,
) {
  const normalizedIds = (movementIds ?? []).filter((value) => Number.isFinite(value) && value > 0);
  return useQuery({
    queryKey: ["entity-attachment-counts", workspaceId ?? null, "movement", normalizedIds.join(",")],
    queryFn: async (): Promise<EntityAttachmentCounts> => {
      if (!workspaceId || normalizedIds.length === 0) return {};
      return fetchEntityAttachmentCounts(workspaceId, "movement", normalizedIds);
    },
    enabled: Boolean(workspaceId && normalizedIds.length > 0),
    staleTime: 30_000,
  });
}

export function useMovementAttachmentsQuery(
  workspaceId?: number | null,
  movementId?: number | null,
) {
  return useEntityAttachmentsQuery(workspaceId, "movement", movementId);
}
