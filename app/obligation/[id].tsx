import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle, Images, Minus, Pencil, Plus, XCircle } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import { buildDateRangeNotice } from "../../lib/date-range-notice";
import { parseDisplayDate, todayPeru } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import { sortByName } from "../../lib/sort-locale";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import {
  useWorkspaceSnapshotQuery,
  useCreateObligationShareInviteMutation,
  useUnlinkObligationShareMutation,
  useSharedObligationsQuery,
  useDeleteObligationEventMutation,
  useNotificationsQuery,
  useObligationPaymentRequestsQuery,
  useAcceptPaymentRequestMutation,
  useRejectPaymentRequestMutation,
  useCreateObligationEventDeleteRequestMutation,
  useRejectObligationEventDeleteRequestMutation,
  useAcceptObligationEventEditRequestMutation,
  useRejectObligationEventEditRequestMutation,
  useObligationEventViewerLinksQuery,
  useUpsertLinkEventToAccountMutation,
  useDeleteViewerEventLinkMutation,
  useObligationEventsQuery,
  useViewerPaymentRequestsQuery,
} from "../../services/queries/workspace-data";
import {
  type EntityAttachmentFile,
  useObligationEventAttachmentCountsQuery,
  useObligationEventAttachmentsQuery,
  useMovementAttachmentCountsQuery,
  useMovementAttachmentsQuery,
} from "../../services/queries/attachments";
import type {
  NotificationItem,
  ObligationEventSummary,
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../types/domain";
import {
  obligationHistoryEventColor,
  obligationHistoryEventAmountPrefix,
  obligationPendingDirectionBadge,
  obligationProgressPaidAdjective,
  obligationViewerActsAsCollector,
} from "../../lib/obligation-viewer-labels";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { PaymentRequestForm } from "../../components/forms/PaymentRequestForm";
import { PrincipalAdjustmentForm } from "../../components/forms/PrincipalAdjustmentForm";
import { ObligationEventEditRequestForm } from "../../components/forms/ObligationEventEditRequestForm";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DatePickerInput } from "../../components/ui/DatePickerInput";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { ObligationEventDeleteImpact } from "../../components/domain/ObligationEventDeleteImpact";
import { ObligationEventActionSheet } from "../../components/domain/ObligationEventActionSheet";
import { ObligationAnalyticsModal } from "../../components/domain/ObligationAnalyticsModal";
import { ObligationCapitalChangesModal } from "../../components/domain/ObligationCapitalChangesModal";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { getObligationStatusLabel } from "../../lib/obligation-labels";

const EVENT_LABEL_PAYABLE: Record<string, string> = {
  opening: "Apertura",
  payment: "Pago",
  principal_increase: "Aumento de capital",
  principal_decrease: "Reduccion de capital",
  interest: "Interes",
  fee: "Cargo",
  discount: "Descuento",
  adjustment: "Ajuste",
  writeoff: "Castigo",
};

type HistoryPreset = "month" | "3m" | "year" | "all" | "custom";

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

