import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  X,
  TrendingUp,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from "lucide-react-native";
import { differenceInCalendarDays, differenceInDays, endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { DatePickerInput } from "../ui/DatePickerInput";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { parseDisplayDate, todayPeru } from "../../lib/date";
import { buildDateRangeNotice } from "../../lib/date-range-notice";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useWorkspace } from "../../lib/workspace-context";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { OBLIGATION_EVENT_HISTORY_PAGE_SIZE } from "../../constants/config";
import type {
  NotificationItem,
  ObligationSummary,
  ObligationEventSummary,
  ObligationPaymentRequest,
  SharedObligationSummary,
} from "../../types/domain";
import {
  useObligationEventsQuery,
  useObligationPaymentRequestsQuery,
  useViewerPaymentRequestsQuery,
  useAcceptPaymentRequestMutation,
  useRejectPaymentRequestMutation,
  useNotificationsQuery,
  useCreateObligationEventDeleteRequestMutation,
  useDeleteObligationEventMutation,
  useObligationEventViewerLinksQuery,
  useRejectObligationEventDeleteRequestMutation,
  useUpsertLinkEventToAccountMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useObligationEventAttachmentsQuery } from "../../services/queries/attachments";
import {
  analyticsChartSectionTitle,
  analyticsEventPaymentNoun,
  analyticsInstallmentsDoneAdj,
  analyticsPaidMetricLabel,
  analyticsPaymentCountMetricLabel,
  obligationEventCashDeltaSign,
  obligationHistoryEventColor,
  obligationHistoryEventAmountPrefix,
  obligationProgressPaidAdjective,
  obligationViewerActsAsCollector,
} from "../../lib/obligation-viewer-labels";
import { useToast } from "../../hooks/useToast";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { ObligationEventDeleteImpact } from "./ObligationEventDeleteImpact";
import { SafeBlurView } from "../ui/SafeBlurView";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";
import { StaggeredItem } from "../ui/StaggeredItem";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function currentMonthRangeYmd(): { from: string; to: string } {
  const today = ymdToLocalDate(todayPeru());
  return {
    from: format(startOfMonth(today), "yyyy-MM-dd"),
    to: format(endOfMonth(today), "yyyy-MM-dd"),
  };
}

function formatSignedCurrencyValue(amount: number, currency: string): string {
  const absolute = formatCurrency(Math.abs(amount), currency);
  if (amount > 0) return `+${absolute}`;
  if (amount < 0) return `-${absolute}`;
  return absolute;
}

function formatPeriodLabel(from: Date, to: Date): string {
  const fromText = format(from, "d MMM", { locale: es });
  const toText = format(to, "d MMM yyyy", { locale: es });
  return `${fromText} al ${toText}`;
}

function firstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function groupAnalyticsEventsByDate(events: ObligationEventSummary[]): Array<{ date: string; events: ObligationEventSummary[] }> {
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

type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";
type ChartScope = "6" | "12" | "all";
type TimelineFilter = "all" | "payments" | "capital";
type TimelineToneFilter = "all" | "positive" | "negative";
type TimelinePerspective = "obligation" | "cash";
type ComparisonMode = "flow" | "capital" | "all";
type ComparisonWindow = "month" | "90d";

const EVENT_LABELS: Record<string, { label: string }> = {
  payment: { label: "Pago" },
  principal_increase: { label: "Aumento principal" },
    principal_decrease: { label: "Reduccion principal" },
  opening: { label: "Apertura" },
  status_change: { label: "Cambio de estado" },
    conditions_update: { label: "Actualizacion" },
};

type Props = {
  visible: boolean;
  obligation: ObligationSummary | SharedObligationSummary | null;
  onClose: () => void;
  onEventTap?: (ev: ObligationEventSummary) => void;
  userId?: string | null;
};

type EventTypeFilter = "all" | "approved" | "pending" | "rejected";

type DeleteRequestHistoryEntry = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  payload: EventDeleteRequestPayload;
  event: ObligationEventSummary | null;
  notification: NotificationItem;
  ownerCanRespond: boolean;
};

type HistoryItem =
  | { kind: "event"; event: ObligationEventSummary; date: string; sortKey: string; sortId: number }
  | { kind: "request"; request: ObligationPaymentRequest; date: string; sortKey: string; sortId: number }
  | {
      kind: "delete_request";
      request: DeleteRequestHistoryEntry;
      date: string;
      sortKey: string;
      sortId: number;
    };

type EventDeleteRequestPayload = {
  obligationId: number;
  eventId: number;
  amount?: number | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  requestedByUserId?: string | null;
  requestedByDisplayName?: string | null;
  rejectionReason?: string | null;
  responseStatus?: "accepted" | "rejected" | null;
};

type EventDeleteStatus = {
  status: "pending" | "accepted" | "rejected";
  notification: NotificationItem;
  payload: EventDeleteRequestPayload;
};

function readEventDeletePayload(value: NotificationItem["payload"]): EventDeleteRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const obligationId = Number(raw.obligationId ?? 0);
  const eventId = Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    amount: raw.amount == null ? null : Number(raw.amount),
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

function compareHistoryItemsNewestFirst(a: HistoryItem, b: HistoryItem): number {
  const bySortKey = b.sortKey.localeCompare(a.sortKey);
  if (bySortKey !== 0) return bySortKey;
  return b.sortId - a.sortId;
}

