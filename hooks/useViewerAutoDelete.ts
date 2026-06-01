import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { readEventDeletePayload } from "../lib/obligation-event-payloads";
import type {
  useDeleteViewerEventLinkMutation,
} from "../services/queries/obligations";
import type {
  NotificationItem,
  ObligationEventSummary,
  ObligationEventViewerLink,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

type DeleteLinkMutation = ReturnType<typeof useDeleteViewerEventLinkMutation>;

type Params = {
  isSharedViewer: boolean;
  obligation: ObligationSummary | SharedObligationSummary | null;
  notifications: NotificationItem[];
  viewerLinks: ObligationEventViewerLink[];
  eventsForDetail: ObligationEventSummary[];
  shareId: number | null;
  deleteViewerLinkMutation: DeleteLinkMutation;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
};

export function useViewerAutoDelete({
  isSharedViewer,
  obligation,
  notifications,
  viewerLinks,
  eventsForDetail,
  shareId,
  deleteViewerLinkMutation,
  showToast,
}: Params) {
  const queryClient = useQueryClient();
  const autoDeletedViewerEventsRef = useRef<Set<number>>(new Set());

  // Auto-delete viewer movement when owner deletes/accepts-delete an event.
  useEffect(() => {
    if (!isSharedViewer || !obligation) return;
    for (const item of notifications) {
      if (item.kind !== "obligation_event_delete_accepted" && item.kind !== "obligation_event_deleted") continue;
      const payload = readEventDeletePayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id) continue;
      if (autoDeletedViewerEventsRef.current.has(payload.eventId)) continue;
      const link = viewerLinks.find((entry) => entry.eventId === payload.eventId);
      if (!link) {
        autoDeletedViewerEventsRef.current.add(payload.eventId);
        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({
          queryKey: ["obligation-event-viewer-links", obligation.id, shareId ?? null],
        });
        continue;
      }
      if (deleteViewerLinkMutation.isPending) continue;

      autoDeletedViewerEventsRef.current.add(payload.eventId);
      deleteViewerLinkMutation.mutate(
        {
          linkId: link.id,
          movementId: link.movementId ?? null,
          obligationId: obligation.id,
          shareId,
        },
        {
          onError: () => {
            autoDeletedViewerEventsRef.current.delete(payload.eventId);
          },
          onSuccess: () => {
            showToast("Movimiento eliminado de tu cuenta", "success");
          },
        },
      );
      break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, viewerLinks, isSharedViewer, obligation?.id, shareId, deleteViewerLinkMutation.isPending]);

  // Cleanup orphan viewer links whose source event no longer exists.
  useEffect(() => {
    if (!isSharedViewer || !obligation || deleteViewerLinkMutation.isPending) return;
    const liveEventIds = new Set(eventsForDetail.map((event) => event.id));
    const orphanLink = viewerLinks.find(
      (link) =>
        !liveEventIds.has(link.eventId) &&
        !autoDeletedViewerEventsRef.current.has(link.eventId),
    );
    if (!orphanLink) return;

    autoDeletedViewerEventsRef.current.add(orphanLink.eventId);
    deleteViewerLinkMutation.mutate(
      {
        linkId: orphanLink.id,
        movementId: orphanLink.movementId ?? null,
        obligationId: obligation.id,
        shareId,
      },
      {
        onError: () => {
          autoDeletedViewerEventsRef.current.delete(orphanLink.eventId);
        },
        onSuccess: () => {
          showToast("Movimiento eliminado de tu cuenta", "success");
        },
      },
    );
  }, [
    isSharedViewer,
    obligation,
    eventsForDetail,
    viewerLinks,
    shareId,
    deleteViewerLinkMutation,
    showToast,
  ]);

  return { autoDeletedViewerEventsRef };
}
