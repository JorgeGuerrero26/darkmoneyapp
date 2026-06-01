import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";
import { parseDisplayDate } from "../../../lib/date";
import type { EventDeleteStatus } from "../../../lib/obligation-event-payloads";
import type {
  ObligationEventSummary,
  ObligationPaymentRequest,
} from "../../../types/domain";
import { styles } from "../ObligationAnalyticsModal.styles";

type Props = {
  selectedViewerEvent: ObligationEventSummary | null;
  currency: string;
  attachmentsLoading: boolean;
  attachmentsCount: number;
  linkedEventIds: Set<number>;
  acceptedViewerRequestByEventId: Map<number, ObligationPaymentRequest>;
  viewerDeleteStatusByEventId: Map<number, EventDeleteStatus>;
  createDeleteRequestIsPending: boolean;
  onPressViewAttachments: () => void;
  onPressLinkAccount: (event: ObligationEventSummary) => void;
  onPressRequestDelete: (event: ObligationEventSummary) => void;
  onClose: () => void;
};

export function AnalyticsViewerEventActionSheet({
  selectedViewerEvent,
  currency,
  attachmentsLoading,
  attachmentsCount,
  linkedEventIds,
  acceptedViewerRequestByEventId,
  viewerDeleteStatusByEventId,
  createDeleteRequestIsPending,
  onPressViewAttachments,
  onPressLinkAccount,
  onPressRequestDelete,
  onClose,
}: Props) {
  return (
    <Modal
      visible={Boolean(selectedViewerEvent)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.approvalOverlay} onPress={onClose}>
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
              {attachmentsLoading ? (
                <Text style={styles.viewerActionNote}>Buscando comprobantes...</Text>
              ) : attachmentsCount > 0 ? (
                <TouchableOpacity
                  style={styles.approvalAcceptBtn}
                  onPress={onPressViewAttachments}
                >
                  <Text style={styles.approvalAcceptText}>
                    {attachmentsCount === 1
                      ? "Ver comprobante"
                      : `Ver ${attachmentsCount} comprobantes`}
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
                  onPress={() => onPressLinkAccount(selectedViewerEvent)}
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
                  onPress={() => onPressRequestDelete(selectedViewerEvent)}
                  disabled={createDeleteRequestIsPending}
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
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.approvalCancelText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}
