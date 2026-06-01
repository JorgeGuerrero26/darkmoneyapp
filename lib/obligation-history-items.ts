import type {
  ObligationEventSummary,
  ObligationPaymentRequest,
} from "../types/domain";
import {
  compareHistoryItemsNewestFirst,
  type DeleteRequestHistoryEntry,
  type HistoryItem,
} from "./obligation-analytics-helpers";

/**
 * Wrap an event as a HistoryItem with the sort keys the modal uses.
 *
 * Why extracted: the analytics modal had three places building the same
 * shape with subtly different filters (combinedList, displayList "pending",
 * displayList "rejected") — three chances to drift.
 */
export function historyItemFromEvent(event: ObligationEventSummary): HistoryItem {
  return {
    kind: "event",
    event,
    date: event.eventDate,
    sortKey: event.createdAt || `${event.eventDate}T00:00:00.000`,
    sortId: event.id,
  };
}

export function historyItemFromRequest(req: ObligationPaymentRequest): HistoryItem {
  return {
    kind: "request",
    request: req,
    date: req.paymentDate,
    sortKey: req.updatedAt || req.createdAt || `${req.paymentDate}T00:00:00.000`,
    sortId: req.id,
  };
}

export function historyItemFromDeleteRequest(req: DeleteRequestHistoryEntry): HistoryItem {
  return {
    kind: "delete_request",
    request: req,
    date: req.notification.scheduledFor,
    sortKey: req.notification.scheduledFor,
    sortId: req.notification.id,
  };
}

/**
 * Combine events (already filtered by date range) + pending/rejected payment
 * requests + delete requests into a unified history list, sorted newest first.
 */
export function buildCombinedHistoryList(input: {
  events: ObligationEventSummary[];
  requests: ObligationPaymentRequest[];
  deleteRequests: DeleteRequestHistoryEntry[];
}): HistoryItem[] {
  const items: HistoryItem[] = input.events.map(historyItemFromEvent);
  for (const req of input.requests) {
    if (req.status === "pending" || req.status === "rejected") {
      items.push(historyItemFromRequest(req));
    }
  }
  for (const req of input.deleteRequests) {
    items.push(historyItemFromDeleteRequest(req));
  }
  return items.sort(compareHistoryItemsNewestFirst);
}

/**
 * Build the history list filtered to a given status (pending or rejected)
 * across both payment requests and delete requests.
 */
export function buildHistoryItemsByRequestStatus(input: {
  requests: ObligationPaymentRequest[];
  deleteRequests: DeleteRequestHistoryEntry[];
  status: "pending" | "rejected";
}): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const req of input.requests) {
    if (req.status === input.status) items.push(historyItemFromRequest(req));
  }
  for (const req of input.deleteRequests) {
    if (req.status === input.status) items.push(historyItemFromDeleteRequest(req));
  }
  return items.sort(compareHistoryItemsNewestFirst);
}
