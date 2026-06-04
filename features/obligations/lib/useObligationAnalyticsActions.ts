import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { removeAttachmentFile } from "../../../lib/entity-attachments";
import { humanizeError } from "../../../lib/errors";
import { mergePreviewAttachments } from "../../../lib/attachments/merge-preview-attachments";
import {
  useObligationEventAttachmentsQuery,
  useMovementAttachmentsQuery,
  type EntityAttachmentFile,
} from "../../../services/queries/attachments";
import { useDeleteObligationEventMutation } from "../../../services/queries/obligations";
import type {
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../types/domain";

type ObligationLike = ObligationSummary | SharedObligationSummary;

type Args = {
  liveAnalyticsObligation: ObligationLike | null;
  ownerUserId: string | null | undefined;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
};

export function useObligationAnalyticsActions({
  liveAnalyticsObligation,
  ownerUserId,
  showToast,
}: Args) {
  const queryClient = useQueryClient();
  const deleteEventMutation = useDeleteObligationEventMutation();

  // Event editing from analytics modal
  const [editEventObligation, setEditEventObligation] = useState<ObligationLike | null>(null);
  const [editingEventForPayment, setEditingEventForPayment] = useState<ObligationEventSummary | undefined>(undefined);
  const [editingEventForAdjustment, setEditingEventForAdjustment] = useState<ObligationEventSummary | undefined>(undefined);
  const [adjustEventMode, setAdjustEventMode] = useState<"increase" | "decrease">("increase");

  // Analytics event selection + menus
  const [selectedAnalyticsEvent, setSelectedAnalyticsEvent] = useState<ObligationEventSummary | null>(null);
  const [selectedAnalyticsEventObligation, setSelectedAnalyticsEventObligation] = useState<ObligationLike | null>(null);
  const [analyticsEventMenuVisible, setAnalyticsEventMenuVisible] = useState(false);
  const [analyticsAttachmentPreviewVisible, setAnalyticsAttachmentPreviewVisible] = useState(false);
  const [deletingAnalyticsAttachmentPath, setDeletingAnalyticsAttachmentPath] = useState<string | null>(null);
  const [analyticsConfirmDeleteVisible, setAnalyticsConfirmDeleteVisible] = useState(false);

  const {
    data: selectedAnalyticsEventAttachments = [],
    isLoading: selectedAnalyticsEventAttachmentsLoading,
  } = useObligationEventAttachmentsQuery(
    selectedAnalyticsEvent ? selectedAnalyticsEventObligation?.workspaceId ?? null : null,
    selectedAnalyticsEvent?.id ?? null,
  );
  const {
    data: selectedAnalyticsMovementAttachments = [],
    isLoading: selectedAnalyticsMovementAttachmentsLoading,
  } = useMovementAttachmentsQuery(
    selectedAnalyticsEvent?.movementId ? selectedAnalyticsEventObligation?.workspaceId ?? null : null,
    selectedAnalyticsEvent?.movementId ?? null,
  );
  const selectedAnalyticsPreviewAttachments = useMemo(
    () => mergePreviewAttachments(selectedAnalyticsEventAttachments, selectedAnalyticsMovementAttachments),
    [selectedAnalyticsEventAttachments, selectedAnalyticsMovementAttachments],
  );
  const selectedAnalyticsPreviewAttachmentsLoading =
    selectedAnalyticsEventAttachmentsLoading ||
    (selectedAnalyticsEvent?.movementId != null && selectedAnalyticsMovementAttachmentsLoading);

  function handleEventTap(ev: ObligationEventSummary) {
    if (!liveAnalyticsObligation) return;
    setSelectedAnalyticsEvent(ev);
    setSelectedAnalyticsEventObligation(liveAnalyticsObligation);
    setAnalyticsAttachmentPreviewVisible(false);
    setAnalyticsEventMenuVisible(true);
  }

  function handleAnalyticsEditEvent() {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    setAnalyticsEventMenuVisible(false);
    if (selectedAnalyticsEvent.eventType === "payment") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setEditingEventForPayment(selectedAnalyticsEvent);
    } else if (selectedAnalyticsEvent.eventType === "principal_increase") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setAdjustEventMode("increase");
      setEditingEventForAdjustment(selectedAnalyticsEvent);
    } else if (selectedAnalyticsEvent.eventType === "principal_decrease") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setAdjustEventMode("decrease");
      setEditingEventForAdjustment(selectedAnalyticsEvent);
    }
  }

  function handleAnalyticsDeleteEvent() {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    deleteEventMutation.mutate(
      {
        eventId: selectedAnalyticsEvent.id,
        obligationId: selectedAnalyticsEventObligation.id,
        movementId: selectedAnalyticsEvent.movementId,
        ownerUserId: ownerUserId ?? undefined,
        obligationTitle: selectedAnalyticsEventObligation.title,
        amount: selectedAnalyticsEvent.amount,
        eventType: selectedAnalyticsEvent.eventType,
        eventDate: selectedAnalyticsEvent.eventDate,
      },
      {
        onSuccess: (data) => {
          setAnalyticsConfirmDeleteVisible(false);
          setSelectedAnalyticsEvent(null);
          setSelectedAnalyticsEventObligation(null);
          showToast(
            data?.deletedOwnerMovementId ? "Evento y movimiento eliminados" : "Evento eliminado",
            "success",
          );
        },
        onError: (err) => showToast(humanizeError(err), "error"),
      },
    );
  }

  async function handleDeleteAnalyticsAttachment(attachment: EntityAttachmentFile) {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    try {
      setDeletingAnalyticsAttachmentPath(attachment.filePath);
      await removeAttachmentFile({
        filePath: attachment.filePath,
        mirrorTargets: attachment.filePath.includes("/movement/")
          ? [
              {
                workspaceId: selectedAnalyticsEventObligation.workspaceId,
                entityType: "obligation-event",
                entityId: selectedAnalyticsEvent.id,
              },
            ]
          : selectedAnalyticsEvent.movementId != null
            ? [
                {
                  workspaceId: selectedAnalyticsEventObligation.workspaceId,
                  entityType: "movement",
                  entityId: selectedAnalyticsEvent.movementId,
                },
              ]
            : [],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "entity-attachments",
          selectedAnalyticsEventObligation.workspaceId,
          "obligation-event",
          selectedAnalyticsEvent.id,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["entity-attachment-counts", selectedAnalyticsEventObligation.workspaceId, "obligation-event"],
      });
      if (selectedAnalyticsEvent.movementId != null) {
        await queryClient.invalidateQueries({
          queryKey: [
            "movement-attachments",
            selectedAnalyticsEventObligation.workspaceId,
            selectedAnalyticsEvent.movementId,
          ],
        });
      }
      showToast("Comprobante eliminado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setDeletingAnalyticsAttachmentPath(null);
    }
  }

  function resetEditEvent() {
    setEditingEventForPayment(undefined);
    setEditingEventForAdjustment(undefined);
    setEditEventObligation(null);
  }

  return {
    // edit-event state
    editEventObligation,
    editingEventForPayment,
    editingEventForAdjustment,
    adjustEventMode,
    resetEditEvent,
    // selection + menus
    selectedAnalyticsEvent,
    selectedAnalyticsEventObligation,
    analyticsEventMenuVisible,
    setAnalyticsEventMenuVisible,
    analyticsAttachmentPreviewVisible,
    setAnalyticsAttachmentPreviewVisible,
    deletingAnalyticsAttachmentPath,
    analyticsConfirmDeleteVisible,
    setAnalyticsConfirmDeleteVisible,
    // derived attachments
    selectedAnalyticsPreviewAttachments,
    selectedAnalyticsPreviewAttachmentsLoading,
    // handlers
    handleEventTap,
    handleAnalyticsEditEvent,
    handleAnalyticsDeleteEvent,
    handleDeleteAnalyticsAttachment,
  };
}
