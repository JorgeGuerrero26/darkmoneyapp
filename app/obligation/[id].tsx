import { useEffect, useMemo, useRef, useState } from "react";
import { mergePreviewAttachments } from "../../lib/attachments/merge-preview-attachments";
import { useObligationDetailHistoryFilter } from "../../features/obligations/lib/useObligationDetailHistoryFilter";
import { useObligationDetailOwnerRequests } from "../../features/obligations/lib/useObligationDetailOwnerRequests";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../lib/auth-context";
import { useUiStore } from "../../store/ui-store";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import { sortByName } from "../../lib/sort-locale";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import {
  useWorkspaceSnapshotQuery,
  useNotificationsQuery,
} from "../../services/queries/workspace-data";
import {
  useCreateObligationShareInviteMutation,
  useUnlinkObligationShareMutation,
  useSharedObligationsQuery,
  useObligationPaymentRequestsQuery,
  useCreateObligationEventDeleteRequestMutation,
  useObligationEventViewerLinksQuery,
  useUpsertLinkEventToAccountMutation,
  useDeleteViewerEventLinkMutation,
  useObligationEventsQuery,
  useViewerPaymentRequestsQuery,
} from "../../services/queries/obligations";
import {
  type EntityAttachmentFile,
  useObligationEventAttachmentCountsQuery,
  useObligationEventAttachmentsQuery,
  useMovementAttachmentCountsQuery,
  useMovementAttachmentsQuery,
} from "../../services/queries/attachments";
import type {
  ObligationEventSummary,
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../types/domain";
import {
  obligationPerspectiveDirectionLabel,
  obligationViewerActsAsCollector,
} from "../../lib/obligation-viewer-labels";
import {
  ownerDefaultAccountId,
  viewerEventAccountDelta,
  viewerEventAccountImpactCopy,
} from "../../lib/obligation-viewer-account-impact";
import { EVENT_LABEL_PAYABLE } from "../../lib/obligation-event-presentation";
import {
  readEventDeletePayload,
  readEventEditPayload,
  type EventDeleteStatus,
  type EventEditStatus,
  type PendingOwnerDeleteRequest,
  type PendingOwnerEditRequest,
} from "../../lib/obligation-event-payloads";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { PaymentRequestForm } from "../../components/forms/PaymentRequestForm";
import { PrincipalAdjustmentForm } from "../../components/forms/PrincipalAdjustmentForm";
import { ObligationEventEditRequestForm } from "../../components/forms/ObligationEventEditRequestForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Button } from "../../components/ui/Button";
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { ObligationEventDeleteImpact } from "../../components/domain/ObligationEventDeleteImpact";
import { ObligationEventActionSheet } from "../../components/domain/ObligationEventActionSheet";
import { ObligationAnalyticsModal } from "../../components/domain/ObligationAnalyticsModal";
import { ObligationCapitalChangesModal } from "../../components/domain/ObligationCapitalChangesModal";
import { useToast } from "../../hooks/useToast";
import { useViewerAutoLink } from "../../hooks/useViewerAutoLink";
import { useViewerAutoDelete } from "../../hooks/useViewerAutoDelete";
import { useObligationNotificationDeepLink } from "../../hooks/useObligationNotificationDeepLink";
import { EventHistoryRow } from "../../features/obligations/components/detail/EventHistoryRow";
import { EventHistoryGroup } from "../../features/obligations/components/detail/EventHistoryGroup";
import { OwnerDeleteRequestList } from "../../features/obligations/components/detail/OwnerDeleteRequestList";
import { OwnerEditRequestList } from "../../features/obligations/components/detail/OwnerEditRequestList";
import { OwnerPendingPaymentRequestList } from "../../features/obligations/components/detail/OwnerPendingPaymentRequestList";
import { ViewerRequestsSection } from "../../features/obligations/components/detail/ViewerRequestsSection";
import { EventHistoryContainer } from "../../features/obligations/components/detail/EventHistoryContainer";
import { ViewerLinkAccountSheet } from "../../features/obligations/components/detail/ViewerLinkAccountSheet";
import { OwnerRespondPaymentRequestSheet } from "../../features/obligations/components/detail/OwnerRespondPaymentRequestSheet";
import { ObligationOverviewCards } from "../../features/obligations/components/detail/ObligationOverviewCards";
import { ObligationDetailInfoCard } from "../../features/obligations/components/detail/ObligationDetailInfoCard";
import { OwnerRespondDeleteRequestSheet } from "../../features/obligations/components/detail/OwnerRespondDeleteRequestSheet";
import { OwnerRespondEditRequestSheet } from "../../features/obligations/components/detail/OwnerRespondEditRequestSheet";
import { ObligationDetailHeaderActions } from "../../features/obligations/components/detail/ObligationDetailHeaderActions";
import { ViewerActivityTabs } from "../../features/obligations/components/detail/ViewerActivityTabs";
import { RegisterPaymentButton } from "../../features/obligations/components/detail/RegisterPaymentButton";
import { RejectRequestSheet } from "../../features/obligations/components/detail/RejectRequestSheet";
import { ShareInviteBottomSheet } from "../../features/obligations/components/detail/ShareInviteBottomSheet";
import { ObligationReportSheet } from "../../features/obligations/components/detail/ObligationReportSheet";
import {
  buildObligationReport,
  type ObligationReportResult,
} from "../../features/obligations/lib/obligationReport";
import { sharePdfFromHtml } from "../../lib/share-pdf-file";
import * as Clipboard from "expo-clipboard";
import {
  buildObligationEventActions,
  buildObligationEventNotices,
  buildObligationEventQuickActions,
  EDITABLE_OBLIGATION_EVENT_TYPES,
  obligationEventAmountLabel,
  obligationEventDateLabel,
  obligationEventStatusBadge,
} from "../../lib/obligation-event-action-sheet";
import { toastedMutate } from "../../lib/toasted-mutate";
import { styles } from "../../features/obligations/lib/obligation-detail.styles";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toParamNumber(value: string | string[] | undefined): number | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function ObligationDetailScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const {
    id,
    paymentRequestId: paymentRequestIdParam,
    notificationKind: notificationKindParam,
    eventId: eventIdParam,
  } = useLocalSearchParams<{
    id: string;
    paymentRequestId?: string | string[];
    notificationKind?: string | string[];
    eventId?: string | string[];
  }>();
  const { handleBack } = useOriginBackNavigation();
  const { reason: notificationReason, dismiss: dismissNotificationReason } = useNotificationReason();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const { showToast, showRichToast } = useToast();
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [paymentFormVisible, setPaymentFormVisible] = useState(false);
  const [paymentRequestFormVisible, setPaymentRequestFormVisible] = useState(false);
  const [editRequestFormVisible, setEditRequestFormVisible] = useState(false);
  const [editingPaymentEvent, setEditingPaymentEvent] = useState<ObligationEventSummary | null>(null);
  const [adjustmentFormVisible, setAdjustmentFormVisible] = useState(false);
  const [adjustmentMode, setAdjustmentMode] = useState<"increase" | "decrease">("increase");
  const [editingAdjustmentEvent, setEditingAdjustmentEvent] = useState<ObligationEventSummary | null>(null);
  const [editRequestEvent, setEditRequestEvent] = useState<ObligationEventSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ObligationEventSummary | null>(null);
  const [eventMenuVisible, setEventMenuVisible] = useState(false);
  const [eventAttachmentsVisible, setEventAttachmentsVisible] = useState(false);
  const [deletingEventAttachmentPath, setDeletingEventAttachmentPath] = useState<string | null>(null);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [capitalChangesVisible, setCapitalChangesVisible] = useState(false);
  const [capitalChangesTab, setCapitalChangesTab] = useState<"increase" | "decrease">("increase");
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [linkingEvent, setLinkingEvent] = useState<ObligationEventSummary | null>(null);
  const [linkingAccountId, setLinkingAccountId] = useState<number | null>(null);
  const [viewerDeleteRequestEvent, setViewerDeleteRequestEvent] = useState<ObligationEventSummary | null>(null);
  const [detailViewportHeight, setDetailViewportHeight] = useState(0);
  const [viewerDetailTab, setViewerDetailTab] = useState<"history" | "requests">("history");
  const [unlinkShareConfirmVisible, setUnlinkShareConfirmVisible] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportResult, setReportResult] = useState<ObligationReportResult | null>(null);
  const [reportMessage, setReportMessage] = useState("");
  const [isSharingReport, setIsSharingReport] = useState(false);
  const detailScrollRef = useRef<ScrollView | null>(null);
  const historySectionYRef = useRef<number | null>(null);
  const eventRowLayoutsRef = useRef<Map<number, { y: number; height: number }>>(new Map());

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const shareMutation = useCreateObligationShareInviteMutation(activeWorkspaceId);
  const unlinkShareMutation = useUnlinkObligationShareMutation(activeWorkspaceId);
  const createDeleteRequestMutation = useCreateObligationEventDeleteRequestMutation();
  const linkEventMutation = useUpsertLinkEventToAccountMutation();
  const deleteViewerLinkMutation = useDeleteViewerEventLinkMutation();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: sharedObligations = [], isLoading: sharedLoading } = useSharedObligationsQuery(
    session?.user?.id ?? null,
  );
  const { data: notifications = [] } = useNotificationsQuery(profile?.id ?? null);

  const obligationIdNum = useMemo(() => parseInt(id ?? "0", 10), [id]);
  const routePaymentRequestId = useMemo(() => toParamNumber(paymentRequestIdParam), [paymentRequestIdParam]);
  const routeEventId = useMemo(() => toParamNumber(eventIdParam), [eventIdParam]);
  const notificationKind = firstParam(notificationKindParam) ?? "";
  const ownerAccounts = useMemo(
    () => sortByName((snapshot?.accounts ?? []).filter((account) => !account.isArchived)),
    [snapshot?.accounts],
  );

  const obligation: ObligationSummary | SharedObligationSummary | null = useMemo(() => {
    const fromSnap = snapshot?.obligations.find((o) => o.id === obligationIdNum) ?? null;
    if (fromSnap) return fromSnap;
    return sharedObligations.find((o) => o.id === obligationIdNum) ?? null;
  }, [snapshot, sharedObligations, obligationIdNum]);
  const {
    data: selectedEventAttachments = [],
    isLoading: selectedEventAttachmentsLoading,
    isFetching: selectedEventAttachmentsFetching,
  } = useObligationEventAttachmentsQuery(
    selectedEvent ? obligation?.workspaceId ?? null : null,
    selectedEvent?.id ?? null,
  );

  const isSharedViewer = Boolean(
    obligation && "viewerMode" in obligation && obligation.viewerMode === "shared_viewer",
  );

  const {
    data: remoteEvents,
    isPending: remoteEventsPending,
    isError: remoteEventsError,
  } = useObligationEventsQuery(obligation?.id, isSharedViewer);

  // Only fetch payment requests when this is NOT a shared viewer (owner sees requests)
  const { data: paymentRequests = [] } = useObligationPaymentRequestsQuery(
    !isSharedViewer ? obligationIdNum : null,
  );
  const pendingRequests = paymentRequests.filter((r) => r.status === "pending");

  // Shared viewer: which payment events have already been linked to an account
  const shareId = isSharedViewer && obligation && "share" in obligation
    ? (obligation as SharedObligationSummary).share.id
    : null;
  const { data: viewerLinks = [], isLoading: viewerLinksLoading } = useObligationEventViewerLinksQuery(
    isSharedViewer ? obligationIdNum : null,
    shareId,
  );
  const linkedEventIds = new Set(viewerLinks.map((l) => l.eventId));
  const viewerLinkByEventId = useMemo(() => {
    const map = new Map<number, (typeof viewerLinks)[number]>();
    for (const link of viewerLinks) map.set(link.eventId, link);
    return map;
  }, [viewerLinks]);
  const selectedEventLinkedMovementId = useMemo(() => {
    if (!selectedEvent) return null;
    if (isSharedViewer) return viewerLinkByEventId.get(selectedEvent.id)?.movementId ?? null;
    return selectedEvent.movementId ?? null;
  }, [isSharedViewer, selectedEvent, viewerLinkByEventId]);
  const {
    data: selectedEventMovementAttachments = [],
    isLoading: selectedEventMovementAttachmentsLoading,
    isFetching: selectedEventMovementAttachmentsFetching,
  } = useMovementAttachmentsQuery(
    selectedEventLinkedMovementId ? obligation?.workspaceId ?? null : null,
    selectedEventLinkedMovementId,
  );
  const selectedEventPreviewAttachments = useMemo(
    () => mergePreviewAttachments(selectedEventAttachments, selectedEventMovementAttachments),
    [selectedEventAttachments, selectedEventMovementAttachments],
  );
  const selectedEventPreviewAttachmentsLoading =
    selectedEventAttachmentsLoading ||
    selectedEventAttachmentsFetching ||
    (selectedEventLinkedMovementId != null &&
      (selectedEventMovementAttachmentsLoading || selectedEventMovementAttachmentsFetching));

  // Shared viewer: their own submitted requests
  const { data: viewerRequests = [] } = useViewerPaymentRequestsQuery(
    isSharedViewer ? obligationIdNum : null,
    profile?.id,
  );

  const eventsForDetail = useMemo(() => {
    if (!obligation) return [] as ObligationEventSummary[];
    const local = obligation.events ?? [];
    // Shared viewers receive history through list-shared-obligations; RLS can make
    // the direct obligation_events query return [] even when events exist.
    const source = isSharedViewer
      ? remoteEvents && remoteEvents.length > 0
        ? remoteEvents
        : local
      : local;
    return sortObligationEventsNewestFirst(source);
  }, [obligation, isSharedViewer, remoteEvents]);

  const capitalOverview = useMemo(() => {
    if (!obligation) {
      return {
        openingAmount: 0,
        increaseEvents: [] as ObligationEventSummary[],
        increaseCount: 0,
        increaseTotal: 0,
        decreaseEvents: [] as ObligationEventSummary[],
        decreaseCount: 0,
        decreaseTotal: 0,
        currentPrincipal: 0,
        progressPercent: 0,
      };
    }

    const openingEvent = eventsForDetail.find((event) => event.eventType === "opening");
    const openingAmount = openingEvent?.amount ?? obligation.principalAmount ?? 0;
    const increaseEvents = eventsForDetail.filter((event) => event.eventType === "principal_increase");
    const decreaseEvents = eventsForDetail.filter((event) => event.eventType === "principal_decrease");
    const increaseTotal = increaseEvents.reduce((sum, event) => sum + event.amount, 0);
    const decreaseTotal = decreaseEvents.reduce((sum, event) => sum + event.amount, 0);
    const currentPrincipalFromEvents = Math.max(0, openingAmount + increaseTotal - decreaseTotal);
    const currentPrincipal =
      obligation.currentPrincipalAmount && obligation.currentPrincipalAmount > 0
        ? obligation.currentPrincipalAmount
        : currentPrincipalFromEvents > 0
          ? currentPrincipalFromEvents
          : obligation.principalAmount;
    const paidOrCollected = Math.max(0, currentPrincipal - Math.max(0, obligation.pendingAmount));
    const progressPercent =
      currentPrincipal > 0.009
        ? Math.min(100, Math.max(0, (paidOrCollected / currentPrincipal) * 100))
        : obligation.progressPercent;

    return {
      openingAmount,
      increaseEvents,
      increaseCount: increaseEvents.length,
      increaseTotal,
      decreaseEvents,
      decreaseCount: decreaseEvents.length,
      decreaseTotal,
      currentPrincipal,
      progressPercent,
    };
  }, [eventsForDetail, obligation]);

  const eventIds = useMemo(() => eventsForDetail.map((event) => event.id), [eventsForDetail]);
  const movementIdsForHistory = useMemo(() => {
    const ids = eventsForDetail
      .map((event) =>
        isSharedViewer
          ? viewerLinkByEventId.get(event.id)?.movementId ?? null
          : event.movementId ?? null,
      )
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    return Array.from(new Set(ids));
  }, [eventsForDetail, isSharedViewer, viewerLinkByEventId]);
  const {
    data: eventAttachmentCounts = {},
    isLoading: eventAttachmentCountsLoading,
  } = useObligationEventAttachmentCountsQuery(
    obligation?.workspaceId ?? null,
    eventIds,
  );
  const {
    data: movementAttachmentCounts = {},
    isLoading: movementAttachmentCountsLoading,
  } = useMovementAttachmentCountsQuery(
    obligation?.workspaceId ?? null,
    movementIdsForHistory,
  );

  const pendingOwnerDeleteRequests = useMemo((): PendingOwnerDeleteRequest[] => {
    if (!obligation || isSharedViewer) return [];
    const items: PendingOwnerDeleteRequest[] = [];
    for (const item of notifications) {
      if (item.kind !== "obligation_event_delete_request") continue;
      const payload = readEventDeletePayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id || payload.responseStatus) continue;
      items.push({
        notification: item,
        payload,
        event: eventsForDetail.find((ev) => ev.id === payload.eventId) ?? null,
      });
    }
    return items.sort((a, b) =>
      b.notification.scheduledFor.localeCompare(a.notification.scheduledFor),
    );
  }, [notifications, obligation, isSharedViewer, eventsForDetail]);

  const ownerDeleteRequestByEventId = useMemo(() => {
    const map = new Map<number, PendingOwnerDeleteRequest>();
    for (const req of pendingOwnerDeleteRequests) {
      map.set(req.payload.eventId, req);
    }
    return map;
  }, [pendingOwnerDeleteRequests]);

  const pendingOwnerEditRequests = useMemo((): PendingOwnerEditRequest[] => {
    if (!obligation || isSharedViewer) return [];
    const items: PendingOwnerEditRequest[] = [];
    for (const item of notifications) {
      if (item.kind !== "obligation_event_edit_request") continue;
      const payload = readEventEditPayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id || payload.responseStatus) continue;
      items.push({
        notification: item,
        payload,
        event: eventsForDetail.find((ev) => ev.id === payload.eventId) ?? null,
      });
    }
    return items.sort((a, b) =>
      b.notification.scheduledFor.localeCompare(a.notification.scheduledFor),
    );
  }, [notifications, obligation, isSharedViewer, eventsForDetail]);

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
      if (
        newerItem ||
        (sameMoment && priority[derivedStatus] >= priority[prev.status])
      ) {
        map.set(payload.eventId, { status: derivedStatus, notification: item, payload });
      }
    }

    return map;
  }, [notifications, obligation, isSharedViewer]);

  const viewerEditStatusByEventId = useMemo(() => {
    const map = new Map<number, EventEditStatus>();
    if (!obligation || !isSharedViewer) return map;
    const relevantKinds = new Map<string, EventEditStatus["status"]>([
      ["obligation_event_edit_pending", "pending"],
      ["obligation_event_edit_accepted", "accepted"],
      ["obligation_event_edit_rejected", "rejected"],
    ]);
    const priority = { pending: 1, accepted: 2, rejected: 2 } as const;

    for (const item of notifications) {
      const status = relevantKinds.get(item.kind);
      if (!status) continue;
      const payload = readEventEditPayload(item.payload);
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
      if (
        newerItem ||
        (sameMoment && priority[derivedStatus] >= priority[prev.status])
      ) {
        map.set(payload.eventId, { status: derivedStatus, notification: item, payload });
      }
    }

    return map;
  }, [notifications, obligation, isSharedViewer]);

  const selectedEventDeleteStatus = selectedEvent
    ? viewerDeleteStatusByEventId.get(selectedEvent.id) ?? null
    : null;
  const selectedEventEditStatus = selectedEvent
    ? viewerEditStatusByEventId.get(selectedEvent.id) ?? null
    : null;
  const selectedEventViewerImpactCopy =
    isSharedViewer && selectedEvent
      ? viewerEventAccountImpactCopy(
          selectedEvent,
          obligation,
          (viewerLinkByEventId.get(selectedEvent.id)?.accountId ?? null) != null,
        )
      : null;
  const showViewerHistoryTab = !isSharedViewer || viewerDetailTab === "history";
  const showViewerRequestsTab = isSharedViewer && viewerDetailTab === "requests";

  const viewerEditRequests = useMemo(
    () =>
      Array.from(viewerEditStatusByEventId.values()).sort((a, b) =>
        b.notification.scheduledFor.localeCompare(a.notification.scheduledFor),
      ),
    [viewerEditStatusByEventId],
  );
  const viewerDeleteRequests = useMemo(
    () =>
      Array.from(viewerDeleteStatusByEventId.values()).sort((a, b) =>
        b.notification.scheduledFor.localeCompare(a.notification.scheduledFor),
      ),
    [viewerDeleteStatusByEventId],
  );

  const {
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
  } = useObligationDetailHistoryFilter({
    obligationId: obligation?.id ?? null,
    events: eventsForDetail,
  });

  useEffect(() => {
    setViewerDetailTab("history");
  }, [obligation?.id]);

  // Force-refetch attachment list every time the preview modal opens to bypass stale cache
  useEffect(() => {
    if (!eventAttachmentsVisible || !selectedEvent || !obligation) return;
    void queryClient.invalidateQueries({
      queryKey: ["entity-attachments", obligation.workspaceId, "obligation-event", selectedEvent.id],
    });
  }, [eventAttachmentsVisible, selectedEvent?.id, obligation?.workspaceId, queryClient]);

  const {
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
    ownerEditResponseAccountId,
    ownerEditPreviousAccountId,
    setOwnerEditResponseAccountId,
    acceptRequestMutation,
    rejectRequestMutation,
    deleteEventMutation,
    rejectDeleteRequestMutation,
    acceptEditRequestMutation,
    rejectEditRequestMutation,
    handleAcceptRequest,
    openOwnerRequestDecision,
    handleRejectRequest,
    handleApproveDeleteRequest,
    handleRejectDeleteRequest,
    handleAcceptEditRequest,
    handleRejectEditRequest,
  } = useObligationDetailOwnerRequests({
    obligation,
    ownerUserId: profile?.id,
    showToast,
  });

  useViewerAutoLink({
    isSharedViewer,
    viewerRequests,
    obligation,
    profileId: profile?.id ?? null,
    shareId,
    activeWorkspaceId,
    linkedEventIds,
    linkEventMutation,
    showToast,
  });

  useViewerAutoDelete({
    isSharedViewer,
    obligation,
    notifications,
    viewerLinks,
    eventsForDetail,
    shareId,
    deleteViewerLinkMutation,
    showToast,
  });

  const {
    highlightedEventId,
    highlightPulseOn,
    pendingFocusEventId,
    setPendingFocusEventId,
    eventFocusNotice,
    applyHistoryPreset,
    focusEventFromNotification,
    focusTimersRef,
  } = useObligationNotificationDeepLink({
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
  });


  function renderHistoryEventRow(
    ev: ObligationEventSummary,
    cardPosition: "single" | "first" | "middle" | "last",
  ) {
    if (!obligation) return null;
    return (
      <EventHistoryRow
        key={ev.id}
        event={ev}
        cardPosition={cardPosition}
        obligation={obligation}
        isSharedViewer={isSharedViewer}
        viewerLinkByEventId={viewerLinkByEventId}
        linkedEventIds={linkedEventIds}
        eventAttachmentCounts={eventAttachmentCounts}
        movementAttachmentCounts={movementAttachmentCounts}
        eventAttachmentCountsLoading={eventAttachmentCountsLoading}
        movementAttachmentCountsLoading={movementAttachmentCountsLoading}
        viewerDeleteStatusByEventId={viewerDeleteStatusByEventId}
        viewerEditStatusByEventId={viewerEditStatusByEventId}
        ownerDeleteRequestByEventId={ownerDeleteRequestByEventId}
        highlightedEventId={highlightedEventId}
        highlightPulseOn={highlightPulseOn}
        pendingFocusEventId={pendingFocusEventId}
        eventLabels={eventLabels}
        styles={styles}
        eventRowLayoutsRef={eventRowLayoutsRef}
        focusTimersRef={focusTimersRef}
        onFocusEvent={focusEventFromNotification}
        onTapEvent={handleEventTap}
        onPressMovement={(movementId) => router.push(`/movement/${movementId}`)}
        onPressAttachments={(event) => {
          setSelectedEvent(event);
          setEventMenuVisible(false);
          setEventAttachmentsVisible(true);
        }}
      />
    );
  }

  function renderHistoryGroup(params: {
    key: "payments" | "capital";
    title: string;
    subtitle: string;
    events: ObligationEventSummary[];
    emptyText: string;
  }) {
    return (
      <EventHistoryGroup
        key={params.key}
        groupKey={params.key}
        title={params.title}
        subtitle={params.subtitle}
        events={params.events}
        emptyText={params.emptyText}
        collapsed={historyGroupsCollapsed[params.key]}
        onToggleCollapsed={() =>
          setHistoryGroupsCollapsed((current) => ({
            ...current,
            [params.key]: !current[params.key],
          }))
        }
        currencyCode={obligation?.currencyCode ?? ""}
        styles={styles}
        renderEventRow={renderHistoryEventRow}
      />
    );
  }

  async function handleShare() {
    if (!shareEmail.trim() || !obligation || !activeWorkspaceId || isSharedViewer) return;
    try {
      const result = await shareMutation.mutateAsync({
        workspaceId: activeWorkspaceId,
        obligationId: obligation.id,
        invitedEmail: shareEmail.trim().toLowerCase(),
      });
      setShareSheetOpen(false);
      setShareEmail("");
      showRichToast({
        type: "success",
        title: result.emailSent ? "Invitación enviada" : "Invitación creada",
        subtitle: result.invitedEmail,
        duration: 5000,
      });
    } catch (err) {
      showToast(humanizeError(err), "error");
    }
  }

  function handleOpenReport() {
    if (!obligation || isSharedViewer) return;
    const result = buildObligationReport({
      obligation,
      events: eventsForDetail,
      ownerName: profile?.fullName ?? null,
    });
    setReportResult(result);
    setReportMessage(result.message);
    setReportSheetOpen(true);
  }

  async function handleCopyReportMessage() {
    await Clipboard.setStringAsync(reportMessage);
    showToast("Mensaje copiado — pégalo en WhatsApp", "success");
  }

  async function handleShareReportPdf() {
    if (!reportResult) return;
    setIsSharingReport(true);
    try {
      await sharePdfFromHtml(reportResult.html, reportResult.fileName, "Compartir reporte");
    } catch (err) {
      showToast(humanizeError(err), "error");
    } finally {
      setIsSharingReport(false);
    }
  }

  async function handleUnlinkViewerShare() {
    if (!obligation || !isSharedViewer || !("share" in obligation)) return;
    await toastedMutate({
      mutate: unlinkShareMutation.mutateAsync,
      input: {
        shareId: obligation.share.id,
        workspaceId: obligation.share.workspaceId,
        obligationId: obligation.id,
      },
      showToast,
      successMessage: "Te desvinculaste de este registro compartido",
      onSuccess: () => {
        setUnlinkShareConfirmVisible(false);
        router.back();
      },
    });
  }


  function handleEventTap(ev: ObligationEventSummary) {
    if (ev.eventType === "opening") return;
    setEventAttachmentsVisible(false);
    setSelectedEvent(ev);
    setEventMenuVisible(true);
  }

  function handleViewerLinkEvent() {
    if (!selectedEvent) return;
    setEventMenuVisible(false);
    openViewerLinkSheet(selectedEvent);
  }

  function openViewerLinkSheet(ev: ObligationEventSummary) {
    const currentLink = viewerLinkByEventId.get(ev.id);
    setLinkingEvent(ev);
    setLinkingAccountId(currentLink?.accountId ?? null);
  }

  function handleViewerDeleteRequestFromMenu() {
    if (!selectedEvent) return;
    setEventMenuVisible(false);
    setViewerDeleteRequestEvent(selectedEvent);
  }

  function handleViewerEditRequestFromMenu() {
    if (!selectedEvent || !isSharedViewer || !obligation || !("share" in obligation)) return;
    setEventMenuVisible(false);
    setEditRequestEvent(selectedEvent);
    setEditRequestFormVisible(true);
  }

  function handleEditEvent() {
    setEventMenuVisible(false);
    if (!selectedEvent) return;
    if (selectedEvent.eventType === "payment") {
      setEditingPaymentEvent(selectedEvent);
      setPaymentFormVisible(true);
    } else if (
      selectedEvent.eventType === "principal_increase" ||
      selectedEvent.eventType === "principal_decrease"
    ) {
      setAdjustmentMode(selectedEvent.eventType === "principal_increase" ? "increase" : "decrease");
      setEditingAdjustmentEvent(selectedEvent);
      setAdjustmentFormVisible(true);
    }
  }

  function handleDeleteEvent() {
    if (!selectedEvent || !obligation) return;
    deleteEventMutation.mutate(
      {
        eventId: selectedEvent.id,
        obligationId: obligation.id,
        workspaceId: obligation.workspaceId,
        movementId: selectedEvent.movementId,
        ownerUserId: profile?.id,
        obligationTitle: obligation.title,
        amount: selectedEvent.amount,
        eventType: selectedEvent.eventType,
        eventDate: selectedEvent.eventDate,
      },
      {
        onSuccess: (data) => showToast(
          data?.deletedOwnerMovementId ? "Evento y movimiento eliminados" : "Evento eliminado",
          "success",
        ),
        onError: (err) => showToast(humanizeError(err), "error"),
      },
    );
  }

  async function handleLinkEvent() {
    if (!linkingEvent || !linkingAccountId || !obligation || !activeWorkspaceId || !profile?.id || !shareId) return;
    const existingLink = viewerLinkByEventId.get(linkingEvent.id);
    const viewerEventLabel =
      linkingEvent.eventType === "payment"
        ? obligation.direction === "receivable" ? "pago" : "cobro"
        : linkingEvent.eventType === "principal_increase"
          ? obligation.direction === "receivable" ? "dinero recibido" : "prestamo entregado"
          : obligation.direction === "receivable" ? "devolucion de principal" : "pago de principal";
    await toastedMutate({
      mutate: linkEventMutation.mutateAsync,
      input: {
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
      },
      showToast,
      successMessage: existingLink
        ? "Cuenta asociada actualizada"
        : `${viewerEventLabel.charAt(0).toUpperCase() + viewerEventLabel.slice(1)} asociado a tu cuenta`,
      onSuccess: (result) => {
        setLinkingEvent(null);
        setLinkingAccountId(null);
        if (result.attachmentSyncError) {
          showToast(result.attachmentSyncError, "error");
        }
      },
    });
  }

  async function handleCreateDeleteRequest(event: ObligationEventSummary) {
    if (!obligation || !isSharedViewer || !profile?.id || !("share" in obligation)) return;
    await toastedMutate({
      mutate: createDeleteRequestMutation.mutateAsync,
      input: {
        obligationId: obligation.id,
        eventId: event.id,
        amount: event.amount,
        currencyCode: obligation.currencyCode,
        eventType: event.eventType,
        eventDate: event.eventDate,
        ownerUserId: obligation.share.ownerUserId,
        viewerUserId: profile.id,
        viewerDisplayName: profile.fullName ?? null,
        obligationTitle: obligation.title,
      },
      showToast,
      successMessage: "Solicitud de eliminacion enviada",
      onSuccess: () => setViewerDeleteRequestEvent(null),
    });
  }

  async function handleDeleteEventAttachment(attachment: EntityAttachmentFile) {
    if (!obligation || !selectedEvent || isSharedViewer) return;
    try {
      setDeletingEventAttachmentPath(attachment.filePath);
      await removeAttachmentFile({
        filePath: attachment.filePath,
        mirrorTargets: attachment.filePath.includes("/movement/")
          ? [
              {
                workspaceId: obligation.workspaceId,
                entityType: "obligation-event",
                entityId: selectedEvent.id,
              },
            ]
          : selectedEventLinkedMovementId != null
            ? [
                {
                  workspaceId: obligation.workspaceId,
                  entityType: "movement",
                  entityId: selectedEventLinkedMovementId,
                },
              ]
            : [],
      });
      await queryClient.invalidateQueries({
        queryKey: ["entity-attachments", obligation.workspaceId, "obligation-event", selectedEvent.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["entity-attachment-counts", obligation.workspaceId, "obligation-event"],
      });
      if (selectedEventLinkedMovementId != null) {
        await queryClient.invalidateQueries({
          queryKey: ["movement-attachments", obligation.workspaceId, selectedEventLinkedMovementId],
        });
      }
      showToast("Comprobante eliminado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setDeletingEventAttachmentPath(null);
    }
  }

  const pageLoading = isLoading || (!obligation && sharedLoading);

  const isReceivable = obligation?.direction === "receivable";
  const viewerActsAsCollector = obligation
    ? obligationViewerActsAsCollector(obligation.direction, isSharedViewer)
    : false;
  const dirColor = viewerActsAsCollector ? COLORS.income : COLORS.expense;
  const directionPerspectiveLabel = obligation
    ? obligationPerspectiveDirectionLabel(obligation.direction, isSharedViewer)
    : "";
  const ownerAccountQuestion = isReceivable
    ? "A que cuenta va a ingresar este dinero?"
    : "De que cuenta va a salir este dinero?";
  const ownerAccountLabel = isReceivable ? "Cuenta de abono" : "Cuenta de debito";
  const ownerRequestDelta = notificationRequestTarget
    ? (isReceivable ? notificationRequestTarget.amount : -notificationRequestTarget.amount)
    : 0;
  const ownerProjectedAccount = notificationRequestTarget && ownerResponseAccountId != null
    ? ownerAccounts.find((acc) => acc.id === ownerResponseAccountId) ?? null
    : null;
  const ownerProjectedBalance = ownerProjectedAccount
    ? ownerProjectedAccount.currentBalance + ownerRequestDelta
    : null;
  const viewerLinkDelta = viewerEventAccountDelta(linkingEvent, obligation);
  const viewerProjectedAccount = linkingEvent && linkingAccountId != null
    ? ownerAccounts.find((acc) => acc.id === linkingAccountId) ?? null
    : null;
  const viewerProjectedBalance = viewerProjectedAccount
    ? viewerProjectedAccount.currentBalance + viewerLinkDelta
    : null;
  const linkingEventImpactCopy =
    linkingEvent && obligation
      ? viewerEventAccountImpactCopy(linkingEvent, obligation, true)
      : null;
  const ownerEditCurrentAmount = ownerEditRequestTarget?.payload.currentAmount ?? ownerEditRequestTarget?.event?.amount ?? 0;
  const ownerEditProposedAmount = ownerEditRequestTarget?.payload.proposedAmount ?? ownerEditRequestTarget?.event?.amount ?? 0;
  const ownerEditCurrentDelta = ownerEditRequestTarget && obligation
    ? (obligation.direction === "receivable" ? ownerEditCurrentAmount : -ownerEditCurrentAmount)
    : 0;
  const ownerEditProposedDelta = ownerEditRequestTarget && obligation
    ? (obligation.direction === "receivable" ? ownerEditProposedAmount : -ownerEditProposedAmount)
    : 0;
  const ownerEditPreviousAccount = ownerEditPreviousAccountId != null
    ? ownerAccounts.find((acc) => acc.id === ownerEditPreviousAccountId) ?? null
    : null;
  const ownerEditSelectedAccount = ownerEditResponseAccountId != null
    ? ownerAccounts.find((acc) => acc.id === ownerEditResponseAccountId) ?? null
    : null;
  const ownerEditPreviousProjectedBalance = ownerEditPreviousAccount
    ? ownerEditPreviousAccount.currentBalance - ownerEditCurrentDelta
    : null;
  const ownerEditSelectedProjectedBalance = ownerEditSelectedAccount
    ? ownerEditSelectedAccount.currentBalance
      + (ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
        ? ownerEditProposedDelta - ownerEditCurrentDelta
        : ownerEditProposedDelta)
    : null;
  const paymentWord =
    obligation && obligationViewerActsAsCollector(obligation.direction, isSharedViewer)
      ? "Cobro"
      : "Pago";
  const paymentWordPlural = paymentWord === "Cobro" ? "Cobros" : "Pagos";
  const eventLabels = useMemo<Record<string, string>>(
    () => ({ ...EVENT_LABEL_PAYABLE, payment: paymentWord }),
    [paymentWord],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={obligation?.title ?? "Obligacion"}
        subtitle={
          isSharedViewer && obligation && "share" in obligation
            ? `Compartido - ${(obligation as SharedObligationSummary).share.ownerDisplayName?.trim() || "Otro usuario"}`
            : activeWorkspace?.name
        }
        onBack={handleBack}
        rightAction={
          <ObligationDetailHeaderActions
            styles={styles}
            hasObligation={Boolean(obligation)}
            isSharedViewer={isSharedViewer}
            pendingRequestCount={pendingRequests.length}
            onPressShare={() => { setShareEmail(""); setShareSheetOpen(true); }}
            onPressReport={handleOpenReport}
            onPressUnlink={() => setUnlinkShareConfirmVisible(true)}
          />
        }
      />
      <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />

      {pageLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : !obligation ? (
        <View style={styles.center}><Text style={styles.errorText}>No encontrada</Text></View>
      ) : (
        <ScrollView
          ref={detailScrollRef}
          onLayout={(event) => setDetailViewportHeight(event.nativeEvent.layout.height)}
          contentContainerStyle={styles.content}
        >
          <ObligationOverviewCards
            styles={styles}
            obligation={obligation}
            isSharedViewer={isSharedViewer}
            dirColor={dirColor}
            directionPerspectiveLabel={directionPerspectiveLabel}
            capitalOverview={capitalOverview}
            onPressEditObligation={() => setEditFormVisible(true)}
            onPressIncreaseCapital={() => {
              setEditingAdjustmentEvent(null);
              setAdjustmentMode("increase");
              setAdjustmentFormVisible(true);
            }}
            onPressDecreaseCapital={() => {
              setEditingAdjustmentEvent(null);
              setAdjustmentMode("decrease");
              setAdjustmentFormVisible(true);
            }}
            onPressCapitalIncreaseDetail={() => {
              setCapitalChangesTab("increase");
              setCapitalChangesVisible(true);
            }}
            onPressCapitalDecreaseDetail={() => {
              setCapitalChangesTab("decrease");
              setCapitalChangesVisible(true);
            }}
          />

          <ObligationDetailInfoCard styles={styles} obligation={obligation} />

          {isSharedViewer ? (
            <ViewerActivityTabs
              styles={styles}
              activeTab={viewerDetailTab}
              historyCount={eventsForDetail.length}
              requestsCount={viewerRequests.length + viewerEditRequests.length + viewerDeleteRequests.length}
              onChangeTab={setViewerDetailTab}
            />
          ) : null}

          {showViewerHistoryTab ? (
            <EventHistoryContainer
              styles={styles}
              paymentWordPlural={paymentWordPlural}
              paymentWord={paymentWord}
              historyDateRangeNotice={historyDateRangeNotice}
              historyPreset={historyPreset}
              historyFrom={historyFrom}
              historyTo={historyTo}
              onApplyPreset={applyHistoryPreset}
              onChangeHistoryFrom={setHistoryFrom}
              onChangeHistoryTo={setHistoryTo}
              onSetCustomPreset={() => setHistoryPreset("custom")}
              eventFocusNotice={eventFocusNotice}
              isSharedViewer={isSharedViewer}
              remoteEventsError={remoteEventsError}
              remoteEventsPending={remoteEventsPending}
              eventsForDetail={eventsForDetail}
              filteredHistoryEvents={filteredHistoryEvents}
              paymentHistoryEvents={paymentHistoryEvents}
              capitalHistoryEvents={capitalHistoryEvents}
              onSectionLayoutY={(y) => { historySectionYRef.current = y; }}
              renderHistoryGroup={renderHistoryGroup}
            />
          ) : null}

          {!isSharedViewer && obligation ? (
            <OwnerDeleteRequestList
              obligation={obligation}
              pendingDeleteRequests={pendingOwnerDeleteRequests}
              eventLabels={eventLabels}
              deleteEventIsPending={deleteEventMutation.isPending}
              rejectIsPending={rejectDeleteRequestMutation.isPending}
              styles={styles}
              onApprove={(req) => void handleApproveDeleteRequest(req)}
              onReject={(req) => void handleRejectDeleteRequest(req)}
              onFocusEvent={(eventId) => {
                setPendingFocusEventId(eventId);
                focusEventFromNotification(eventId, {
                  tone: "info",
                  message: "Evento de la solicitud resaltado en el historial.",
                  toastMessage: "Evento resaltado",
                });
              }}
            />
          ) : null}

          {!isSharedViewer && obligation ? (
            <OwnerEditRequestList
              obligation={obligation}
              pendingEditRequests={pendingOwnerEditRequests}
              eventLabels={eventLabels}
              acceptIsPending={acceptEditRequestMutation.isPending}
              rejectIsPending={rejectEditRequestMutation.isPending}
              styles={styles}
              onSelectRequest={setOwnerEditRequestTarget}
            />
          ) : null}

          {!isSharedViewer && obligation ? (
            <OwnerPendingPaymentRequestList
              obligation={obligation}
              pendingRequests={pendingRequests}
              acceptIsPending={acceptRequestMutation.isPending}
              styles={styles}
              onAcceptPress={openOwnerRequestDecision}
              onRejectPress={(req) => { setRejectingRequest(req); setRejectReason(""); }}
            />
          ) : null}

          {showViewerRequestsTab && obligation ? (
            <ViewerRequestsSection
              obligation={obligation}
              viewerPaymentRequests={viewerRequests}
              viewerEditRequests={viewerEditRequests}
              viewerDeleteRequests={viewerDeleteRequests}
              eventsForDetail={eventsForDetail}
              linkedEventIds={linkedEventIds}
              eventLabels={eventLabels}
              styles={styles}
            />
          ) : null}

          <RegisterPaymentButton
            styles={styles}
            obligation={obligation}
            isSharedViewer={isSharedViewer}
            onPressViewerRequest={() => setPaymentRequestFormVisible(true)}
            onPressOwnerRegister={() => setPaymentFormVisible(true)}
          />
        </ScrollView>
      )}

      <ObligationForm
        visible={editFormVisible}
        onClose={() => setEditFormVisible(false)}
        onSuccess={() => setEditFormVisible(false)}
        editObligation={obligation ?? undefined}
      />

      <PaymentForm
        visible={paymentFormVisible}
        onClose={() => { setPaymentFormVisible(false); setEditingPaymentEvent(null); }}
        onSuccess={() => {
          setPaymentFormVisible(false);
          setEditingPaymentEvent(null);
          if (obligation?.workspaceId) {
            void queryClient.invalidateQueries({
              queryKey: ["entity-attachment-counts", obligation.workspaceId, "obligation-event"],
            });
          }
        }}
        obligation={obligation}
        editEvent={editingPaymentEvent ?? undefined}
      />

      <PrincipalAdjustmentForm
        visible={adjustmentFormVisible}
        mode={adjustmentMode}
        obligation={obligation && !("viewerMode" in obligation) ? (obligation as ObligationSummary) : null}
        onClose={() => { setAdjustmentFormVisible(false); setEditingAdjustmentEvent(null); }}
        onSuccess={() => {
          setAdjustmentFormVisible(false);
          setEditingAdjustmentEvent(null);
          if (obligation?.workspaceId) {
            void queryClient.invalidateQueries({
              queryKey: ["entity-attachment-counts", obligation.workspaceId, "obligation-event"],
            });
          }
        }}
        editEvent={editingAdjustmentEvent ?? undefined}
      />

      {isSharedViewer && obligation && "share" in obligation ? (
        <PaymentRequestForm
          visible={paymentRequestFormVisible}
          onClose={() => setPaymentRequestFormVisible(false)}
          onSuccess={() => setPaymentRequestFormVisible(false)}
          obligation={obligation as SharedObligationSummary}
        />
      ) : null}

      {isSharedViewer && obligation && "share" in obligation ? (
        <ObligationEventEditRequestForm
          visible={editRequestFormVisible}
          onClose={() => {
            setEditRequestFormVisible(false);
            setEditRequestEvent(null);
          }}
          onSuccess={() => {
            setEditRequestFormVisible(false);
            setEditRequestEvent(null);
          }}
          obligation={obligation as SharedObligationSummary}
          event={editRequestEvent}
        />
      ) : null}

      <ObligationAnalyticsModal
        visible={analyticsVisible}
        obligation={obligation}
        onClose={() => setAnalyticsVisible(false)}
        onEventTap={(ev) => {
          handleEventTap(ev);
        }}
        userId={profile?.id}
      />

      {obligation ? (
        <ObligationCapitalChangesModal
          visible={capitalChangesVisible}
          onClose={() => setCapitalChangesVisible(false)}
          currencyCode={obligation.currencyCode}
          increases={capitalOverview.increaseEvents}
          decreases={capitalOverview.decreaseEvents}
          initialTab={capitalChangesTab}
        />
      ) : null}

      <ViewerLinkAccountSheet
        styles={styles}
        linkingEvent={linkingEvent}
        linkingAccountId={linkingAccountId}
        obligation={obligation}
        accounts={(snapshot?.accounts ?? []).filter((a) => !a.isArchived)}
        viewerLinkExists={Boolean(linkingEvent && viewerLinkByEventId.get(linkingEvent.id))}
        viewerLinkDelta={viewerLinkDelta}
        viewerProjectedAccount={viewerProjectedAccount}
        viewerProjectedBalance={viewerProjectedBalance}
        linkingEventImpactCopy={linkingEventImpactCopy}
        insetBottom={insets.bottom}
        linkIsPending={linkEventMutation.isPending}
        onClose={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
        onSelectAccount={setLinkingAccountId}
        onConfirm={handleLinkEvent}
      />

      <ConfirmDialog
        visible={Boolean(viewerDeleteRequestEvent)}
        title="Solicitar eliminacion?"
        body="El propietario recibira una notificacion para aprobar o rechazar la eliminacion de este evento."
        confirmLabel="Enviar solicitud"
        cancelLabel="Cancelar"
        onCancel={() => setViewerDeleteRequestEvent(null)}
        onConfirm={() => {
          if (viewerDeleteRequestEvent) {
            void handleCreateDeleteRequest(viewerDeleteRequestEvent);
          }
        }}
        destructive={false}
      >
        {viewerDeleteRequestEvent && obligation ? (
          <ObligationEventDeleteImpact
            event={viewerDeleteRequestEvent}
            obligation={obligation}
            accounts={snapshot?.accounts ?? []}
            actor="viewer"
            viewerLinkedAccountId={viewerLinkByEventId.get(viewerDeleteRequestEvent.id)?.accountId ?? null}
          />
        ) : null}
      </ConfirmDialog>

      <OwnerRespondPaymentRequestSheet
        styles={styles}
        notificationRequestTarget={notificationRequestTarget}
        obligation={obligation}
        ownerAccounts={ownerAccounts}
        ownerResponseAccountId={ownerResponseAccountId}
        ownerProjectedAccount={ownerProjectedAccount}
        ownerProjectedBalance={ownerProjectedBalance}
        ownerRequestDelta={ownerRequestDelta}
        ownerAccountQuestion={ownerAccountQuestion}
        ownerAccountLabel={ownerAccountLabel}
        insetBottom={insets.bottom}
        acceptIsPending={acceptRequestMutation.isPending}
        onSelectAccount={setOwnerResponseAccountId}
        onAccept={(req) => void handleAcceptRequest(req)}
        onReject={(req) => {
          setRejectingRequest(req);
          setRejectReason("");
          setNotificationRequestTarget(null);
          setOwnerResponseAccountId(null);
        }}
        onCancel={() => { setNotificationRequestTarget(null); setOwnerResponseAccountId(null); }}
      />

      <OwnerRespondDeleteRequestSheet
        styles={styles}
        ownerDeleteRequestTarget={ownerDeleteRequestTarget}
        obligation={obligation}
        accounts={snapshot?.accounts ?? []}
        insetBottom={insets.bottom}
        approveIsPending={deleteEventMutation.isPending}
        rejectIsPending={rejectDeleteRequestMutation.isPending}
        onApprove={(target) => void handleApproveDeleteRequest(target)}
        onReject={(target) => void handleRejectDeleteRequest(target)}
        onCancel={() => setOwnerDeleteRequestTarget(null)}
      />

      <OwnerRespondEditRequestSheet
        styles={styles}
        ownerEditRequestTarget={ownerEditRequestTarget}
        obligation={obligation}
        ownerAccounts={ownerAccounts}
        ownerAccountLabel={ownerAccountLabel}
        ownerEditResponseAccountId={ownerEditResponseAccountId}
        ownerEditPreviousAccount={ownerEditPreviousAccount}
        ownerEditPreviousProjectedBalance={ownerEditPreviousProjectedBalance}
        ownerEditSelectedAccount={ownerEditSelectedAccount}
        ownerEditSelectedProjectedBalance={ownerEditSelectedProjectedBalance}
        ownerEditCurrentAmount={ownerEditCurrentAmount}
        ownerEditProposedAmount={ownerEditProposedAmount}
        ownerEditCurrentDelta={ownerEditCurrentDelta}
        ownerEditProposedDelta={ownerEditProposedDelta}
        insetBottom={insets.bottom}
        acceptIsPending={acceptEditRequestMutation.isPending}
        rejectIsPending={rejectEditRequestMutation.isPending}
        onSelectAccount={setOwnerEditResponseAccountId}
        onAccept={(target) => void handleAcceptEditRequest(target)}
        onReject={(target) => void handleRejectEditRequest(target)}
        onCancel={() => setOwnerEditRequestTarget(null)}
      />

      <RejectRequestSheet
        styles={styles}
        rejectingRequest={rejectingRequest}
        currencyCode={obligation?.currencyCode ?? ""}
        rejectReason={rejectReason}
        rejectIsPending={rejectRequestMutation.isPending}
        insetBottom={insets.bottom}
        onChangeReason={setRejectReason}
        onConfirm={handleRejectRequest}
        onCancel={() => setRejectingRequest(null)}
      />

      {/* Men? de acciones sobre un evento */}
      <ObligationEventActionSheet
        visible={eventMenuVisible}
        onClose={() => setEventMenuVisible(false)}
        eventTitle={eventLabels[selectedEvent?.eventType ?? ""] ?? selectedEvent?.eventType}
        dateLabel={obligationEventDateLabel(selectedEvent)}
        amountLabel={obligationEventAmountLabel(
          selectedEvent,
          obligation,
          isSharedViewer,
          selectedEventViewerImpactCopy,
        )}
        description={selectedEvent?.description ?? null}
        notes={selectedEvent?.notes ?? null}
        statusBadge={obligationEventStatusBadge(isSharedViewer, selectedEventDeleteStatus)}
        notices={buildObligationEventNotices({
          isSharedViewer,
          attachmentsLoading: selectedEventPreviewAttachmentsLoading,
          deleteStatus: selectedEventDeleteStatus,
          editStatus: selectedEventEditStatus,
          viewerImpactCopy: selectedEventViewerImpactCopy,
        })}
        quickActions={buildObligationEventQuickActions({
          isSharedViewer,
          selectedEvent,
          previewAttachmentsCount: selectedEventPreviewAttachments.length,
          linkedEventIds,
          onPressAttachments: () => {
            setEventMenuVisible(false);
            setEventAttachmentsVisible(true);
          },
          onPressLinkAccount: handleViewerLinkEvent,
        })}
        actions={buildObligationEventActions({
          isSharedViewer,
          selectedEvent,
          deleteStatus: selectedEventDeleteStatus,
          editStatus: selectedEventEditStatus,
          onViewerRequestEdit: handleViewerEditRequestFromMenu,
          onViewerRequestDelete: handleViewerDeleteRequestFromMenu,
          onOwnerEdit: handleEditEvent,
          onOwnerDelete: () => {
            setEventMenuVisible(false);
            setConfirmDeleteVisible(true);
          },
        })}
      />

      <ConfirmDialog
        visible={confirmDeleteVisible}
        title="Eliminar evento?"
        body={
          selectedEvent?.movementId
            ? "Se eliminará el evento y el movimiento contable vinculado."
            : "Este evento se eliminará permanentemente."
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() => { setConfirmDeleteVisible(false); handleDeleteEvent(); }}
      >
        {selectedEvent && obligation ? (
          <ObligationEventDeleteImpact
            event={selectedEvent}
            obligation={obligation}
            accounts={snapshot?.accounts ?? []}
            actor="owner"
          />
        ) : null}
      </ConfirmDialog>

      <AttachmentPreviewModal
        visible={eventAttachmentsVisible}
        attachments={selectedEventPreviewAttachments}
        isLoading={selectedEventPreviewAttachmentsLoading}
        onClose={() => setEventAttachmentsVisible(false)}
        onDeleteAttachment={!isSharedViewer && selectedEvent ? handleDeleteEventAttachment : undefined}
        deletingAttachmentPath={deletingEventAttachmentPath}
        insets={insets}
        title="Comprobantes del evento"
      />

      <ConfirmDialog
        visible={unlinkShareConfirmVisible}
        title="Desvincular registro compartido"
        body="Dejarás de ver este crédito o deuda en tu módulo de obligaciones. El propietario conservará su registro original."
        confirmLabel="Desvincular"
        cancelLabel="Cancelar"
        onCancel={() => setUnlinkShareConfirmVisible(false)}
        onConfirm={() => void handleUnlinkViewerShare()}
      />

      <ShareInviteBottomSheet
        styles={styles}
        visible={shareSheetOpen}
        shareEmail={shareEmail}
        isSubmitting={shareMutation.isPending}
        onChangeEmail={setShareEmail}
        onSubmit={handleShare}
        onClose={() => setShareSheetOpen(false)}
      />

      <ObligationReportSheet
        styles={styles}
        visible={reportSheetOpen}
        folio={reportResult?.folio ?? ""}
        message={reportMessage}
        isSharing={isSharingReport}
        onChangeMessage={setReportMessage}
        onCopyMessage={() => void handleCopyReportMessage()}
        onSharePdf={() => void handleShareReportPdf()}
        onClose={() => setReportSheetOpen(false)}
      />
    </View>
  );
}


export default function ObligationDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <ObligationDetailScreen />
    </ErrorBoundary>
  );
}
