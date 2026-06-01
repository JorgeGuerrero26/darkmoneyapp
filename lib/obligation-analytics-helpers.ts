import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../components/ui/AmountDisplay";
import type {
  NotificationItem,
  ObligationEventSummary,
  ObligationPaymentRequest,
} from "../types/domain";
import type { EventDeleteRequestPayload } from "./obligation-event-payloads";

/**
 * Human-readable labels for each `ObligationEvent.eventType` shown in the
 * analytics modal. Keep this aligned with the EVENT_LABEL_PAYABLE map in
 * `lib/obligation-event-presentation.ts` — that one is used in the history
 * row of the detail screen and has a slightly different vocabulary.
 */
export const ANALYTICS_EVENT_LABELS: Record<string, { label: string }> = {
  payment: { label: "Pago" },
  principal_increase: { label: "Aumento principal" },
  principal_decrease: { label: "Reduccion principal" },
  opening: { label: "Apertura" },
  status_change: { label: "Cambio de estado" },
  conditions_update: { label: "Actualizacion" },
};

/** "+12.34", "-12.34" or "12.34" (zero). */
export function formatSignedCurrencyValue(amount: number, currency: string): string {
  const absolute = formatCurrency(Math.abs(amount), currency);
  if (amount > 0) return `+${absolute}`;
  if (amount < 0) return `-${absolute}`;
  return absolute;
}

/** "5 ene al 12 ene 2026" — locale "es", no year on the start side. */
export function formatPeriodLabel(from: Date, to: Date): string {
  const fromText = format(from, "d MMM", { locale: es });
  const toText = format(to, "d MMM yyyy", { locale: es });
  return `${fromText} al ${toText}`;
}

/** Group events by their date (YYYY-MM-DD), newest first. */
export function groupAnalyticsEventsByDate(
  events: ObligationEventSummary[],
): Array<{ date: string; events: ObligationEventSummary[] }> {
  const map = new Map<string, ObligationEventSummary[]>();
  for (const e of events) {
    const date = e.eventDate.slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, evs]) => ({ date, events: evs }));
}

export type DeleteRequestHistoryEntry = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  payload: EventDeleteRequestPayload;
  event: ObligationEventSummary | null;
  notification: NotificationItem;
  ownerCanRespond: boolean;
};

export type HistoryItem =
  | { kind: "event"; event: ObligationEventSummary; date: string; sortKey: string; sortId: number }
  | { kind: "request"; request: ObligationPaymentRequest; date: string; sortKey: string; sortId: number }
  | {
      kind: "delete_request";
      request: DeleteRequestHistoryEntry;
      date: string;
      sortKey: string;
      sortId: number;
    };

export function compareHistoryItemsNewestFirst(a: HistoryItem, b: HistoryItem): number {
  const bySortKey = b.sortKey.localeCompare(a.sortKey);
  if (bySortKey !== 0) return bySortKey;
  return b.sortId - a.sortId;
}
