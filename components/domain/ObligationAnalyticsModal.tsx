import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronDown, X } from "lucide-react-native";

import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";
import type {
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
  useViewerPaymentRequestsQuery,
  useCreateObligationEventDeleteRequestMutation,
  useObligationEventViewerLinksQuery,
  useUpsertLinkEventToAccountMutation,
} from "../../services/queries/obligations";
import { useObligationEventAttachmentsQuery } from "../../services/queries/attachments";
import {
  analyticsEventPaymentNoun,
  analyticsPaidMetricLabel,
  obligationEventCashDeltaSign,
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
import { buildMonthlySeries } from "../../lib/obligation-monthly-series";
import { computeAnalyticsAmounts } from "../../lib/obligation-analytics-amounts";
import { useObligationAnalyticsHistory } from "../../hooks/useObligationAnalyticsHistory";
import { styles } from "./ObligationAnalyticsModal.styles";
import { AnalyticsChartBars } from "./analytics/AnalyticsChartBars";
import { ObligationAnalyticsOverview } from "./analytics/ObligationAnalyticsOverview";
import { AnalyticsTimeline } from "./analytics/AnalyticsTimeline";
import { AnalyticsViewerEventActionSheet } from "./analytics/AnalyticsViewerEventActionSheet";
import { AnalyticsViewerLinkAccountSheet } from "./analytics/AnalyticsViewerLinkAccountSheet";

type ChartScope = "6" | "12" | "all";
type TimelineFilter = "all" | "payments" | "capital";
type TimelinePerspective = "obligation" | "cash";

type Props = {
  visible: boolean;
  obligation: ObligationSummary | SharedObligationSummary | null;
  onClose: () => void;
  onEventTap?: (ev: ObligationEventSummary) => void;
  userId?: string | null;
};

export function ObligationAnalyticsModal({ visible, obligation, onClose, onEventTap, userId }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast, showErrorToast } = useToast();
  const [chartScope, setChartScope] = useState<ChartScope>("6");
  const [analyticsPerspective, setAnalyticsPerspective] = useState<TimelinePerspective>("obligation");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [calculationOpen, setCalculationOpen] = useState(false);
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({
    visible,
    onClose,
  });

  useEffect(() => {
    if (!visible || !obligation) return;
    setChartScope("6");
    setAnalyticsPerspective("obligation");
    setTimelineFilter("all");
    setCalculationOpen(false);
    setSelectedViewerEvent(null);
    setViewerAttachmentPreviewVisible(false);
    setLinkingEvent(null);
    setLinkingAccountId(null);
    setViewerDeleteRequestEvent(null);
  }, [visible, obligation?.id]);

  const isSharedViewer =
    obligation != null &&
    "viewerMode" in obligation &&
    (obligation as SharedObligationSummary).viewerMode === "shared_viewer";

  const {
    data: remoteEvents,
    isPending: remoteEventsPending,
    isError: remoteEventsError,
    refetch: refetchRemoteEvents,
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

  // Las solicitudes aceptadas permiten reconocer pagos ya asociados por el visor.
  const { data: viewerRequests = [] } = useViewerPaymentRequestsQuery(
    visible && isSharedViewer ? obligation?.id : null,
    userId,
  );
  const acceptedViewerRequestByEventId = useMemo(() => {
    const map = new Map<number, ObligationPaymentRequest>();
    for (const req of viewerRequests) {
      if (req.status === "accepted" && req.acceptedEventId != null) {
        map.set(req.acceptedEventId, req);
      }
    }
    return map;
  }, [viewerRequests]);

  const createDeleteRequestMutation = useCreateObligationEventDeleteRequestMutation();
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

  // Todos los hooks deben ejecutarse siempre (nunca después de `return null`).
  const {
    paymentEvents,
    allEventsSorted,
    timelineEvents,
  } = useObligationAnalyticsHistory(eventsForModal);

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
                // El movimiento sí se creó: lo que falló fue solo copiar los comprobantes.
                showErrorToast("Los comprobantes no se copiaron", data.attachmentSyncError);
              }
            },
          },
        );
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRequests, linkedEventIds.size]);

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
        };
      })
      .filter((item): item is { event: ObligationEventSummary; signedAmount: number } => item != null)
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
  const analyticsAmounts = useMemo(
    () => computeAnalyticsAmounts(obligation, paymentEvents),
    [obligation, paymentEvents],
  );

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
        // El movimiento sí quedó asociado: lo que falló fue solo copiar los comprobantes.
        showErrorToast("Los comprobantes no se copiaron", result.attachmentSyncError);
      }
    } catch (err: unknown) {
      showErrorToast("No se pudo asociar a tu cuenta", err);
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
      showToast("Solicitud de eliminación enviada", "success");
    } catch (err: unknown) {
      showErrorToast("No se pudo enviar la solicitud de eliminación", err);
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
  const maxAnalysisMonthly = Math.max(...analysisMonthlySeries.map((month) => Math.abs(month.total)), 1);
  const analysisPositiveTotal = analysisEvents
    .filter((item) => item.signedAmount > 0)
    .reduce((sum, item) => sum + item.signedAmount, 0);
  const analysisNegativeTotal = analysisEvents
    .filter((item) => item.signedAmount < 0)
    .reduce((sum, item) => sum + Math.abs(item.signedAmount), 0);
  const analysisTotalRecorded = analysisPositiveTotal - analysisNegativeTotal;
  const paidMetricLabel = analyticsPaidMetricLabel(obligation.direction, isSharedViewer);
  const eventPaymentNoun = analyticsEventPaymentNoun(obligation.direction, isSharedViewer);
  const analysisRelevantEventCount = allEventsSorted.filter((event) =>
    event.eventType === "payment" ||
    event.eventType === "principal_increase" ||
    event.eventType === "principal_decrease",
  ).length;
  const analysisUnlinkedEventCount =
    analyticsUsesCashPerspective
      ? Math.max(0, analysisRelevantEventCount - analysisEvents.length)
      : 0;
  const filteredTimelineEvents = (() => {
    return timelineEvents.filter((event) => {
      if (analyticsUsesCashPerspective && !shouldUseCashPerspective(event.id, analyticsPerspective)) return false;
      if (timelineFilter === "payments" && event.eventType !== "payment") return false;
      if (timelineFilter === "capital" && event.eventType === "payment") return false;
      return true;
    });
  })();
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
            <View style={[styles.header, redesignedStyles.header]}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Analítica</Text>
                <Text style={styles.subtitle} numberOfLines={2}>{obligation.title} · {obligation.counterparty}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={18} color={COLORS.storm} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, redesignedStyles.content]}
            showsVerticalScrollIndicator={false}
          >
            {isSharedViewer && remoteEventsPending && !remoteEvents ? (
              <View style={redesignedStyles.feedback}>
                <ActivityIndicator color={COLORS.storm} />
                <Text style={redesignedStyles.feedbackText}>Cargando actividad compartida…</Text>
              </View>
            ) : isSharedViewer && remoteEventsError ? (
              <View style={redesignedStyles.feedback}>
                <Text style={redesignedStyles.feedbackText}>No se pudo cargar la actividad compartida.</Text>
                <TouchableOpacity onPress={() => { void refetchRemoteEvents(); }} accessibilityRole="button">
                  <Text style={redesignedStyles.retry}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : <>
            <ObligationAnalyticsOverview
              obligation={obligation}
              currentPrincipal={currentPrincipal}
              paidAmount={paidAmount}
              paymentCount={paymentEvents.length}
              progressPercent={displayProgressPercent}
              paidLabel={paidMetricLabel}
              isSharedViewer={isSharedViewer}
              cashPerspective={analyticsUsesCashPerspective}
              cashNet={analysisTotalRecorded}
              cashIn={analysisPositiveTotal}
              cashOut={analysisNegativeTotal}
              linkedCount={analysisEvents.length}
              unlinkedCount={analysisUnlinkedEventCount}
              onChangePerspective={(cash) => setAnalyticsPerspective(cash ? "cash" : "obligation")}
            />

            <AnalyticsChartBars
              title={analyticsUsesCashPerspective ? "Tu caja mes a mes" : `${eventPaymentNoun}s mes a mes`}
              series={analysisMonthlySeries}
              maxAbsValue={maxAnalysisMonthly}
              currency={currency}
              signedDisplay={analyticsUsesCashPerspective}
              chartScope={chartScope}
              onChangeChartScope={setChartScope}
            />

            <AnalyticsTimeline
              key={`${obligation.id}-${analyticsPerspective}`}
              timelineEvents={timelineEvents}
              filteredTimelineEvents={filteredTimelineEvents}
              timelineFilter={timelineFilter}
              onChangeTimelineFilter={setTimelineFilter}
              analyticsDirection={analyticsDirection}
              isSharedViewer={isSharedViewer}
              currency={currency}
              eventPaymentNoun={eventPaymentNoun}
              shouldUseCashPerspective={(eventId) => shouldUseCashPerspective(eventId, analyticsPerspective)}
              onEventTap={onEventTap}
              onViewerEventTap={handleViewerEventTap}
            />

            <TouchableOpacity
              style={redesignedStyles.calculationRow}
              onPress={() => setCalculationOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: calculationOpen }}
            >
              <Text style={redesignedStyles.calculationLabel}>Cómo se calcula</Text>
              <ChevronDown size={16} color={COLORS.storm} style={calculationOpen && redesignedStyles.chevronOpen} />
            </TouchableOpacity>
            {calculationOpen ? (
              <Text style={redesignedStyles.calculationText}>
                El pendiente es el monto acordado menos los pagos registrados, con los ajustes de capital. El porcentaje compara lo pagado con ese monto. La vista de tus cuentas incluye solo eventos vinculados a una cuenta; el gráfico suma esos movimientos por mes.
              </Text>
            ) : null}
            </>}

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
    </Modal>
  );
}

const redesignedStyles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl },
  content: { gap: 0, paddingHorizontal: SPACING.xl },
  feedback: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  feedbackText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
  retry: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  calculationRow: {
    minHeight: 56,
    marginTop: SPACING.xxxl,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  calculationLabel: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  calculationText: { paddingTop: SPACING.md, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 21, color: COLORS.storm },
});
