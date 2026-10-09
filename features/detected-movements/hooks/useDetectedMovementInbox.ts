import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEmailDetectionProAccessQuery } from "../../../services/queries/email-detection-access";
import { usePendingDetectedMovementsQuery } from "../../../services/queries/notification-detection";
import type { DetectionDraft } from "../lib/review-draft";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";

/** Selección y borradores locales; el estado pendiente vive únicamente en Supabase. */
export function useDetectedMovementInbox(userId: string | null, workspaceId: number | null) {
  const access = useEmailDetectionProAccessQuery(userId);
  const enabled = access.data === true && !access.isError;
  const query = usePendingDetectedMovementsQuery(userId, workspaceId, enabled);
  const queryClient = useQueryClient();
  // Ordena también la caché persistida de versiones anteriores, que venía al revés.
  const pending = useMemo(() => enabled ? [...(query.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [], [enabled, query.data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"closed" | "list" | "review">("closed");
  const [reviewSelection, setReviewSelection] = useState<DetectedMovementSuggestion | null>(null);
  const drafts = useRef(new Map<number, DetectionDraft>());
  // La mutación elimina el pendiente antes de terminar su callback. Conserva la revisión
  // abierta para que la actualización de caché no cambie de registro ni desmonte el Modal.
  const pinnedSelection = enabled && mode !== "closed" && reviewSelection?.userId === userId && reviewSelection.workspaceId === workspaceId ? reviewSelection : null;
  const selected = pinnedSelection ? pending.find((item) => item.id === pinnedSelection.id) ?? pinnedSelection : pending.find((item) => item.id === selectedId) ?? pending[0] ?? null;

  useEffect(() => {
    for (const item of query.data ?? []) queryClient.setQueryData(["detected-movement-suggestion", item.id], item);
  }, [query.data, queryClient]);
  useEffect(() => {
    drafts.current.clear(); setSelectedId(null); setReviewSelection(null); setMode("closed");
  }, [workspaceId, userId]);
  useFocusEffect(useCallback(() => {
    if (enabled) void query.refetch();
  }, [enabled, query.refetch]));

  const rememberDraft = useCallback((id: number, draft: DetectionDraft) => { drafts.current.set(id, draft); }, []);
  function resolve(id: number) {
    const index = pending.findIndex((item) => item.id === id);
    const next = pending.slice(index + 1).find((item) => item.id !== id) ?? pending.find((item) => item.id !== id) ?? null;
    drafts.current.delete(id); setSelectedId(next?.id ?? null); setReviewSelection(next);
    if (!next) setMode("closed");
  }
  function select(id: number) {
    const item = pending.find((value) => value.id === id);
    if (item) queryClient.setQueryData(["detected-movement-suggestion", id], item);
    setSelectedId(id); setMode("review");
    setReviewSelection(item ?? null);
  }
  function resolveMany(ids: number[]) {
    const resolved = new Set(ids);
    const remaining = pending.filter((item) => !resolved.has(item.id));
    const next = remaining.find((item) => item.id === selected?.id) ?? remaining[0] ?? null;
    for (const id of ids) drafts.current.delete(id);
    setSelectedId(next?.id ?? null); setReviewSelection(next);
    if (!next) setMode("closed");
  }
  const error = access.isError ? "No pudimos verificar tu acceso PRO" : enabled && query.isError ? "No pudimos cargar los movimientos por revisar" : null;
  const loading = access.isPending || (enabled && query.isPending);
  const retry = () => { if (access.isError) void access.refetch(); else void query.refetch(); };
  return { pending, selected, mode, error, loading, retry, drafts: drafts.current, rememberDraft, resolve, resolveMany, select,
    openReview: () => { setReviewSelection(selected); setMode("review"); },
    openList: () => { setReviewSelection(selected); setMode("list"); }, close: () => setMode("closed") };
}
