import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useWorkspace } from "../../lib/workspace-context";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { OBLIGATION_EVENT_HISTORY_PAGE_SIZE } from "../../constants/config";
import type {
  NotificationItem,
  ObligationSummary,
  ObligationEventSummary,
  ObligationPaymentRequest,
  SharedObligationSummary,
} from "../../types/domain";
import {
  useNotificationsQuery,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import {
  useObligationEventsQuery,
  useObligationPaymentRequestsQuery,
  useViewerPaymentRequestsQuery,
  useAcceptPaymentRequestMutation,
  useRejectPaymentRequestMutation,
  useCreateObligationEventDeleteRequestMutation,
  useDeleteObligationEventMutation,
  useObligationEventViewerLinksQuery,
  useRejectObligationEventDeleteRequestMutation,
  useUpsertLinkEventToAccountMutation,
} from "../../services/queries/obligations";
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
import {
  readEventDeletePayload,
  type EventDeleteStatus,
} from "../../lib/obligation-event-payloads";
import { firstMeaningfulText } from "../../lib/text-utils";
import { currentMonthRangeYmd, ymdToLocalDate } from "../../lib/obligation-date-range";
import {
  ANALYTICS_EVENT_LABELS,
  formatPeriodLabel,
  formatSignedCurrencyValue,
  groupAnalyticsEventsByDate,
  type DeleteRequestHistoryEntry,
  type HistoryItem,
} from "../../lib/obligation-analytics-helpers";
import { buildMonthlySeries } from "../../lib/obligation-monthly-series";
import { computeAnalyticsAmounts } from "../../lib/obligation-analytics-amounts";
import {
  buildCombinedHistoryList,
  buildHistoryItemsByRequestStatus,
} from "../../lib/obligation-history-items";
import { useObligationAnalyticsHistory } from "../../hooks/useObligationAnalyticsHistory";
import { styles } from "./ObligationAnalyticsModal.styles";
import { AnalyticsChartBars } from "./analytics/AnalyticsChartBars";
import { AnalyticsInstallmentGrid } from "./analytics/AnalyticsInstallmentGrid";
import { AnalyticsInsightCards } from "./analytics/AnalyticsInsightCards";
import { AnalyticsTimeline } from "./analytics/AnalyticsTimeline";
import { AnalyticsViewerEventActionSheet } from "./analytics/AnalyticsViewerEventActionSheet";
import { AnalyticsViewerLinkAccountSheet } from "./analytics/AnalyticsViewerLinkAccountSheet";
import { AnalyticsApprovalSheet } from "./analytics/AnalyticsApprovalSheet";

type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";
type ChartScope = "6" | "12" | "all";
type TimelineFilter = "all" | "payments" | "capital";
type TimelineToneFilter = "all" | "positive" | "negative";
type TimelinePerspective = "obligation" | "cash";
type ComparisonMode = "flow" | "capital" | "all";
type ComparisonWindow = "month" | "90d";

type Props = {
  visible: boolean;
  obligation: ObligationSummary | SharedObligationSummary | null;
  onClose: () => void;
  onEventTap?: (ev: ObligationEventSummary) => void;
  userId?: string | null;
};

type EventTypeFilter = "all" | "approved" | "pending" | "rejected";

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

  // Todos los hooks deben ejecutarse siempre (nunca después de `return null`).
  const {
    paymentEvents,
    allEventsSorted,
    timelineEvents,
    filteredHistoryEvents,
    historyDateRangeNotice,
  } = useObligationAnalyticsHistory({
    eventsForModal,
    historyPreset,
    historyFrom,
    historyTo,
  });

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

  const monthlyPayments = useMemo(
    () =>
      buildMonthlySeries({
        items: paymentEvents,
        scope: chartScope,
        getMonthKey: (e) => e.eventDate.slice(0, 7),
        getAmount: (e) => e.amount,
      }),
    [paymentEvents, chartScope],
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
  const analysisMonthlySeries = useMemo(
    () =>
      buildMonthlySeries({
        items: analysisEvents,
        scope: chartScope,
        getMonthKey: (item) => item.event.eventDate.slice(0, 7),
        getAmount: (item) => item.signedAmount,
      }),
    [analysisEvents, chartScope],
  );
  // Combined list: events (approved) + pending/rejected requests
  const combinedList = useMemo(
    () =>
      buildCombinedHistoryList({
        events: filteredHistoryEvents,
        requests: allRequests,
        deleteRequests,
      }),
    [filteredHistoryEvents, allRequests, deleteRequests],
  );

  const displayList = useMemo((): HistoryItem[] => {
    switch (eventTypeFilter) {
      case "approved":
        return combinedList.filter((i) => i.kind === "event");
      case "pending":
        return buildHistoryItemsByRequestStatus({
          requests: allRequests,
          deleteRequests,
          status: "pending",
        });
      case "rejected":
        return buildHistoryItemsByRequestStatus({
          requests: allRequests,
          deleteRequests,
          status: "rejected",
        });
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

  const analyticsAmounts = useMemo(
    () => computeAnalyticsAmounts(obligation, paymentEvents),
    [obligation, paymentEvents],
  );

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

            <AnalyticsInsightCards
              analysisEvents={analysisEvents}
              analyticsUsesCashPerspective={analyticsUsesCashPerspective}
              analysisAveragePaymentAmount={analysisAveragePaymentAmount}
              analysisLargestEvent={analysisLargestEvent}
              analysisLastEvent={analysisLastEvent}
              analysisFirstEvent={analysisFirstEvent}
              analysisAverageGapDays={analysisAverageGapDays}
              analysisEventLabel={analysisEventLabel}
              eventPaymentNoun={eventPaymentNoun}
              todayLocal={todayLocal}
              currency={currency}
            />

            <AnalyticsChartBars
              title={analysisChartTitle}
              series={analysisMonthlySeries}
              maxAbsValue={maxAnalysisMonthly}
              currency={currency}
              signedDisplay={analyticsUsesCashPerspective}
              needsScroll={needsChartScroll}
              chartScope={chartScope}
              onChangeChartScope={setChartScope}
            />

            <AnalyticsInstallmentGrid
              paidInstallments={paidInstallments}
              totalInstallments={totalInstallments}
              installmentsDoneAdj={installmentsDoneAdj}
              isSharedViewer={isSharedViewer}
            />

            <AnalyticsTimeline
              timelineEvents={timelineEvents}
              filteredTimelineEvents={filteredTimelineEvents}
              timelineFilter={timelineFilter}
              timelineToneFilter={timelineToneFilter}
              onChangeTimelineFilter={setTimelineFilter}
              onChangeTimelineToneFilter={setTimelineToneFilter}
              analyticsDirection={analyticsDirection}
              isSharedViewer={isSharedViewer}
              currency={currency}
              eventPaymentNoun={eventPaymentNoun}
              shouldUseCashPerspective={(eventId) => shouldUseCashPerspective(eventId, analyticsPerspective)}
              onEventTap={onEventTap}
              onViewerEventTap={handleViewerEventTap}
            />

          </ScrollView>
        </Animated.View>
      </View>

      <AnalyticsViewerEventActionSheet
        selectedViewerEvent={selectedViewerEvent}
        currency={currency}
        attachmentsLoading={selectedViewerEventAttachmentsLoading}
        attachmentsCount={selectedViewerEventAttachments.length}
        linkedEventIds={linkedEventIds}
        acceptedViewerRequestByEventId={acceptedViewerRequestByEventId}
        viewerDeleteStatusByEventId={viewerDeleteStatusByEventId}
        createDeleteRequestIsPending={createDeleteRequestMutation.isPending}
        onPressViewAttachments={() => setViewerAttachmentPreviewVisible(true)}
        onPressLinkAccount={openViewerLinkSheet}
        onPressRequestDelete={(event) => {
          setViewerDeleteRequestEvent(event);
          setSelectedViewerEvent(null);
        }}
        onClose={() => setSelectedViewerEvent(null)}
      />

      <AttachmentPreviewModal
        visible={viewerAttachmentPreviewVisible}
        attachments={selectedViewerEventAttachments}
        onClose={() => setViewerAttachmentPreviewVisible(false)}
        title="Comprobantes del evento"
      />

      <AnalyticsViewerLinkAccountSheet
        linkingEvent={linkingEvent}
        linkingAccountId={linkingAccountId}
        currency={currency}
        viewerAccounts={viewerAccounts}
        viewerLinkAlreadyExists={Boolean(linkingEvent && viewerLinkByEventId.get(linkingEvent.id))}
        viewerProjectedAccount={viewerProjectedAccount}
        viewerProjectedBalance={viewerProjectedBalance}
        viewerLinkDelta={viewerLinkDelta}
        linkIsPending={linkEventMutation.isPending}
        onSelectAccount={setLinkingAccountId}
        onConfirm={() => { void handleLinkEvent(); }}
        onClose={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
      />

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
      <AnalyticsApprovalSheet
        approvingRequest={approvingRequest}
        currency={currency}
        ownerAccountQuestion={ownerAccountQuestion}
        ownerAccountLabel={ownerAccountLabel}
        ownerAccounts={ownerAccounts}
        approvalAccountId={approvalAccountId}
        approvalProjectedAccount={approvalProjectedAccount}
        approvalProjectedBalance={approvalProjectedBalance}
        approvalDelta={approvalDelta}
        acceptIsPending={acceptMutation.isPending}
        onSelectAccount={setApprovalAccountId}
        onConfirm={confirmInlineAccept}
        onClose={() => { setApprovingRequest(null); setApprovalAccountId(null); }}
      />
    </Modal>
  );
}