export function ObligationAnalyticsModal({ visible, obligation, onClose, onEventTap, userId }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>("month");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [chartScope, setChartScope] = useState<ChartScope>("6");
  const [analyticsPerspective, setAnalyticsPerspective] = useState<TimelinePerspective>("cash");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [timelineToneFilter, setTimelineToneFilter] = useState<TimelineToneFilter>("all");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("flow");
  const [comparisonWindow, setComparisonWindow] = useState<ComparisonWindow>("month");
  const [historyPageIndex, setHistoryPageIndex] = useState(0);
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({
    visible,
    onClose,
  });

  useEffect(() => {
    if (!visible || !obligation) return;
    const { from, to } = currentMonthRangeYmd();
    setHistoryPreset("month");
    setHistoryFrom(from);
    setHistoryTo(to);
    setChartScope("6");
    setAnalyticsPerspective("cash");
    setTimelineFilter("all");
    setTimelineToneFilter("all");
    setComparisonMode("flow");
    setComparisonWindow("month");
    setHistoryPageIndex(0);
    setEventTypeFilter("all");
    setRejectingRequestId(null);
    setRejectReason("");
    setApprovingRequest(null);
    setApprovalAccountId(null);
    setSelectedViewerEvent(null);
    setViewerAttachmentPreviewVisible(false);
    setLinkingEvent(null);
    setLinkingAccountId(null);
    setViewerDeleteRequestEvent(null);
  }, [visible, obligation?.id]);

  useEffect(() => {
    setHistoryPageIndex(0);
  }, [historyFrom, historyTo, historyPreset]);

  const isSharedViewer =
    obligation != null &&
    "viewerMode" in obligation &&
    (obligation as SharedObligationSummary).viewerMode === "shared_viewer";

  const {
    data: remoteEvents,
    isPending: remoteEventsPending,
    isError: remoteEventsError,
  } = useObligationEventsQuery(obligation?.id, visible && isSharedViewer);

  const shareId = isSharedViewer && obligation && "share" in obligation
    ? (obligation as SharedObligationSummary).share.id
    : null;
  const { data: viewerLinks = [] } = useObligationEventViewerLinksQuery(
    visible && isSharedViewer ? obligation?.id : null,
    visible && isSharedViewer ? shareId : null,
  );
  const linkedEventIds = useMemo(
    () => new Set(viewerLinks.map((link) => link.eventId)),
    [viewerLinks],
  );
  const viewerLinkByEventId = useMemo(() => {
    const map = new Map<number, (typeof viewerLinks)[number]>();
    for (const link of viewerLinks) map.set(link.eventId, link);
    return map;
  }, [viewerLinks]);

  // Payment requests: owner sees all requests; viewer sees their own
  const { data: ownerRequests = [] } = useObligationPaymentRequestsQuery(
    visible && !isSharedViewer ? obligation?.id : null,
  );
  const { data: viewerRequests = [] } = useViewerPaymentRequestsQuery(
    visible && isSharedViewer ? obligation?.id : null,
    userId,
  );
  const allRequests = isSharedViewer ? viewerRequests : ownerRequests;
  const acceptedViewerRequestByEventId = useMemo(() => {
    const map = new Map<number, ObligationPaymentRequest>();
    for (const req of viewerRequests) {
      if (req.status === "accepted" && req.acceptedEventId != null) {
        map.set(req.acceptedEventId, req);
      }
    }
    return map;
  }, [viewerRequests]);

  const acceptMutation = useAcceptPaymentRequestMutation();
  const rejectMutation = useRejectPaymentRequestMutation();
  const createDeleteRequestMutation = useCreateObligationEventDeleteRequestMutation();
  const deleteEventMutation = useDeleteObligationEventMutation();
  const rejectDeleteRequestMutation = useRejectObligationEventDeleteRequestMutation();
  const linkEventMutation = useUpsertLinkEventToAccountMutation();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: notifications = [] } = useNotificationsQuery(profile?.id ?? null);
  const [selectedViewerEvent, setSelectedViewerEvent] = useState<ObligationEventSummary | null>(null);
  const [viewerAttachmentPreviewVisible, setViewerAttachmentPreviewVisible] = useState(false);
  const {
    data: selectedViewerEventAttachments = [],
    isLoading: selectedViewerEventAttachmentsLoading,
  } = useObligationEventAttachmentsQuery(
    selectedViewerEvent ? obligation?.workspaceId ?? null : null,
    selectedViewerEvent?.id ?? null,
  );
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>("all");
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingRequest, setApprovingRequest] = useState<ObligationPaymentRequest | null>(null);
  const [approvalAccountId, setApprovalAccountId] = useState<number | null>(null);
  const [linkingEvent, setLinkingEvent] = useState<ObligationEventSummary | null>(null);
  const [linkingAccountId, setLinkingAccountId] = useState<number | null>(null);
  const [viewerDeleteRequestEvent, setViewerDeleteRequestEvent] = useState<ObligationEventSummary | null>(null);
  const autoLinkedRef = useRef<Set<number>>(new Set());
  const ownerAccounts = useMemo(
    () => sortByName((snapshot?.accounts ?? []).filter((account) => !account.isArchived)),
    [snapshot?.accounts],
  );
  const viewerAccounts = ownerAccounts;
  const viewerDeleteStatusByEventId = useMemo(() => {
    const map = new Map<number, EventDeleteStatus>();
    if (!obligation || !isSharedViewer) return map;
    const relevantKinds = new Map<string, EventDeleteStatus["status"]>([
      ["obligation_event_delete_pending", "pending"],
      ["obligation_event_delete_accepted", "accepted"],
      ["obligation_event_delete_rejected", "rejected"],
    ]);
    const priority = { pending: 1, accepted: 2, rejected: 2 } as const;

    for (const item of notifications) {
      const status = relevantKinds.get(item.kind);
      if (!status) continue;
      const payload = readEventDeletePayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id) continue;
      const derivedStatus =
        status === "pending" && payload.responseStatus ? payload.responseStatus : status;
      const prev = map.get(payload.eventId);
      if (!prev) {
        map.set(payload.eventId, { status: derivedStatus, notification: item, payload });
        continue;
      }
      const newerItem =
        item.scheduledFor.localeCompare(prev.notification.scheduledFor) > 0;
      const sameMoment =
        item.scheduledFor.localeCompare(prev.notification.scheduledFor) === 0;
      if (newerItem || (sameMoment && priority[derivedStatus] >= priority[prev.status])) {
        map.set(payload.eventId, { status: derivedStatus, notification: item, payload });
      }
    }

    return map;
  }, [notifications, obligation, isSharedViewer]);

  // Obligaciones compartidas suelen llegar sin `events`; los cargamos desde Supabase.
  const eventsForModal = useMemo(() => {
    if (!obligation) return [] as ObligationEventSummary[];
    const local = obligation.events ?? [];
    if (isSharedViewer) return remoteEvents ?? local;
    return local;
  }, [obligation, isSharedViewer, remoteEvents]);

  const ownerDeleteRequests = useMemo((): DeleteRequestHistoryEntry[] => {
    if (!obligation || isSharedViewer) return [];
    const items: DeleteRequestHistoryEntry[] = [];
    for (const item of notifications) {
      if (item.kind !== "obligation_event_delete_request") continue;
      const payload = readEventDeletePayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id || payload.responseStatus) continue;
      items.push({
        id: `owner-delete-${item.id}`,
        status: "pending",
        payload,
        event: eventsForModal.find((ev) => ev.id === payload.eventId) ?? null,
        notification: item,
        ownerCanRespond: true,
      });
    }
    return items.sort((a, b) => b.notification.scheduledFor.localeCompare(a.notification.scheduledFor));
  }, [eventsForModal, isSharedViewer, notifications, obligation]);

  const viewerDeleteRequests = useMemo((): DeleteRequestHistoryEntry[] => {
    if (!obligation || !isSharedViewer) return [];
    return [...viewerDeleteStatusByEventId.values()]
      .filter((item) => item.status === "pending" || item.status === "rejected")
      .map((item) => ({
        id: `viewer-delete-${item.notification.id}`,
        status: item.status,
        payload: item.payload,
        event: eventsForModal.find((ev) => ev.id === item.payload.eventId) ?? null,
        notification: item.notification,
        ownerCanRespond: false,
      }))
      .sort((a, b) => b.notification.scheduledFor.localeCompare(a.notification.scheduledFor));
  }, [eventsForModal, isSharedViewer, obligation, viewerDeleteStatusByEventId]);

  const deleteRequests = isSharedViewer ? viewerDeleteRequests : ownerDeleteRequests;

  // Todos los hooks deben ejecutarse siempre (nunca despuÃƒÂ©s de `return null`).
  const paymentEvents = useMemo(() => {
    return eventsForModal
      .filter((e) => e.eventType === "payment")
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [eventsForModal]);

  useEffect(() => {
    if (!isSharedViewer || !viewerRequests.length || !profile?.id || !shareId || !activeWorkspaceId || !obligation) return;
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
            linkedByUserId: profile.id,
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

  const monthlyPayments = useMemo(() => {
    const eventMonth = (e: ObligationEventSummary) => e.eventDate.slice(0, 7);

    if (chartScope === "all") {
      const keys = [...new Set(paymentEvents.map(eventMonth))].sort();
      const anchor = ymdToLocalDate(todayPeru());
      const fallbackKey = format(startOfMonth(anchor), "yyyy-MM");
      const monthKeys = keys.length > 0 ? keys : [fallbackKey];
      return monthKeys.map((key) => {
        const d = ymdToLocalDate(`${key}-01`);
        const label = format(d, "MMM yy", { locale: es });
        const total = paymentEvents.filter((e) => eventMonth(e) === key).reduce((s, e) => s + e.amount, 0);
        return { label, key, total };
      });
    }

    const n = chartScope === "12" ? 12 : 6;
    const anchor = ymdToLocalDate(todayPeru());
    const months: { label: string; key: string; total: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(anchor, i));
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM", { locale: es });
      const total = paymentEvents.filter((e) => eventMonth(e) === key).reduce((s, e) => s + e.amount, 0);
      months.push({ label, key, total });
    }
    return months;
  }, [paymentEvents, chartScope]);

  const allEventsSorted = useMemo(
    () => sortObligationEventsNewestFirst(eventsForModal),
    [eventsForModal],
  );
  const analyticsDirection = obligation?.direction ?? "receivable";
  function shouldUseCashPerspective(eventId: number, perspective: TimelinePerspective) {
    if (!isSharedViewer || perspective !== "cash") return false;
    return (viewerLinkByEventId.get(eventId)?.accountId ?? null) != null;
  }
  const analyticsUsesCashPerspective = isSharedViewer && analyticsPerspective === "cash";
  const analysisEvents = useMemo(() => {
    if (!analyticsUsesCashPerspective) {
      return paymentEvents.map((event) => ({
        event,
        signedAmount: event.amount,
        displayAmount: event.amount,
      }));
    }
    return eventsForModal
      .filter((event) =>
        event.eventType === "payment" ||
        event.eventType === "principal_increase" ||
        event.eventType === "principal_decrease",
      )
      .map((event) => {
        if (!shouldUseCashPerspective(event.id, analyticsPerspective)) return null;
        const sign = obligationEventCashDeltaSign(event.eventType, analyticsDirection, isSharedViewer);
        if (sign === 0) return null;
        return {
          event,
          signedAmount: sign * event.amount,
          displayAmount: event.amount,
        };
      })
      .filter((item): item is { event: ObligationEventSummary; signedAmount: number; displayAmount: number } => item != null)
      .sort((a, b) => b.event.eventDate.localeCompare(a.event.eventDate));
  }, [
    analyticsDirection,
    analyticsPerspective,
    analyticsUsesCashPerspective,
    eventsForModal,
    isSharedViewer,
    paymentEvents,
    viewerLinkByEventId,
  ]);
  const analysisMonthlySeries = useMemo(() => {
    const eventMonth = (item: { event: ObligationEventSummary }) => item.event.eventDate.slice(0, 7);
    if (chartScope === "all") {
      const keys = [...new Set(analysisEvents.map(eventMonth))].sort();
      const anchor = ymdToLocalDate(todayPeru());
      const fallbackKey = format(startOfMonth(anchor), "yyyy-MM");
      const monthKeys = keys.length > 0 ? keys : [fallbackKey];
      return monthKeys.map((key) => {
        const d = ymdToLocalDate(`${key}-01`);
        const label = format(d, "MMM yy", { locale: es });
        const total = analysisEvents
          .filter((item) => eventMonth(item) === key)
          .reduce((sum, item) => sum + item.signedAmount, 0);
        return { label, key, total };
      });
    }
    const n = chartScope === "12" ? 12 : 6;
    const anchor = ymdToLocalDate(todayPeru());
    const months: { label: string; key: string; total: number }[] = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = startOfMonth(subMonths(anchor, i));
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM", { locale: es });
      const total = analysisEvents
        .filter((item) => eventMonth(item) === key)
        .reduce((sum, item) => sum + item.signedAmount, 0);
      months.push({ label, key, total });
    }
    return months;
  }, [analysisEvents, chartScope]);
  const timelineEvents = useMemo(
    () => allEventsSorted.filter((event) => event.eventType !== "opening").slice(0, 12),
    [allEventsSorted],
  );

  const filteredHistoryEvents = useMemo(() => {
    if (historyPreset === "all") {
      return allEventsSorted;
    }
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to) {
      return allEventsSorted;
    }
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

  // Combined list: events (approved) + pending/rejected requests
  const combinedList = useMemo((): HistoryItem[] => {
    const items: HistoryItem[] = filteredHistoryEvents.map((e) => ({
      kind: "event",
      event: e,
      date: e.eventDate,
      sortKey: e.createdAt || `${e.eventDate}T00:00:00.000`,
      sortId: e.id,
    }));
    // Add pending and rejected requests to the combined view
    for (const req of allRequests) {
      if (req.status === "pending" || req.status === "rejected") {
        items.push({
          kind: "request",
          request: req,
          date: req.paymentDate,
          sortKey: req.updatedAt || req.createdAt || `${req.paymentDate}T00:00:00.000`,
          sortId: req.id,
        });
      }
    }
    for (const req of deleteRequests) {
      items.push({
        kind: "delete_request",
        request: req,
        date: req.notification.scheduledFor,
        sortKey: req.notification.scheduledFor,
        sortId: req.notification.id,
      });
    }
    return items.sort(compareHistoryItemsNewestFirst);
  }, [filteredHistoryEvents, allRequests, deleteRequests]);

  const displayList = useMemo((): HistoryItem[] => {
    switch (eventTypeFilter) {
      case "approved":
        return combinedList.filter((i) => i.kind === "event");
      case "pending":
        return [
          ...allRequests
            .filter((r) => r.status === "pending")
            .map((r) => ({
              kind: "request" as const,
              request: r,
              date: r.paymentDate,
              sortKey: r.updatedAt || r.createdAt || `${r.paymentDate}T00:00:00.000`,
              sortId: r.id,
            })),
          ...deleteRequests
            .filter((r) => r.status === "pending")
            .map((r) => ({
              kind: "delete_request" as const,
              request: r,
              date: r.notification.scheduledFor,
              sortKey: r.notification.scheduledFor,
              sortId: r.notification.id,
            })),
        ]
          .sort(compareHistoryItemsNewestFirst);
      case "rejected":
        return [
          ...allRequests
            .filter((r) => r.status === "rejected")
            .map((r) => ({
              kind: "request" as const,
              request: r,
              date: r.paymentDate,
              sortKey: r.updatedAt || r.createdAt || `${r.paymentDate}T00:00:00.000`,
              sortId: r.id,
            })),
          ...deleteRequests
            .filter((r) => r.status === "rejected")
            .map((r) => ({
              kind: "delete_request" as const,
              request: r,
              date: r.notification.scheduledFor,
              sortKey: r.notification.scheduledFor,
              sortId: r.notification.id,
            })),
        ]
          .sort(compareHistoryItemsNewestFirst);
      default:
        return combinedList;
    }
  }, [combinedList, allRequests, deleteRequests, eventTypeFilter]);

  const pendingCount =
    allRequests.filter((r) => r.status === "pending").length +
    deleteRequests.filter((r) => r.status === "pending").length;

  const historyPageSize = OBLIGATION_EVENT_HISTORY_PAGE_SIZE;
  const historyTotalPages = Math.max(1, Math.ceil(displayList.length / historyPageSize));
  const historySafePage = Math.min(historyPageIndex, historyTotalPages - 1);
  const historyPageOffset = historySafePage * historyPageSize;
  const paginatedHistoryItems = displayList.slice(
    historyPageOffset,
    historyPageOffset + historyPageSize,
  );

  /**
   * Obligaciones compartidas (edge) a veces traen `principal` / `currentPrincipal` en 0 pero sÃƒÂ­
   * `pendingAmount` y `progressPercent`. Entonces "Pagado" y "Principal" salÃƒÂ­an 0 aunque la barra
   * mostraba el % correcto. Si aplica: principal Ã¢â€°Ë† pendiente / (1 Ã¢Ë†â€™ progress/100).
   *
   * El % de avance puede redondearse o calcularse distinto que la suma de eventos; si hay cobros/pagos
   * en el historial, priorizamos **pendiente + suma(eventos)** para alinear tarjetas con el historial y el grÃƒÂ¡fico.
   */
  const analyticsAmounts = useMemo(() => {
    if (!obligation) return { currentPrincipal: 0, paidAmount: 0 };

    const pendingRaw = Number(obligation.pendingAmount);
    const safePending = Number.isFinite(pendingRaw) ? Math.max(0, pendingRaw) : 0;
    const pctRaw = Number(obligation.progressPercent);
    const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 0;

    const cp = obligation.currentPrincipalAmount;
    const p0 = obligation.principalAmount;
    const principalFromFields =
      cp != null && cp > 0 ? cp : p0 != null && p0 > 0 ? p0 : 0;

    let currentPrincipal = principalFromFields;

    if (currentPrincipal <= 0 && safePending > 0 && pct > 0 && pct < 100) {
      currentPrincipal = safePending / (1 - pct / 100);
    } else if (currentPrincipal <= 0 && safePending > 0) {
      currentPrincipal = safePending;
    }

    let paidAmount = currentPrincipal - safePending;

    const paidFromEvents = paymentEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (paidFromEvents > 0.004) {
      const paidFromBalance = Number.isFinite(paidAmount) ? paidAmount : 0;
      const noPrincipalFromApi = principalFromFields <= 0;
      const balanceVsEventsMismatch = Math.abs(paidFromBalance - paidFromEvents) > 0.05;
      if (noPrincipalFromApi || balanceVsEventsMismatch) {
        paidAmount = paidFromEvents;
        currentPrincipal = safePending + paidFromEvents;
      }
    }

    return {
      currentPrincipal: Number.isFinite(currentPrincipal) ? currentPrincipal : 0,
      paidAmount: Number.isFinite(paidAmount) ? Math.max(0, paidAmount) : 0,
    };
  }, [obligation, paymentEvents]);

  function handleInlineAccept(req: ObligationPaymentRequest) {
    if (!obligation) return;
    setApprovingRequest(req);
    setApprovalAccountId(
      !isSharedViewer ? (obligation as ObligationSummary).settlementAccountId ?? null : null,
    );
  }

  function confirmInlineAccept() {
    if (!obligation || !approvingRequest) return;
    acceptMutation.mutate(
      {
        requestId: approvingRequest.id,
        obligationId: approvingRequest.obligationId,
        workspaceId: approvingRequest.workspaceId,
        amount: approvingRequest.amount,
        paymentDate: approvingRequest.paymentDate,
        installmentNo: approvingRequest.installmentNo,
        description: approvingRequest.description,
        accountId: approvalAccountId,
        createMovement: approvalAccountId != null,
        direction: obligation.direction,
        obligationTitle: obligation.title,
        viewerAccountId: approvingRequest.viewerAccountId ?? null,
        viewerWorkspaceId: approvingRequest.viewerWorkspaceId ?? null,
        viewerUserId: approvingRequest.requestedByUserId,
        ownerUserId: userId,
        shareId: approvingRequest.shareId,
      },
      {
        onSuccess: () => {
          setApprovingRequest(null);
          setApprovalAccountId(null);
          showToast("Solicitud aceptada", "success");
        },
        onError: (err) => {
          showToast(humanizeError(err), "error");
        },
      },
    );
  }

  async function handleInlineReject(req: ObligationPaymentRequest) {
    if (!obligation) return;
    try {
      await rejectMutation.mutateAsync({
        requestId: req.id,
        obligationId: req.obligationId,
        rejectionReason: rejectReason.trim() || null,
        viewerUserId: req.requestedByUserId,
        ownerUserId: userId,
        amount: req.amount,
        obligationTitle: obligation.title,
      });
      setRejectingRequestId(null);
      setRejectReason("");
      showToast("Solicitud rechazada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  function handleViewerEventTap(ev: ObligationEventSummary) {
    setViewerAttachmentPreviewVisible(false);
    setSelectedViewerEvent(ev);
  }

  function openViewerLinkSheet(ev: ObligationEventSummary) {
    const currentLink = viewerLinkByEventId.get(ev.id);
    setLinkingEvent(ev);
    setLinkingAccountId(currentLink?.accountId ?? null);
    setSelectedViewerEvent(null);
  }

  async function handleLinkEvent() {
    if (!linkingEvent || !linkingAccountId || !obligation || !activeWorkspaceId || !profile?.id || !shareId) return;
    const existingLink = viewerLinkByEventId.get(linkingEvent.id);
    try {
      const result = await linkEventMutation.mutateAsync({
        obligationId: obligation.id,
        obligationWorkspaceId: obligation.workspaceId,
        eventId: linkingEvent.id,
        eventType: linkingEvent.eventType as "payment" | "principal_increase" | "principal_decrease",
        shareId,
        linkedByUserId: profile.id,
        viewerWorkspaceId: existingLink?.viewerWorkspaceId ?? activeWorkspaceId,
        accountId: linkingAccountId,
        amount: linkingEvent.amount,
        eventDate: linkingEvent.eventDate,
        description: linkingEvent.description,
        obligationDirection: obligation.direction,
        obligationTitle: obligation.title,
        currencyCode: obligation.currencyCode,
      });
      setLinkingEvent(null);
      setLinkingAccountId(null);
      setSelectedViewerEvent(null);
      const verb = obligation.direction === "receivable" ? "pago" : "cobro";
      showToast(
        existingLink
          ? "Cuenta asociada actualizada"
          : `${verb.charAt(0).toUpperCase() + verb.slice(1)} asociado a tu cuenta`,
        "success",
      );
      if (result.attachmentSyncError) {
        showToast(result.attachmentSyncError, "error");
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleCreateDeleteRequest() {
    if (!viewerDeleteRequestEvent || !obligation || !isSharedViewer || !profile?.id || !("share" in obligation)) return;
    try {
      await createDeleteRequestMutation.mutateAsync({
        obligationId: obligation.id,
        eventId: viewerDeleteRequestEvent.id,
        amount: viewerDeleteRequestEvent.amount,
        currencyCode: obligation.currencyCode,
        eventType: viewerDeleteRequestEvent.eventType,
        eventDate: viewerDeleteRequestEvent.eventDate,
        ownerUserId: obligation.share.ownerUserId,
        viewerUserId: profile.id,
        viewerDisplayName: profile.fullName ?? null,
        obligationTitle: obligation.title,
      });
      setViewerDeleteRequestEvent(null);
      setSelectedViewerEvent(null);
      showToast("Solicitud de eliminacion enviada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleApproveDeleteRequest(req: DeleteRequestHistoryEntry) {
    if (!obligation) return;
    try {
      await deleteEventMutation.mutateAsync({
        eventId: req.payload.eventId,
        obligationId: obligation.id,
        movementId: req.event?.movementId ?? null,
        ownerUserId: userId,
        obligationTitle: obligation.title,
        amount: req.event?.amount ?? req.payload.amount,
        eventType: req.event?.eventType ?? req.payload.eventType,
        eventDate: req.event?.eventDate ?? req.payload.eventDate,
      });
      showToast(
        req.event ? "Solicitud aprobada y evento eliminado" : "Solicitud aprobada y pendiente resuelta",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleRejectDeleteRequest(req: DeleteRequestHistoryEntry) {
    if (!obligation || !userId || !req.payload.requestedByUserId) return;
    try {
      await rejectDeleteRequestMutation.mutateAsync({
        obligationId: obligation.id,
        eventId: req.payload.eventId,
        ownerUserId: userId,
        viewerUserId: req.payload.requestedByUserId,
        amount: req.payload.amount,
        eventType: req.payload.eventType,
        eventDate: req.payload.eventDate,
        obligationTitle: obligation.title,
      });
      showToast("Solicitud de eliminacion rechazada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  if (!obligation) return null;

  const currency = obligation.currencyCode;
  const { currentPrincipal, paidAmount } = analyticsAmounts;
  /** Coherente con las tarjetas (evita % redondeado en servidor vs suma real de eventos). */
  const displayProgressPercent =
    currentPrincipal > 0.009
      ? Math.min(100, Math.max(0, (Math.max(0, paidAmount) / currentPrincipal) * 100))
      : obligation.progressPercent;
  const isPaid = obligation.status === "paid";

  const needsChartScroll =
    chartScope === "all" && monthlyPayments.length > 6;

  const maxMonthly = Math.max(...monthlyPayments.map((m) => m.total), 1);

  const totalInstallments = obligation.installmentCount ?? 0;
  const paidInstallments = paymentEvents.length;
  const todayLocal = ymdToLocalDate(todayPeru());
  const todayMonthKey = format(startOfMonth(todayLocal), "yyyy-MM");
  const currentMonthPaid = paymentEvents
    .filter((event) => event.eventDate.slice(0, 7) === todayMonthKey)
    .reduce((sum, event) => sum + event.amount, 0);
  const trailing90DaysPaid = paymentEvents
    .filter((event) => {
      const eventDate = ymdToLocalDate(event.eventDate);
      return differenceInDays(todayLocal, eventDate) <= 90;
    })
    .reduce((sum, event) => sum + event.amount, 0);
  const totalPaidRecorded = paymentEvents.reduce((sum, event) => sum + event.amount, 0);
  const averagePaymentAmount = paymentEvents.length > 0 ? totalPaidRecorded / paymentEvents.length : 0;
  const lastPaymentEvent = paymentEvents[0] ?? null;
  const firstPaymentEvent = paymentEvents.length > 0 ? paymentEvents[paymentEvents.length - 1] : null;
  const largestPaymentEvent = paymentEvents.reduce<ObligationEventSummary | null>(
    (largest, event) => (!largest || event.amount > largest.amount ? event : largest),
    null,
  );
  const averageGapDays = (() => {
    if (paymentEvents.length < 2) return null;
    const gaps: number[] = [];
    for (let index = 0; index < paymentEvents.length - 1; index += 1) {
      const newer = ymdToLocalDate(paymentEvents[index].eventDate);
      const older = ymdToLocalDate(paymentEvents[index + 1].eventDate);
      gaps.push(Math.abs(differenceInCalendarDays(newer, older)));
    }
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  })();
  const bestMonth = monthlyPayments.reduce<{ key: string; label: string; total: number } | null>(
    (best, month) => (!best || month.total > best.total ? month : best),
    null,
  );
  const monthsWithActivity = monthlyPayments.filter((month) => month.total > 0);
  const averageMonthlyPaid =
    monthsWithActivity.length > 0
      ? monthsWithActivity.reduce((sum, month) => sum + month.total, 0) / monthsWithActivity.length
      : 0;
  const remainingInstallments = Math.max(0, totalInstallments - paidInstallments);
  const amountPerRemainingInstallment =
    remainingInstallments > 0 ? obligation.pendingAmount / remainingInstallments : null;
  const monthsToFinishAtCurrentRhythm =
    averageMonthlyPaid > 0 && obligation.pendingAmount > 0
      ? Math.ceil(obligation.pendingAmount / averageMonthlyPaid)
      : null;
  const dueDatePressure = obligation.dueDate
    ? (() => {
        const daysUntilDue = differenceInCalendarDays(ymdToLocalDate(obligation.dueDate), todayLocal);
        if (monthsToFinishAtCurrentRhythm == null) {
          return daysUntilDue < 0 ? "Sin ritmo suficiente para recuperar el atraso" : "Aun no hay ritmo suficiente";
        }
        const monthsUntilDue = daysUntilDue / 30;
        if (daysUntilDue < 0) return "Compromiso vencido";
        if (monthsToFinishAtCurrentRhythm <= monthsUntilDue) return "Ritmo saludable";
        if (monthsToFinishAtCurrentRhythm <= monthsUntilDue + 1) return "Ritmo justo";
        return "Necesita acelerar";
      })()
    : "Sin fecha limite";
  const chartTitle = analyticsChartSectionTitle(obligation.direction, isSharedViewer, chartScope);
  const paidMetricLabel = analyticsPaidMetricLabel(obligation.direction, isSharedViewer);
  const paymentCountMetricLabel = analyticsPaymentCountMetricLabel(obligation.direction, isSharedViewer);
  const installmentsDoneAdj = analyticsInstallmentsDoneAdj(obligation.direction, isSharedViewer);
  const eventPaymentNoun = analyticsEventPaymentNoun(obligation.direction, isSharedViewer);
  const maxAnalysisMonthly = Math.max(...analysisMonthlySeries.map((month) => Math.abs(month.total)), 1);
  const analysisCurrentMonthTotal = analysisEvents
    .filter((item) => item.event.eventDate.slice(0, 7) === todayMonthKey)
    .reduce((sum, item) => sum + item.signedAmount, 0);
  const analysisTrailing90DaysTotal = analysisEvents
    .filter((item) => differenceInDays(todayLocal, ymdToLocalDate(item.event.eventDate)) <= 90)
    .reduce((sum, item) => sum + item.signedAmount, 0);
  const analysisTotalRecorded = analysisEvents.reduce((sum, item) => sum + item.signedAmount, 0);
  const analysisAveragePaymentAmount = analysisEvents.length > 0 ? analysisTotalRecorded / analysisEvents.length : 0;
  const analysisLastEvent = analysisEvents[0]?.event ?? null;
  const analysisFirstEvent = analysisEvents.length > 0 ? analysisEvents[analysisEvents.length - 1]?.event ?? null : null;
  const analysisLargestEvent = analysisEvents.reduce<{ event: ObligationEventSummary; signedAmount: number; displayAmount: number } | null>(
    (largest, item) => (!largest || Math.abs(item.signedAmount) > Math.abs(largest.signedAmount) ? item : largest),
    null,
  );
  const analysisAverageGapDays = (() => {
    if (analysisEvents.length < 2) return null;
    const gaps: number[] = [];
    for (let index = 0; index < analysisEvents.length - 1; index += 1) {
      const newer = ymdToLocalDate(analysisEvents[index].event.eventDate);
      const older = ymdToLocalDate(analysisEvents[index + 1].event.eventDate);
      gaps.push(Math.abs(differenceInCalendarDays(newer, older)));
    }
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  })();
  const analysisBestMonth = analysisMonthlySeries.reduce<{ key: string; label: string; total: number } | null>(
    (best, month) => {
      if (month.total === 0) return best;
      if (!best) return month;
      return Math.abs(month.total) > Math.abs(best.total) ? month : best;
    },
    null,
  );
  const analysisMonthsWithActivity = analysisMonthlySeries.filter((month) => month.total !== 0);
  const analysisAverageMonthlyTotal =
    analysisMonthsWithActivity.length > 0
      ? analysisMonthsWithActivity.reduce((sum, month) => sum + month.total, 0) / analysisMonthsWithActivity.length
      : 0;
  const analysisPositiveTotal = analysisEvents
    .filter((item) => item.signedAmount > 0)
    .reduce((sum, item) => sum + item.signedAmount, 0);
  const analysisNegativeTotal = analysisEvents
    .filter((item) => item.signedAmount < 0)
    .reduce((sum, item) => sum + Math.abs(item.signedAmount), 0);
  const analysisRelevantEventCount = allEventsSorted.filter((event) =>
    event.eventType === "payment" ||
    event.eventType === "principal_increase" ||
    event.eventType === "principal_decrease",
  ).length;
  const analysisUnlinkedEventCount =
    analyticsUsesCashPerspective
      ? Math.max(0, analysisRelevantEventCount - analysisEvents.length)
      : 0;
  const analysisEventLabel =
    analyticsUsesCashPerspective
      ? analysisEvents.length === 1
        ? "movimiento"
        : "movimientos"
      : analysisEvents.length === 1
        ? eventPaymentNoun.toLowerCase()
        : `${eventPaymentNoun.toLowerCase()}s`;
  const analysisChartTitle = analyticsUsesCashPerspective
    ? chartScope === "6"
      ? "Impacto neto en caja por mes (ultimos 6 meses)"
      : chartScope === "12"
        ? "Impacto neto en caja por mes (ultimos 12 meses)"
        : "Impacto neto en caja por mes (historico completo)"
    : chartTitle;
  const analysisSparkTitle = analyticsUsesCashPerspective
    ? "Velocidad de caja"
    : `Velocidad de ${eventPaymentNoun.toLowerCase()}s`;
  const analysisSparkLabel = analyticsUsesCashPerspective
    ? "promedio mensual neto con cuenta asociada"
    : "promedio mensual activo";
  const timelineSummary = (() => {
    let positive = 0;
    let negative = 0;
    let unlinked = 0;
    const summaryEvents = timelineEvents.filter((event) => {
      if (timelineFilter === "payments") return event.eventType === "payment";
      if (timelineFilter === "capital") return event.eventType !== "payment";
      return true;
    });
    for (const event of summaryEvents) {
      const useCashPerspective = shouldUseCashPerspective(event.id, analyticsPerspective);
      const tint = obligationHistoryEventColor(
        event.eventType,
        analyticsDirection,
        isSharedViewer,
        useCashPerspective,
      );
      if (tint === COLORS.income) positive += 1;
      if (tint === COLORS.expense) negative += 1;
      if (isSharedViewer && analyticsPerspective === "cash" && !useCashPerspective) unlinked += 1;
    }
    return { positive, negative, unlinked, total: summaryEvents.length };
  })();
  const filteredTimelineEvents = (() => {
    return timelineEvents.filter((event) => {
      if (timelineFilter === "payments" && event.eventType !== "payment") return false;
      if (timelineFilter === "capital" && event.eventType === "payment") return false;
      if (timelineToneFilter === "all") return true;
      const useCashPerspective = shouldUseCashPerspective(event.id, analyticsPerspective);
      const tint = obligationHistoryEventColor(
        event.eventType,
        analyticsDirection,
        isSharedViewer,
        useCashPerspective,
      );
      if (timelineToneFilter === "positive") return tint === COLORS.income;
      return tint === COLORS.expense;
    });
  })();
  const comparisonSummary = (() => {
    const scopedEvents = allEventsSorted.filter((event) => {
      if (event.eventType === "opening") return false;
      if (comparisonMode === "flow") return event.eventType === "payment";
      if (comparisonMode === "capital") {
        return event.eventType === "principal_increase" || event.eventType === "principal_decrease";
      }
      return (
        event.eventType === "payment" ||
        event.eventType === "principal_increase" ||
        event.eventType === "principal_decrease"
      );
    });
    const currentPeriod =
      comparisonWindow === "month"
        ? { from: startOfMonth(todayLocal), to: todayLocal, label: format(startOfMonth(todayLocal), "MMMM yyyy", { locale: es }) }
        : { from: subDays(todayLocal, 89), to: todayLocal, label: formatPeriodLabel(subDays(todayLocal, 89), todayLocal) };
    const previousPeriod =
      comparisonWindow === "month"
        ? {
            from: startOfMonth(subMonths(todayLocal, 1)),
            to: endOfMonth(subMonths(todayLocal, 1)),
            label: format(startOfMonth(subMonths(todayLocal, 1)), "MMMM yyyy", { locale: es }),
          }
        : {
            from: subDays(currentPeriod.from, 90),
            to: subDays(currentPeriod.from, 1),
            label: formatPeriodLabel(subDays(currentPeriod.from, 90), subDays(currentPeriod.from, 1)),
          };
    const isWithinPeriod = (eventDate: string, from: Date, to: Date) => {
      const date = ymdToLocalDate(eventDate);
      return date >= from && date <= to;
    };
    const netImpactForPeriod = (from: Date, to: Date) =>
      scopedEvents
        .filter((event) => isWithinPeriod(event.eventDate, from, to))
        .reduce((sum, event) => {
          const useCashPerspective = shouldUseCashPerspective(event.id, analyticsPerspective);
          const tint = obligationHistoryEventColor(
            event.eventType,
            analyticsDirection,
            isSharedViewer,
            useCashPerspective,
          );
          if (tint === COLORS.income) return sum + event.amount;
          if (tint === COLORS.expense) return sum - event.amount;
          return sum;
        }, 0);
    const currentCount = scopedEvents.filter((event) => isWithinPeriod(event.eventDate, currentPeriod.from, currentPeriod.to)).length;
    const previousCount = scopedEvents.filter((event) => isWithinPeriod(event.eventDate, previousPeriod.from, previousPeriod.to)).length;
    const currentNet = netImpactForPeriod(currentPeriod.from, currentPeriod.to);
    const previousNet = netImpactForPeriod(previousPeriod.from, previousPeriod.to);
    const deltaAmount = currentNet - previousNet;
    const deltaCount = currentCount - previousCount;
    const deltaPercent = previousNet !== 0 ? (deltaAmount / Math.abs(previousNet)) * 100 : null;
    const toneStyle =
      deltaAmount > 0
        ? styles.insightPositive
        : deltaAmount < 0
          ? styles.insightNegative
          : styles.insightWarning;
    const categoryHint =
      comparisonMode === "flow"
        ? `${eventPaymentNoun.toLowerCase()}s`
        : comparisonMode === "capital"
          ? "aumentos y reducciones de capital"
          : "flujo y capital combinados";
    const perspectiveHint =
      analyticsPerspective === "cash"
        ? "desde la caja"
        : "sobre la obligacion";
    const windowHint =
      comparisonWindow === "month"
        ? "el mes actual contra el mes anterior"
        : "los ultimos 90 dias contra los 90 dias previos";
    const summaryLead =
      deltaAmount > 0
        ? `${comparisonWindow === "month" ? "Este mes" : "En los ultimos 90 dias"} mejoraste el impacto ${comparisonMode === "capital" ? "del capital" : comparisonMode === "flow" ? "del flujo" : "total"}`
        : deltaAmount < 0
          ? `${comparisonWindow === "month" ? "Este mes" : "En los ultimos 90 dias"} el impacto ${comparisonMode === "capital" ? "del capital" : comparisonMode === "flow" ? "del flujo" : "total"} empeoro`
          : `${comparisonWindow === "month" ? "Este mes" : "En los ultimos 90 dias"} el impacto se mantuvo estable`;
    const summaryBody =
      previousNet !== 0
        ? `${formatSignedCurrencyValue(currentNet, currency)} frente a ${formatSignedCurrencyValue(previousNet, currency)} en el periodo anterior (${deltaPercent! >= 0 ? "+" : ""}${Math.round(deltaPercent!)}%).`
        : currentNet !== 0
          ? `${formatSignedCurrencyValue(currentNet, currency)} tras un periodo previo sin impacto neto.`
          : "No hubo impacto neto en ninguno de los dos periodos.";
    const summaryFootnote =
      deltaCount === 0
        ? "La cantidad de eventos se mantuvo igual."
        : `${deltaCount > 0 ? "Hubo mas" : "Hubo menos"} eventos: ${currentCount} vs ${previousCount}.`;
    return {
      currentNet,
      previousNet,
      currentCount,
      previousCount,
      currentPeriodLabel: currentPeriod.label,
      previousPeriodLabel: previousPeriod.label,
      toneStyle,
      scopeHint: `Compara ${categoryHint} ${perspectiveHint} entre ${windowHint}.`,
      detail:
        previousNet !== 0
          ? `${deltaPercent! >= 0 ? "+" : ""}${Math.round(deltaPercent!)}% frente a ${previousPeriod.label}`
          : currentNet !== 0
            ? `Aparece impacto en ${currentPeriod.label} tras un periodo previo sin cambios`
            : "Ninguno de los dos periodos registra impacto neto",
      countLabel:
        deltaCount === 0
          ? "Misma cantidad de eventos"
          : `${deltaCount > 0 ? "+" : ""}${deltaCount} evento${Math.abs(deltaCount) === 1 ? "" : "s"}`,
      headline:
        deltaAmount > 0
          ? "Impacto mas favorable que el periodo anterior"
          : deltaAmount < 0
            ? "Impacto menos favorable que el periodo anterior"
            : "Impacto estable frente al periodo anterior",
      summaryLead,
      summaryBody,
      summaryFootnote,
      showCashHint: isSharedViewer && analyticsPerspective === "cash",
      itemFamily:
        comparisonMode === "flow"
          ? `${eventPaymentNoun.toLowerCase()}${currentCount === 1 ? "" : "s"}`
          : comparisonMode === "capital"
            ? `cambio${currentCount === 1 ? "" : "s"} de capital`
            : `evento${currentCount === 1 ? "" : "s"} clave`,
      previousItemFamily:
        comparisonMode === "flow"
          ? `${eventPaymentNoun.toLowerCase()}${previousCount === 1 ? "" : "s"}`
          : comparisonMode === "capital"
            ? `cambio${previousCount === 1 ? "" : "s"} de capital`
            : `evento${previousCount === 1 ? "" : "s"} clave`,
    };
  })();

  function applyHistoryPreset(p: HistoryPreset) {
    setHistoryPreset(p);
    if (p === "all") {
      setHistoryFrom("");
      setHistoryTo("");
      return;
    }
    const today = ymdToLocalDate(todayPeru());
    if (p === "month") {
      setHistoryFrom(format(startOfMonth(today), "yyyy-MM-dd"));
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "3m") {
      setHistoryFrom(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"));
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "year") {
      setHistoryFrom(`${today.getFullYear()}-01-01`);
      setHistoryTo(format(endOfMonth(today), "yyyy-MM-dd"));
      return;
    }
    if (p === "custom") {
      const { from, to } = currentMonthRangeYmd();
      setHistoryFrom(from);
      setHistoryTo(to);
    }
  }

  const metrics = analyticsUsesCashPerspective
    ? [
        {
          key: "cashNet",
          label: "Caja neta",
          value: formatSignedCurrencyValue(analysisTotalRecorded, currency),
          icon: TrendingUp,
          color:
            analysisTotalRecorded > 0
              ? COLORS.income
              : analysisTotalRecorded < 0
                ? COLORS.danger
                : COLORS.warning,
        },
        {
          key: "cashIn",
          label: "Ingresos vinculados",
          value: formatCurrency(analysisPositiveTotal, currency),
          icon: CheckCircle2,
          color: COLORS.income,
        },
        {
          key: "cashOut",
          label: "Salidas vinculadas",
          value: formatCurrency(analysisNegativeTotal, currency),
          icon: XCircle,
          color: COLORS.danger,
        },
        {
          key: "cashCount",
          label: "Mov. vinculados",
          value: String(analysisEvents.length),
          icon: CreditCard,
          color: COLORS.primary,
        },
      ]
    : [
        {
          key: "principal",
          label: "Principal",
          value: formatCurrency(currentPrincipal, currency),
          icon: TrendingUp,
          color: COLORS.primary,
        },
        {
          key: "paid",
          label: paidMetricLabel,
          value: formatCurrency(Math.max(0, paidAmount), currency),
          icon: CheckCircle2,
          color: COLORS.income,
        },
        {
          key: "pending",
          label: "Pendiente",
          value: formatCurrency(obligation.pendingAmount, currency),
          icon: Clock,
          color: COLORS.warning,
        },
        {
          key: "paymentCount",
          label: paymentCountMetricLabel,
          value: String(obligation.paymentCount),
          icon: CreditCard,
          color: COLORS.storm,
        },
      ];
  const ownerAccountQuestion = obligation.direction === "receivable"
    ? "A que cuenta va a ingresar este dinero?"
    : "De que cuenta va a salir este dinero?";
  const ownerAccountLabel = obligation.direction === "receivable"
    ? "Cuenta de abono"
    : "Cuenta de debito";

  const approvalDelta = approvingRequest
    ? (obligation.direction === "receivable" ? approvingRequest.amount : -approvingRequest.amount)
    : 0;
  const approvalProjectedAccount = approvingRequest && approvalAccountId != null
    ? ownerAccounts.find((acc) => acc.id === approvalAccountId) ?? null
    : null;
  const approvalProjectedBalance = approvalProjectedAccount
    ? approvalProjectedAccount.currentBalance + approvalDelta
    : null;
  const viewerLinkDelta = linkingEvent
    ? (obligationViewerActsAsCollector(obligation.direction, true) ? linkingEvent.amount : -linkingEvent.amount)
    : 0;
  const viewerProjectedAccount = linkingEvent && linkingAccountId != null
    ? viewerAccounts.find((acc) => acc.id === linkingAccountId) ?? null
    : null;
  const viewerProjectedBalance = viewerProjectedAccount
    ? viewerProjectedAccount.currentBalance + viewerLinkDelta
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <SafeBlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>

      <View style={styles.sheet} pointerEvents="box-none">
        <Animated.View style={[styles.card, sheetStyle]}>
          <View {...panHandlers}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={1}>{obligation.title}</Text>
                <Text style={styles.subtitle}>{obligation.counterparty}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={18} color={COLORS.storm} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Progress */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressPct}>
                  {Math.round(displayProgressPercent)}%{" "}
                  {obligationProgressPaidAdjective(obligation.direction, isSharedViewer)}
                </Text>
                {obligation.dueDate ? (
                  <Text style={styles.dueDate}>
                    <Calendar size={11} color={COLORS.storm} /> Vence {format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                  </Text>
                ) : null}
              </View>
              {analyticsUsesCashPerspective ? (
                <Text style={styles.progressHint}>
                  Esta barra sigue leyendo el avance base de la obligacion. El modo caja solo cambia las metricas y graficos del analisis.
                </Text>
              ) : null}
              <ProgressBar
                percent={displayProgressPercent}
                alertPercent={isPaid ? 101 : 90}
                height={8}
              />
              <View style={styles.progressAmounts}>
                <Text style={styles.amountSmall}>{formatCurrency(Math.max(0, paidAmount), currency)}</Text>
                <Text style={styles.amountSmall}>{formatCurrency(currentPrincipal, currency)}</Text>
              </View>
            </View>

            {/* 4 Key metrics */}
            <View style={styles.metricsGrid}>
              {metrics.map((m) => (
                <View key={m.key} style={styles.metricCard}>
                  <m.icon size={16} color={m.color} strokeWidth={2} />
                  <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
            {analyticsUsesCashPerspective && analysisUnlinkedEventCount > 0 ? (
              <Text style={styles.metricsFootnote}>
                {analysisUnlinkedEventCount} evento{analysisUnlinkedEventCount === 1 ? "" : "s"} sin cuenta asociada siguen fuera de esta lectura de caja.
              </Text>
            ) : null}
            {isSharedViewer ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Perspectiva del analisis</Text>
                <View style={styles.pillRowWrap}>
                  {(
                    [
                      { id: "obligation" as TimelinePerspective, label: "Impacto en obligacion" },
                      { id: "cash" as TimelinePerspective, label: "Impacto en caja" },
                    ] as const
                  ).map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.filterPill, analyticsPerspective === option.id && styles.filterPillActive]}
                      onPress={() => setAnalyticsPerspective(option.id)}
                    >
                      <Text style={[styles.filterPillText, analyticsPerspective === option.id && styles.filterPillTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {analyticsUsesCashPerspective ? (
                  <Text style={styles.timelinePerspectiveHint}>
                    En caja, solo cuentan los eventos que ya tienen cuenta asociada. Los demas siguen leyendo el impacto sobre la obligacion.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ritmo reciente</Text>
              <View style={styles.insightGrid}>
                <View style={styles.insightCard}>
                  <Text style={styles.insightValue}>
                    {analysisEvents.length > 0
                      ? analyticsUsesCashPerspective
                        ? formatSignedCurrencyValue(analysisAveragePaymentAmount, currency)
                        : formatCurrency(analysisAveragePaymentAmount, currency)
                      : "Sin eventos"}
                  </Text>
                  <Text style={styles.insightLabel}>
                    {analyticsUsesCashPerspective ? "Promedio por movimiento" : `Promedio por ${eventPaymentNoun}`}
                  </Text>
                  <Text style={styles.insightSub}>
                    {analysisEvents.length > 0
                      ? `${analysisEvents.length} ${analysisEventLabel} registrados`
                      : "Aun no hay historial suficiente"}
                  </Text>
                </View>
                <View style={styles.insightCard}>
                  <Text style={styles.insightValue}>
                    {analysisLargestEvent
                      ? analyticsUsesCashPerspective
                        ? formatSignedCurrencyValue(analysisLargestEvent.signedAmount, currency)
                        : formatCurrency(analysisLargestEvent.displayAmount, currency)
                      : "Sin eventos"}
                  </Text>
                  <Text style={styles.insightLabel}>
                    {analyticsUsesCashPerspective ? "Mayor impacto en caja" : `Mayor ${eventPaymentNoun}`}
                  </Text>
                  <Text style={styles.insightSub}>
                    {analysisLargestEvent
                      ? format(parseDisplayDate(analysisLargestEvent.event.eventDate), "d MMM yyyy", { locale: es })
                      : "Todavia no hay un pico registrado"}
                  </Text>
                </View>
                <View style={styles.insightCard}>
                  <Text style={styles.insightValue}>
                    {analysisLastEvent
                      ? `${Math.max(0, differenceInDays(todayLocal, ymdToLocalDate(analysisLastEvent.eventDate)))} d`
                      : "Sin eventos"}
                  </Text>
                  <Text style={styles.insightLabel}>Tiempo desde el ultimo</Text>
                  <Text style={styles.insightSub}>
                    {analysisLastEvent
                      ? format(parseDisplayDate(analysisLastEvent.eventDate), "d MMM yyyy", { locale: es })
                      : "No hay movimientos recientes"}
                  </Text>
                </View>
                <View style={styles.insightCard}>
                  <Text style={styles.insightValue}>
                    {analysisAverageGapDays != null ? `${Math.round(analysisAverageGapDays)} d` : "Sin serie"}
                  </Text>
                  <Text style={styles.insightLabel}>Separacion promedio</Text>
                  <Text style={styles.insightSub}>
                    {analysisFirstEvent && analysisLastEvent && analysisEvents.length > 1
                      ? `Desde ${format(parseDisplayDate(analysisFirstEvent.eventDate), "d MMM", { locale: es })} hasta ${format(parseDisplayDate(analysisLastEvent.eventDate), "d MMM", { locale: es })}`
                      : "Necesita al menos dos eventos"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Monthly payments chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{analysisChartTitle}</Text>
              {needsChartScroll ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={styles.chartScroll}
                >
                  <View style={[styles.chart, styles.chartWide]}>
                    {analysisMonthlySeries.map((m) => (
                      <View key={m.key} style={[styles.chartBar, styles.chartBarFixed]}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              m.total > 0 ? styles.barFillPositive : m.total < 0 ? styles.barFillNegative : null,
                              { height: `${Math.round((Math.abs(m.total) / maxAnalysisMonthly) * 100)}%` as any },
                              m.total === 0 && styles.barEmpty,
                            ]}
                          />
                        </View>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {m.label}
                        </Text>
                        {m.total !== 0 ? (
                          <Text style={styles.barValue} numberOfLines={1}>
                            {(analyticsUsesCashPerspective
                              ? formatSignedCurrencyValue(m.total, currency)
                              : formatCurrency(m.total, currency)).replace(/\s/g, "")}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.chart}>
                  {analysisMonthlySeries.map((m) => (
                    <View key={m.key} style={styles.chartBar}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            m.total > 0 ? styles.barFillPositive : m.total < 0 ? styles.barFillNegative : null,
                            { height: `${Math.round((Math.abs(m.total) / maxAnalysisMonthly) * 100)}%` as any },
                            m.total === 0 && styles.barEmpty,
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {m.label}
                      </Text>
                      {m.total !== 0 ? (
                        <Text style={styles.barValue} numberOfLines={1}>
                          {(analyticsUsesCashPerspective
                            ? formatSignedCurrencyValue(m.total, currency)
                            : formatCurrency(m.total, currency)).replace(/\s/g, "")}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.pillRowWrap}>
                {(
                  [
                    { id: "6" as ChartScope, label: "6 meses" },
                    { id: "12" as ChartScope, label: "12 meses" },
                    { id: "all" as ChartScope, label: "Todo" },
                  ] as const
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterPill, chartScope === opt.id && styles.filterPillActive]}
                    onPress={() => setChartScope(opt.id)}
                  >
                    <Text style={[styles.filterPillText, chartScope === opt.id && styles.filterPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Installment grid */}
            {totalInstallments > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Cuotas: {paidInstallments} de {totalInstallments} {installmentsDoneAdj}
                </Text>
                {isSharedViewer ? (
                  <Text style={styles.sectionHint}>
                    Este bloque sigue mostrando el avance contractual de la obligacion. No cambia por la perspectiva de caja del analisis.
                  </Text>
                ) : null}
                <View style={styles.installmentGrid}>
                  {Array.from({ length: totalInstallments }, (_, i) => {
                    const n = i + 1;
                    const paid = n <= paidInstallments;
                    return (
                      <View
                        key={n}
                        style={[styles.installmentCell, paid ? styles.installmentPaid : styles.installmentPending]}
                      >
                        <Text style={[styles.installmentNum, { color: paid ? COLORS.pine : COLORS.storm }]}>
                          {n}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Timeline ESTILO 2 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Línea de tiempo</Text>

              {/* Filter pills */}
              <View style={styles.pillRowWrap}>
                {(
                  [
                    { id: "all" as TimelineFilter, label: "Todos" },
                    { id: "payments" as TimelineFilter, label: `${eventPaymentNoun}s` },
                    { id: "capital" as TimelineFilter, label: "Capital" },
                  ] as const
                ).map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.filterPill, timelineFilter === option.id && styles.filterPillActive]}
                    onPress={() => setTimelineFilter(option.id)}
                  >
                    <Text style={[styles.filterPillText, timelineFilter === option.id && styles.filterPillTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.pillRowWrap}>
                {(
                  [
                    { id: "all" as TimelineToneFilter, label: "Todo impacto" },
                    { id: "positive" as TimelineToneFilter, label: "Solo positivos" },
                    { id: "negative" as TimelineToneFilter, label: "Solo negativos" },
                  ] as const
                ).map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.filterPill, timelineToneFilter === option.id && styles.filterPillActive]}
                    onPress={() => setTimelineToneFilter(option.id)}
                  >
                    <Text style={[styles.filterPillText, timelineToneFilter === option.id && styles.filterPillTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {timelineEvents.length === 0 ? (
                <Text style={styles.emptyHistory}>Aun no hay eventos para construir la linea de tiempo.</Text>
              ) : filteredTimelineEvents.length === 0 ? (
                <Text style={styles.emptyHistory}>No hay eventos que coincidan con esos filtros.</Text>
              ) : (
                <View style={styles.tl2Container}>
                  {groupAnalyticsEventsByDate(filteredTimelineEvents).map(({ date, events: dayEvents }) => {
                    const dayTotal = dayEvents.reduce((sum, e) => {
                      const useCash = shouldUseCashPerspective(e.id, analyticsPerspective);
                      const prefix = obligationHistoryEventAmountPrefix(e.eventType, analyticsDirection, isSharedViewer, useCash);
                      return sum + (prefix === "+" ? e.amount : -e.amount);
                    }, 0);
                    const dayTotalColor = dayTotal >= 0 ? COLORS.income : COLORS.danger;
                    return (
                      <View key={date}>
                        {/* Date node row */}
                        <View style={styles.tl2DateRow}>
                          <View style={styles.tl2NodeCol}>
                            <View style={styles.tl2DateDot} />
                          </View>
                          <Text style={styles.tl2DateLabel}>
                            {format(new Date(date + "T12:00:00"), "d MMM yyyy", { locale: es }).toUpperCase()}
                          </Text>
                          <View style={styles.tl2DateLine} />
                          <Text style={[styles.tl2DayTotal, { color: dayTotalColor }]}>
                            {dayTotal >= 0 ? "+" : ""}{formatCurrency(Math.abs(dayTotal), currency)}
                          </Text>
                        </View>

                        {/* Events */}
                        {dayEvents.map((event, i) => {
                          const useCashPerspective = shouldUseCashPerspective(event.id, analyticsPerspective);
                          const eventTint = obligationHistoryEventColor(
                            event.eventType,
                            analyticsDirection,
                            isSharedViewer,
                            useCashPerspective,
                          );
                          const amountPrefix = obligationHistoryEventAmountPrefix(
                            event.eventType,
                            analyticsDirection,
                            isSharedViewer,
                            useCashPerspective,
                          );
                          const eventLabel =
                            event.eventType === "payment"
                              ? eventPaymentNoun
                              : EVENT_LABELS[event.eventType]?.label ?? event.eventType;
                          const eventDetail = firstMeaningfulText(event.description, event.reason, event.notes);
                          const impactLabel =
                            eventTint === COLORS.income
                              ? "Positivo"
                              : eventTint === COLORS.expense
                                ? "Negativo"
                                : "Neutro";
                          const isLastInDay = i === dayEvents.length - 1;

                          return (
                            <View key={event.id} style={styles.tl2EventRow}>
                              {/* Line column */}
                              <View style={styles.tl2LineCol}>
                                <View style={styles.tl2LineSegment} />
                                <View style={[styles.tl2Dot, {
                                  backgroundColor: eventTint,
                                  shadowColor: eventTint,
                                  shadowOpacity: 0.5,
                                  shadowRadius: 3,
                                  elevation: 3,
                                }]} />
                                {isLastInDay
                                  ? <View style={styles.tl2LineEnd} />
                                  : <View style={styles.tl2LineSegment} />
                                }
                              </View>

                              {/* Card */}
                              <TouchableOpacity
                                style={styles.tl2Card}
                                onPress={() => {
                                  if (onEventTap) { onEventTap(event); return; }
                                  if (isSharedViewer) handleViewerEventTap(event);
                                }}
                                activeOpacity={onEventTap || isSharedViewer ? 0.8 : 1}
                              >
                                <View style={styles.tl2CardBody}>
                                  <Text style={[styles.tl2TypeLabel, { color: eventTint }]} numberOfLines={1}>
                                    {eventLabel}
                                  </Text>
                                  <View style={styles.tl2CardSubRow}>
                                    <View style={[styles.tl2Badge, { backgroundColor: eventTint + "18" }]}>
                                      <Text style={[styles.tl2BadgeText, { color: eventTint }]}>{impactLabel}</Text>
                                    </View>
                                    {eventDetail ? (
                                      <Text style={styles.tl2CardDesc} numberOfLines={1}>
                                        {eventDetail}
                                      </Text>
                                    ) : null}
                                  </View>
                                </View>
                                <Text style={[styles.tl2Amount, { color: eventTint }]} numberOfLines={1}>
                                  {amountPrefix}{formatCurrency(event.amount, currency)}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

          </ScrollView>
        </Animated.View>
      </View>

      <Modal
        visible={Boolean(selectedViewerEvent)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedViewerEvent(null)}
      >
        <Pressable
          style={styles.approvalOverlay}
          onPress={() => setSelectedViewerEvent(null)}
        >
          <View
            style={styles.approvalSheet}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.approvalTitle}>Acciones del evento</Text>
            {selectedViewerEvent ? (
              <>
                <Text style={styles.approvalSub}>
                  {formatCurrency(selectedViewerEvent.amount, currency)}{" - "}
                  {format(parseDisplayDate(selectedViewerEvent.eventDate), "d MMM yyyy", { locale: es })}
                </Text>
                {selectedViewerEventAttachmentsLoading ? (
                  <Text style={styles.viewerActionNote}>Buscando comprobantes...</Text>
                ) : selectedViewerEventAttachments.length > 0 ? (
                  <TouchableOpacity
                    style={styles.approvalAcceptBtn}
                    onPress={() => setViewerAttachmentPreviewVisible(true)}
                  >
                    <Text style={styles.approvalAcceptText}>
                      {selectedViewerEventAttachments.length === 1
                        ? "Ver comprobante"
                        : `Ver ${selectedViewerEventAttachments.length} comprobantes`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {selectedViewerEvent.eventType === "payment" &&
                !(
                  !linkedEventIds.has(selectedViewerEvent.id) &&
                  acceptedViewerRequestByEventId.get(selectedViewerEvent.id)?.viewerAccountId
                ) ? (
                  <TouchableOpacity
                    style={styles.approvalAcceptBtn}
                    onPress={() => openViewerLinkSheet(selectedViewerEvent)}
                  >
                    <Text style={styles.approvalAcceptText}>
                      {linkedEventIds.has(selectedViewerEvent.id)
                        ? "Cambiar cuenta asociada"
                        : "Asociar a una cuenta"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {selectedViewerEvent.eventType === "payment" &&
                !linkedEventIds.has(selectedViewerEvent.id) &&
                Boolean(
                  acceptedViewerRequestByEventId.get(selectedViewerEvent.id)?.viewerAccountId &&
                  acceptedViewerRequestByEventId.get(selectedViewerEvent.id)?.viewerWorkspaceId,
                ) ? (
                  <View style={styles.viewerStatusChipAccepted}>
                    <Text style={styles.viewerStatusChipAcceptedText}>
                      Registrando movimiento en la cuenta elegida
                    </Text>
                  </View>
                ) : null}
                {viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.status === "pending" ? (
                  <View style={styles.viewerStatusChipPending}>
                    <Text style={styles.viewerStatusChipPendingText}>Eliminacion pendiente</Text>
                  </View>
                ) : viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.status === "accepted" ? (
                  <View style={styles.viewerStatusChipAccepted}>
                    <Text style={styles.viewerStatusChipAcceptedText}>Eliminacion aprobada</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.viewerDangerBtn}
                    onPress={() => {
                      setViewerDeleteRequestEvent(selectedViewerEvent);
                      setSelectedViewerEvent(null);
                    }}
                    disabled={createDeleteRequestMutation.isPending}
                  >
                    <Text style={styles.viewerDangerBtnText}>
                      {viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.status === "rejected"
                        ? "Solicitar eliminacion otra vez"
                        : "Solicitar eliminacion"}
                    </Text>
                  </TouchableOpacity>
                )}
                {viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.status === "rejected" ? (
                  <Text style={styles.viewerActionNote}>
                    {viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.payload.rejectionReason?.trim()
                      ? `Rechazada: ${viewerDeleteStatusByEventId.get(selectedViewerEvent.id)?.payload.rejectionReason?.trim()}`
                      : "La solicitud anterior fue rechazada"}
                  </Text>
                ) : null}
              </>
            ) : null}
            <TouchableOpacity onPress={() => setSelectedViewerEvent(null)}>
              <Text style={styles.approvalCancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <AttachmentPreviewModal
        visible={viewerAttachmentPreviewVisible}
        attachments={selectedViewerEventAttachments}
        onClose={() => setViewerAttachmentPreviewVisible(false)}
        title="Comprobantes del evento"
      />

      <Modal
        visible={Boolean(linkingEvent)}
        transparent
        animationType="fade"
        onRequestClose={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
      >
        <Pressable
          style={styles.approvalOverlay}
          onPress={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
        >
          <View
            style={styles.approvalSheet}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.approvalTitle}>
              {linkingEvent && viewerLinkByEventId.get(linkingEvent.id)
                ? "Cambiar cuenta asociada"
                : "Asociar a una cuenta"}
            </Text>
            {linkingEvent ? (
              <>
                <Text style={styles.approvalSub}>
                  {formatCurrency(linkingEvent.amount, currency)}{" - "}
                  {format(parseDisplayDate(linkingEvent.eventDate), "d MMM yyyy", { locale: es })}
                </Text>
                <Text style={styles.sectionHint}>
                  {viewerLinkByEventId.get(linkingEvent.id)
                    ? "Elige la nueva cuenta en la que se reflejara este movimiento"
                    : "Elige la cuenta en la que se refleja este movimiento"}
                </Text>
                {viewerAccounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.approvalAccountRow,
                      linkingAccountId === acc.id && styles.approvalAccountRowSelected,
                    ]}
                    onPress={() => setLinkingAccountId(acc.id)}
                  >
                    <View style={styles.approvalAccountInfo}>
                      <Text style={styles.approvalAccountName}>{acc.name}</Text>
                      <Text style={styles.approvalAccountBalance}>
                        {formatCurrency(acc.currentBalance, acc.currencyCode)}
                      </Text>
                    </View>
                    {linkingAccountId === acc.id ? (
                      <Text style={styles.approvalAccountCheck}>OK</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {viewerProjectedAccount && viewerProjectedBalance != null ? (
                  <View style={styles.approvalProjectionCard}>
                    <Text style={styles.approvalProjectionTitle}>Proyectado para {viewerProjectedAccount.name}</Text>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Saldo actual</Text>
                      <Text style={styles.approvalProjectionValue}>
                        {formatCurrency(viewerProjectedAccount.currentBalance, viewerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Movimiento</Text>
                      <Text
                        style={[
                          styles.approvalProjectionValue,
                          viewerLinkDelta >= 0 ? styles.approvalProjectionPositive : styles.approvalProjectionNegative,
                        ]}
                      >
                        {viewerLinkDelta >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(viewerLinkDelta), viewerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Quedara en</Text>
                      <Text style={styles.approvalProjectionStrong}>
                        {formatCurrency(viewerProjectedBalance, viewerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {viewerAccounts.length === 0 ? (
                  <Text style={styles.viewerActionNote}>No tienes cuentas registradas en este workspace</Text>
                ) : null}
              </>
            ) : null}
            <View style={styles.approvalActions}>
              <TouchableOpacity
                style={[
                  styles.approvalAcceptBtn,
                  (!linkingAccountId || linkEventMutation.isPending) && styles.viewerDisabledBtn,
                ]}
                onPress={() => { void handleLinkEvent(); }}
                disabled={!linkingAccountId || linkEventMutation.isPending}
              >
                {linkEventMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.income} />
                ) : (
                  <Text style={styles.approvalAcceptText}>Confirmar asociacion</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
              >
                <Text style={styles.approvalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={Boolean(viewerDeleteRequestEvent)}
        title="Solicitar eliminacion?"
        body="El propietario recibira una notificacion para aprobar o rechazar la eliminacion de este evento."
        confirmLabel="Enviar solicitud"
        cancelLabel="Cancelar"
        onCancel={() => setViewerDeleteRequestEvent(null)}
        onConfirm={() => { void handleCreateDeleteRequest(); }}
        destructive={false}
      >
        {viewerDeleteRequestEvent ? (
          <ObligationEventDeleteImpact
            event={viewerDeleteRequestEvent}
            obligation={obligation}
            accounts={viewerAccounts}
            actor="viewer"
            viewerLinkedAccountId={viewerLinkByEventId.get(viewerDeleteRequestEvent.id)?.accountId ?? null}
          />
        ) : null}
      </ConfirmDialog>
      <Modal
        visible={Boolean(approvingRequest)}
        transparent
        animationType="fade"
        onRequestClose={() => { setApprovingRequest(null); setApprovalAccountId(null); }}
      >
        <Pressable
          style={styles.approvalOverlay}
          onPress={() => { setApprovingRequest(null); setApprovalAccountId(null); }}
        >
          <View
            style={styles.approvalSheet}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.approvalTitle}>Aceptar solicitud</Text>
            {approvingRequest ? (
              <>
                <Text style={styles.approvalSub}>
                  {formatCurrency(approvingRequest.amount, currency)}{" - "}
                  {format(parseDisplayDate(approvingRequest.paymentDate), "d MMM yyyy", { locale: es })}
                </Text>
                {approvingRequest.description ? (
                  <Text style={styles.eventDesc}>{approvingRequest.description}</Text>
                ) : null}
                <Text style={styles.sectionHint}>{ownerAccountQuestion}</Text>
                <Text style={styles.approvalLabel}>{ownerAccountLabel}</Text>
                {ownerAccounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.approvalAccountRow,
                      approvalAccountId === acc.id && styles.approvalAccountRowSelected,
                    ]}
                    onPress={() => setApprovalAccountId(acc.id)}
                  >
                    <View style={styles.approvalAccountInfo}>
                      <Text style={styles.approvalAccountName}>{acc.name}</Text>
                      <Text style={styles.approvalAccountBalance}>
                        {formatCurrency(acc.currentBalance, acc.currencyCode)}
                      </Text>
                    </View>
                    {approvalAccountId === acc.id ? (
                      <Text style={styles.approvalAccountCheck}>OK</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {approvalProjectedAccount && approvalProjectedBalance != null ? (
                  <View style={styles.approvalProjectionCard}>
                    <Text style={styles.approvalProjectionTitle}>Proyectado para {approvalProjectedAccount.name}</Text>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Saldo actual</Text>
                      <Text style={styles.approvalProjectionValue}>
                        {formatCurrency(approvalProjectedAccount.currentBalance, approvalProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Movimiento</Text>
                      <Text
                        style={[
                          styles.approvalProjectionValue,
                          approvalDelta >= 0 ? styles.approvalProjectionPositive : styles.approvalProjectionNegative,
                        ]}
                      >
                        {approvalDelta >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(approvalDelta), approvalProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.approvalProjectionRow}>
                      <Text style={styles.approvalProjectionLabel}>Quedara en</Text>
                      <Text style={styles.approvalProjectionStrong}>
                        {formatCurrency(approvalProjectedBalance, approvalProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.approvalAccountRow,
                    approvalAccountId == null && styles.approvalAccountRowSelected,
                  ]}
                  onPress={() => setApprovalAccountId(null)}
                >
                  <View style={styles.approvalAccountInfo}>
                    <Text style={styles.approvalAccountName}>No registrar movimiento contable</Text>
                    <Text style={styles.approvalAccountBalance}>Solo aceptar la solicitud sin cambiar tus cuentas</Text>
                  </View>
                  {approvalAccountId == null ? (
                    <Text style={styles.approvalAccountCheck}>OK</Text>
                  ) : null}
                </TouchableOpacity>
              </>
            ) : null}
            <View style={styles.approvalActions}>
              <TouchableOpacity
                style={styles.approvalAcceptBtn}
                onPress={confirmInlineAccept}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.income} />
                ) : (
                  <Text style={styles.approvalAcceptText}>Aceptar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setApprovingRequest(null); setApprovalAccountId(null); }}
              >
                <Text style={styles.approvalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  approvalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  approvalSheet: {
    backgroundColor: "rgba(8,12,18,0.98)",
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  approvalTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    textAlign: "center",
  },
  approvalSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
  approvalLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  approvalAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  approvalAccountRowSelected: {
    borderColor: COLORS.primary + "88",
    backgroundColor: COLORS.primary + "18",
  },
  approvalAccountInfo: {
    flex: 1,
    gap: 2,
  },
  approvalAccountName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  approvalAccountBalance: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  approvalProjectionCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    backgroundColor: COLORS.primary + "12",
    padding: SPACING.sm,
    gap: 6,
  },
  approvalProjectionTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  approvalProjectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  approvalProjectionLabel: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  approvalProjectionValue: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  approvalProjectionStrong: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  approvalProjectionPositive: {
    color: COLORS.income,
  },
  approvalProjectionNegative: {
    color: COLORS.danger,
  },
  approvalAccountCheck: {
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  approvalActions: {
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  approvalAcceptBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.income + "18",
    borderWidth: 1,
    borderColor: COLORS.income + "44",
  },
  approvalAcceptText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.income,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  approvalCancelText: {
    textAlign: "center",
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  viewerDangerBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  viewerDangerBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  viewerStatusChipPending: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warning + "18",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  viewerStatusChipPendingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  viewerStatusChipAccepted: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.income + "18",
    borderWidth: 1,
    borderColor: COLORS.income + "44",
  },
  viewerStatusChipAcceptedText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.income,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  viewerActionNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    fontFamily: FONT_FAMILY.body,
  },
  viewerDisabledBtn: {
    opacity: 0.45,
  },
  card: {
    maxHeight: "92%",
    backgroundColor: "rgba(8,12,18,0.96)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.07)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACING.xs,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADIUS.sm,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Progress Ã¢â€â‚¬Ã¢â€â‚¬
  progressSection: { gap: SPACING.xs },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  progressPct: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  dueDate: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  progressHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  progressAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  amountSmall: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Metrics Ã¢â€â‚¬Ã¢â€â‚¬
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  insightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    borderLeftColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.06)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    padding: SPACING.md,
    gap: 4,
    alignItems: "flex-start",
  },
  metricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
  },
  metricLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  metricsFootnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
    marginTop: -SPACING.xs,
  },
  insightCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: SPACING.md,
    gap: 4,
  },
  insightValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  insightLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  insightSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  insightPositive: {
    color: COLORS.income,
  },
  insightWarning: {
    color: COLORS.warning,
  },
  insightNegative: {
    color: COLORS.danger,
  },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Section Ã¢â€â‚¬Ã¢â€â‚¬
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  comparisonNarrativeCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 6,
  },
  comparisonNarrativeEyebrow: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  comparisonNarrativeLead: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  comparisonNarrativeBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 20,
  },
  comparisonNarrativeFootnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  sectionHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  dateRangeCaption: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    lineHeight: 18,
  },
  historyPresetRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  pillRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  customRange: { gap: SPACING.sm, marginTop: SPACING.xs },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Chart Ã¢â€â‚¬Ã¢â€â‚¬
  chartScroll: {
    flexGrow: 1,
    paddingVertical: SPACING.xs,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.xs,
    height: 88,
    minWidth: "100%",
  },
  chartWide: {
    minWidth: undefined,
    paddingRight: SPACING.md,
  },
  chartBar: {
    flex: 1,
    minWidth: 28,
    alignItems: "center",
    gap: 3,
  },
  chartBarFixed: {
    flex: 0,
    width: 40,
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    minHeight: 3,
  },
  barFillPositive: {
    backgroundColor: COLORS.income,
  },
  barFillNegative: {
    backgroundColor: COLORS.danger,
  },
  barEmpty: { backgroundColor: "transparent", minHeight: 0 },
  barLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  barValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 9,
    color: COLORS.primary,
  },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Installment grid Ã¢â€â‚¬Ã¢â€â‚¬
  installmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  installmentCell: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  installmentPaid: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  installmentPending: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  installmentNum: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 11,
  },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Event history Ã¢â€â‚¬Ã¢â€â‚¬
  historyPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    gap: SPACING.sm,
  },
  historyPagerBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  historyPagerBtnDisabled: {
    opacity: 0.35,
  },
  historyPagerText: {
    flex: 1,
    textAlign: "center",
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  emptyHistory: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  eventRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  eventDot: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  eventDotInner: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  eventInfo: { flex: 1, gap: 2 },
  eventTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  eventLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  installmentBadge: {
    backgroundColor: COLORS.primary + "22",
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  installmentBadgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    color: COLORS.primary,
  },
  eventAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    marginLeft: "auto" as any,
  },
  eventDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  eventReason: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontStyle: "italic",
  },
  eventDate: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 1,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  pendingCountBadge: {
    backgroundColor: COLORS.warning + "22",
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  pendingCountBadgeText: {
    fontSize: 10,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  filterPillPending: {
    borderColor: COLORS.warning + "66",
  },
  requestRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderLeftWidth: 2,
    paddingLeft: SPACING.xs,
    marginLeft: -SPACING.xs,
  },
  requestActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  acceptInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.income + "18",
    borderWidth: 1,
    borderColor: COLORS.income + "44",
  },
  rejectInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  requestActionText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  rejectInline: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  rejectInlineInput: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    padding: SPACING.xs + 2,
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  rejectInlineActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
  },
  rejectInlineConfirm: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger + "22",
    borderWidth: 1,
    borderColor: COLORS.danger + "55",
  },
  rejectInlineConfirmText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  rejectInlineCancelText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },

  // Spark card
  sparkCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  sparkHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sparkAvg: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  sparkAvgLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 2,
  },
  sparkMonths: {
    flexDirection: "row",
    gap: 2,
  },
  sparkMonthItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  sparkMonthLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  sparkMonthVal: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    color: COLORS.primary,
  },
  sparkMonthZero: {
    color: COLORS.storm,
  },
  timelinePerspectiveHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
    marginTop: -SPACING.xs,
  },
  timelineSummaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  timelineSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  timelineSummaryPositivePill: {
    borderColor: COLORS.income + "44",
    backgroundColor: COLORS.income + "14",
  },
  timelineSummaryNegativePill: {
    borderColor: COLORS.expense + "44",
    backgroundColor: COLORS.expense + "14",
  },
  timelineSummaryNeutralPill: {
    borderColor: "rgba(255,255,255,0.12)",
  },
  timelineSummaryValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  timelineSummaryPositiveValue: {
    color: COLORS.income,
  },
  timelineSummaryNegativeValue: {
    color: COLORS.expense,
  },
  timelineSummaryLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  timelineCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  timelineRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
  },
  timelineRowBorder: {
    marginBottom: SPACING.xs,
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
    position: "relative",
    minHeight: 88,
  },
  timelineLine: {
    position: "absolute",
    top: 18,
    bottom: -SPACING.md,
    width: 2,
    borderRadius: RADIUS.full,
  },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timelineDotInner: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
  },
  timelineSurface: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timelineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  timelineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  timelineDatePill: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timelineImpactPill: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  timelineImpactText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
  },
  timelineType: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  timelineAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    flexShrink: 0,
  },
  timelineDate: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    color: COLORS.storm,
  },
  timelineDescription: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    lineHeight: 18,
  },

  // ── ESTILO 2 Timeline ──────────────────────────────────────────────────────
  tl2Container: {
    paddingHorizontal: 4,
    marginTop: SPACING.xs,
  },
  tl2DateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 6,
    gap: 0,
  },
  tl2NodeCol: {
    width: 28,
    alignItems: "center",
  },
  tl2DateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.storm,
    borderWidth: 2,
    borderColor: "rgba(18,20,26,1)",
  },
  tl2DateLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  tl2DateLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginLeft: 10,
  },
  tl2DayTotal: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bodySemibold,
    marginLeft: 8,
  },
  tl2EventRow: {
    flexDirection: "row",
  },
  tl2LineCol: {
    width: 28,
    alignItems: "center",
  },
  tl2LineSegment: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    minHeight: 8,
  },
  tl2LineEnd: {
    flex: 1,
    minHeight: 6,
  },
  tl2Dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  tl2Card: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tl2CardBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  tl2TypeLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    lineHeight: 15,
  },
  tl2CardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 1,
  },
  tl2Badge: {
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tl2BadgeText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  tl2CardDesc: {
    fontSize: 10,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    flex: 1,
  },
  tl2Amount: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bodySemibold,
    flexShrink: 0,
  },
});
