import { useEffect, useRef } from "react";

import type {
  useUpsertLinkEventToAccountMutation,
} from "../services/queries/obligations";
import type {
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

type LinkMutation = ReturnType<typeof useUpsertLinkEventToAccountMutation>;

type Params = {
  isSharedViewer: boolean;
  viewerRequests: ObligationPaymentRequest[];
  obligation: ObligationSummary | SharedObligationSummary | null;
  profileId: string | null | undefined;
  shareId: number | null;
  activeWorkspaceId: number | null;
  linkedEventIds: Set<number>;
  linkEventMutation: LinkMutation;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
};

export function useViewerAutoLink({
  isSharedViewer,
  viewerRequests,
  obligation,
  profileId,
  shareId,
  activeWorkspaceId,
  linkedEventIds,
  linkEventMutation,
  showToast,
}: Params) {
  const autoLinkedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!isSharedViewer || !viewerRequests.length || !profileId || !shareId || !activeWorkspaceId || !obligation) return;
    for (const req of viewerRequests) {
      if (
        req.status === "accepted" &&
        req.viewerAccountId != null &&
        req.viewerWorkspaceId != null &&
        req.acceptedEventId != null &&
        !linkedEventIds.has(req.acceptedEventId) &&
        !autoLinkedRef.current.has(req.id) &&
        !linkEventMutation.isPending
      ) {
        autoLinkedRef.current.add(req.id);
        const verb = obligation.direction === "receivable" ? "pago" : "cobro";
        linkEventMutation.mutate(
          {
            obligationId: obligation.id,
            obligationWorkspaceId: obligation.workspaceId,
            eventId: req.acceptedEventId,
            eventType: "payment",
            shareId,
            linkedByUserId: profileId,
            viewerWorkspaceId: req.viewerWorkspaceId,
            accountId: req.viewerAccountId,
            amount: req.amount,
            eventDate: req.paymentDate,
            description: req.description,
            obligationDirection: obligation.direction,
            obligationTitle: obligation.title,
            currencyCode: obligation.currencyCode,
          },
          {
            onError: () => {
              autoLinkedRef.current.delete(req.id);
            },
            onSuccess: (data) => {
              showToast(
                `${verb.charAt(0).toUpperCase() + verb.slice(1)} registrado en tu cuenta automaticamente`,
                "success",
              );
              if (data?.attachmentSyncError) {
                showToast(data.attachmentSyncError, "error");
              }
            },
          },
        );
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRequests, linkedEventIds.size]);

  return { autoLinkedRef };
}
