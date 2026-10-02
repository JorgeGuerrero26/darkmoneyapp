import { useMemo } from "react";

import { sortObligationEventsNewestFirst } from "../lib/sort-obligation-events";
import type { ObligationEventSummary } from "../types/domain";

/** Payments and complete activity for the analytical sheet, newest first. */
export function useObligationAnalyticsHistory(eventsForModal: ObligationEventSummary[]) {
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
    () => allEventsSorted.filter((event) => event.eventType !== "opening"),
    [allEventsSorted],
  );

  return {
    paymentEvents,
    allEventsSorted,
    timelineEvents,
  };
}
