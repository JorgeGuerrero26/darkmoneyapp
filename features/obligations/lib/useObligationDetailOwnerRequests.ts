import { useEffect, useState } from "react";
import {
  useAcceptPaymentRequestMutation,
  useDeleteObligationEventMutation,
  useRejectPaymentRequestMutation,
  useRejectObligationEventDeleteRequestMutation,
  useAcceptObligationEventEditRequestMutation,
  useRejectObligationEventEditRequestMutation,
} from "../../../services/queries/obligations";
import { ownerDefaultAccountId } from "../../../lib/obligation-viewer-account-impact";
import { useOwnerEditAccount } from "../../../hooks/useOwnerEditAccount";
import { toastedMutate } from "../../../lib/toasted-mutate";
import type {
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../types/domain";
import type {
  PendingOwnerDeleteRequest,
  PendingOwnerEditRequest,
} from "../../../lib/obligation-event-payloads";

type ObligationLike = ObligationSummary | SharedObligationSummary;

type Args = {
  obligation: ObligationLike | null;
  ownerUserId: string | null | undefined;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
};

export function useObligationDetailOwnerRequests({
  obligation,
  ownerUserId,
  showToast,
}: Args) {
  const acceptRequestMutation = useAcceptPaymentRequestMutation();
  const rejectRequestMutation = useRejectPaymentRequestMutation();
  const deleteEventMutation = useDeleteObligationEventMutation();
  const rejectDeleteRequestMutation = useRejectObligationEventDeleteRequestMutation();
  const acceptEditRequestMutation = useAcceptObligationEventEditRequestMutation();
  const rejectEditRequestMutation = useRejectObligationEventEditRequestMutation();

  const [rejectingRequest, setRejectingRequest] = useState<ObligationPaymentRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [notificationRequestTarget, setNotificationRequestTarget] = useState<ObligationPaymentRequest | null>(null);
  const [ownerResponseAccountId, setOwnerResponseAccountId] = useState<number | null>(null);
  const [ownerDeleteRequestTarget, setOwnerDeleteRequestTarget] = useState<PendingOwnerDeleteRequest | null>(null);
  const [ownerEditRequestTarget, setOwnerEditRequestTarget] = useState<PendingOwnerEditRequest | null>(null);

  const {
    ownerEditResponseAccountId,
    ownerEditPreviousAccountId,
    setOwnerEditResponseAccountId,
  } = useOwnerEditAccount(ownerEditRequestTarget, obligation);

  // Reset owner response account when a new request target is selected
  useEffect(() => {
    if (!notificationRequestTarget) return;
    setOwnerResponseAccountId(ownerDefaultAccountId(obligation));
  }, [notificationRequestTarget?.id, obligation]);

  async function handleAcceptRequest(req: ObligationPaymentRequest) {
    if (!obligation) return;
    const selectedAccountId = ownerResponseAccountId;
    const viewerAutoLinked = Boolean(req.viewerAccountId);
    await toastedMutate({
      mutate: acceptRequestMutation.mutateAsync,
      input: {
        requestId: req.id,
        obligationId: req.obligationId,
        workspaceId: req.workspaceId,
        amount: req.amount,
        paymentDate: req.paymentDate,
        installmentNo: req.installmentNo,
        description: req.description,
        accountId: selectedAccountId,
        createMovement: selectedAccountId != null,
        direction: obligation.direction,
        obligationTitle: obligation.title,
        viewerAccountId: req.viewerAccountId ?? null,
        viewerWorkspaceId: req.viewerWorkspaceId ?? null,
        viewerUserId: req.requestedByUserId,
        ownerUserId: ownerUserId ?? undefined,
        shareId: req.shareId,
      },
      showToast,
      successMessage: viewerAutoLinked
        ? "Solicitud aceptada - el movimiento quedo registrado en la cuenta del solicitante"
        : "Solicitud aceptada y evento registrado",
      onSuccess: () => {
        setNotificationRequestTarget(null);
        setOwnerResponseAccountId(null);
      },
    });
  }

  function openOwnerRequestDecision(req: ObligationPaymentRequest) {
    setNotificationRequestTarget(req);
    setOwnerResponseAccountId(ownerDefaultAccountId(obligation));
  }

  async function handleRejectRequest() {
    if (!rejectingRequest) return;
    await toastedMutate({
      mutate: rejectRequestMutation.mutateAsync,
      input: {
        requestId: rejectingRequest.id,
        obligationId: rejectingRequest.obligationId,
        rejectionReason: rejectReason.trim() || null,
        viewerUserId: rejectingRequest.requestedByUserId,
        ownerUserId: ownerUserId ?? undefined,
        amount: rejectingRequest.amount,
        obligationTitle: obligation?.title,
      },
      showToast,
      successMessage: "Solicitud rechazada",
      onSuccess: () => {
        setRejectingRequest(null);
        setNotificationRequestTarget(null);
        setOwnerResponseAccountId(null);
        setRejectReason("");
      },
    });
  }

  async function handleApproveDeleteRequest(target: PendingOwnerDeleteRequest) {
    if (!obligation) return;
    await toastedMutate({
      mutate: deleteEventMutation.mutateAsync,
      input: {
        eventId: target.payload.eventId,
        obligationId: obligation.id,
        workspaceId: obligation.workspaceId,
        movementId: target.event?.movementId ?? null,
        ownerUserId: ownerUserId ?? undefined,
        obligationTitle: obligation.title,
        amount: target.event?.amount ?? target.payload.amount,
        eventType: target.event?.eventType ?? target.payload.eventType,
        eventDate: target.event?.eventDate ?? target.payload.eventDate,
      },
      showToast,
      successMessage: target.event
        ? "Solicitud aprobada y evento eliminado"
        : "Solicitud aprobada y pendiente resuelta",
      onSuccess: () => setOwnerDeleteRequestTarget(null),
    });
  }

  async function handleRejectDeleteRequest(target: PendingOwnerDeleteRequest) {
    if (!obligation || !ownerUserId || !target.payload.requestedByUserId) return;
    await toastedMutate({
      mutate: rejectDeleteRequestMutation.mutateAsync,
      input: {
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId,
        viewerUserId: target.payload.requestedByUserId,
        amount: target.payload.amount,
        eventType: target.payload.eventType,
        eventDate: target.payload.eventDate,
        obligationTitle: obligation.title,
      },
      showToast,
      successMessage: "Solicitud de eliminacion rechazada",
      onSuccess: () => setOwnerDeleteRequestTarget(null),
    });
  }

  async function handleAcceptEditRequest(target: PendingOwnerEditRequest) {
    if (!obligation || !ownerUserId) return;
    await toastedMutate({
      mutate: acceptEditRequestMutation.mutateAsync,
      input: {
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId,
        viewerUserId: target.payload.requestedByUserId ?? "",
        obligationTitle: obligation.title,
        currencyCode: obligation.currencyCode,
        eventType: target.payload.eventType ?? target.event?.eventType ?? "payment",
        direction:
          (target.payload.eventType ?? target.event?.eventType) === "payment"
            ? obligation.direction
            : undefined,
        currentAmount: target.payload.currentAmount ?? target.event?.amount ?? null,
        currentEventDate: target.payload.currentEventDate ?? target.event?.eventDate ?? null,
        currentInstallmentNo: target.payload.currentInstallmentNo ?? target.event?.installmentNo ?? null,
        currentDescription: target.payload.currentDescription ?? target.event?.description ?? null,
        currentNotes: target.payload.currentNotes ?? target.event?.notes ?? null,
        proposedAmount: target.payload.proposedAmount ?? target.event?.amount ?? 0,
        proposedEventDate: target.payload.proposedEventDate ?? target.event?.eventDate ?? obligation.startDate,
        proposedInstallmentNo: target.payload.proposedInstallmentNo ?? null,
        proposedDescription: target.payload.proposedDescription ?? null,
        proposedNotes: target.payload.proposedNotes ?? null,
        accountId: ownerEditResponseAccountId,
      },
      showToast,
      successMessage: "Solicitud de edicion aprobada",
      onSuccess: () => setOwnerEditRequestTarget(null),
    });
  }

  async function handleRejectEditRequest(target: PendingOwnerEditRequest) {
    if (!obligation || !ownerUserId || !target.payload.requestedByUserId) return;
    await toastedMutate({
      mutate: rejectEditRequestMutation.mutateAsync,
      input: {
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId,
        viewerUserId: target.payload.requestedByUserId,
        currencyCode: obligation.currencyCode,
        obligationTitle: obligation.title,
        currentAmount: target.payload.currentAmount ?? target.event?.amount ?? null,
        currentEventDate: target.payload.currentEventDate ?? target.event?.eventDate ?? null,
        currentInstallmentNo: target.payload.currentInstallmentNo ?? target.event?.installmentNo ?? null,
        currentDescription: target.payload.currentDescription ?? target.event?.description ?? null,
        currentNotes: target.payload.currentNotes ?? target.event?.notes ?? null,
        proposedAmount: target.payload.proposedAmount ?? null,
        proposedEventDate: target.payload.proposedEventDate ?? null,
        proposedInstallmentNo: target.payload.proposedInstallmentNo ?? null,
        proposedDescription: target.payload.proposedDescription ?? null,
        proposedNotes: target.payload.proposedNotes ?? null,
      },
      showToast,
      successMessage: "Solicitud de edicion rechazada",
      onSuccess: () => setOwnerEditRequestTarget(null),
    });
  }

  return {
    // state
    rejectingRequest,
    setRejectingRequest,
    rejectReason,
    setRejectReason,
    notificationRequestTarget,
    setNotificationRequestTarget,
    ownerResponseAccountId,
    setOwnerResponseAccountId,
    ownerDeleteRequestTarget,
    setOwnerDeleteRequestTarget,
    ownerEditRequestTarget,
    setOwnerEditRequestTarget,
    // owner-edit account (from useOwnerEditAccount)
    ownerEditResponseAccountId,
    ownerEditPreviousAccountId,
    setOwnerEditResponseAccountId,
    // mutations (exposed so JSX can read .isPending and so the event-actions hook can reuse deleteEventMutation)
    acceptRequestMutation,
    rejectRequestMutation,
    deleteEventMutation,
    rejectDeleteRequestMutation,
    acceptEditRequestMutation,
    rejectEditRequestMutation,
    // handlers
    handleAcceptRequest,
    openOwnerRequestDecision,
    handleRejectRequest,
    handleApproveDeleteRequest,
    handleRejectDeleteRequest,
    handleAcceptEditRequest,
    handleRejectEditRequest,
  };
}
