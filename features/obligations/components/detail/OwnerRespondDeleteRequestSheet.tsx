import {
  Modal,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { Button } from "../../../../components/ui/Button";
import { ObligationEventDeleteImpact } from "../../../../components/domain/ObligationEventDeleteImpact";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { SPACING } from "../../../../constants/theme";
import type { PendingOwnerDeleteRequest } from "../../../../lib/obligation-event-payloads";
import type {
  AccountSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type OwnerRespondDeleteRequestSheetStyles = {
  overlay: StyleProp<ViewStyle>;
  rejectSheet: StyleProp<ViewStyle>;
  rejectTitle: StyleProp<TextStyle>;
  rejectSub: StyleProp<TextStyle>;
  viewerRequestNote: StyleProp<TextStyle>;
  rejectConfirmBtn: StyleProp<ViewStyle>;
};

type Props = {
  styles: OwnerRespondDeleteRequestSheetStyles;
  ownerDeleteRequestTarget: PendingOwnerDeleteRequest | null;
  obligation: ObligationSummary | SharedObligationSummary | null;
  accounts: AccountSummary[];
  insetBottom: number;
  approveIsPending: boolean;
  rejectIsPending: boolean;
  onApprove: (target: PendingOwnerDeleteRequest) => void;
  onReject: (target: PendingOwnerDeleteRequest) => void;
  onCancel: () => void;
};

export function OwnerRespondDeleteRequestSheet({
  styles,
  ownerDeleteRequestTarget,
  obligation,
  accounts,
  insetBottom,
  approveIsPending,
  rejectIsPending,
  onApprove,
  onReject,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={Boolean(ownerDeleteRequestTarget)}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View
          style={[styles.rejectSheet, { paddingBottom: insetBottom + SPACING.lg }]}
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
                  accounts={accounts}
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
              if (ownerDeleteRequestTarget) onApprove(ownerDeleteRequestTarget);
            }}
            loading={approveIsPending}
          />
          <Button
            label="Rechazar"
            variant="ghost"
            onPress={() => {
              if (ownerDeleteRequestTarget) onReject(ownerDeleteRequestTarget);
            }}
            loading={rejectIsPending}
            style={styles.rejectConfirmBtn}
          />
          <Button
            label="Cancelar"
            variant="ghost"
            onPress={onCancel}
          />
        </View>
      </Pressable>
    </Modal>
  );
}
