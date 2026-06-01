import { useMemo } from "react";

import { buildDateRangeNotice } from "../lib/date-range-notice";
import { sortObligationEventsNewestFirst } from "../lib/sort-obligation-events";
import type { ObligationEventSummary } from "../types/domain";

type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";

type Params = {
  eventsForModal: ObligationEventSummary[];
  historyPreset: HistoryPreset;
  historyFrom: string;
  historyTo: string;
};

/**
 * Derived history slices for the analytics modal:
 *   - paymentEvents: events of type "payment" only, newest first.
 *   - allEventsSorted: all events newest first.
 *   - timelineEvents: top 12 non-opening events for the rendered timeline.
 *   - filteredHistoryEvents: events within the [historyFrom, historyTo] range
 *     (or all if preset is "all" or the range is empty).
 *   - historyDateRangeNotice: human-readable copy describing the active range.
 *
 * All derivations are pure useMemos. Extracted so the analytics modal stops
 * declaring them inline (~80 lines).
 */
export function useObligationAnalyticsHistory({
  eventsForModal,
  historyPreset,
  historyFrom,
  historyTo,
}: Params) {
  const paymentEvents = useMemo(() => {
    return eventsForModal
      .filter((e) => e.eventType === "payment")
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [eventsForModal]);

  const allEventsSorted = useMemo(
    () => sortObligationEventsNewestFirst(eventsForModal),
    [eventsForModal],
  );

  const timelineEvents = useMemo(
    () => allEventsSorted.filter((event) => event.eventType !== "opening").slice(0, 12),
    [allEventsSorted],
  );

  const filteredHistoryEvents = useMemo(() => {
    if (historyPreset === "all") return allEventsSorted;
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to) return allEventsSorted;
    return allEventsSorted.filter((e) => {
      const d = e.eventDate.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [allEventsSorted, historyFrom, historyTo, historyPreset]);

  const historyDateRangeNotice = useMemo(() => {
    const from = historyPreset === "all" ? null : historyFrom.trim() || null;
    const to = historyPreset === "all" ? null : historyTo.trim() || null;
    return buildDateRangeNotice({
      subject: "eventos del historial",
      from,
      to,
      allMessage: "Mostrando todos los eventos del historial.",
    });
  }, [historyFrom, historyPreset, historyTo]);

  return {
    paymentEvents,
    allEventsSorted,
    timelineEvents,
    filteredHistoryEvents,
    historyDateRangeNotice,
  };
}
