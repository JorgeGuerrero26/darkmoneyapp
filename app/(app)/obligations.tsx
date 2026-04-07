import { useRouter, useFocusEffect } from "expo-router";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { FAB } from "../../components/ui/FAB";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Users, CreditCard, TrendingUp, TrendingDown, Trash2, BarChart2, Archive } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth-context";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { humanizeError } from "../../lib/errors";
import { parseDisplayDate } from "../../lib/date";
import { useWorkspace } from "../../lib/workspace-context";
import {
  buildShareByObligationId,
  getDirectionLabel,
  getObligationStatusLabel,
  getShareStatusLabel,
} from "../../lib/obligation-labels";
import { obligationSwipeActionLabel } from "../../lib/obligation-viewer-labels";
import {
  useWorkspaceSnapshotQuery,
  useDeleteObligationEventMutation,
  useDeleteObligationMutation,
  useArchiveObligationMutation,
  useObligationSharesQuery,
  useSharedObligationsQuery,
  usePendingPaymentRequestCountsQuery,
} from "../../services/queries/workspace-data";
import {
  type EntityAttachmentFile,
  useObligationEventAttachmentsQuery,
  useMovementAttachmentsQuery,
} from "../../services/queries/attachments";
import { PaymentRequestForm } from "../../components/forms/PaymentRequestForm";
import { useToast } from "../../hooks/useToast";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ObligationAnalyticsModal } from "../../components/domain/ObligationAnalyticsModal";
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { ObligationEventActionSheet } from "../../components/domain/ObligationEventActionSheet";
import type {
  ObligationEventSummary,
  ObligationShareSummary,
  ObligationSummary,
  ObligationStatus,
  SharedObligationSummary,
} from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { PrincipalAdjustmentForm } from "../../components/forms/PrincipalAdjustmentForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useSwipeTab } from "../../hooks/useSwipeTab";

// ─── Status config ───────────────────────────────────────────────────────────

/** Colores por obligations.status; el texto sale de getObligationStatusLabel (paridad web). */
const STATUS_COLORS: Record<ObligationStatus, string> = {
  active: COLORS.primary,
  draft: COLORS.storm,
  paid: COLORS.income,
  cancelled: COLORS.storm,
  defaulted: COLORS.warning,
};

const ANALYTICS_EVENT_LABELS: Record<string, string> = {
  opening: "Apertura",
  payment: "Pago",
  principal_increase: "Aumento de capital",
  principal_decrease: "Reducción de capital",
  interest: "Interés",
  fee: "Cargo",
  discount: "Descuento",
  adjustment: "Ajuste",
  writeoff: "Castigo",
};

const ANALYTICS_EDITABLE_TYPES = new Set(["payment", "principal_increase", "principal_decrease"]);

const UNDO_DELETE_MS = 5000;

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

type FilterChip = { id: string; label: string };
const FILTER_CHIPS: FilterChip[] = [
  { id: "all",       label: "Todas" },
  { id: "receivable",label: "Me deben" },
  { id: "payable",   label: "Debo" },
  { id: "active",    label: "Activa" },
  { id: "defaulted", label: "Incumplido" },
  { id: "draft",     label: "Borrador" },
  { id: "paid",      label: "Liquidada" },
  { id: "cancelled", label: "Cancelada" },
];

// ─── Swipeable row ────────────────────────────────────────────────────────────
// LEFT swipe (←) → reveals DELETE on the right
// RIGHT swipe (→) → reveals PAGAR on the left

const REVEAL_W = 90;

type SwipeableObligationRowProps = {
  obligation: ObligationSummary | SharedObligationSummary;
  /** Share activo (pending | accepted) para esta obligación; si no hay fila, sin tercer badge. */
  obligationShare?: ObligationShareSummary | null;
  /** Obligación de otro usuario compartida contigo (no eliminar / no es “tuya”). */
  isSharedWithMe?: boolean;
  /** Número de solicitudes de pago pendientes (badge rojo). */
  pendingRequestCount?: number;
  onOpenDetail: () => void;
  onPayment: () => void;
  onDelete: () => void;
  onAnalytics: () => void;
  deleteActionLabel?: string;
  deleteActionColor?: string;
  deleteActionBg?: string;
  deleteActionIcon?: typeof Trash2;
};

