import { type MutableRefObject } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Images } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { EVENT_TYPE_ICON } from "../../../../lib/obligation-event-presentation";
import {
  obligationHistoryEventAmountPrefix,
  obligationHistoryEventColor,
} from "../../../../lib/obligation-viewer-labels";
import { viewerEventAccountImpactCopy } from "../../../../lib/obligation-viewer-account-impact";
import { firstMeaningfulText } from "../../../../lib/text-utils";
import type {
  EventDeleteStatus,
  EventEditStatus,
  PendingOwnerDeleteRequest,
} from "../../../../lib/obligation-event-payloads";
import type {
  ObligationEventSummary,
  ObligationEventViewerLink,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type EventHistoryRowStyles = {
  eventCard: StyleProp<ViewStyle>;
  eventRowHighlighted: StyleProp<ViewStyle>;
  eventRowHighlightedPulse: StyleProp<ViewStyle>;
  eventCardInner: StyleProp<ViewStyle>;
  eventIconBox: StyleProp<ViewStyle>;
  eventIconText: StyleProp<TextStyle>;
  eventCardBody: StyleProp<ViewStyle>;
  eventTypeLabel: StyleProp<TextStyle>;
  eventDescription: StyleProp<TextStyle>;
  eventDescriptionMuted: StyleProp<TextStyle>;
  eventInstallmentNote: StyleProp<TextStyle>;
  eventImpactNote: StyleProp<TextStyle>;
  eventCardAmount: StyleProp<TextStyle>;
  eventChipsRow: StyleProp<ViewStyle>;
  movementChip: StyleProp<ViewStyle>;
  movementChipText: StyleProp<TextStyle>;
  eventAttachmentLoadingChip: StyleProp<ViewStyle>;
  eventAttachmentLoadingText: StyleProp<TextStyle>;
  eventAttachmentChip: StyleProp<ViewStyle>;
  eventAttachmentChipText: StyleProp<TextStyle>;
  ownerEventDeletePendingChip: StyleProp<ViewStyle>;
  ownerEventDeletePendingText: StyleProp<TextStyle>;
  viewerAccountLinkedChip: StyleProp<ViewStyle>;
  viewerAccountLinkedChipNegative: StyleProp<ViewStyle>;
  viewerAccountLinkedText: StyleProp<TextStyle>;
  viewerAccountLinkedTextNegative: StyleProp<TextStyle>;
  viewerAccountUnlinkedChip: StyleProp<ViewStyle>;
  viewerAccountUnlinkedText: StyleProp<TextStyle>;
  viewerEventActions: StyleProp<ViewStyle>;
  viewerEditPendingChip: StyleProp<ViewStyle>;
  viewerEditPendingText: StyleProp<TextStyle>;
  viewerDeletePendingChip: StyleProp<ViewStyle>;
  viewerDeletePendingText: StyleProp<TextStyle>;
  viewerDeleteAcceptedChip: StyleProp<ViewStyle>;
  viewerDeleteAcceptedText: StyleProp<TextStyle>;
  viewerRequestNote: StyleProp<TextStyle>;
};

type CardPosition = "single" | "first" | "middle" | "last";

type Props = {
  event: ObligationEventSummary;
  cardPosition: CardPosition;
  obligation: ObligationSummary | SharedObligationSummary;
  isSharedViewer: boolean;
  viewerLinkByEventId: Map<number, ObligationEventViewerLink>;
  linkedEventIds: Set<number>;
  eventAttachmentCounts: Record<number, number>;
  movementAttachmentCounts: Record<number, number>;
  eventAttachmentCountsLoading: boolean;
  movementAttachmentCountsLoading: boolean;
  viewerDeleteStatusByEventId: Map<number, EventDeleteStatus>;
  viewerEditStatusByEventId: Map<number, EventEditStatus>;
  ownerDeleteRequestByEventId: Map<number, PendingOwnerDeleteRequest>;
  highlightedEventId: number | null;
  highlightPulseOn: boolean;
  pendingFocusEventId: number | null;
  eventLabels: Record<string, string>;
  styles: EventHistoryRowStyles;
  eventRowLayoutsRef: MutableRefObject<Map<number, { y: number; height: number }>>;
  focusTimersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>;
  onFocusEvent: (eventId: number, options: { announce: boolean }) => void;
  onTapEvent: (event: ObligationEventSummary) => void;
  onPressMovement: (movementId: number) => void;
  onPressAttachments: (event: ObligationEventSummary) => void;
};

export function EventHistoryRow({
  event: ev,
  cardPosition,
  obligation,
  isSharedViewer,
  viewerLinkByEventId,
  linkedEventIds,
  eventAttachmentCounts,
  movementAttachmentCounts,
  eventAttachmentCountsLoading,
  movementAttachmentCountsLoading,
  viewerDeleteStatusByEventId,
  viewerEditStatusByEventId,
  ownerDeleteRequestByEventId,
  highlightedEventId,
  highlightPulseOn,
  pendingFocusEventId,
  eventLabels,
  styles,
  eventRowLayoutsRef,
  focusTimersRef,
  onFocusEvent,
  onTapEvent,
  onPressMovement,
  onPressAttachments,
}: Props) {
  const viewerLinkedAccountId = isSharedViewer
    ? viewerLinkByEventId.get(ev.id)?.accountId ?? null
    : null;
  const useCashPerspective = isSharedViewer && viewerLinkedAccountId != null;
  const evTint = obligationHistoryEventColor(
    ev.eventType,
    obligation.direction,
    isSharedViewer,
    useCashPerspective,
  );
  const evAmountPrefix = obligationHistoryEventAmountPrefix(
    ev.eventType,
    obligation.direction,
    isSharedViewer,
    useCashPerspective,
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
  const viewerImpactCopy = isSharedViewer
    ? viewerEventAccountImpactCopy(ev, obligation, viewerLinkedAccountId != null)
    : null;

  const cardRadius =
    cardPosition === "single"
      ? { borderRadius: 12 }
      : cardPosition === "first"
        ? { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }
        : cardPosition === "last"
          ? { borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }
          : { borderRadius: 4 };

  const hasChipsRow =
    showAttachmentLoading ||
    (ev.movementId && !isSharedViewer) ||
    attachmentCount > 0 ||
    isViewerLinkable ||
    ownerDeleteRequest;

  const hasViewerStatusRow =
    isSharedViewer && ev.eventType !== "opening" && (
      viewerEditStatus?.status === "pending" ||
      viewerDeleteStatus?.status === "pending" ||
      viewerDeleteStatus?.status === "accepted" ||
      viewerEditStatus?.status === "rejected" ||
      viewerDeleteStatus?.status === "rejected"
    );

  return (
    <View
      style={[
        styles.eventCard,
        cardRadius,
        isHighlighted && styles.eventRowHighlighted,
        isHighlighted && highlightPulseOn && styles.eventRowHighlightedPulse,
      ]}
      onLayout={(e) => {
        eventRowLayoutsRef.current.set(ev.id, {
          y: e.nativeEvent.layout.y,
          height: e.nativeEvent.layout.height,
        });
        if (pendingFocusEventId === ev.id) {
          const focusTimer = setTimeout(() => {
            onFocusEvent(ev.id, { announce: false });
          }, 60);
          focusTimersRef.current.push(focusTimer);
        }
      }}
    >
      <TouchableOpacity
        style={styles.eventCardInner}
        onPress={isTappable ? () => onTapEvent(ev) : undefined}
        activeOpacity={isTappable ? 0.7 : 1}
      >
        <View style={[styles.eventIconBox, { backgroundColor: evTint + "18" }]}>
          <Text style={[styles.eventIconText, { color: evTint }]}>
            {EVENT_TYPE_ICON[ev.eventType] ?? "·"}
          </Text>
        </View>

        <View style={styles.eventCardBody}>
          <Text style={[styles.eventTypeLabel, { color: evTint }]} numberOfLines={1}>
            {eventLabels[ev.eventType] ?? ev.eventType}
          </Text>
          {eventInlineDescription ? (
            <Text style={styles.eventDescription} numberOfLines={1}>
              {eventInlineDescription}
            </Text>
          ) : (
            <Text style={styles.eventDescriptionMuted}>Sin descripción</Text>
          )}
          {ev.installmentNo ? (
            <Text style={styles.eventInstallmentNote}>Cuota {ev.installmentNo}</Text>
          ) : null}
          {viewerImpactCopy ? (
            <Text
              style={[
                styles.eventImpactNote,
                viewerImpactCopy.tone === "positive"
                  ? { color: COLORS.income }
                  : viewerImpactCopy.tone === "negative"
                    ? { color: COLORS.danger }
                    : { color: COLORS.storm },
              ]}
            >
              {viewerImpactCopy.chipLabel}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.eventCardAmount, { color: evTint }]} numberOfLines={1}>
          {evAmountPrefix}{formatCurrency(ev.amount, obligation.currencyCode)}
        </Text>
      </TouchableOpacity>

      {hasChipsRow ? (
        <View style={styles.eventChipsRow}>
          {ev.movementId && !isSharedViewer ? (
            <TouchableOpacity
              style={styles.movementChip}
              onPress={() => ev.movementId != null && onPressMovement(ev.movementId)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.movementChipText}>Mov.</Text>
            </TouchableOpacity>
          ) : null}
          {showAttachmentLoading ? (
            <View style={styles.eventAttachmentLoadingChip}>
              <ActivityIndicator size="small" color={COLORS.storm} />
              <Text style={styles.eventAttachmentLoadingText}>Comprobando...</Text>
            </View>
          ) : null}
          {!showAttachmentLoading && attachmentCount > 0 ? (
            <TouchableOpacity
              style={styles.eventAttachmentChip}
              onPress={() => onPressAttachments(ev)}
              activeOpacity={0.86}
            >
              <Images size={11} color={COLORS.primary} />
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
            viewerImpactCopy && viewerImpactCopy.tone !== "neutral" ? (
              <View
                style={[
                  styles.viewerAccountLinkedChip,
                  viewerImpactCopy.tone === "negative" && styles.viewerAccountLinkedChipNegative,
                ]}
              >
                <Text
                  style={[
                    styles.viewerAccountLinkedText,
                    viewerImpactCopy.tone === "negative" && styles.viewerAccountLinkedTextNegative,
                  ]}
                >
                  {viewerImpactCopy.tone === "positive" ? "Cuenta asociada con entrada" : "Cuenta asociada con salida"}
                </Text>
              </View>
            ) : isLinked ? (
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

      {hasViewerStatusRow ? (
        <View style={styles.viewerEventActions}>
          {viewerEditStatus?.status === "pending" ? (
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
          {viewerEditStatus?.status === "rejected" ? (
            <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
              {viewerEditStatus.payload.rejectionReason?.trim()
                ? `Edicion rechazada: ${viewerEditStatus.payload.rejectionReason.trim()}`
                : "Solicitud de edicion rechazada"}
            </Text>
          ) : null}
          {viewerDeleteStatus?.status === "rejected" ? (
            <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
              {viewerDeleteStatus.payload.rejectionReason?.trim()
                ? `Rechazada: ${viewerDeleteStatus.payload.rejectionReason.trim()}`
                : "Solicitud de eliminacion rechazada"}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
