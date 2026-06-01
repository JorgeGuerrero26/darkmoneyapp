import type { NotificationItem, ObligationEventSummary } from "../types/domain";

export type EventDeleteRequestPayload = {
  obligationId: number;
  eventId: number;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
};

export type EventDeleteStatus = {
  status: "pending" | "accepted" | "rejected";
  notification: NotificationItem;
  payload: EventDeleteRequestPayload;
};

export type PendingOwnerDeleteRequest = {
  notification: NotificationItem;
  payload: EventDeleteRequestPayload;
  event: ObligationEventSummary | null;
};

export type EventEditRequestPayload = {
  obligationId: number;
  eventId: number;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
};

export type EventEditStatus = {
  status: "pending" | "accepted" | "rejected";
  notification: NotificationItem;
  payload: EventEditRequestPayload;
};

export type PendingOwnerEditRequest = {
  notification: NotificationItem;
  payload: EventEditRequestPayload;
  event: ObligationEventSummary | null;
};

export function readEventDeletePayload(
  value: NotificationItem["payload"],
): EventDeleteRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const obligationId = Number(raw.obligationId ?? 0);
  const eventId = Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    amount: raw.amount == null ? null : Number(raw.amount),
    currencyCode:
      typeof raw.currencyCode === "string" ? raw.currencyCode.trim().toUpperCase() || null : null,
    eventType: typeof raw.eventType === "string" ? raw.eventType : null,
    eventDate: typeof raw.eventDate === "string" ? raw.eventDate : null,
    obligationTitle: typeof raw.obligationTitle === "string" ? raw.obligationTitle : null,
    requestedByUserId: typeof raw.requestedByUserId === "string" ? raw.requestedByUserId : null,
    requestedByDisplayName:
      typeof raw.requestedByDisplayName === "string" ? raw.requestedByDisplayName : null,
    rejectionReason: typeof raw.rejectionReason === "string" ? raw.rejectionReason : null,
    responseStatus:
      raw.responseStatus === "accepted" || raw.responseStatus === "rejected"
        ? raw.responseStatus
        : null,
  };
}

export function readEventEditPayload(
  value: NotificationItem["payload"],
): EventEditRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const obligationId = Number(raw.obligationId ?? 0);
  const eventId = Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    currencyCode:
      typeof raw.currencyCode === "string" ? raw.currencyCode.trim().toUpperCase() || null : null,
    eventType: typeof raw.eventType === "string" ? raw.eventType : null,
    obligationTitle: typeof raw.obligationTitle === "string" ? raw.obligationTitle : null,
    requestedByUserId: typeof raw.requestedByUserId === "string" ? raw.requestedByUserId : null,
    requestedByDisplayName:
      typeof raw.requestedByDisplayName === "string" ? raw.requestedByDisplayName : null,
    rejectionReason: typeof raw.rejectionReason === "string" ? raw.rejectionReason : null,
    responseStatus:
      raw.responseStatus === "accepted" || raw.responseStatus === "rejected"
        ? raw.responseStatus
        : null,
    currentAmount: raw.currentAmount == null ? null : Number(raw.currentAmount),
    currentEventDate: typeof raw.currentEventDate === "string" ? raw.currentEventDate : null,
    currentInstallmentNo:
      raw.currentInstallmentNo == null ? null : Number(raw.currentInstallmentNo),
    currentDescription:
      typeof raw.currentDescription === "string" ? raw.currentDescription : null,
    currentNotes: typeof raw.currentNotes === "string" ? raw.currentNotes : null,
    proposedAmount: raw.proposedAmount == null ? null : Number(raw.proposedAmount),
    proposedEventDate: typeof raw.proposedEventDate === "string" ? raw.proposedEventDate : null,
    proposedInstallmentNo:
      raw.proposedInstallmentNo == null ? null : Number(raw.proposedInstallmentNo),
    proposedDescription:
      typeof raw.proposedDescription === "string" ? raw.proposedDescription : null,
    proposedNotes: typeof raw.proposedNotes === "string" ? raw.proposedNotes : null,
  };
}

/**
 * Build a delete-request notification payload. Used by the mutations that
 * create / accept / reject delete requests. The currency code is normalized
 * to uppercase so backend and clients agree on a single canonical form.
 */
export function eventDeletePayload(input: {
  obligationId: number;
  eventId: number;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
}): EventDeleteRequestPayload {
  return {
    obligationId: input.obligationId,
    eventId: input.eventId,
    amount: input.amount ?? null,
    currencyCode: input.currencyCode?.trim().toUpperCase() || null,
    eventType: input.eventType ?? null,
    eventDate: input.eventDate ?? null,
    obligationTitle: input.obligationTitle ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    requestedByDisplayName: input.requestedByDisplayName ?? null,
    rejectionReason: input.rejectionReason ?? null,
    responseStatus: input.responseStatus ?? null,
  };
}

/**
 * Build an edit-request notification payload. Mirrors {@link eventDeletePayload}
 * with the proposed-vs-current fields.
 */
export function eventEditPayload(input: {
  obligationId: number;
  eventId: number;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
}): EventEditRequestPayload {
  return {
    obligationId: input.obligationId,
    eventId: input.eventId,
    currencyCode: input.currencyCode?.trim().toUpperCase() || null,
    eventType: input.eventType ?? null,
    obligationTitle: input.obligationTitle ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    requestedByDisplayName: input.requestedByDisplayName ?? null,
    rejectionReason: input.rejectionReason ?? null,
    responseStatus: input.responseStatus ?? null,
    currentAmount: input.currentAmount ?? null,
    currentEventDate: input.currentEventDate ?? null,
    currentInstallmentNo: input.currentInstallmentNo ?? null,
    currentDescription: input.currentDescription ?? null,
    currentNotes: input.currentNotes ?? null,
    proposedAmount: input.proposedAmount ?? null,
    proposedEventDate: input.proposedEventDate ?? null,
    proposedInstallmentNo: input.proposedInstallmentNo ?? null,
    proposedDescription: input.proposedDescription ?? null,
    proposedNotes: input.proposedNotes ?? null,
  };
}
