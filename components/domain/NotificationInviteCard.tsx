import { Mail } from "lucide-react-native";

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS } from "../../constants/theme";
import type { PendingObligationShareInviteItem } from "../../types/domain";

type Props = {
  invite: PendingObligationShareInviteItem;
  onPress: () => void;
};

export function NotificationInviteCard({ invite, onPress }: Props) {
  const kindLabel = invite.inviteKindLabel === "deuda"
    ? "deuda"
    : invite.inviteKindLabel === "credito"
      ? "crédito"
      : "crédito o deuda";
  const title = invite.obligationTitle ?? `Solicitud de ${kindLabel}`;

  return (
    <ResourceCard
      title={`Tienes una ${kindLabel} compartida`}
      subtitle={invite.ownerDisplayName
        ? `${invite.ownerDisplayName} te envió una solicitud.`
        : "Tienes una solicitud pendiente."}
      onPress={onPress}
      leading={<ResourceCardIcon icon={Mail} color={COLORS.pine} />}
      meta={
        <>
          <ResourceCardBadge label="Invitación" color={COLORS.pine} />
          <ResourceCardMetaText>{title}</ResourceCardMetaText>
        </>
      }
      footer={invite.message ? <ResourceCardMetaText>"{invite.message}"</ResourceCardMetaText> : null}
    />
  );
}
