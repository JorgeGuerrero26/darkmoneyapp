import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrollView } from "react-native";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { todayPeru } from "../lib/date";
import { currentMonthRangeYmd, ymdToLocalDate } from "../lib/obligation-date-range";
import { ownerDefaultAccountId } from "../lib/obligation-viewer-account-impact";
import type {
  ObligationEventViewerLink,
  ObligationEventSummary,
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";
import type {
  PendingOwnerDeleteRequest,
  PendingOwnerEditRequest,
} from "../lib/obligation-event-payloads";

export type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";

function bestHistoryPresetForEventDate(eventDate: string): HistoryPreset {
  const eventDateLocal = ymdToLocalDate(eventDate.slice(0, 10));
  const today = ymdToLocalDate(todayPeru());
  const monthFrom = startOfMonth(today);
  const monthTo = endOfMonth(today);
  if (eventDateLocal >= monthFrom && eventDateLocal <= monthTo) {
    return "month";
  }
  const threeMonthsFrom = startOfMonth(subMonths(today, 2));
  if (eventDateLocal >= threeMonthsFrom && eventDateLocal <= monthTo) {
    return "3m";
  }
  const yearFrom = new Date(today.getFullYear(), 0, 1);
  if (eventDateLocal >= yearFrom && eventDateLocal <= monthTo) {
    return "year";
  }
  return "all";
}

type FocusOptions = {
  announce?: boolean;
  tone?: "info" | "success";
  message?: string;
  toastMessage?: string | null;
};

type Params = {
  obligation: ObligationSummary | SharedObligationSummary | null;
  notificationKind: string;
  routePaymentRequestId: number | null;
  routeEventId: number | null;
  isSharedViewer: boolean;
  viewerLinksLoading: boolean;
  paymentRequests: ObligationPaymentRequest[];
  pendingOwnerDeleteRequests: PendingOwnerDeleteRequest[];
  pendingOwnerEditRequests: PendingOwnerEditRequest[];
  viewerLinks: ObligationEventViewerLink[];
  viewerLinkByEventId: Map<number, ObligationEventViewerLink>;
  eventsForDetail: ObligationEventSummary[];
  filteredHistoryEvents: ObligationEventSummary[];
  showViewerHistoryTab: boolean;
  remoteEventsPending: boolean;
  historyPreset: HistoryPreset;
  historyFrom: string;
  historyTo: string;
  setHistoryPreset: (preset: HistoryPreset) => void;
  setHistoryFrom: (value: string) => void;
  setHistoryTo: (value: string) => void;
  setHistoryGroupsCollapsed: React.Dispatch<
    React.SetStateAction<{ payments: boolean; capital: boolean }>
  >;
  setViewerDetailTab: (tab: "history" | "requests") => void;
  setNotificationRequestTarget: (req: ObligationPaymentRequest | null) => void;
  setOwnerResponseAccountId: (accountId: number | null) => void;
  setOwnerDeleteRequestTarget: (target: PendingOwnerDeleteRequest | null) => void;
  setOwnerEditRequestTarget: (target: PendingOwnerEditRequest | null) => void;
  showToast: (message: string, tone?: "success" | "error" | "info") => void;
  detailScrollRef: React.MutableRefObject<ScrollView | null>;
  historySectionYRef: React.MutableRefObject<number | null>;
  eventRowLayoutsRef: React.MutableRefObject<Map<number, { y: number; height: number }>>;
  detailViewportHeight: number;
};

export function useObligationNotificationDeepLink({
  obligation,
  notificationKind,
  routePaymentRequestId,
  routeEventId,
  isSharedViewer,
  viewerLinksLoading,
  paymentRequests,
  pendingOwnerDeleteRequests,
  pendingOwnerEditRequests,
  viewerLinks,
  viewerLinkByEventId,
  eventsForDetail,
  filteredHistoryEvents,
  showViewerHistoryTab,
  remoteEventsPending,
  historyPreset,
  historyFrom,
  historyTo,
  setHistoryPreset,
  setHistoryFrom,
  setHistoryTo,
  setHistoryGroupsCollapsed,
  setViewerDetailTab,
  setNotificationRequestTarget,
  setOwnerResponseAccountId,
  setOwnerDeleteRequestTarget,
  setOwnerEditRequestTarget,
  showToast,
  detailScrollRef,
  historySectionYRef,
  eventRowLayoutsRef,
  detailViewportHeight,
}: Params) {
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [highlightPulseOn, setHighlightPulseOn] = useState(false);
  const [pendingFocusEventId, setPendingFocusEventId] = useState<number | null>(null);
  const [eventFocusNotice, setEventFocusNotice] = useState<{
    tone: "info" | "success";
    text: string;
  } | null>(null);
  const notificationPromptHandledRef = useRef<string | null>(null);
  const focusTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearFocusTimers = useCallback(() => {
    focusTimersRef.current.forEach((timer) => clearTimeout(timer));
    focusTimersRef.current = [];
  }, []);

  const showEventFocusNotice = useCallback((tone: "info" | "success", text: string) => {
    setEventFocusNotice({ tone, text });
    const hideTimer = setTimeout(() => {
      setEventFocusNotice((current) => (current?.text === text ? null : current));
    }, 3200);
    focusTimersRef.current.push(hideTimer);
  }, []);

  const pulseEventHighlight = useCallback((eventId: number) => {
    const pulseFrames = [true, false, true, false, true, false];
    setHighlightedEventId(eventId);
    pulseFrames.forEach((isOn, index) => {
      const timer = setTimeout(() => {
        setHighlightedEventId(eventId);
        setHighlightPulseOn(isOn);
      }, index * 240);
      focusTimersRef.current.push(timer);
    });
    focusTimersRef.current.push(
      setTimeout(() => {
        setHighlightPulseOn(false);
      }, pulseFrames.length * 240),
    );
    focusTimersRef.current.push(
      setTimeout(() => {
        setHighlightedEventId(null);
      }, pulseFrames.length * 240 + 500),
    );
  }, []);

  const applyHistoryPreset = useCallback(
    (preset: HistoryPreset) => {
      setHistoryPreset(preset);
      if (preset === "all") {
        setHistoryFrom("");
        setHistoryTo("");
        return;
      }
      const today = ymdToLocalDate(todayPeru());
      if (preset === "month") {
        setHistoryFrom(format(startOfMonth(today), "yyyy-MM-dd"));
        setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
        return;
      }
      if (preset === "3m") {
        setHistoryFrom(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"));
        setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
        return;
      }
      if (preset === "year") {
        setHistoryFrom(`${today.getFullYear()}-01-01`);
        setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
        return;
      }
      const { from, to } = currentMonthRangeYmd();
      setHistoryFrom(from);
      setHistoryTo(to);
    },
    [setHistoryFrom, setHistoryPreset, setHistoryTo],
  );

  const focusEventFromNotification = useCallback(
    (eventId: number, options?: FocusOptions): boolean => {
      const announce = options?.announce ?? true;
      const linked = viewerLinkByEventId.has(eventId);
      const tone = options?.tone ?? (linked ? "success" : "info");
      const message =
        options?.message
        ?? (linked
          ? "Cuenta ya asociada. Te mostramos el evento relacionado."
          : "Te mostramos el evento relacionado para que puedas revisarlo o asociarlo a una cuenta.");
      if (announce) {
        clearFocusTimers();
        showEventFocusNotice(tone, message);
      }
      if (announce && options?.toastMessage) {
        showToast(options.toastMessage, tone === "success" ? "success" : "info");
      } else if (linked && announce) {
        showToast("Cuenta ya asociada", "success");
      }
      const layout = eventRowLayoutsRef.current.get(eventId);
      if (!layout) {
        const historyY = historySectionYRef.current;
        if (historyY != null) {
          detailScrollRef.current?.scrollTo({
            y: Math.max(historyY - 120, 0),
            animated: true,
          });
        }
        setPendingFocusEventId(eventId);
        return false;
      }
      const historyY = historySectionYRef.current ?? 0;
      const absoluteRowY = historyY + layout.y;
      const centeredOffset =
        detailViewportHeight > 0
          ? Math.max(absoluteRowY - (detailViewportHeight - layout.height) / 2, 0)
          : Math.max(absoluteRowY - 220, 0);
      detailScrollRef.current?.scrollTo({
        y: centeredOffset,
        animated: true,
      });
      pulseEventHighlight(eventId);
      setPendingFocusEventId(null);
      return true;
    },
    [
      clearFocusTimers,
      detailScrollRef,
      detailViewportHeight,
      eventRowLayoutsRef,
      historySectionYRef,
      pulseEventHighlight,
      showEventFocusNotice,
      showToast,
      viewerLinkByEventId,
    ],
  );

  // Cleanup focus timers on unmount.
  useEffect(() => () => {
    clearFocusTimers();
  }, [clearFocusTimers]);

  // Handle notifications: set targets / focus events.
  useEffect(() => {
    if (!obligation || !notificationKind) return;
    const promptKey = `${notificationKind}:${routePaymentRequestId ?? routeEventId ?? ""}:${obligation.id}`;
    if (notificationPromptHandledRef.current === promptKey) return;

    if (notificationKind === "obligation_payment_request" && routePaymentRequestId && !isSharedViewer) {
      const req = paymentRequests.find(
        (item) => item.id === routePaymentRequestId && item.status === "pending",
      );
      notificationPromptHandledRef.current = promptKey;
      if (req) {
        setNotificationRequestTarget(req);
        setOwnerResponseAccountId(ownerDefaultAccountId(obligation));
      }
      return;
    }

    if (notificationKind === "obligation_event_delete_request" && routeEventId && !isSharedViewer) {
      const req = pendingOwnerDeleteRequests.find((item) => item.payload.eventId === routeEventId);
      if (req) {
        notificationPromptHandledRef.current = promptKey;
        setOwnerDeleteRequestTarget(req);
      }
      return;
    }

    if (notificationKind === "obligation_event_edit_request" && routeEventId && !isSharedViewer) {
      const req = pendingOwnerEditRequests.find((item) => item.payload.eventId === routeEventId);
      if (req) {
        notificationPromptHandledRef.current = promptKey;
        setOwnerEditRequestTarget(req);
      }
      return;
    }

    if (
      (
        notificationKind === "obligation_event_unlinked" ||
        notificationKind === "obligation_event_updated" ||
        notificationKind === "obligation_event_edit_pending" ||
        notificationKind === "obligation_event_edit_accepted" ||
        notificationKind === "obligation_event_edit_rejected"
      ) &&
      routeEventId &&
      isSharedViewer &&
      !viewerLinksLoading
    ) {
      notificationPromptHandledRef.current = promptKey;
      setViewerDetailTab("history");
      setPendingFocusEventId(routeEventId);
      focusEventFromNotification(routeEventId, {
        announce: true,
        ...(notificationKind === "obligation_event_updated"
          ? {
              tone: "info" as const,
              message: "Este evento fue actualizado. Te mostramos exactamente cual cambio.",
              toastMessage: "Evento actualizado",
            }
          : {}),
      });
    }
  }, [
    obligation,
    notificationKind,
    routePaymentRequestId,
    routeEventId,
    isSharedViewer,
    viewerLinksLoading,
    paymentRequests,
    pendingOwnerDeleteRequests,
    pendingOwnerEditRequests,
    viewerLinks,
    setViewerDetailTab,
    setNotificationRequestTarget,
    setOwnerResponseAccountId,
    setOwnerDeleteRequestTarget,
    setOwnerEditRequestTarget,
    focusEventFromNotification,
  ]);

  // Switch history preset when a focus is pending and target event is out of range.
  useEffect(() => {
    if (!pendingFocusEventId) return;
    const targetEvent = eventsForDetail.find((event) => event.id === pendingFocusEventId);
    if (!targetEvent) return;
    setHistoryGroupsCollapsed((current) => ({
      payments: targetEvent.eventType === "payment" ? false : current.payments,
      capital: targetEvent.eventType === "payment" ? current.capital : false,
    }));
    const bestPreset = bestHistoryPresetForEventDate(targetEvent.eventDate);
    if (historyPreset !== bestPreset) {
      applyHistoryPreset(bestPreset);
      return;
    }
    if (bestPreset === "all") return;
    const eventDay = targetEvent.eventDate.slice(0, 10);
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to || eventDay < from || eventDay > to) {
      applyHistoryPreset(bestPreset);
    }
  }, [
    pendingFocusEventId,
    eventsForDetail,
    historyPreset,
    historyFrom,
    historyTo,
    applyHistoryPreset,
    setHistoryGroupsCollapsed,
  ]);

  // Retry focus once the event becomes visible in the filtered view.
  useEffect(() => {
    if (!pendingFocusEventId || !showViewerHistoryTab) return;
    if (isSharedViewer && remoteEventsPending) return;
    const existsInView = filteredHistoryEvents.some((event) => event.id === pendingFocusEventId);
    if (!existsInView) return;
    const retryTimer = setTimeout(() => {
      focusEventFromNotification(pendingFocusEventId, { announce: false });
    }, 80);
    return () => clearTimeout(retryTimer);
  }, [
    filteredHistoryEvents,
    pendingFocusEventId,
    showViewerHistoryTab,
    isSharedViewer,
    remoteEventsPending,
    detailViewportHeight,
    focusEventFromNotification,
  ]);

  return {
    highlightedEventId,
    highlightPulseOn,
    pendingFocusEventId,
    setPendingFocusEventId,
    eventFocusNotice,
    setEventFocusNotice,
    applyHistoryPreset,
    focusEventFromNotification,
    clearFocusTimers,
    focusTimersRef,
    notificationPromptHandledRef,
  };
}