function mergePreviewAttachments(
  eventAttachments: EntityAttachmentFile[],
  movementAttachments: EntityAttachmentFile[],
): EntityAttachmentFile[] {
  const merged: EntityAttachmentFile[] = [];
  const seen = new Set<string>();
  for (const attachment of [...eventAttachments, ...movementAttachments]) {
    const key = attachment.fileName || attachment.filePath;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

function firstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

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

type PendingOwnerDeleteRequest = {
  notification: NotificationItem;
  payload: EventDeleteRequestPayload;
  event: ObligationEventSummary | null;
};

type EventEditRequestPayload = {
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

type EventEditStatus = {
  status: "pending" | "accepted" | "rejected";
  notification: NotificationItem;
  payload: EventEditRequestPayload;
};

type PendingOwnerEditRequest = {
  notification: NotificationItem;
  payload: EventEditRequestPayload;
  event: ObligationEventSummary | null;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toParamNumber(value: string | string[] | undefined): number | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

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

function readEventEditPayload(value: NotificationItem["payload"]): EventEditRequestPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const obligationId = Number(raw.obligationId ?? 0);
  const eventId = Number(raw.eventId ?? 0);
  if (!obligationId || !eventId) return null;
  return {
    obligationId,
    eventId,
    currencyCode: typeof raw.currencyCode === "string" ? raw.currencyCode : null,
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

function ownerDefaultAccountId(
  obligation: ObligationSummary | SharedObligationSummary | null,
): number | null {
  if (!obligation || "viewerMode" in obligation) return null;
  return (obligation as ObligationSummary).settlementAccountId ?? null;
}

function viewerEventAccountDelta(
  event: ObligationEventSummary | null,
  obligation: ObligationSummary | SharedObligationSummary | null,
): number {
  if (!event || !obligation) return 0;
  const viewerIsDebtor = obligation.direction === "receivable";
  if (event.eventType === "payment") {
    return viewerIsDebtor ? -event.amount : event.amount;
  }
  if (event.eventType === "principal_increase") {
    return viewerIsDebtor ? event.amount : -event.amount;
  }
  if (event.eventType === "principal_decrease") {
    return viewerIsDebtor ? -event.amount : event.amount;
  }
  return 0;
}

function ObligationDetailScreen() {
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const { showToast } = useToast();
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
  const [rejectingRequest, setRejectingRequest] = useState<ObligationPaymentRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [notificationRequestTarget, setNotificationRequestTarget] = useState<ObligationPaymentRequest | null>(null);
  const [ownerResponseAccountId, setOwnerResponseAccountId] = useState<number | null>(null);
  const [ownerEditResponseAccountId, setOwnerEditResponseAccountId] = useState<number | null>(null);
  const [ownerEditPreviousAccountId, setOwnerEditPreviousAccountId] = useState<number | null>(null);
  const [linkingEvent, setLinkingEvent] = useState<ObligationEventSummary | null>(null);
  const [linkingAccountId, setLinkingAccountId] = useState<number | null>(null);
  const [viewerDeleteRequestEvent, setViewerDeleteRequestEvent] = useState<ObligationEventSummary | null>(null);
  const [ownerDeleteRequestTarget, setOwnerDeleteRequestTarget] = useState<PendingOwnerDeleteRequest | null>(null);
  const [ownerEditRequestTarget, setOwnerEditRequestTarget] = useState<PendingOwnerEditRequest | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [highlightPulseOn, setHighlightPulseOn] = useState(false);
  const [pendingFocusEventId, setPendingFocusEventId] = useState<number | null>(null);
  const [detailViewportHeight, setDetailViewportHeight] = useState(0);
  const [eventFocusNotice, setEventFocusNotice] = useState<{
    tone: "info" | "success";
    text: string;
  } | null>(null);
  const [viewerDetailTab, setViewerDetailTab] = useState<"history" | "requests">("history");
  const [unlinkShareConfirmVisible, setUnlinkShareConfirmVisible] = useState(false);
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>("month");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const notificationPromptHandledRef = useRef<string | null>(null);
  const detailScrollRef = useRef<ScrollView | null>(null);
  const historySectionYRef = useRef<number | null>(null);
  const eventRowLayoutsRef = useRef<Map<number, { y: number; height: number }>>(new Map());
  const focusTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const deleteEventMutation = useDeleteObligationEventMutation();
  const shareMutation = useCreateObligationShareInviteMutation(activeWorkspaceId);
  const unlinkShareMutation = useUnlinkObligationShareMutation(activeWorkspaceId);
  const acceptRequestMutation = useAcceptPaymentRequestMutation();
  const rejectRequestMutation = useRejectPaymentRequestMutation();
  const createDeleteRequestMutation = useCreateObligationEventDeleteRequestMutation();
  const rejectDeleteRequestMutation = useRejectObligationEventDeleteRequestMutation();
  const acceptEditRequestMutation = useAcceptObligationEventEditRequestMutation();
  const rejectEditRequestMutation = useRejectObligationEventEditRequestMutation();
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
    const source = isSharedViewer ? remoteEvents ?? local : local;
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

  const filteredHistoryEvents = useMemo(() => {
    if (historyPreset === "all") {
      return eventsForDetail;
    }
    const from = historyFrom.trim();
    const to = historyTo.trim();
    if (!from || !to) {
      return eventsForDetail;
    }
    return eventsForDetail.filter((event) => {
      const d = event.eventDate.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [eventsForDetail, historyFrom, historyPreset, historyTo]);

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

  useEffect(() => {
    setViewerDetailTab("history");
    const { from, to } = currentMonthRangeYmd();
    setHistoryPreset("month");
    setHistoryFrom(from);
    setHistoryTo(to);
  }, [obligation?.id]);

  // Force-refetch attachment list every time the preview modal opens to bypass stale cache
  useEffect(() => {
    if (!eventAttachmentsVisible || !selectedEvent || !obligation) return;
    void queryClient.invalidateQueries({
      queryKey: ["entity-attachments", obligation.workspaceId, "obligation-event", selectedEvent.id],
    });
  }, [eventAttachmentsVisible, selectedEvent?.id, obligation?.workspaceId, queryClient]);

  function applyHistoryPreset(preset: HistoryPreset) {
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
  }

  function clearFocusTimers() {
    focusTimersRef.current.forEach((timer) => clearTimeout(timer));
    focusTimersRef.current = [];
  }

  function showEventFocusNotice(
    tone: "info" | "success",
    text: string,
  ) {
    setEventFocusNotice({ tone, text });
    const hideTimer = setTimeout(() => {
      setEventFocusNotice((current) => (current?.text === text ? null : current));
    }, 3200);
    focusTimersRef.current.push(hideTimer);
  }

  function pulseEventHighlight(eventId: number) {
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
  }

  function focusEventFromNotification(
    eventId: number,
    options?: {
      announce?: boolean;
      tone?: "info" | "success";
      message?: string;
      toastMessage?: string | null;
    },
  ) {
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
  }

  useEffect(() => () => {
    clearFocusTimers();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerEditAccounts() {
      if (!ownerEditRequestTarget?.event?.movementId || !supabase) {
        const fallbackAccountId = ownerDefaultAccountId(obligation);
        if (!cancelled) {
          setOwnerEditPreviousAccountId(fallbackAccountId);
          setOwnerEditResponseAccountId(fallbackAccountId);
        }
        return;
      }

      const { data, error } = await supabase
        .from("movements")
        .select("source_account_id, destination_account_id")
        .eq("id", ownerEditRequestTarget.event.movementId)
        .maybeSingle();

      const resolvedAccountId =
        data && !error
          ? Number((data as { source_account_id?: number | null; destination_account_id?: number | null }).source_account_id
            ?? (data as { source_account_id?: number | null; destination_account_id?: number | null }).destination_account_id
            ?? 0) || null
          : ownerDefaultAccountId(obligation);

      if (!cancelled) {
        setOwnerEditPreviousAccountId(resolvedAccountId);
        setOwnerEditResponseAccountId(resolvedAccountId);
      }
    }

    if (ownerEditRequestTarget) {
      void loadOwnerEditAccounts();
    } else {
      setOwnerEditPreviousAccountId(null);
      setOwnerEditResponseAccountId(null);
    }

    return () => {
      cancelled = true;
    };
  }, [obligation, ownerEditRequestTarget]);

  // Auto-link: when a request is accepted and viewer pre-selected an account,
  // auto-create their movement + link if not already done.
  const autoLinkedRef = useRef<Set<number>>(new Set());
  const autoDeletedViewerEventsRef = useRef<Set<number>>(new Set());
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
              // Allow retry next time the effect runs
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
        break; // Process one at a time to avoid concurrent mutations
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRequests, linkedEventIds.size]);

  useEffect(() => {
    if (!isSharedViewer || !obligation) return;
    for (const item of notifications) {
      if (item.kind !== "obligation_event_delete_accepted" && item.kind !== "obligation_event_deleted") continue;
      const payload = readEventDeletePayload(item.payload);
      if (!payload || payload.obligationId !== obligation.id) continue;
      if (autoDeletedViewerEventsRef.current.has(payload.eventId)) continue;
      const link = viewerLinks.find((entry) => entry.eventId === payload.eventId);
      if (!link) {
        autoDeletedViewerEventsRef.current.add(payload.eventId);
        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({
          queryKey: ["obligation-event-viewer-links", obligation.id, shareId ?? null],
        });
        continue;
      }
      if (deleteViewerLinkMutation.isPending) continue;

      autoDeletedViewerEventsRef.current.add(payload.eventId);
      deleteViewerLinkMutation.mutate(
        {
          linkId: link.id,
          movementId: link.movementId ?? null,
          obligationId: obligation.id,
          shareId,
        },
        {
          onError: () => {
            autoDeletedViewerEventsRef.current.delete(payload.eventId);
          },
          onSuccess: () => {
            showToast("Movimiento eliminado de tu cuenta", "success");
          },
        },
      );
      break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, viewerLinks, isSharedViewer, obligation?.id, shareId, deleteViewerLinkMutation.isPending]);

  useEffect(() => {
    if (!isSharedViewer || !obligation || deleteViewerLinkMutation.isPending) return;
    const liveEventIds = new Set(eventsForDetail.map((event) => event.id));
    const orphanLink = viewerLinks.find(
      (link) =>
        !liveEventIds.has(link.eventId) &&
        !autoDeletedViewerEventsRef.current.has(link.eventId),
    );
    if (!orphanLink) return;

    autoDeletedViewerEventsRef.current.add(orphanLink.eventId);
    deleteViewerLinkMutation.mutate(
      {
        linkId: orphanLink.id,
        movementId: orphanLink.movementId ?? null,
        obligationId: obligation.id,
        shareId,
      },
      {
        onError: () => {
          autoDeletedViewerEventsRef.current.delete(orphanLink.eventId);
        },
        onSuccess: () => {
          showToast("Movimiento eliminado de tu cuenta", "success");
        },
      },
    );
  }, [
    isSharedViewer,
    obligation,
    eventsForDetail,
    viewerLinks,
    shareId,
    deleteViewerLinkMutation.isPending,
    showToast,
  ]);

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
  ]);

  useEffect(() => {
    if (!pendingFocusEventId) return;
    const targetEvent = eventsForDetail.find((event) => event.id === pendingFocusEventId);
    if (!targetEvent) return;
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
  }, [pendingFocusEventId, eventsForDetail, historyPreset, historyFrom, historyTo]);

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
  ]);

  useEffect(() => {
    if (!notificationRequestTarget) return;
    setOwnerResponseAccountId(ownerDefaultAccountId(obligation));
  }, [notificationRequestTarget?.id, obligation]);

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
      showToast(
        result.emailSent
          ? `Invitacion enviada a ${result.invitedEmail}`
          : "Invitacion creada",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleUnlinkViewerShare() {
    if (!obligation || !isSharedViewer || !("share" in obligation)) return;
    try {
      await unlinkShareMutation.mutateAsync({
        shareId: obligation.share.id,
        workspaceId: obligation.share.workspaceId,
        obligationId: obligation.id,
      });
      setUnlinkShareConfirmVisible(false);
      showToast("Te desvinculaste de este registro compartido", "success");
      router.replace("/(app)/obligations");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const EDITABLE_TYPES = new Set(["payment", "principal_increase", "principal_decrease"]);

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
      const viewerEventLabel =
        linkingEvent.eventType === "payment"
          ? obligation.direction === "receivable" ? "pago" : "cobro"
          : linkingEvent.eventType === "principal_increase"
            ? obligation.direction === "receivable" ? "dinero recibido" : "prestamo entregado"
            : obligation.direction === "receivable" ? "devolucion de principal" : "pago de principal";
      showToast(
        existingLink
          ? "Cuenta asociada actualizada"
          : `${viewerEventLabel.charAt(0).toUpperCase() + viewerEventLabel.slice(1)} asociado a tu cuenta`,
        "success",
      );
      if (result.attachmentSyncError) {
        showToast(result.attachmentSyncError, "error");
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleAcceptRequest(req: ObligationPaymentRequest) {
    if (!obligation) return;
    const selectedAccountId = ownerResponseAccountId;
    try {
      await acceptRequestMutation.mutateAsync({
        requestId: req.id,
        obligationId: req.obligationId,
        workspaceId: req.workspaceId,
        amount: req.amount,
        paymentDate: req.paymentDate,
        installmentNo: req.installmentNo,
        description: req.description,
        accountId: selectedAccountId,
        createMovement: selectedAccountId != null,
        direction: obligation.direction,
        obligationTitle: obligation.title,
        viewerAccountId: req.viewerAccountId ?? null,
        viewerWorkspaceId: req.viewerWorkspaceId ?? null,
        viewerUserId: req.requestedByUserId,
        ownerUserId: profile?.id,
        shareId: req.shareId,
      });
      setNotificationRequestTarget(null);
      setOwnerResponseAccountId(null);
      const viewerAutoLinked = Boolean(req.viewerAccountId);
      showToast(
        viewerAutoLinked
          ? "Solicitud aceptada - el movimiento quedo registrado en la cuenta del solicitante"
          : "Solicitud aceptada y evento registrado",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  function openOwnerRequestDecision(req: ObligationPaymentRequest) {
    setNotificationRequestTarget(req);
    setOwnerResponseAccountId(ownerDefaultAccountId(obligation));
  }

  async function handleRejectRequest() {
    if (!rejectingRequest) return;
    try {
      await rejectRequestMutation.mutateAsync({
        requestId: rejectingRequest.id,
        obligationId: rejectingRequest.obligationId,
        rejectionReason: rejectReason.trim() || null,
        viewerUserId: rejectingRequest.requestedByUserId,
        ownerUserId: profile?.id,
        amount: rejectingRequest.amount,
        obligationTitle: obligation?.title,
      });
      setRejectingRequest(null);
      setNotificationRequestTarget(null);
      setOwnerResponseAccountId(null);
      setRejectReason("");
      showToast("Solicitud rechazada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleCreateDeleteRequest(event: ObligationEventSummary) {
    if (!obligation || !isSharedViewer || !profile?.id || !("share" in obligation)) return;
    try {
      await createDeleteRequestMutation.mutateAsync({
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
      });
      setViewerDeleteRequestEvent(null);
      showToast("Solicitud de eliminacion enviada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleApproveDeleteRequest(target: PendingOwnerDeleteRequest) {
    if (!obligation) return;
    try {
      await deleteEventMutation.mutateAsync({
        eventId: target.payload.eventId,
        obligationId: obligation.id,
        workspaceId: obligation.workspaceId,
        movementId: target.event?.movementId ?? null,
        ownerUserId: profile?.id,
        obligationTitle: obligation.title,
        amount: target.event?.amount ?? target.payload.amount,
        eventType: target.event?.eventType ?? target.payload.eventType,
        eventDate: target.event?.eventDate ?? target.payload.eventDate,
      });
      setOwnerDeleteRequestTarget(null);
      showToast(
        target.event ? "Solicitud aprobada y evento eliminado" : "Solicitud aprobada y pendiente resuelta",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleRejectDeleteRequest(target: PendingOwnerDeleteRequest) {
    if (!obligation || !profile?.id || !target.payload.requestedByUserId) return;
    try {
      await rejectDeleteRequestMutation.mutateAsync({
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId: profile.id,
        viewerUserId: target.payload.requestedByUserId,
        amount: target.payload.amount,
        eventType: target.payload.eventType,
        eventDate: target.payload.eventDate,
        obligationTitle: obligation.title,
      });
      setOwnerDeleteRequestTarget(null);
      showToast("Solicitud de eliminacion rechazada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleAcceptEditRequest(target: PendingOwnerEditRequest) {
    if (!obligation || !profile?.id) return;
    try {
      await acceptEditRequestMutation.mutateAsync({
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId: profile.id,
        viewerUserId: target.payload.requestedByUserId ?? "",
        obligationTitle: obligation.title,
        currencyCode: obligation.currencyCode,
        eventType: target.payload.eventType ?? target.event?.eventType ?? "payment",
        direction:
          (target.payload.eventType ?? target.event?.eventType) === "payment"
            ? obligation.direction
            : undefined,
        currentAmount: target.payload.currentAmount ?? target.event?.amount ?? null,
        currentEventDate: target.payload.currentEventDate ?? target.event?.eventDate ?? null,
        currentInstallmentNo: target.payload.currentInstallmentNo ?? target.event?.installmentNo ?? null,
        currentDescription: target.payload.currentDescription ?? target.event?.description ?? null,
        currentNotes: target.payload.currentNotes ?? target.event?.notes ?? null,
        proposedAmount: target.payload.proposedAmount ?? target.event?.amount ?? 0,
        proposedEventDate: target.payload.proposedEventDate ?? target.event?.eventDate ?? obligation.startDate,
        proposedInstallmentNo: target.payload.proposedInstallmentNo ?? null,
        proposedDescription: target.payload.proposedDescription ?? null,
        proposedNotes: target.payload.proposedNotes ?? null,
        accountId: ownerEditResponseAccountId,
      });
      setOwnerEditRequestTarget(null);
      showToast("Solicitud de edicion aprobada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleRejectEditRequest(target: PendingOwnerEditRequest) {
    if (!obligation || !profile?.id || !target.payload.requestedByUserId) return;
    try {
      await rejectEditRequestMutation.mutateAsync({
        obligationId: obligation.id,
        eventId: target.payload.eventId,
        ownerUserId: profile.id,
        viewerUserId: target.payload.requestedByUserId,
        currencyCode: obligation.currencyCode,
        obligationTitle: obligation.title,
        currentAmount: target.payload.currentAmount ?? target.event?.amount ?? null,
        currentEventDate: target.payload.currentEventDate ?? target.event?.eventDate ?? null,
        currentInstallmentNo: target.payload.currentInstallmentNo ?? target.event?.installmentNo ?? null,
        currentDescription: target.payload.currentDescription ?? target.event?.description ?? null,
        currentNotes: target.payload.currentNotes ?? target.event?.notes ?? null,
        proposedAmount: target.payload.proposedAmount ?? null,
        proposedEventDate: target.payload.proposedEventDate ?? null,
        proposedInstallmentNo: target.payload.proposedInstallmentNo ?? null,
        proposedDescription: target.payload.proposedDescription ?? null,
        proposedNotes: target.payload.proposedNotes ?? null,
      });
      setOwnerEditRequestTarget(null);
      showToast("Solicitud de edicion rechazada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
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
  const dirColor = isReceivable ? COLORS.income : COLORS.expense;
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
  const eventLabels = useMemo(() => {
    if (!obligation) return EVENT_LABEL_PAYABLE;
    const paymentWord = obligationViewerActsAsCollector(obligation.direction, isSharedViewer)
      ? "Cobro"
      : "Pago";
    return { ...EVENT_LABEL_PAYABLE, payment: paymentWord };
  }, [obligation, isSharedViewer]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={obligation?.title ?? "Obligacion"}
        subtitle={
          isSharedViewer && obligation && "share" in obligation
            ? `Compartido - ${(obligation as SharedObligationSummary).share.ownerDisplayName?.trim() || "Otro usuario"}`
            : activeWorkspace?.name
        }
        rightAction={
          <View style={styles.headerActions}>
            {obligation && !isSharedViewer ? (
              <>
                {pendingRequests.length > 0 ? (
                  <View style={styles.requestBadgeWrap}>
                    <View style={styles.requestBadge}>
                      <Text style={styles.requestBadgeText}>{pendingRequests.length}</Text>
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.shareBtn} onPress={() => { setShareEmail(""); setShareSheetOpen(true); }}>
                  <Text style={styles.shareBtnText}>Compartir</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {obligation && isSharedViewer ? (
              <TouchableOpacity
                style={[styles.shareBtn, styles.unlinkHeaderBtn]}
                onPress={() => setUnlinkShareConfirmVisible(true)}
              >
                <Text style={[styles.shareBtnText, styles.unlinkHeaderBtnText]}>Desvincular</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => router.replace("/(app)/obligations")}>
              <Text style={styles.back}>Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

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
          {/* Hero */}
          <Card style={styles.heroCard}>
            <Text style={[styles.directionBadge, { color: dirColor }]}>
              {obligationPendingDirectionBadge(obligation.direction, isSharedViewer)}
            </Text>
            <Text style={styles.counterparty}>{obligation.counterparty || "Sin contacto"}</Text>
            <Text style={[styles.pendingAmount, { color: dirColor }]}>
              {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
            </Text>
            <Text style={styles.pendingLabel}>pendiente</Text>
            <ProgressBar percent={capitalOverview.progressPercent} alertPercent={100} style={styles.progress} />
            <Text style={styles.progressLabel}>
              {Math.round(capitalOverview.progressPercent)}%{" "}
              {obligationProgressPaidAdjective(obligation.direction, isSharedViewer)} sobre un capital actual de{" "}
              {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
            </Text>
          </Card>

          <Card style={styles.capitalSummaryCard}>
            <Text style={styles.sectionTitle}>Resumen de capital</Text>
            <View style={styles.capitalSummaryGrid}>
              <View style={styles.capitalSummaryItem}>
                <Text style={styles.capitalSummaryLabel}>Inicio</Text>
                <Text style={styles.capitalSummaryValue}>
                  {formatCurrency(capitalOverview.openingAmount, obligation.currencyCode)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.capitalSummaryItem, styles.capitalSummaryAction]}
                activeOpacity={0.86}
                onPress={() => {
                  setCapitalChangesTab("increase");
                  setCapitalChangesVisible(true);
                }}
              >
                <Text style={styles.capitalSummaryLabel}>Aumentos</Text>
                <Text style={[styles.capitalSummaryValue, styles.capitalSummaryPositive]}>
                  +{formatCurrency(capitalOverview.increaseTotal, obligation.currencyCode)}
                </Text>
                <Text style={styles.capitalSummaryMeta}>
                  {capitalOverview.increaseCount} {capitalOverview.increaseCount === 1 ? "evento" : "eventos"}
                </Text>
                <Text style={styles.capitalSummaryLink}>Ver detalle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.capitalSummaryItem, styles.capitalSummaryAction]}
                activeOpacity={0.86}
                onPress={() => {
                  setCapitalChangesTab("decrease");
                  setCapitalChangesVisible(true);
                }}
              >
                <Text style={styles.capitalSummaryLabel}>Reducciones</Text>
                <Text style={[styles.capitalSummaryValue, styles.capitalSummaryNegative]}>
                  -{formatCurrency(capitalOverview.decreaseTotal, obligation.currencyCode)}
                </Text>
                <Text style={styles.capitalSummaryMeta}>
                  {capitalOverview.decreaseCount} {capitalOverview.decreaseCount === 1 ? "evento" : "eventos"}
                </Text>
                <Text style={styles.capitalSummaryLink}>Ver detalle</Text>
              </TouchableOpacity>
              <View style={styles.capitalSummaryItem}>
                <Text style={styles.capitalSummaryLabel}>Capital actual</Text>
                <Text style={styles.capitalSummaryValue}>
                  {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
                </Text>
              </View>
            </View>
          </Card>

          {!isSharedViewer ? (
            <View style={styles.detailActionsPanel}>
              <TouchableOpacity
                style={styles.detailPrimaryAction}
                onPress={() => setEditFormVisible(true)}
                activeOpacity={0.86}
              >
                <View style={styles.detailPrimaryIcon}>
                  <Pencil size={16} color={COLORS.bgVoid} strokeWidth={2.4} />
                </View>
                <View style={styles.detailActionCopy}>
                  <Text style={styles.detailPrimaryTitle}>Editar obligación</Text>
                  <Text style={styles.detailActionMeta}>Datos, fechas y cuenta</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.detailActionsRow}>
                <TouchableOpacity
                  style={[styles.detailActionSecondaryBtn, styles.detailActionIncreaseBtn]}
                  activeOpacity={0.86}
                  onPress={() => {
                    setEditingAdjustmentEvent(null);
                    setAdjustmentMode("increase");
                    setAdjustmentFormVisible(true);
                  }}
                >
                  <View style={[styles.detailActionIcon, styles.detailActionIncreaseIcon]}>
                    <Plus size={15} color={COLORS.income} strokeWidth={2.4} />
                  </View>
                  <Text style={[styles.detailActionSecondaryText, styles.detailActionIncreaseText]}>
                    Aumentar monto
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.detailActionSecondaryBtn, styles.detailActionDangerBtn]}
                  activeOpacity={0.86}
                  onPress={() => {
                    setEditingAdjustmentEvent(null);
                    setAdjustmentMode("decrease");
                    setAdjustmentFormVisible(true);
                  }}
                >
                  <View style={[styles.detailActionIcon, styles.detailActionDangerIcon]}>
                    <Minus size={15} color={COLORS.danger} strokeWidth={2.4} />
                  </View>
                  <Text style={[styles.detailActionSecondaryText, styles.detailActionDangerText]}>
                    Reducir monto
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Details */}
          <Card style={styles.detailInfoCard}>
            <View style={styles.detailInfoHeader}>
              <Text style={styles.sectionTitle}>Detalles</Text>
              <Text style={styles.detailInfoBadge}>{obligation.currencyCode}</Text>
            </View>
            <DetailRow label="Estado" value={getObligationStatusLabel(obligation.status)} />
            <Divider />
            <DetailRow
              label="Fecha inicio"
              value={format(parseDisplayDate(obligation.startDate), "d MMM yyyy", { locale: es })}
            />
            {obligation.dueDate ? (
              <>
                <Divider />
                <DetailRow
                  label="Vencimiento"
                  value={format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                />
              </>
            ) : null}
            {obligation.installmentAmount ? (
              <>
                <Divider />
                <DetailRow
                  label="Cuota"
                  value={`${formatCurrency(obligation.installmentAmount, obligation.currencyCode)}${obligation.installmentCount ? ` x ${obligation.installmentCount}` : ""}`}
                />
              </>
            ) : null}
            {obligation.interestRate ? (
              <>
                <Divider />
                <DetailRow label="Interes" value={`${obligation.interestRate}%`} />
              </>
            ) : null}
            {obligation.settlementAccountName ? (
              <>
                <Divider />
                <DetailRow label="Cuenta de liquidacion" value={obligation.settlementAccountName} />
              </>
            ) : null}
            {obligation.description?.trim() ? (
              <>
                <Divider />
                <DetailRow label="Descripcion" value={obligation.description.trim()} />
              </>
            ) : null}
            {obligation.notes?.trim() ? (
              <>
                <Divider />
                <DetailRow label="Notas" value={obligation.notes.trim()} />
              </>
            ) : null}
          </Card>

          {isSharedViewer ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actividad</Text>
              <View style={styles.viewerTabsRow}>
                <TouchableOpacity
                  style={[
                    styles.viewerTabChip,
                    viewerDetailTab === "history" && styles.viewerTabChipActive,
                  ]}
                  onPress={() => setViewerDetailTab("history")}
                  activeOpacity={0.86}
                >
                  <Text
                    style={[
                      styles.viewerTabChipText,
                      viewerDetailTab === "history" && styles.viewerTabChipTextActive,
                    ]}
                  >
                    Historial ({eventsForDetail.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.viewerTabChip,
                    viewerDetailTab === "requests" && styles.viewerTabChipActive,
                  ]}
                  onPress={() => setViewerDetailTab("requests")}
                  activeOpacity={0.86}
                >
                  <Text
                    style={[
                      styles.viewerTabChipText,
                      viewerDetailTab === "requests" && styles.viewerTabChipTextActive,
                    ]}
                  >
                    Mis solicitudes ({viewerRequests.length + viewerEditRequests.length + viewerDeleteRequests.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Events history */}
          {showViewerHistoryTab ? (
            <View
              style={styles.section}
              onLayout={(event) => {
                historySectionYRef.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionTitle}>Historial de eventos</Text>
              <Text style={styles.dateRangeCaption}>{historyDateRangeNotice}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyPresetRow}>
                {(
                  [
                    { id: "month" as HistoryPreset, label: "Mes actual" },
                    { id: "3m" as HistoryPreset, label: "3 meses" },
                    { id: "year" as HistoryPreset, label: "Este ano" },
                    { id: "all" as HistoryPreset, label: "Todo" },
                    { id: "custom" as HistoryPreset, label: "Rango..." },
                  ] as const
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterPill, historyPreset === opt.id && styles.filterPillActive]}
                    onPress={() => applyHistoryPreset(opt.id)}
                  >
                    <Text style={[styles.filterPillText, historyPreset === opt.id && styles.filterPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {historyPreset === "custom" ? (
                <View style={styles.customRange}>
                  <DatePickerInput
                    label="Desde"
                    value={historyFrom}
                    onChange={(value) => { setHistoryFrom(value); setHistoryPreset("custom"); }}
                    hideLabel
                    variant="formRow"
                  />
                  <DatePickerInput
                    label="Hasta"
                    value={historyTo}
                    onChange={(value) => { setHistoryTo(value); setHistoryPreset("custom"); }}
                    hideLabel
                    variant="formRow"
                    minimumDate={historyFrom ? ymdToLocalDate(historyFrom) : undefined}
                  />
                </View>
              ) : null}
              {eventFocusNotice ? (
                <View
                  style={[
                    styles.eventFocusNotice,
                    eventFocusNotice.tone === "success"
                      ? styles.eventFocusNoticeSuccess
                      : styles.eventFocusNoticeInfo,
                  ]}
                >
                  <Text
                    style={[
                      styles.eventFocusNoticeText,
                      eventFocusNotice.tone === "success"
                        ? styles.eventFocusNoticeTextSuccess
                        : styles.eventFocusNoticeTextInfo,
                    ]}
                  >
                    {eventFocusNotice.text}
                  </Text>
                </View>
              ) : null}
              {isSharedViewer && remoteEventsError && eventsForDetail.length === 0 ? (
                <Text style={styles.emptyHistory}>No pudimos cargar el historial.</Text>
              ) : isSharedViewer && remoteEventsPending && eventsForDetail.length === 0 ? (
                <Text style={styles.emptyHistory}>Cargando historial...</Text>
              ) : filteredHistoryEvents.length === 0 ? (
                <Text style={styles.emptyHistory}>
                  {eventsForDetail.length === 0
                    ? "Sin eventos registrados aun."
                    : "Ningun evento en este rango de fechas."}
                </Text>
              ) : filteredHistoryEvents.map((ev) => {
                const evTint = obligationHistoryEventColor(
                  ev.eventType,
                  obligation.direction,
                  isSharedViewer,
                );
                const evAmountPrefix = obligationHistoryEventAmountPrefix(
                  ev.eventType,
                  obligation.direction,
                  isSharedViewer,
                );
                const rowMovementId = isSharedViewer
                  ? viewerLinkByEventId.get(ev.id)?.movementId ?? null
                  : ev.movementId ?? null;
                const attachmentCount = Math.max(
                  eventAttachmentCounts[ev.id] ?? 0,
                  rowMovementId != null ? movementAttachmentCounts[rowMovementId] ?? 0 : 0,
                );
                const canHaveAttachments = ev.eventType === "payment";
                const showAttachmentLoading =
                  canHaveAttachments &&
                  (eventAttachmentCountsLoading || (rowMovementId != null && movementAttachmentCountsLoading));
                const isTappable = ev.eventType !== "opening";
                const isViewerLinkable =
                  isSharedViewer &&
                  (ev.eventType === "payment" ||
                    ev.eventType === "principal_increase" ||
                    ev.eventType === "principal_decrease");
                const isLinked = linkedEventIds.has(ev.id);
                const viewerDeleteStatus = viewerDeleteStatusByEventId.get(ev.id);
                const viewerEditStatus = viewerEditStatusByEventId.get(ev.id);
                const ownerDeleteRequest = !isSharedViewer ? ownerDeleteRequestByEventId.get(ev.id) ?? null : null;
                const isHighlighted = highlightedEventId === ev.id;
                const eventInlineDescription = firstMeaningfulText(ev.description, ev.reason);
                const eventInlineNotes = ev.notes?.trim() || null;
                const showEventInlineNotes =
                  eventInlineNotes != null &&
                  eventInlineNotes.length > 0 &&
                  eventInlineNotes !== eventInlineDescription;
                const eventDateLabel = format(parseDisplayDate(ev.eventDate), "d MMM yyyy", { locale: es });
                return (
                  <View
                    key={ev.id}
                    style={[
                      styles.eventRow,
                      isHighlighted && styles.eventRowHighlighted,
                      isHighlighted && highlightPulseOn && styles.eventRowHighlightedPulse,
                    ]}
                    onLayout={(event) => {
                      eventRowLayoutsRef.current.set(ev.id, {
                        y: event.nativeEvent.layout.y,
                        height: event.nativeEvent.layout.height,
                      });
                      if (pendingFocusEventId === ev.id) {
                        const focusTimer = setTimeout(() => {
                          focusEventFromNotification(ev.id, { announce: false });
                        }, 60);
                        focusTimersRef.current.push(focusTimer);
                      }
                    }}
                  >
                    <TouchableOpacity
                      style={styles.eventMainPress}
                      onPress={isTappable ? () => handleEventTap(ev) : undefined}
                      activeOpacity={isTappable ? 0.7 : 1}
                    >
                      <View style={[styles.eventAccent, { backgroundColor: evTint }]} />
                      <View style={styles.eventBody}>
                        <View style={styles.eventHeaderRow}>
                          <View style={styles.eventInfo}>
                            <Text style={[styles.eventType, { color: evTint }]} numberOfLines={1}>
                              {eventLabels[ev.eventType] ?? ev.eventType}
                            </Text>
                            <Text style={styles.eventDate}>{eventDateLabel}</Text>
                          </View>
                          <View style={styles.eventAmountGroup}>
                            <View
                              style={[
                                styles.eventAmountPill,
                                { backgroundColor: evTint + "12", borderColor: evTint + "42" },
                              ]}
                            >
                              <Text style={[styles.eventAmount, { color: evTint }]} numberOfLines={1}>
                                {evAmountPrefix}
                                {formatCurrency(ev.amount, obligation.currencyCode)}
                              </Text>
                            </View>
                            {isTappable ? <Text style={styles.eventChevron}>{">"}</Text> : null}
                          </View>
                        </View>
                        {eventInlineDescription ? (
                          <Text style={styles.eventDescription} numberOfLines={2}>
                            {eventInlineDescription}
                          </Text>
                        ) : !showEventInlineNotes ? (
                          <Text style={styles.eventDescriptionMuted}>
                            Este evento no tiene descripcion visible.
                          </Text>
                        ) : null}
                        {showEventInlineNotes ? (
                          <Text style={styles.eventNotes} numberOfLines={2}>
                            {eventInlineNotes}
                          </Text>
                        ) : null}
                        {ev.installmentNo ? (
                          <View style={styles.eventInlineMetaRow}>
                            <View style={styles.eventMetaChip}>
                              <Text style={styles.eventMetaChipText}>Cuota {ev.installmentNo}</Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {(showAttachmentLoading ||
                      (ev.movementId && !isSharedViewer) ||
                      attachmentCount > 0 ||
                      isViewerLinkable ||
                      ownerDeleteRequest) ? (
                      <View style={styles.eventAttachmentRow}>
                        {ev.movementId && !isSharedViewer ? (
                          <TouchableOpacity
                            style={styles.movementChip}
                            onPress={() => router.push(`/movement/${ev.movementId}`)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.movementChipText}>Mov.</Text>
                          </TouchableOpacity>
                        ) : null}
                        {showAttachmentLoading ? (
                          <View style={styles.eventAttachmentLoadingChip}>
                            <ActivityIndicator size="small" color={COLORS.storm} />
                            <Text style={styles.eventAttachmentLoadingText}>
                              Comprobando comprobante...
                            </Text>
                          </View>
                        ) : null}
                        {!showAttachmentLoading && attachmentCount > 0 ? (
                          <TouchableOpacity
                            style={styles.eventAttachmentChip}
                            onPress={() => {
                              setSelectedEvent(ev);
                              setEventMenuVisible(false);
                              setEventAttachmentsVisible(true);
                            }}
                            activeOpacity={0.86}
                          >
                            <Images size={12} color={COLORS.primary} />
                            <Text style={styles.eventAttachmentChipText}>
                              {attachmentCount === 1 ? "Ver comprobante" : `Ver ${attachmentCount} comprobantes`}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {ownerDeleteRequest ? (
                          <View style={styles.ownerEventDeletePendingChip}>
                            <Text style={styles.ownerEventDeletePendingText}>Eliminacion solicitada</Text>
                          </View>
                        ) : null}
                        {isViewerLinkable && (
                          isLinked ? (
                            <View style={styles.viewerAccountLinkedChip}>
                              <Text style={styles.viewerAccountLinkedText}>Cuenta asociada</Text>
                            </View>
                          ) : (
                            <View style={styles.viewerAccountUnlinkedChip}>
                              <Text style={styles.viewerAccountUnlinkedText}>Sin cuenta asociada</Text>
                            </View>
                          )
                        )}
                      </View>
                    ) : null}

                    {isSharedViewer && ev.eventType !== "opening" ? (
                      <View style={styles.viewerEventActions}>
                        {EDITABLE_TYPES.has(ev.eventType) && viewerEditStatus?.status === "pending" ? (
                          <View style={styles.viewerEditPendingChip}>
                            <Text style={styles.viewerEditPendingText}>Edicion pendiente</Text>
                          </View>
                        ) : null}
                        {viewerDeleteStatus?.status === "pending" ? (
                          <View style={styles.viewerDeletePendingChip}>
                            <Text style={styles.viewerDeletePendingText}>Eliminacion pendiente</Text>
                          </View>
                        ) : viewerDeleteStatus?.status === "accepted" ? (
                          <View style={styles.viewerDeleteAcceptedChip}>
                            <Text style={styles.viewerDeleteAcceptedText}>Eliminacion aprobada</Text>
                          </View>
                        ) : null}
                        {viewerEditStatus?.status !== "pending" &&
                        viewerDeleteStatus?.status !== "pending" &&
                        viewerDeleteStatus?.status !== "accepted" ? (
                          <Text style={styles.viewerEventManageHint}>
                            Toca la tarjeta para gestionar
                          </Text>
                        ) : null}
                        {viewerEditStatus?.status === "rejected" ? (
                          <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                            {viewerEditStatus.payload.rejectionReason?.trim()
                              ? `Edicion rechazada: ${viewerEditStatus.payload.rejectionReason.trim()}`
                              : "La solicitud de edicion anterior fue rechazada"}
                          </Text>
                        ) : null}
                        {viewerDeleteStatus?.status === "rejected" ? (
                          <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                            {viewerDeleteStatus.payload.rejectionReason?.trim()
                              ? `Rechazada: ${viewerDeleteStatus.payload.rejectionReason.trim()}`
                              : "La solicitud anterior fue rechazada"}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {!isSharedViewer && pendingOwnerDeleteRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Solicitudes de eliminacion ({pendingOwnerDeleteRequests.length})
              </Text>
              {pendingOwnerDeleteRequests.map((req) => {
                const targetType = req.event?.eventType ?? req.payload.eventType ?? null;
                const targetLabel = targetType ? eventLabels[targetType] ?? targetType : "Evento";
                const targetAmount = req.event?.amount ?? req.payload.amount ?? null;
                const targetDate = req.event?.eventDate ?? req.payload.eventDate ?? obligation.startDate;
                const targetTint = req.event
                  ? obligationHistoryEventColor(req.event.eventType, obligation.direction, false)
                  : COLORS.danger;
                const targetPrefix = req.event
                  ? obligationHistoryEventAmountPrefix(req.event.eventType, obligation.direction, false)
                  : "";
                const targetDescription = req.event
                  ? firstMeaningfulText(req.event.description, req.event.reason, req.event.notes)
                  : null;
                return (
                  <View key={req.notification.id} style={styles.ownerDeleteRequestCard}>
                    <View style={styles.ownerDeleteRequestHeader}>
                      <View style={styles.ownerDeleteRequestTitleWrap}>
                        <Text style={styles.ownerDeleteRequestEyebrow}>Solicitud de eliminacion</Text>
                        <Text style={styles.ownerDeleteRequestTitle} numberOfLines={1}>
                          {req.payload.requestedByDisplayName ?? "Visualizador compartido"}
                        </Text>
                      </View>
                      <View style={styles.ownerDeleteRequestStatus}>
                        <Text style={styles.ownerDeleteRequestStatusText}>Pendiente</Text>
                      </View>
                    </View>

                    <View style={styles.ownerDeleteTargetCard}>
                      <View style={[styles.ownerDeleteTargetAccent, { backgroundColor: targetTint }]} />
                      <View style={styles.ownerDeleteTargetBody}>
                        <View style={styles.ownerDeleteTargetTopRow}>
                          <View style={styles.ownerDeleteTargetInfo}>
                            <Text style={[styles.ownerDeleteTargetType, { color: targetTint }]} numberOfLines={1}>
                              {targetLabel}
                            </Text>
                            <Text style={styles.ownerDeleteTargetDate}>
                              {format(parseDisplayDate(targetDate), "d MMM yyyy", { locale: es })}
                            </Text>
                          </View>
                          <Text style={[styles.ownerDeleteTargetAmount, { color: targetTint }]} numberOfLines={1}>
                            {targetAmount != null
                              ? `${targetPrefix}${formatCurrency(targetAmount, obligation.currencyCode)}`
                              : "Sin monto"}
                          </Text>
                        </View>
                        {targetDescription ? (
                          <Text style={styles.ownerDeleteTargetDesc} numberOfLines={2}>
                            {targetDescription}
                          </Text>
                        ) : (
                          <Text style={styles.ownerDeleteTargetDescMuted}>
                            {req.event
                              ? "Este evento no tiene descripcion visible."
                              : "El evento ya no esta disponible en el historial."}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.ownerDeleteRequestActions}>
                      {req.event ? (
                        <TouchableOpacity
                          style={styles.ownerDeleteFocusBtn}
                          onPress={() => {
                            setPendingFocusEventId(req.event?.id ?? null);
                            if (req.event) {
                              focusEventFromNotification(req.event.id, {
                                tone: "info",
                                message: "Evento de la solicitud resaltado en el historial.",
                                toastMessage: "Evento resaltado",
                              });
                            }
                          }}
                          activeOpacity={0.86}
                        >
                          <Text style={styles.ownerDeleteFocusText}>Ver evento</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.requestNoAccount}>
                          Puedes aceptar para cerrar la solicitud pendiente.
                        </Text>
                      )}
                      <View style={styles.ownerDeleteDecisionActions}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => void handleApproveDeleteRequest(req)}
                          disabled={deleteEventMutation.isPending}
                        >
                          <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => void handleRejectDeleteRequest(req)}
                          disabled={rejectDeleteRequestMutation.isPending}
                        >
                          <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {!isSharedViewer && pendingOwnerEditRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Solicitudes de edicion ({pendingOwnerEditRequests.length})
              </Text>
              {pendingOwnerEditRequests.map((req) => (
                <View key={req.notification.id} style={styles.requestCard}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName}>
                      {req.payload.requestedByDisplayName ?? "Visualizador compartido"}
                    </Text>
                    <Text style={styles.requestAmount}>
                      {req.payload.proposedAmount != null
                        ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                        : req.event
                          ? formatCurrency(req.event.amount, obligation.currencyCode)
                          : "Evento"}
                    </Text>
                    <Text style={styles.requestDate}>
                      {format(
                        parseDisplayDate(
                          req.payload.proposedEventDate ?? req.event?.eventDate ?? obligation.startDate,
                        ),
                        "d MMM yyyy",
                        { locale: es },
                      )}
                    </Text>
                    <Text style={styles.requestDesc} numberOfLines={2}>
                      {req.payload.proposedDescription?.trim()
                        || req.event?.description?.trim()
                        || (req.payload.eventType ? eventLabels[req.payload.eventType] ?? req.payload.eventType : "Evento")}
                    </Text>
                    <Text style={styles.viewerRequestNote}>
                      Antes:{" "}
                      {req.payload.currentAmount != null
                        ? formatCurrency(req.payload.currentAmount, obligation.currencyCode)
                        : req.event
                          ? formatCurrency(req.event.amount, obligation.currencyCode)
                          : "Sin dato"}
                      {"  "}
                      Ahora:{" "}
                      {req.payload.proposedAmount != null
                        ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                        : "Sin cambio"}
                    </Text>
                    {!req.event ? (
                      <Text style={styles.requestNoAccount}>
                        El evento ya no esta disponible para editar.
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => setOwnerEditRequestTarget(req)}
                      disabled={acceptEditRequestMutation.isPending || !req.event}
                    >
                      <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => setOwnerEditRequestTarget(req)}
                      disabled={rejectEditRequestMutation.isPending}
                    >
                      <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Pending payment requests (owner view) */}
          {!isSharedViewer && pendingRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Solicitudes pendientes ({pendingRequests.length})
              </Text>
              {pendingRequests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName}>
                      {req.requestedByDisplayName ?? "Visualizador compartido"}
                    </Text>
                    <Text style={styles.requestAmount}>
                      {formatCurrency(req.amount, obligation.currencyCode)}
                    </Text>
                    <Text style={styles.requestDate}>
                      {format(parseDisplayDate(req.paymentDate), "d MMM yyyy", { locale: es })}
                    </Text>
                    {req.description ? (
                      <Text style={styles.requestDesc} numberOfLines={2}>{req.description}</Text>
                    ) : null}
                    {req.viewerAccountId ? (
                      <View style={styles.requestAccountChip}>
                        <Text style={styles.requestAccountChipText}>
                          Se registrara en su cuenta al aceptar
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.requestNoAccount}>Sin cuenta asociada</Text>
                    )}
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => openOwnerRequestDecision(req)}
                      disabled={acceptRequestMutation.isPending}
                    >
                      <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => { setRejectingRequest(req); setRejectReason(""); }}
                    >
                      <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Viewer: mis solicitudes */}
          {showViewerRequestsTab &&
          (viewerRequests.length > 0 || viewerEditRequests.length > 0 || viewerDeleteRequests.length > 0) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mis solicitudes</Text>
              <Text style={styles.sectionHint}>
                Seguimiento de lo que enviaste al propietario y aun requiere respuesta o ya fue respondido.
              </Text>
            </View>
          ) : null}

          {showViewerRequestsTab && viewerRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.requestGroupTitle}>Pagos y cobros</Text>
              {viewerRequests.map((req) => {
                const isPending = req.status === "pending";
                const isAccepted = req.status === "accepted";
                const isRejected = req.status === "rejected";
                const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
                const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
                const autoLinked = isAccepted && req.acceptedEventId != null && linkedEventIds.has(req.acceptedEventId);
                return (
                  <View
                    key={req.id}
                    style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
                  >
                    <View style={styles.viewerRequestHeader}>
                      <Text style={styles.viewerRequestAmount}>
                        {formatCurrency(req.amount, obligation.currencyCode)}
                      </Text>
                      <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.viewerRequestDate}>
                      {format(parseDisplayDate(req.paymentDate), "d MMM yyyy", { locale: es })}
                    </Text>
                    {req.description ? (
                      <Text style={styles.viewerRequestDesc} numberOfLines={1}>{req.description}</Text>
                    ) : null}
                    {isAccepted && autoLinked ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                        Movimiento registrado en tu cuenta
                      </Text>
                    ) : isAccepted && !autoLinked && req.viewerAccountId ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.warning }]}>
                        Registrando movimiento...
                      </Text>
                    ) : isAccepted ? (
                      <Text style={styles.viewerRequestNote}>Sin cuenta asociada - asocia el evento manualmente</Text>
                    ) : null}
                    {isRejected && req.rejectionReason ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                        Motivo: {req.rejectionReason}
                      </Text>
                    ) : null}
                    {isPending ? (
                      <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {showViewerRequestsTab && viewerEditRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.requestGroupTitle}>Cambios de evento</Text>
              {viewerEditRequests.map((req) => {
                const isPending = req.status === "pending";
                const isAccepted = req.status === "accepted";
                const isRejected = req.status === "rejected";
                const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
                const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
                return (
                  <View
                    key={req.notification.id}
                    style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
                  >
                    <View style={styles.viewerRequestHeader}>
                      <Text style={styles.viewerRequestAmount}>
                        {req.payload.proposedAmount != null
                          ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                          : "Edicion"}
                      </Text>
                      <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.viewerRequestDate}>
                      {format(
                        parseDisplayDate(
                          req.payload.proposedEventDate ?? req.payload.currentEventDate ?? obligation.startDate,
                        ),
                        "d MMM yyyy",
                        { locale: es },
                      )}
                    </Text>
                    <Text style={styles.viewerRequestDesc} numberOfLines={2}>
                      {req.payload.proposedDescription?.trim()
                        || req.payload.currentDescription?.trim()
                        || "Cambio en el evento"}
                    </Text>
                    <Text style={styles.viewerRequestNote}>
                      Antes:{" "}
                      {req.payload.currentAmount != null
                        ? formatCurrency(req.payload.currentAmount, obligation.currencyCode)
                        : "Sin dato"}
                      {"  "}
                      Ahora:{" "}
                      {req.payload.proposedAmount != null
                        ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                        : "Sin cambio"}
                    </Text>
                    {isAccepted ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                        La edicion fue aprobada y el evento ya se actualizo.
                      </Text>
                    ) : null}
                    {isRejected ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                        {req.payload.rejectionReason?.trim()
                          ? `Motivo: ${req.payload.rejectionReason.trim()}`
                          : "La solicitud fue rechazada"}
                      </Text>
                    ) : null}
                    {isPending ? (
                      <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {showViewerRequestsTab && viewerDeleteRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.requestGroupTitle}>Eliminaciones de evento</Text>
              {viewerDeleteRequests.map((req) => {
                const isPending = req.status === "pending";
                const isAccepted = req.status === "accepted";
                const isRejected = req.status === "rejected";
                const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
                const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
                const targetEvent = eventsForDetail.find((event) => event.id === req.payload.eventId) ?? null;
                const targetType = targetEvent?.eventType ?? req.payload.eventType ?? null;
                const targetLabel = targetType ? eventLabels[targetType] ?? targetType : "Evento";
                const targetDate = targetEvent?.eventDate ?? req.payload.eventDate ?? obligation.startDate;
                const targetAmount = targetEvent?.amount ?? req.payload.amount ?? null;
                const targetDescription = targetEvent
                  ? firstMeaningfulText(targetEvent.description, targetEvent.reason, targetEvent.notes)
                  : null;
                return (
                  <View
                    key={req.notification.id}
                    style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
                  >
                    <View style={styles.viewerRequestHeader}>
                      <Text style={styles.viewerRequestAmount}>
                        {targetAmount != null
                          ? formatCurrency(targetAmount, obligation.currencyCode)
                          : "Eliminacion"}
                      </Text>
                      <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.viewerRequestDate}>
                      {format(parseDisplayDate(targetDate), "d MMM yyyy", { locale: es })}
                    </Text>
                    <Text style={styles.viewerRequestDesc} numberOfLines={2}>
                      {targetDescription ?? targetLabel}
                    </Text>
                    {isAccepted ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                        La eliminacion fue aprobada.
                      </Text>
                    ) : null}
                    {isRejected ? (
                      <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                        {req.payload.rejectionReason?.trim()
                          ? `Motivo: ${req.payload.rejectionReason.trim()}`
                          : "La solicitud fue rechazada"}
                      </Text>
                    ) : null}
                    {isPending ? (
                      <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {showViewerRequestsTab &&
          viewerRequests.length === 0 &&
          viewerEditRequests.length === 0 &&
          viewerDeleteRequests.length === 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mis solicitudes</Text>
              <View style={styles.viewerEmptyState}>
                <Text style={styles.viewerEmptyStateText}>
                  Aún no tienes solicitudes en esta obligación.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Action button */}
          {obligation.status === "active" ? (
            isSharedViewer ? (
              <TouchableOpacity style={styles.payBtn} onPress={() => setPaymentRequestFormVisible(true)}>
                <Text style={styles.payBtnText}>
                  {obligationViewerActsAsCollector(obligation.direction, true)
                    ? "Solicitar cobro"
                    : "Solicitar pago"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.payBtn} onPress={() => setPaymentFormVisible(true)}>
                <Text style={styles.payBtnText}>
                  {obligationViewerActsAsCollector(obligation.direction, false)
                    ? "Registrar cobro"
                    : "Registrar pago"}
                </Text>
              </TouchableOpacity>
            )
          ) : null}
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

      {/* Asociar evento a cuenta (shared viewer) */}
      <Modal
        visible={Boolean(linkingEvent)}
        transparent
        animationType="fade"
        onRequestClose={() => { setLinkingEvent(null); setLinkingAccountId(null); }}
      >
        <Pressable style={styles.overlay} onPress={() => { setLinkingEvent(null); setLinkingAccountId(null); }}>
          <View
            style={[styles.linkSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.eventMenuHandle} />
            <Text style={styles.linkSheetTitle}>
              {linkingEvent && viewerLinkByEventId.get(linkingEvent.id)
                ? "Cambiar cuenta asociada"
                : "Asociar a una cuenta"}
            </Text>
            {linkingEvent && obligation ? (
              <Text style={styles.linkSheetSub}>
                {linkingEvent.eventType === "payment"
                  ? (obligationViewerActsAsCollector(obligation.direction, true) ? "Cobro" : "Pago")
                  : linkingEvent.eventType === "principal_increase"
                    ? (obligation.direction === "receivable" ? "Dinero recibido" : "Prestamo entregado")
                    : (obligation.direction === "receivable" ? "Devolucion de principal" : "Pago de principal")}{" "}
                de {formatCurrency(linkingEvent.amount, obligation.currencyCode)}{" "}
                - {format(parseDisplayDate(linkingEvent.eventDate), "d MMM yyyy", { locale: es })}
              </Text>
            ) : null}
            <Text style={styles.linkSheetHint}>
              {linkingEvent && viewerLinkByEventId.get(linkingEvent.id)
                ? "Elige la nueva cuenta en la que se reflejara este movimiento"
                : "Elige la cuenta en la que se refleja este movimiento"}
            </Text>
            {(snapshot?.accounts ?? []).filter((a) => !a.isArchived).map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.linkAccountRow,
                  linkingAccountId === acc.id && styles.linkAccountRowSelected,
                ]}
                onPress={() => setLinkingAccountId(acc.id)}
              >
                <View style={styles.linkAccountInfo}>
                  <Text style={styles.linkAccountName}>{acc.name}</Text>
                  <Text style={styles.linkAccountBalance}>
                    {formatCurrency(acc.currentBalance, acc.currencyCode)}
                  </Text>
                </View>
                {linkingAccountId === acc.id ? (
                  <Text style={styles.linkAccountCheck}>OK</Text>
                ) : null}
              </TouchableOpacity>
            ))}
            {viewerProjectedAccount && viewerProjectedBalance != null ? (
              <View style={styles.accountProjectionCard}>
                <Text style={styles.accountProjectionTitle}>Proyectado para {viewerProjectedAccount.name}</Text>
                <View style={styles.accountProjectionRow}>
                  <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                  <Text style={styles.accountProjectionValue}>
                    {formatCurrency(viewerProjectedAccount.currentBalance, viewerProjectedAccount.currencyCode)}
                  </Text>
                </View>
                <View style={styles.accountProjectionRow}>
                  <Text style={styles.accountProjectionLabel}>Movimiento</Text>
                  <Text
                    style={[
                      styles.accountProjectionValue,
                      viewerLinkDelta >= 0 ? styles.accountProjectionPositive : styles.accountProjectionNegative,
                    ]}
                  >
                    {viewerLinkDelta >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(viewerLinkDelta), viewerProjectedAccount.currencyCode)}
                  </Text>
                </View>
                <View style={styles.accountProjectionRow}>
                  <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                  <Text style={styles.accountProjectionStrong}>
                    {formatCurrency(viewerProjectedBalance, viewerProjectedAccount.currencyCode)}
                  </Text>
                </View>
              </View>
            ) : null}
            {(snapshot?.accounts ?? []).filter((a) => !a.isArchived).length === 0 ? (
              <Text style={styles.linkNoAccounts}>No tienes cuentas registradas en este workspace</Text>
            ) : null}
            <Button
              label="Confirmar asociacion"
              onPress={handleLinkEvent}
              loading={linkEventMutation.isPending}
              style={{ marginTop: SPACING.sm, opacity: linkingAccountId ? 1 : 0.4 }}
            />
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

      <Modal
        visible={Boolean(notificationRequestTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => { setNotificationRequestTarget(null); setOwnerResponseAccountId(null); }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => { setNotificationRequestTarget(null); setOwnerResponseAccountId(null); }}
        >
          <View
            style={[styles.linkSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.linkSheetTitle}>Responder solicitud</Text>
            {notificationRequestTarget && obligation ? (
              <>
                <Text style={styles.linkSheetSub}>
                  {formatCurrency(notificationRequestTarget.amount, obligation.currencyCode)}
                  {" - "}
                  {format(parseDisplayDate(notificationRequestTarget.paymentDate), "d MMM yyyy", { locale: es })}
                </Text>
                {notificationRequestTarget.description ? (
                  <Text style={styles.viewerRequestDesc}>{notificationRequestTarget.description}</Text>
                ) : null}
                <Text style={styles.linkSheetHint}>{ownerAccountQuestion}</Text>
                <Text style={styles.ownerAccountLabel}>{ownerAccountLabel}</Text>
                {ownerAccounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.linkAccountRow,
                      ownerResponseAccountId === acc.id && styles.linkAccountRowSelected,
                    ]}
                    onPress={() => setOwnerResponseAccountId(acc.id)}
                  >
                    <View style={styles.linkAccountInfo}>
                      <Text style={styles.linkAccountName}>{acc.name}</Text>
                      <Text style={styles.linkAccountBalance}>
                        {formatCurrency(acc.currentBalance, acc.currencyCode)}
                      </Text>
                    </View>
                    {ownerResponseAccountId === acc.id ? (
                      <Text style={styles.linkAccountCheck}>OK</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {ownerProjectedAccount && ownerProjectedBalance != null ? (
                  <View style={styles.accountProjectionCard}>
                    <Text style={styles.accountProjectionTitle}>Proyectado para {ownerProjectedAccount.name}</Text>
                    <View style={styles.accountProjectionRow}>
                      <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                      <Text style={styles.accountProjectionValue}>
                        {formatCurrency(ownerProjectedAccount.currentBalance, ownerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.accountProjectionRow}>
                      <Text style={styles.accountProjectionLabel}>Movimiento</Text>
                      <Text
                        style={[
                          styles.accountProjectionValue,
                          ownerRequestDelta >= 0 ? styles.accountProjectionPositive : styles.accountProjectionNegative,
                        ]}
                      >
                        {ownerRequestDelta >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(ownerRequestDelta), ownerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                    <View style={styles.accountProjectionRow}>
                      <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                      <Text style={styles.accountProjectionStrong}>
                        {formatCurrency(ownerProjectedBalance, ownerProjectedAccount.currencyCode)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.linkAccountRow,
                    ownerResponseAccountId == null && styles.linkAccountRowSelected,
                  ]}
                  onPress={() => setOwnerResponseAccountId(null)}
                >
                  <View style={styles.linkAccountInfo}>
                    <Text style={styles.linkAccountName}>No registrar movimiento contable</Text>
                    <Text style={styles.linkAccountBalance}>Solo aceptar la solicitud sin cambiar tus cuentas</Text>
                  </View>
                  {ownerResponseAccountId == null ? (
                    <Text style={styles.linkAccountCheck}>OK</Text>
                  ) : null}
                </TouchableOpacity>
              </>
            ) : null}
            <Button
              label="Aceptar"
              onPress={() => {
                if (notificationRequestTarget) {
                  void handleAcceptRequest(notificationRequestTarget);
                }
              }}
              loading={acceptRequestMutation.isPending}
            />
            <Button
              label="Rechazar"
              variant="ghost"
              onPress={() => {
                if (notificationRequestTarget) {
                  setRejectingRequest(notificationRequestTarget);
                  setRejectReason("");
                  setNotificationRequestTarget(null);
                  setOwnerResponseAccountId(null);
                }
              }}
              style={styles.rejectConfirmBtn}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => { setNotificationRequestTarget(null); setOwnerResponseAccountId(null); }}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(ownerDeleteRequestTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setOwnerDeleteRequestTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setOwnerDeleteRequestTarget(null)}>
          <View
            style={[styles.rejectSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.rejectTitle}>Responder eliminacion</Text>
            {ownerDeleteRequestTarget && obligation ? (
              <>
                <Text style={styles.rejectSub}>
                  {ownerDeleteRequestTarget.payload.requestedByDisplayName ?? "Visualizador compartido"}
                  {" - "}
                  {ownerDeleteRequestTarget.event
                    ? formatCurrency(ownerDeleteRequestTarget.event.amount, obligation.currencyCode)
                    : ownerDeleteRequestTarget.payload.amount != null
                      ? formatCurrency(ownerDeleteRequestTarget.payload.amount, obligation.currencyCode)
                      : "Evento"}
                </Text>
                {ownerDeleteRequestTarget.event ? (
                  <ObligationEventDeleteImpact
                    event={ownerDeleteRequestTarget.event}
                    obligation={obligation}
                    accounts={snapshot?.accounts ?? []}
                    actor="owner"
                  />
                ) : (
                  <Text style={styles.viewerRequestNote}>
                    El evento ya no esta disponible. Aun puedes aprobar para cerrar la solicitud.
                  </Text>
                )}
              </>
            ) : null}
            <Button
              label="Aprobar"
              onPress={() => {
                if (ownerDeleteRequestTarget) {
                  void handleApproveDeleteRequest(ownerDeleteRequestTarget);
                }
              }}
              loading={deleteEventMutation.isPending}
            />
            <Button
              label="Rechazar"
              variant="ghost"
              onPress={() => {
                if (ownerDeleteRequestTarget) {
                  void handleRejectDeleteRequest(ownerDeleteRequestTarget);
                }
              }}
              loading={rejectDeleteRequestMutation.isPending}
              style={styles.rejectConfirmBtn}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setOwnerDeleteRequestTarget(null)}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(ownerEditRequestTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setOwnerEditRequestTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setOwnerEditRequestTarget(null)}>
          <View
            style={[styles.rejectSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.rejectTitle}>Responder edicion</Text>
            {ownerEditRequestTarget && obligation ? (
              <>
                <Text style={styles.rejectSub}>
                  {ownerEditRequestTarget.payload.requestedByDisplayName ?? "Visualizador compartido"}
                  {" - "}
                  {ownerEditRequestTarget.payload.proposedAmount != null
                    ? formatCurrency(ownerEditRequestTarget.payload.proposedAmount, obligation.currencyCode)
                    : "Edicion"}
                </Text>
                <View style={styles.ownerEditSummaryCard}>
                  <View style={styles.ownerEditSummaryRow}>
                    <Text style={styles.ownerEditSummaryLabel}>Monto actual</Text>
                    <Text style={styles.ownerEditSummaryValue}>
                      {ownerEditRequestTarget.payload.currentAmount != null
                        ? formatCurrency(ownerEditRequestTarget.payload.currentAmount, obligation.currencyCode)
                        : "Sin dato"}
                    </Text>
                  </View>
                  <View style={styles.ownerEditSummaryRow}>
                    <Text style={styles.ownerEditSummaryLabel}>Monto propuesto</Text>
                    <Text style={styles.ownerEditSummaryStrong}>
                      {ownerEditRequestTarget.payload.proposedAmount != null
                        ? formatCurrency(ownerEditRequestTarget.payload.proposedAmount, obligation.currencyCode)
                        : "Sin cambio"}
                    </Text>
                  </View>
                  <View style={styles.ownerEditSummaryRow}>
                    <Text style={styles.ownerEditSummaryLabel}>Fecha actual</Text>
                    <Text style={styles.ownerEditSummaryValue}>
                      {ownerEditRequestTarget.payload.currentEventDate
                        ? format(parseDisplayDate(ownerEditRequestTarget.payload.currentEventDate), "d MMM yyyy", { locale: es })
                        : "Sin dato"}
                    </Text>
                  </View>
                  <View style={styles.ownerEditSummaryRow}>
                    <Text style={styles.ownerEditSummaryLabel}>Fecha propuesta</Text>
                    <Text style={styles.ownerEditSummaryValue}>
                      {ownerEditRequestTarget.payload.proposedEventDate
                        ? format(parseDisplayDate(ownerEditRequestTarget.payload.proposedEventDate), "d MMM yyyy", { locale: es })
                        : "Sin cambio"}
                    </Text>
                  </View>
                  {ownerEditRequestTarget.payload.proposedDescription?.trim() ? (
                    <Text style={styles.viewerRequestNote}>
                      Descripcion: {ownerEditRequestTarget.payload.proposedDescription.trim()}
                    </Text>
                  ) : null}
                  {ownerEditRequestTarget.payload.proposedNotes?.trim() ? (
                    <Text style={styles.viewerRequestNote}>
                      Notas: {ownerEditRequestTarget.payload.proposedNotes.trim()}
                    </Text>
                  ) : null}
                </View>
                {!ownerEditRequestTarget.event ? (
                  <Text style={styles.viewerRequestNote}>
                    El evento ya no esta disponible para editar.
                  </Text>
                ) : null}
                {ownerEditRequestTarget.event && ownerAccounts.length > 0 ? (
                  <>
                    <Text style={styles.linkSheetHint}>
                      Elige la cuenta donde quedara reflejado este movimiento despues de aprobar la edicion
                    </Text>
                    <Text style={styles.ownerAccountLabel}>{ownerAccountLabel}</Text>
                    {ownerAccounts.map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.linkAccountRow,
                          ownerEditResponseAccountId === acc.id && styles.linkAccountRowSelected,
                        ]}
                        onPress={() => setOwnerEditResponseAccountId(acc.id)}
                      >
                        <View style={styles.linkAccountInfo}>
                          <Text style={styles.linkAccountName}>{acc.name}</Text>
                          <Text style={styles.linkAccountBalance}>
                            {formatCurrency(acc.currentBalance, acc.currencyCode)}
                          </Text>
                        </View>
                        {ownerEditResponseAccountId === acc.id ? (
                          <Text style={styles.linkAccountCheck}>OK</Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                    {ownerEditPreviousAccount && ownerEditPreviousProjectedBalance != null ? (
                      <View style={styles.accountProjectionCard}>
                        <Text style={styles.accountProjectionTitle}>
                          Asi quedara la cuenta anterior: {ownerEditPreviousAccount.name}
                        </Text>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                          <Text style={styles.accountProjectionValue}>
                            {formatCurrency(ownerEditPreviousAccount.currentBalance, ownerEditPreviousAccount.currencyCode)}
                          </Text>
                        </View>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>Reversion del movimiento actual</Text>
                          <Text
                            style={[
                              styles.accountProjectionValue,
                              ownerEditCurrentDelta >= 0 ? styles.accountProjectionNegative : styles.accountProjectionPositive,
                            ]}
                          >
                            {ownerEditCurrentDelta >= 0 ? "-" : "+"}
                            {formatCurrency(Math.abs(ownerEditCurrentAmount), ownerEditPreviousAccount.currencyCode)}
                          </Text>
                        </View>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                          <Text style={styles.accountProjectionStrong}>
                            {formatCurrency(ownerEditPreviousProjectedBalance, ownerEditPreviousAccount.currencyCode)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {ownerEditSelectedAccount && ownerEditSelectedProjectedBalance != null ? (
                      <View style={styles.accountProjectionCard}>
                        <Text style={styles.accountProjectionTitle}>
                          Asi quedara la cuenta seleccionada: {ownerEditSelectedAccount.name}
                        </Text>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                          <Text style={styles.accountProjectionValue}>
                            {formatCurrency(ownerEditSelectedAccount.currentBalance, ownerEditSelectedAccount.currencyCode)}
                          </Text>
                        </View>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>
                            {ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                              ? "Ajuste neto del movimiento"
                              : "Nuevo movimiento"}
                          </Text>
                          <Text
                            style={[
                              styles.accountProjectionValue,
                              (ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                                ? ownerEditProposedDelta - ownerEditCurrentDelta
                                : ownerEditProposedDelta) >= 0
                                ? styles.accountProjectionPositive
                                : styles.accountProjectionNegative,
                            ]}
                          >
                            {(ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                              ? ownerEditProposedDelta - ownerEditCurrentDelta
                              : ownerEditProposedDelta) >= 0
                              ? "+"
                              : "-"}
                            {formatCurrency(
                              Math.abs(
                                ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                                  ? ownerEditProposedAmount - ownerEditCurrentAmount
                                  : ownerEditProposedAmount,
                              ),
                              ownerEditSelectedAccount.currencyCode,
                            )}
                          </Text>
                        </View>
                        <View style={styles.accountProjectionRow}>
                          <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                          <Text style={styles.accountProjectionStrong}>
                            {formatCurrency(ownerEditSelectedProjectedBalance, ownerEditSelectedAccount.currencyCode)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : null}
                {ownerEditRequestTarget.event && ownerAccounts.length === 0 ? (
                  <Text style={styles.requestNoAccount}>
                    No tienes cuentas activas disponibles para reasignar este movimiento.
                  </Text>
                ) : null}
              </>
            ) : null}
            <Button
              label="Aprobar"
              onPress={() => {
                if (ownerEditRequestTarget) {
                  void handleAcceptEditRequest(ownerEditRequestTarget);
                }
              }}
              loading={acceptEditRequestMutation.isPending}
              disabled={!ownerEditRequestTarget?.event || (ownerAccounts.length > 0 && ownerEditResponseAccountId == null)}
            />
            <Button
              label="Rechazar"
              variant="ghost"
              onPress={() => {
                if (ownerEditRequestTarget) {
                  void handleRejectEditRequest(ownerEditRequestTarget);
                }
              }}
              loading={rejectEditRequestMutation.isPending}
              style={styles.rejectConfirmBtn}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setOwnerEditRequestTarget(null)}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Reject request confirmation */}
      <Modal
        visible={Boolean(rejectingRequest)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingRequest(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRejectingRequest(null)}>
          <View
            style={[styles.rejectSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.rejectTitle}>Rechazar solicitud</Text>
            {rejectingRequest ? (
              <Text style={styles.rejectSub}>
                {formatCurrency(rejectingRequest.amount, obligation?.currencyCode ?? "")}
                {" - "}
                {format(parseDisplayDate(rejectingRequest.paymentDate), "d MMM yyyy", { locale: es })}
              </Text>
            ) : null}
            <View style={styles.rejectInputWrap}>
              <TextInput
                style={styles.rejectInput}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Motivo (opcional)"
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>
            <Button
              label="Confirmar rechazo"
              variant="ghost"
              onPress={handleRejectRequest}
              loading={rejectRequestMutation.isPending}
              style={styles.rejectConfirmBtn}
            />
            <Button label="Cancelar" variant="ghost" onPress={() => setRejectingRequest(null)} />
          </View>
        </Pressable>
      </Modal>

      {/* Men? de acciones sobre un evento */}
      <ObligationEventActionSheet
        visible={eventMenuVisible}
        onClose={() => setEventMenuVisible(false)}
        eventTitle={eventLabels[selectedEvent?.eventType ?? ""] ?? selectedEvent?.eventType}
        dateLabel={
          selectedEvent
            ? format(parseDisplayDate(selectedEvent.eventDate), "d MMM yyyy", { locale: es })
            : null
        }
        amountLabel={
          selectedEvent ? formatCurrency(selectedEvent.amount, obligation?.currencyCode ?? "") : null
        }
        description={selectedEvent?.description ?? null}
        notes={selectedEvent?.notes ?? null}
        statusBadge={
          isSharedViewer && selectedEventDeleteStatus?.status === "pending"
            ? { label: "Eliminacion pendiente", tone: "warning" as const }
            : isSharedViewer && selectedEventDeleteStatus?.status === "accepted"
              ? { label: "Eliminacion aprobada", tone: "success" as const }
              : null
        }
        notices={[
          ...(selectedEventPreviewAttachmentsLoading
            ? [
                {
                  key: "checking-attachments",
                  text: "Comprobando si este evento tiene comprobantes...",
                  tone: "info" as const,
                },
              ]
            : []),
          ...(isSharedViewer && selectedEventDeleteStatus?.status === "rejected"
            ? [
                {
                  key: "delete-rejected",
                  text: selectedEventDeleteStatus.payload.rejectionReason?.trim()
                    ? `Rechazada: ${selectedEventDeleteStatus.payload.rejectionReason.trim()}`
                    : "La solicitud anterior fue rechazada.",
                  tone: "danger" as const,
                },
              ]
            : []),
          ...(isSharedViewer && selectedEventEditStatus?.status === "pending"
            ? [
                {
                  key: "edit-pending",
                  text: "Ya hay una solicitud de edicion pendiente para este evento.",
                  tone: "warning" as const,
                },
              ]
            : []),
          ...(isSharedViewer && selectedEventEditStatus?.status === "rejected"
            ? [
                {
                  key: "edit-rejected",
                  text: selectedEventEditStatus.payload.rejectionReason?.trim()
                    ? `Edicion rechazada: ${selectedEventEditStatus.payload.rejectionReason.trim()}`
                    : "La solicitud de edicion anterior fue rechazada.",
                  tone: "danger" as const,
                },
              ]
            : []),
        ]}
        quickActions={[
          ...(selectedEventPreviewAttachments.length > 0
            ? [
                {
                  key: "attachments",
                  label:
                    selectedEventPreviewAttachments.length === 1
                      ? "Ver comprobante"
                      : `Ver ${selectedEventPreviewAttachments.length} comprobantes`,
                  onPress: () => {
                    setEventMenuVisible(false);
                    setEventAttachmentsVisible(true);
                  },
                  variant: "secondary" as const,
                },
              ]
            : []),
          ...(isSharedViewer &&
          selectedEvent &&
          (selectedEvent.eventType === "payment" ||
            selectedEvent.eventType === "principal_increase" ||
            selectedEvent.eventType === "principal_decrease")
            ? [
                {
                  key: "link-account",
                  label: linkedEventIds.has(selectedEvent.id)
                    ? "Cambiar cuenta asociada"
                    : "Asociar a una cuenta",
                  onPress: handleViewerLinkEvent,
                  variant: "ghost" as const,
                },
              ]
            : []),
        ]}
        actions={
          isSharedViewer
            ? [
                ...(selectedEvent &&
                EDITABLE_TYPES.has(selectedEvent.eventType) &&
                selectedEventEditStatus?.status !== "pending"
                  ? [
                      {
                        key: "request-edit",
                        label:
                          selectedEventEditStatus?.status === "rejected"
                            ? "Solicitar edicion otra vez"
                            : "Solicitar edicion",
                        variant: "primary" as const,
                        onPress: handleViewerEditRequestFromMenu,
                      },
                    ]
                  : []),
                ...(selectedEvent &&
                selectedEventDeleteStatus?.status !== "pending" &&
                selectedEventDeleteStatus?.status !== "accepted"
                  ? [
                      {
                        key: "request-delete",
                        label:
                          selectedEventDeleteStatus?.status === "rejected"
                            ? "Solicitar eliminacion otra vez"
                            : "Solicitar eliminacion",
                        variant: "ghost" as const,
                        onPress: handleViewerDeleteRequestFromMenu,
                      },
                    ]
                  : []),
              ]
            : [
                ...(selectedEvent && EDITABLE_TYPES.has(selectedEvent.eventType)
                  ? [
                      {
                        key: "edit",
                        label: "Editar",
                        onPress: handleEditEvent,
                        variant: "primary" as const,
                      },
                    ]
                  : []),
                {
                  key: "delete",
                  label: "Eliminar",
                  variant: "ghost" as const,
                  onPress: () => {
                    setEventMenuVisible(false);
                    setConfirmDeleteVisible(true);
                  },
                },
              ]
        }
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

      {/* Share obligation sheet */}
      <BottomSheet
        visible={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        title="Compartir obligación"
        snapHeight={0.42}
      >
        <View style={styles.shareSheet}>
          <Text style={styles.shareSheetSub}>
            La otra parte podra ver el estado y registrar pagos
          </Text>
          <Input
            label="Email del destinatario *"
            value={shareEmail}
            onChangeText={setShareEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="correo@ejemplo.com"
          />
          <Button
            label="Enviar invitacion"
            onPress={handleShare}
            loading={shareMutation.isPending}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={rowStyles.divider} />;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
    flex: 2,
    textAlign: "right",
    lineHeight: 19,
  },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: SPACING.xs },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.storm, fontSize: FONT_SIZE.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  shareBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.income + "88",
  },
  shareBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.income, fontFamily: FONT_FAMILY.bodyMedium },
  unlinkHeaderBtn: {
    borderColor: COLORS.expense + "66",
    backgroundColor: COLORS.expense + "12",
  },
  unlinkHeaderBtnText: {
    color: COLORS.expense,
  },
  detailActionsPanel: {
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,14,20,0.50)",
    padding: SPACING.sm,
  },
  detailPrimaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  detailPrimaryIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(5,7,11,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailPrimaryTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.bgVoid,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  detailActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  detailActionMeta: {
    fontSize: FONT_SIZE.xs,
    color: "rgba(5,7,11,0.72)",
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  detailActionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  detailActionSecondaryBtn: {
    flex: 1,
    minHeight: 74,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  detailActionIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
  },
  detailActionIncreaseBtn: {
    borderColor: COLORS.income + "28",
    backgroundColor: COLORS.income + "0E",
  },
  detailActionIncreaseIcon: {
    backgroundColor: COLORS.income + "18",
  },
  detailActionIncreaseText: {
    color: COLORS.income,
  },
  detailActionDangerBtn: {
    borderColor: COLORS.danger + "28",
    backgroundColor: COLORS.danger + "0E",
  },
  detailActionDangerIcon: {
    backgroundColor: COLORS.danger + "18",
  },
  detailActionSecondaryText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
    textAlign: "center",
  },
  detailActionDangerText: {
    color: COLORS.danger,
  },
  detailInfoCard: {
    gap: 0,
  },
  detailInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  detailInfoBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.secondary + "38",
    backgroundColor: COLORS.secondary + "12",
    color: COLORS.secondary,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  shareSheet: {
    gap: SPACING.md,
  },
  shareSheetSub: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", marginTop: -SPACING.sm },
  heroCard: { alignItems: "center", gap: SPACING.xs, paddingVertical: SPACING.xl },
  directionBadge: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, textTransform: "uppercase", letterSpacing: 0.5 },
  counterparty: { fontSize: FONT_SIZE.md, color: COLORS.storm },
  pendingAmount: { fontSize: 36, fontFamily: FONT_FAMILY.heading, marginTop: SPACING.sm },
  pendingLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  progress: { width: "100%", marginTop: SPACING.md },
  progressLabel: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  capitalSummaryCard: {
    gap: SPACING.sm,
  },
  capitalSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  capitalSummaryItem: {
    flex: 1,
    minWidth: "46%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    padding: SPACING.sm,
    gap: 4,
  },
  capitalSummaryAction: {
    borderColor: COLORS.primary + "28",
  },
  capitalSummaryLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  capitalSummaryValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  capitalSummaryMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
  },
  capitalSummaryLink: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
    marginTop: 2,
  },
  capitalSummaryPositive: {
    color: COLORS.income,
  },
  capitalSummaryNegative: {
    color: COLORS.danger,
  },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm, textTransform: "uppercase", letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    lineHeight: 18,
  },
  dateRangeCaption: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  historyPresetRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
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
  customRange: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  emptyHistory: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  viewerTabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  viewerTabChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  viewerTabChipActive: {
    borderColor: COLORS.primary + "66",
    backgroundColor: COLORS.primary + "16",
  },
  viewerTabChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  viewerTabChipTextActive: {
    color: COLORS.primary,
  },
  eventFocusNotice: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    alignSelf: "flex-start",
  },
  eventFocusNoticeInfo: {
    backgroundColor: COLORS.primary + "10",
    borderColor: COLORS.primary + "20",
  },
  eventFocusNoticeSuccess: {
    backgroundColor: COLORS.income + "10",
    borderColor: COLORS.income + "20",
  },
  eventFocusNoticeText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  eventFocusNoticeTextInfo: {
    color: COLORS.primary,
  },
  eventFocusNoticeTextSuccess: {
    color: COLORS.income,
  },
  eventRow: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(10,14,20,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  eventRowHighlighted: {
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.income + "08",
    borderColor: COLORS.income + "28",
  },
  eventRowHighlightedPulse: {
    backgroundColor: COLORS.income + "12",
    borderColor: COLORS.income + "42",
  },
  eventMainPress: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  eventAccent: {
    width: 3,
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: RADIUS.full,
  },
  eventBody: {
    flex: 1,
    gap: SPACING.xs,
    minWidth: 0,
  },
  eventHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  eventInfo: { gap: 2, flex: 1, minWidth: 0 },
  eventRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING.xs,
    flexWrap: "wrap",
    flexShrink: 1,
    maxWidth: "55%",
  },
  eventType: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  eventDate: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  eventDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 19,
  },
  eventDescriptionMuted: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 17,
  },
  eventNotes: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  eventAmountGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flexShrink: 0,
  },
  eventAmountPill: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    maxWidth: 150,
  },
  eventAmount: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },
  eventChevron: { fontSize: FONT_SIZE.md, color: COLORS.storm, marginTop: 1 },
  eventInlineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: 2,
  },
  eventMetaChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  eventMetaChipText: {
    fontSize: 10,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  movementChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.ember + "22",
    borderWidth: 1,
    borderColor: COLORS.ember + "55",
  },
  movementChipText: { fontSize: 10, color: COLORS.ember, fontFamily: FONT_FAMILY.bodySemibold },
  eventAttachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
    paddingLeft: SPACING.md,
    marginTop: 4,
  },
  eventAttachmentChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "14",
    borderWidth: 1,
    borderColor: COLORS.primary + "38",
  },
  eventAttachmentChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  eventAttachmentLoadingChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  eventAttachmentLoadingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  ownerEventDeletePendingChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger + "16",
    borderWidth: 1,
    borderColor: COLORS.danger + "36",
  },
  ownerEventDeletePendingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  eventMenuSheet: {
    paddingTop: SPACING.xs,
    gap: SPACING.sm,
  },
  eventMenuHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: SPACING.xs,
  },
  eventMenuTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink, textAlign: "center" },
  eventMenuSub: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", marginBottom: SPACING.xs },
  eventMenuBtn: { marginTop: SPACING.xs },
  eventMenuStatusNote: { fontSize: FONT_SIZE.xs, color: COLORS.danger, textAlign: "center" },
  eventMenuDeleteBtn: { borderColor: COLORS.expense + "66" },
  payBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  payBtnText: { color: "#FFFFFF", fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold },
  requestBadgeWrap: { position: "relative" },
  requestBadge: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.full,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  requestBadgeText: { color: "#FFF", fontSize: 11, fontFamily: FONT_FAMILY.bodySemibold },
  requestGroupTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
    marginTop: SPACING.xs,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + "33",
    padding: SPACING.sm,
  },
  requestInfo: { flex: 1, gap: 2 },
  requestName: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  requestAmount: { fontSize: FONT_SIZE.md, color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  requestDate: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  requestDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  requestAccountChip: {
    marginTop: 2,
    backgroundColor: COLORS.income + "18",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  requestAccountChipText: { fontSize: 10, color: COLORS.income, fontFamily: FONT_FAMILY.bodyMedium },
  requestNoAccount: { fontSize: 10, color: COLORS.textDisabled, marginTop: 2 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingTop: 2 },
  acceptBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderRadius: RADIUS.md, backgroundColor: COLORS.income + "18",
  },
  rejectBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderRadius: RADIUS.md, backgroundColor: COLORS.danger + "18",
  },
  ownerDeleteRequestCard: {
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.danger + "28",
    backgroundColor: "rgba(10,14,20,0.58)",
    padding: SPACING.md,
  },
  ownerDeleteRequestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  ownerDeleteRequestTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ownerDeleteRequestEyebrow: {
    fontSize: 10,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ownerDeleteRequestTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  ownerDeleteRequestStatus: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.warning + "16",
    borderWidth: 1,
    borderColor: COLORS.warning + "36",
  },
  ownerDeleteRequestStatusText: {
    fontSize: 10,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  ownerDeleteTargetCard: {
    flexDirection: "row",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: SPACING.sm,
  },
  ownerDeleteTargetAccent: {
    width: 3,
    alignSelf: "stretch",
    minHeight: 46,
    borderRadius: RADIUS.full,
  },
  ownerDeleteTargetBody: {
    flex: 1,
    minWidth: 0,
    gap: SPACING.xs,
  },
  ownerDeleteTargetTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  ownerDeleteTargetInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ownerDeleteTargetType: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  ownerDeleteTargetDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  ownerDeleteTargetAmount: {
    maxWidth: 140,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textAlign: "right",
  },
  ownerDeleteTargetDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    lineHeight: 17,
  },
  ownerDeleteTargetDescMuted: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    lineHeight: 17,
  },
  ownerDeleteRequestActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  ownerDeleteFocusBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.secondary + "32",
    backgroundColor: COLORS.secondary + "10",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.sm,
  },
  ownerDeleteFocusText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.secondary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  ownerDeleteDecisionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  rejectSheet: {
    backgroundColor: COLORS.mist,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  rejectTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink, textAlign: "center" },
  rejectSub: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
  rejectInputWrap: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: SPACING.sm,
  },
  rejectInput: { color: COLORS.ink, fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.body },
  rejectConfirmBtn: { borderColor: COLORS.danger + "66" },
  ownerEditSummaryCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    backgroundColor: COLORS.primary + "10",
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  ownerEditSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  ownerEditSummaryLabel: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  ownerEditSummaryValue: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  ownerEditSummaryStrong: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  viewerAccountLinkedChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.income + "14",
    borderWidth: 1,
    borderColor: COLORS.income + "30",
  },
  viewerAccountLinkedText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.income,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  viewerAccountUnlinkedChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  viewerAccountUnlinkedText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  viewerEventActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flexWrap: "wrap",
    paddingLeft: SPACING.md,
  },
  viewerEditPendingChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.warning + "20",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  viewerEditPendingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  viewerEventManageHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontStyle: "italic",
  },
  viewerDeletePendingChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.warning + "20",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  viewerDeletePendingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  viewerDeleteAcceptedChip: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.income + "20",
    borderWidth: 1,
    borderColor: COLORS.income + "44",
  },
  viewerDeleteAcceptedText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.income,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  linkSheet: {
    backgroundColor: COLORS.mist,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  linkSheetTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink, textAlign: "center" },
  linkSheetSub: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", marginTop: -SPACING.xs },
  linkSheetHint: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, textAlign: "center" },
  ownerAccountLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  linkAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  linkAccountRowSelected: {
    borderColor: COLORS.primary + "88",
    backgroundColor: COLORS.primary + "18",
  },
  linkAccountInfo: { flex: 1, gap: 2 },
  linkAccountName: { fontSize: FONT_SIZE.sm, color: COLORS.ink, fontFamily: FONT_FAMILY.bodyMedium },
  linkAccountBalance: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  linkAccountCheck: { fontSize: FONT_SIZE.md, color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  accountProjectionCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    backgroundColor: COLORS.primary + "12",
    padding: SPACING.sm,
    gap: 6,
  },
  accountProjectionTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  accountProjectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  accountProjectionLabel: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  accountProjectionValue: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  accountProjectionStrong: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  accountProjectionPositive: {
    color: COLORS.income,
  },
  accountProjectionNegative: {
    color: COLORS.danger,
  },
  linkNoAccounts: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", paddingVertical: SPACING.sm },
  viewerRequestCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.sm,
    gap: 4,
  },
  viewerRequestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewerRequestAmount: { fontSize: FONT_SIZE.md, color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  viewerRequestStatus: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  viewerRequestStatusText: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium },
  viewerRequestDate: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  viewerRequestDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  viewerRequestNote: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, marginTop: 2 },
  viewerEmptyState: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    padding: SPACING.md,
  },
  viewerEmptyStateText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
});

// --- Event delete impact ------------------------------------------------------

function EventDeleteImpact({
  event,
  obligation,
}: {
  event: ObligationEventSummary;
  obligation: ObligationSummary | SharedObligationSummary;
}) {
  if (event.eventType !== "payment") return null;
  const projectedPending = obligation.pendingAmount + event.amount;
  const currency = obligation.currencyCode;
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <View style={evImpactStyles.container}>
      <View style={evImpactStyles.row}>
        <Text style={evImpactStyles.label}>Pendiente obligación</Text>
        <View style={evImpactStyles.values}>
          <Text style={evImpactStyles.from}>{fmt(obligation.pendingAmount)}</Text>
          <Text style={evImpactStyles.arrow}>-</Text>
          <Text style={evImpactStyles.to}>{fmt(projectedPending)}</Text>
        </View>
      </View>
      {event.movementId ? (
        <Text style={evImpactStyles.note}>El movimiento contable vinculado también se eliminará.</Text>
      ) : null}
    </View>
  );
}

const evImpactStyles = StyleSheet.create({
  container: {
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  label: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  values: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  from: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  arrow: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  to: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.warning },
  note: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, fontStyle: "italic" },
});

export default function ObligationDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <ObligationDetailScreen />
    </ErrorBoundary>
  );
}
