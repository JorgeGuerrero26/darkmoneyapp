import { useEffect, useMemo, useState } from "react";
import { buildDateRangeNotice } from "../../../lib/date-range-notice";
import { currentMonthRangeYmd } from "../../../lib/obligation-date-range";
import type { ObligationEventSummary } from "../../../types/domain";

export type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";

export type HistoryGroupsCollapsed = {
  payments: boolean;
  capital: boolean;
};

type Args = {
  obligationId: number | null | undefined;
  events: ObligationEventSummary[];
};

export function useObligationDetailHistoryFilter({ obligationId, events }: Args) {
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>("month");
  const [historyGroupsCollapsed, setHistoryGroupsCollapsed] = useState<HistoryGroupsCollapsed>({
    payments: false,
    capital: false,
  });
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // Reset when obligation changes
  useEffect(() => {
    const { from, to } = currentMonthRangeYmd();
    setHistoryPreset("month");
    setHistoryFrom(from);
    setHistoryTo(to);
    setHistoryGroupsCollapsed({ payments: false, capital: false });
  }, [obligationId]);

  const filteredHistoryEvents = useMemo(() => {
    if (historyPreset === "all") return events;
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to) return events;
    return events.filter((event) => {
      const d = event.eventDate.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [events, historyFrom, historyPreset, historyTo]);

  const paymentHistoryEvents = useMemo(
    () => filteredHistoryEvents.filter((event) => event.eventType === "payment"),
    [filteredHistoryEvents],
  );
  const capitalHistoryEvents = useMemo(
    () => filteredHistoryEvents.filter((event) => event.eventType !== "payment"),
    [filteredHistoryEvents],
  );

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
    historyPreset,
    setHistoryPreset,
    historyFrom,
    setHistoryFrom,
    historyTo,
    setHistoryTo,
    historyGroupsCollapsed,
    setHistoryGroupsCollapsed,
    filteredHistoryEvents,
    paymentHistoryEvents,
    capitalHistoryEvents,
    historyDateRangeNotice,
  };
}