function SwipeableObligationRow({
  obligation,
  obligationShare,
  isSharedWithMe,
  pendingRequestCount = 0,
  onOpenDetail,
  onPayment,
  onDelete,
  onAnalytics,
  deleteActionLabel = "Eliminar",
  deleteActionColor = COLORS.danger,
  deleteActionBg = COLORS.danger + "28",
  deleteActionIcon: DeleteActionIcon = Trash2,
}: SwipeableObligationRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  // "right" = swiped right (pay), "left" = swiped left (delete), null = closed
  const openDir = useRef<"right" | "left" | null>(null);

  const payOpacity = translateX.interpolate({
    inputRange: [0, 16, REVEAL_W],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });
  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL_W, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    if (toValue === 0) openDir.current = null;
    else if (toValue > 0) openDir.current = "right";
    else openDir.current = "left";
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, { dx }) => {
        const base = openDir.current === "right" ? REVEAL_W : openDir.current === "left" ? -REVEAL_W : 0;
        const raw = base + dx;
        const minX = isSharedWithMe ? Math.min(0, base) : -REVEAL_W * 1.4;
        const clamped = Math.min(REVEAL_W * 1.4, Math.max(minX, raw));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = openDir.current === "right" ? REVEAL_W : openDir.current === "left" ? -REVEAL_W : 0;
        const finalX = base + dx;
        if (finalX > REVEAL_W / 2 || vx > 0.4) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          snapTo(REVEAL_W);
        } else if (!isSharedWithMe && (finalX < -REVEAL_W / 2 || vx < -0.4)) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          snapTo(-REVEAL_W);
        } else {
          snapTo(0);
        }
      },
    })
  ).current;

  function handleCardPress() {
    if (openDir.current !== null) { snapTo(0); return; }
    onOpenDetail();
  }

  function handlePayPress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    snapTo(0, onPayment);
  }

  function handleDeletePress() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    snapTo(0, onDelete);
  }

  const isPaid = obligation.status === "paid" || obligation.status === "cancelled";
  const color = obligation.direction === "receivable" ? COLORS.income : COLORS.expense;
  const directionColor = obligation.direction === "receivable" ? COLORS.income : COLORS.expense;
  const obligationStatusColor = STATUS_COLORS[obligation.status] ?? STATUS_COLORS.active;
  const obligationStatusLabel = getObligationStatusLabel(obligation.status);
  const directionLabel = getDirectionLabel(obligation.direction);
  const shareLabel = obligationShare ? getShareStatusLabel(obligationShare.status) : null;
  const shareColor =
    obligationShare?.status === "pending"
      ? COLORS.warning
      : obligationShare?.status === "accepted"
        ? COLORS.income
        : COLORS.storm;

  const paySwipeLabel = obligationSwipeActionLabel(obligation.direction, Boolean(isSharedWithMe));

  return (
    <View style={swipeStyles.container}>
      {/* LEFT action (pay) — revealed by swiping RIGHT */}
      <Animated.View style={[swipeStyles.payBg, { opacity: payOpacity }]}>
        <TouchableOpacity style={swipeStyles.actionBtn} onPress={handlePayPress} activeOpacity={0.8}>
          <CreditCard size={20} color={COLORS.pine} strokeWidth={2} />
          <Text style={[swipeStyles.actionLabel, { color: COLORS.pine }]}>{paySwipeLabel}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* RIGHT action (delete) — revealed by swiping LEFT; no aplica a compartidos contigo */}
      {!isSharedWithMe ? (
        <Animated.View style={[swipeStyles.deleteBg, { opacity: deleteOpacity, backgroundColor: deleteActionBg }]}>
          <TouchableOpacity style={swipeStyles.actionBtn} onPress={handleDeletePress} activeOpacity={0.8}>
            <DeleteActionIcon size={20} color={deleteActionColor} strokeWidth={2} />
            <Text style={[swipeStyles.actionLabel, { color: deleteActionColor }]}>{deleteActionLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Swipeable card */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Card onPress={handleCardPress} style={swipeStyles.card}>
          <View style={swipeStyles.header}>
            <View style={swipeStyles.titleWrap}>
              <Text style={swipeStyles.title} numberOfLines={1}>{obligation.title}</Text>
              {pendingRequestCount > 0 ? (
                <TouchableOpacity style={swipeStyles.pendingBadge} onPress={onAnalytics} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={swipeStyles.pendingBadgeText}>{pendingRequestCount}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={swipeStyles.headerRight}>
              <TouchableOpacity onPress={onAnalytics} style={swipeStyles.analyticsBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <BarChart2 size={14} color={COLORS.storm} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[swipeStyles.amount, { color }]}>
                {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
              </Text>
            </View>
          </View>

          <View style={swipeStyles.metaRow}>
            <Text style={swipeStyles.counterparty}>{obligation.counterparty}</Text>
          </View>

          <View style={swipeStyles.badgesRow}>
            <View
              style={[
                swipeStyles.badgePill,
                { backgroundColor: directionColor + "22", borderColor: directionColor + "44" },
              ]}
            >
              <Text style={[swipeStyles.badgePillText, { color: directionColor }]}>{directionLabel}</Text>
            </View>
            <View
              style={[
                swipeStyles.badgePill,
                {
                  backgroundColor: obligationStatusColor + "22",
                  borderColor: obligationStatusColor + "44",
                },
              ]}
            >
              <Text style={[swipeStyles.badgePillText, { color: obligationStatusColor }]}>
                {obligationStatusLabel}
              </Text>
            </View>
            {shareLabel ? (
              <View
                style={[
                  swipeStyles.badgePill,
                  { backgroundColor: shareColor + "22", borderColor: shareColor + "44" },
                ]}
              >
                <Users size={10} color={shareColor} strokeWidth={2} />
                <Text style={[swipeStyles.badgePillText, { color: shareColor }]}>{shareLabel}</Text>
              </View>
            ) : null}
            {isSharedWithMe && "share" in obligation ? (
              <View
                style={[
                  swipeStyles.badgePill,
                  { backgroundColor: COLORS.secondary + "22", borderColor: COLORS.secondary + "44" },
                ]}
              >
                <Users size={10} color={COLORS.secondary} strokeWidth={2} />
                <Text style={[swipeStyles.badgePillText, { color: COLORS.secondary }]} numberOfLines={1}>
                  Compartido
                  {(obligation as SharedObligationSummary).share.ownerDisplayName?.trim()
                    ? ` · ${(obligation as SharedObligationSummary).share.ownerDisplayName!.trim()}`
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>

          {!isPaid ? (
            <>
              <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={5} />
              <View style={swipeStyles.progressRow}>
                <Text style={swipeStyles.progressText}>{Math.round(obligation.progressPercent)}% pagado</Text>
                {obligation.dueDate ? (
                  <Text style={swipeStyles.dueDate}>
                    Vence {format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

        </Card>
      </Animated.View>
    </View>
  );
}

function canDeleteObligation(ob: ObligationSummary) {
  return ob.events.every((event) => event.eventType === "opening");
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function ObligationsScreen() {
  const swipeGesture = useSwipeTab();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteObligationMutation(activeWorkspaceId);
  const archiveMutation = useArchiveObligationMutation(activeWorkspaceId);
  const deleteEventMutation = useDeleteObligationEventMutation();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: obligationShares = [] } = useObligationSharesQuery(activeWorkspaceId);
  const { data: sharedObligations = [], isLoading: sharedLoading, isFetching: sharedFetching } =
    useSharedObligationsQuery(session?.user?.id ?? null);
  const { data: pendingRequestCounts } = usePendingPaymentRequestCountsQuery(activeWorkspaceId);

  const shareByObligationId = useMemo(
    () => buildShareByObligationId(obligationShares),
    [obligationShares],
  );

  const [activeFilter, setActiveFilter] = useState("all");
  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [paymentObligation, setPaymentObligation] = useState<ObligationSummary | null>(null);
  const [paymentRequestObligation, setPaymentRequestObligation] = useState<SharedObligationSummary | null>(null);
  const [adjustObligation, setAdjustObligation] = useState<ObligationSummary | null>(null);
  const [adjustMode, setAdjustMode] = useState<"increase" | "decrease">("increase");
  const [deleteTarget, setDeleteTarget] = useState<ObligationSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ObligationSummary | null>(null);
  const [analyticsObligation, setAnalyticsObligation] = useState<
    ObligationSummary | SharedObligationSummary | null
  >(null);

  // Event editing from analytics modal
  const [editEventObligation, setEditEventObligation] = useState<
    ObligationSummary | SharedObligationSummary | null
  >(null);
  const [editingEventForPayment, setEditingEventForPayment] = useState<ObligationEventSummary | undefined>(undefined);
  const [editingEventForAdjustment, setEditingEventForAdjustment] = useState<ObligationEventSummary | undefined>(undefined);
  const [adjustEventMode, setAdjustEventMode] = useState<"increase" | "decrease">("increase");
  const [selectedAnalyticsEvent, setSelectedAnalyticsEvent] = useState<ObligationEventSummary | null>(null);
  const [selectedAnalyticsEventObligation, setSelectedAnalyticsEventObligation] = useState<
    ObligationSummary | SharedObligationSummary | null
  >(null);
  const [analyticsEventMenuVisible, setAnalyticsEventMenuVisible] = useState(false);
  const [analyticsAttachmentPreviewVisible, setAnalyticsAttachmentPreviewVisible] = useState(false);
  const [deletingAnalyticsAttachmentPath, setDeletingAnalyticsAttachmentPath] = useState<string | null>(null);
  const [analyticsConfirmDeleteVisible, setAnalyticsConfirmDeleteVisible] = useState(false);
  const {
    data: selectedAnalyticsEventAttachments = [],
    isLoading: selectedAnalyticsEventAttachmentsLoading,
  } = useObligationEventAttachmentsQuery(
    selectedAnalyticsEvent ? selectedAnalyticsEventObligation?.workspaceId ?? null : null,
    selectedAnalyticsEvent?.id ?? null,
  );
  const {
    data: selectedAnalyticsMovementAttachments = [],
    isLoading: selectedAnalyticsMovementAttachmentsLoading,
  } = useMovementAttachmentsQuery(
    selectedAnalyticsEvent?.movementId ? selectedAnalyticsEventObligation?.workspaceId ?? null : null,
    selectedAnalyticsEvent?.movementId ?? null,
  );
  const selectedAnalyticsPreviewAttachments = useMemo(
    () => mergePreviewAttachments(selectedAnalyticsEventAttachments, selectedAnalyticsMovementAttachments),
    [selectedAnalyticsEventAttachments, selectedAnalyticsMovementAttachments],
  );
  const selectedAnalyticsPreviewAttachmentsLoading =
    selectedAnalyticsEventAttachmentsLoading ||
    (selectedAnalyticsEvent?.movementId != null && selectedAnalyticsMovementAttachmentsLoading);

  // Undo-delete: hidden list of ids pending actual deletion
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteDeadlines, setPendingDeleteDeadlines] = useState<Record<number, number>>({});
  const [undoNow, setUndoNow] = useState(() => Date.now());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteItems = useRef<Map<number, ObligationSummary>>(new Map());

  async function handleArchiveObligation(ob: ObligationSummary) {
    if (ob.status === "cancelled") {
      showToast("La obligación ya está archivada", "success");
      return;
    }
    try {
      await archiveMutation.mutateAsync({ id: ob.id, archived: true });
      showToast("Obligación archivada. Para eliminarla, primero borra sus eventos.", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const finalizeDelete = useCallback((id: number) => {
    const pending = pendingDeleteItems.current.get(id);
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteDeadlines((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!pending) return;
    deleteMutation.mutate(pending.id, {
      onError: (e) => showToast(e.message, "error"),
    });
  }, [deleteMutation, showToast]);

  function startUndoDelete(ob: ObligationSummary) {
    const deadline = Date.now() + UNDO_DELETE_MS;
    setUndoNow(Date.now());
    pendingDeleteItems.current.set(ob.id, ob);
    setPendingDeleteIds((prev) => new Set(prev).add(ob.id));
    setPendingDeleteDeadlines((prev) => ({ ...prev, [ob.id]: deadline }));
    const timer = setTimeout(() => {
      finalizeDelete(ob.id);
    }, UNDO_DELETE_MS);
    deleteTimers.current.set(ob.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteDeadlines((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // Clear timers on unmount
  useEffect(() => {
    return () => { deleteTimers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (Object.keys(pendingDeleteDeadlines).length === 0) return;
    const interval = setInterval(() => setUndoNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [pendingDeleteDeadlines]);

  useEffect(() => {
    const expiredIds = Object.entries(pendingDeleteDeadlines)
      .filter(([, deadline]) => deadline <= undoNow)
      .map(([id]) => Number(id));
    expiredIds.forEach((id) => finalizeDelete(id));
  }, [finalizeDelete, pendingDeleteDeadlines, undoNow]);

  function handleObligationRemoveAction(ob: ObligationSummary) {
    if (canDeleteObligation(ob)) {
      startUndoDelete(ob);
      return;
    }
    setArchiveTarget(ob);
  }

  const obligations = snapshot?.obligations ?? [];

  function passesFilter(ob: ObligationSummary | SharedObligationSummary) {
    if (activeFilter === "all") return true;
    if (activeFilter === "receivable" || activeFilter === "payable") return ob.direction === activeFilter;
    return ob.status === activeFilter;
  }

  const filtered = obligations.filter((ob) => passesFilter(ob));
  const filteredShared = sharedObligations.filter((ob) => passesFilter(ob));
  const liveAnalyticsObligation = useMemo(() => {
    if (!analyticsObligation) return null;
    const isSharedAnalytics =
      "viewerMode" in analyticsObligation &&
      (analyticsObligation as SharedObligationSummary).viewerMode === "shared_viewer";
    if (isSharedAnalytics) {
      return (
        sharedObligations.find(
          (ob) =>
            ob.id === analyticsObligation.id &&
            ob.workspaceId === analyticsObligation.workspaceId,
        ) ?? analyticsObligation
      );
    }
    return obligations.find((ob) => ob.id === analyticsObligation.id) ?? analyticsObligation;
  }, [analyticsObligation, obligations, sharedObligations]);

  const listRefreshing = isLoading || sharedFetching;

  const refreshTriggeredRef = useRef(false);
  const onRefreshOrig = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
    if (activeWorkspaceId) {
      void queryClient.invalidateQueries({ queryKey: ["obligation-shares", activeWorkspaceId] });
    }
  }, [queryClient, activeWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
    }, [queryClient]),
  );

  useEffect(() => {
    if (!listRefreshing && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [listRefreshing]);

  const workspaceData = useMemo(
    () => filtered.filter((ob) => !pendingDeleteIds.has(ob.id)),
    [filtered, pendingDeleteIds],
  );

  const obligationSections = useMemo(() => {
    type OblSection = {
      key: "workspace" | "shared";
      label: string;
      hint?: string;
      data: (ObligationSummary | SharedObligationSummary)[];
    };
    const sections: OblSection[] = [];
    if (workspaceData.length > 0) {
      sections.push({ key: "workspace", label: "Tu workspace", data: workspaceData });
    }
    if (filteredShared.length > 0) {
      sections.push({
        key: "shared",
        label: "Compartidos contigo",
        hint: "Créditos o deudas que otro usuario compartió contigo (invitación aceptada).",
        data: filteredShared,
      });
    }
    return sections;
  }, [workspaceData, filteredShared]);


  const renderObligationItem = useCallback(
    ({ item, section }: { item: ObligationSummary | SharedObligationSummary; section: { key: string } }) => {
      if (section.key === "shared") {
        const ob = item as SharedObligationSummary;
        return (
          <SwipeableObligationRow
            obligation={ob}
            obligationShare={ob.share}
            isSharedWithMe
            onOpenDetail={() => router.push(`/obligation/${ob.id}`)}
            onPayment={() => setPaymentRequestObligation(ob)}
            onDelete={() => {}}
            onAnalytics={() => setAnalyticsObligation(ob)}
          />
        );
      }
      const ob = item as ObligationSummary;
      const allowDelete = canDeleteObligation(ob);
      return (
        <SwipeableObligationRow
          obligation={ob}
          obligationShare={shareByObligationId.get(ob.id) ?? null}
          pendingRequestCount={pendingRequestCounts?.get(ob.id) ?? 0}
          onOpenDetail={() => router.push(`/obligation/${ob.id}`)}
          onPayment={() => setPaymentObligation(ob)}
          onDelete={() => handleObligationRemoveAction(ob)}
          onAnalytics={() => setAnalyticsObligation(ob)}
          deleteActionLabel={allowDelete ? "Eliminar" : ob.status === "cancelled" ? "Archivada" : "Archivar"}
          deleteActionColor={allowDelete ? COLORS.danger : COLORS.storm}
          deleteActionBg={allowDelete ? COLORS.danger + "28" : COLORS.storm + "22"}
          deleteActionIcon={allowDelete ? Trash2 : Archive}
        />
      );
    },
    [router, shareByObligationId, pendingRequestCounts, handleObligationRemoveAction],
  );

  function openAdjust(ob: ObligationSummary, mode: "increase" | "decrease") {
    setAdjustMode(mode);
    setAdjustObligation(ob);
  }

  function handleEventTap(ev: ObligationEventSummary) {
    const ob = liveAnalyticsObligation;
    if (!ob) return;
    setSelectedAnalyticsEvent(ev);
    setSelectedAnalyticsEventObligation(ob);
    setAnalyticsAttachmentPreviewVisible(false);
    setAnalyticsEventMenuVisible(true);
  }

  function handleAnalyticsEditEvent() {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    setAnalyticsEventMenuVisible(false);
    if (selectedAnalyticsEvent.eventType === "payment") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setEditingEventForPayment(selectedAnalyticsEvent);
    } else if (selectedAnalyticsEvent.eventType === "principal_increase") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setAdjustEventMode("increase");
      setEditingEventForAdjustment(selectedAnalyticsEvent);
    } else if (selectedAnalyticsEvent.eventType === "principal_decrease") {
      setEditEventObligation(selectedAnalyticsEventObligation);
      setAdjustEventMode("decrease");
      setEditingEventForAdjustment(selectedAnalyticsEvent);
    }
  }

  function handleAnalyticsDeleteEvent() {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    deleteEventMutation.mutate(
      {
        eventId: selectedAnalyticsEvent.id,
        obligationId: selectedAnalyticsEventObligation.id,
        movementId: selectedAnalyticsEvent.movementId,
        ownerUserId: profile?.id,
        obligationTitle: selectedAnalyticsEventObligation.title,
        amount: selectedAnalyticsEvent.amount,
        eventType: selectedAnalyticsEvent.eventType,
        eventDate: selectedAnalyticsEvent.eventDate,
      },
      {
        onSuccess: (data) => {
          setAnalyticsConfirmDeleteVisible(false);
          setSelectedAnalyticsEvent(null);
          setSelectedAnalyticsEventObligation(null);
          showToast(
            data?.deletedOwnerMovementId ? "Evento y movimiento eliminados" : "Evento eliminado",
            "success",
          );
        },
        onError: (err) => showToast(humanizeError(err), "error"),
      },
    );
  }

  async function handleDeleteAnalyticsAttachment(
    attachment: EntityAttachmentFile,
  ) {
    if (!selectedAnalyticsEvent || !selectedAnalyticsEventObligation) return;
    try {
      setDeletingAnalyticsAttachmentPath(attachment.filePath);
      await removeAttachmentFile({
        filePath: attachment.filePath,
        mirrorTargets: attachment.filePath.includes("/movement/")
          ? [
              {
                workspaceId: selectedAnalyticsEventObligation.workspaceId,
                entityType: "obligation-event",
                entityId: selectedAnalyticsEvent.id,
              },
            ]
          : selectedAnalyticsEvent.movementId != null
            ? [
                {
                  workspaceId: selectedAnalyticsEventObligation.workspaceId,
                  entityType: "movement",
                  entityId: selectedAnalyticsEvent.movementId,
                },
              ]
            : [],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "entity-attachments",
          selectedAnalyticsEventObligation.workspaceId,
          "obligation-event",
          selectedAnalyticsEvent.id,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["entity-attachment-counts", selectedAnalyticsEventObligation.workspaceId, "obligation-event"],
      });
      if (selectedAnalyticsEvent.movementId != null) {
        await queryClient.invalidateQueries({
          queryKey: [
            "movement-attachments",
            selectedAnalyticsEventObligation.workspaceId,
            selectedAnalyticsEvent.movementId,
          ],
        });
      }
      showToast("Comprobante eliminado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setDeletingAnalyticsAttachmentPath(null);
    }
  }

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Créditos y Deudas" />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
        style={styles.filtersScroll}
      >
        {FILTER_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[styles.filterChip, activeFilter === chip.id && styles.filterChipActive]}
            onPress={() => setActiveFilter(chip.id)}
          >
            <Text style={[styles.filterChipText, activeFilter === chip.id && styles.filterChipTextActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <SectionList
        sections={obligationSections}
        keyExtractor={(item) => `${(item as SharedObligationSummary).workspaceId ?? ""}-${item.id}`}
        renderItem={renderObligationItem}
        renderSectionHeader={({ section }) => (
          <View>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            {section.hint ? (
              <Text style={styles.sectionHint}>{section.hint}</Text>
            ) : null}
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          isLoading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : sharedLoading && filteredShared.length === 0 && obligationSections.length === 0 ? (
            <View style={styles.sharedLoading}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.sharedLoadingText}>Cargando compartidos contigo…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading && workspaceData.length === 0 && filteredShared.length === 0 && !sharedLoading ? (
            <EmptyState
              title="Sin obligaciones"
              description="Registra préstamos, deudas y créditos aquí. Las que otros compartan contigo aparecen abajo en «Compartidos contigo»."
              action={
                activeFilter === "all"
                  ? { label: "Nueva obligación", onPress: () => setCreateFormVisible(true) }
                  : undefined
              }
            />
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        SectionSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
        refreshControl={
          <RefreshControl refreshing={listRefreshing} onRefresh={onRefreshOrig} tintColor={COLORS.primary} />
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={15}
        contentContainerStyle={styles.listContent}
      />

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />

      {/* Forms */}
      <ObligationForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
      {paymentRequestObligation ? (
        <PaymentRequestForm
          visible={Boolean(paymentRequestObligation)}
          onClose={() => setPaymentRequestObligation(null)}
          onSuccess={() => setPaymentRequestObligation(null)}
          obligation={paymentRequestObligation}
        />
      ) : null}
      <PaymentForm
        visible={Boolean(paymentObligation) || Boolean(editingEventForPayment)}
        onClose={() => { setPaymentObligation(null); setEditingEventForPayment(undefined); setEditEventObligation(null); }}
        onSuccess={() => { setPaymentObligation(null); setEditingEventForPayment(undefined); setEditEventObligation(null); }}
        obligation={paymentObligation ?? editEventObligation}
        editEvent={editingEventForPayment}
      />
      <PrincipalAdjustmentForm
        visible={Boolean(adjustObligation) || Boolean(editingEventForAdjustment)}
        mode={editingEventForAdjustment ? adjustEventMode : adjustMode}
        obligation={adjustObligation ?? editEventObligation}
        onClose={() => { setAdjustObligation(null); setEditingEventForAdjustment(undefined); setEditEventObligation(null); }}
        onSuccess={() => { setAdjustObligation(null); setEditingEventForAdjustment(undefined); setEditEventObligation(null); }}
        editEvent={editingEventForAdjustment}
      />

      {/* Undo-delete banner */}
      <UndoBanner
        visible={pendingDeleteIds.size > 0}
        message={pendingDeleteIds.size === 1 ? "Obligación eliminada" : `${pendingDeleteIds.size} obligaciones eliminadas`}
        onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
        durationMs={5000}
        bottomOffset={90}
      />

      <ObligationAnalyticsModal
        visible={Boolean(analyticsObligation)}
        obligation={liveAnalyticsObligation}
        onClose={() => setAnalyticsObligation(null)}
        onEventTap={handleEventTap}
        userId={profile?.id}
      />
      <ObligationEventActionSheet
        visible={analyticsEventMenuVisible}
        onClose={() => setAnalyticsEventMenuVisible(false)}
        eventTitle={
          ANALYTICS_EVENT_LABELS[selectedAnalyticsEvent?.eventType ?? ""] ?? selectedAnalyticsEvent?.eventType
        }
        dateLabel={
          selectedAnalyticsEvent
            ? format(parseDisplayDate(selectedAnalyticsEvent.eventDate), "d MMM yyyy", { locale: es })
            : null
        }
        amountLabel={
          selectedAnalyticsEvent
            ? formatCurrency(
                selectedAnalyticsEvent.amount,
                selectedAnalyticsEventObligation?.currencyCode ?? "",
              )
            : null
        }
        description={selectedAnalyticsEvent?.description ?? null}
        notes={selectedAnalyticsEvent?.notes ?? null}
        notices={
          selectedAnalyticsPreviewAttachmentsLoading
            ? [
                {
                  key: "checking-attachments",
                  text: "Comprobando si este evento tiene comprobantes...",
                  tone: "info" as const,
                },
              ]
            : []
        }
        quickActions={
          selectedAnalyticsPreviewAttachments.length > 0
            ? [
                {
                  key: "attachments",
                  label:
                    selectedAnalyticsPreviewAttachments.length === 1
                      ? "Ver comprobante"
                      : `Ver ${selectedAnalyticsPreviewAttachments.length} comprobantes`,
                  onPress: () => {
                    setAnalyticsEventMenuVisible(false);
                    setAnalyticsAttachmentPreviewVisible(true);
                  },
                  variant: "secondary" as const,
                },
              ]
            : []
        }
        actions={[
          ...(selectedAnalyticsEvent && ANALYTICS_EDITABLE_TYPES.has(selectedAnalyticsEvent.eventType)
            ? [
                {
                  key: "edit",
                  label: "Editar",
                  onPress: handleAnalyticsEditEvent,
                  variant: "primary" as const,
                },
              ]
            : []),
          {
            key: "delete",
            label: "Eliminar",
            variant: "ghost" as const,
            onPress: () => {
              setAnalyticsEventMenuVisible(false);
              setAnalyticsConfirmDeleteVisible(true);
            },
          },
        ]}
      />

      <AttachmentPreviewModal
        visible={analyticsAttachmentPreviewVisible}
        attachments={selectedAnalyticsPreviewAttachments}
        onClose={() => setAnalyticsAttachmentPreviewVisible(false)}
        onDeleteAttachment={handleDeleteAnalyticsAttachment}
        deletingAttachmentPath={deletingAnalyticsAttachmentPath}
        isLoading={selectedAnalyticsPreviewAttachmentsLoading}
        insets={insets}
        title="Comprobantes del evento"
      />

      <ConfirmDialog
        visible={Boolean(archiveTarget)}
        title={archiveTarget?.status === "cancelled" ? "Ya archivada" : "¿Archivar obligación?"}
        body={
          archiveTarget
            ? archiveTarget.status === "cancelled"
              ? `"${archiveTarget.title}" ya está archivada.`
              : `Se archivará "${archiveTarget.title}". No se elimina — puedes filtrar por estado "Cancelada" para verla.`
            : ""
        }
        confirmLabel={archiveTarget?.status === "cancelled" ? "Entendido" : "Archivar"}
        cancelLabel="Cancelar"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => {
          const target = archiveTarget;
          setArchiveTarget(null);
          if (target && target.status !== "cancelled") void handleArchiveObligation(target);
        }}
      />

      <ConfirmDialog
        visible={analyticsConfirmDeleteVisible}
        title="¿Eliminar evento?"
        body={
          selectedAnalyticsEvent?.movementId
            ? "Se eliminará el evento y el movimiento contable vinculado."
            : "Este evento será eliminado permanentemente."
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setAnalyticsConfirmDeleteVisible(false)}
        onConfirm={handleAnalyticsDeleteEvent}
      >
        {selectedAnalyticsEvent && selectedAnalyticsEventObligation ? (
          <EventDeleteImpact
            event={selectedAnalyticsEvent}
            obligation={selectedAnalyticsEventObligation}
          />
        ) : null}
      </ConfirmDialog>
    </View>
    </GestureDetector>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const swipeStyles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  payBg: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: REVEAL_W,
    backgroundColor: COLORS.pine + "30",
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  deleteBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_W,
    backgroundColor: COLORS.danger + "28",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  card: { padding: SPACING.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: SPACING.sm,
  },
  analyticsBtn: {
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginRight: SPACING.sm,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  pendingBadge: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: FONT_FAMILY.bodySemibold,
    includeFontPadding: false,
  },
  amount: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  counterparty: { fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  progressText: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  dueDate: { fontSize: FONT_SIZE.xs, color: COLORS.warning },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  filtersScroll: { flexGrow: 0 },
  filtersRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    minHeight: 38,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  filterChipText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm + 4,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  filterChipTextActive: { color: COLORS.pine },
  listContent: { padding: SPACING.lg, paddingBottom: 100 },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    opacity: 0.85,
    marginBottom: SPACING.sm,
    marginTop: -SPACING.xs,
  },
  sharedLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  sharedLoadingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  eventMenuSheet: {
    backgroundColor: COLORS.mist,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  eventMenuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  eventMenuTitle: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
    textAlign: "center",
  },
  eventMenuSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  eventMenuBtn: { marginTop: SPACING.xs },
  eventMenuDeleteBtn: { borderColor: COLORS.expense + "66" },
});

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
          <Text style={evImpactStyles.arrow}>→</Text>
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

export default function ObligationsScreenRoot() {
  return (
    <ErrorBoundary>
      <ObligationsScreen />
    </ErrorBoundary>
  );
}


