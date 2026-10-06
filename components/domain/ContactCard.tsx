import { memo } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react-native";

import {
  ResourceCard,
  ResourceCardIcon,
} from "../ui/ResourceCard";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { COLORS } from "../../constants/theme";
import { TYPE_ICON } from "../../features/contacts/lib/contactsLabels";
import { contactRowSubtitle } from "../../features/contacts/lib/contactRowSubtitle";
import type { CounterpartyOverview } from "../../types/domain";
import type { CurrencyAmount } from "../../lib/catalog-money";

export type ContactMetrics = {
  movementCount: number;
  receivablePendingTotal: number;
  payablePendingTotal: number;
  subscriptionCount: number;
  recurringIncomeCount: number;
  receivable?: CurrencyAmount[];
  payable?: CurrencyAmount[];
  hasReceivable?: boolean;
  hasPayable?: boolean;
};

type Props = {
  contact: CounterpartyOverview;
  metrics?: ContactMetrics;
  canDelete: boolean;
  onPress: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

function ContactCardContent({
  contact,
  metrics,
  onPress,
  onLongPress,
  selected,
}: {
  contact: CounterpartyOverview;
  metrics?: ContactMetrics;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  const ContactIcon = TYPE_ICON[contact.type];

  return (
    <ResourceCard
      variant="row"
      pinned={contact.isPinned}
      title={contact.name}
      subtitle={contactRowSubtitle(contact, metrics)}
      archived={contact.isArchived}
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
      leading={<ResourceCardIcon icon={ContactIcon} color={COLORS.storm} />}
    />
  );
}

function ContactCardBase({
  contact,
  metrics,
  canDelete,
  onPress,
  onArchive,
  onDelete,
  onRestore,
  onLongPress,
  selected = false,
  selectMode = false,
}: Props) {
  if (selectMode) {
    return (
      <ContactCardContent
        contact={contact}
        metrics={metrics}
        onPress={onPress}
        onLongPress={onLongPress}
        selected={selected}
      />
    );
  }

  const rightAction = contact.isArchived
    ? {
        label: "Restaurar",
        icon: ArchiveRestore,
        color: COLORS.pine,
        backgroundColor: COLORS.pine + "30",
        onPress: onRestore,
      }
    : canDelete
      ? {
          label: "Eliminar",
          icon: Trash2,
          color: COLORS.danger,
          backgroundColor: COLORS.danger + "28",
          haptic: "warning" as const,
          onPress: onDelete,
        }
      : {
          label: "Archivar",
          icon: Archive,
          color: COLORS.ember,
          backgroundColor: COLORS.ember + "30",
          onPress: onArchive,
        };

  return (
    <SwipeActionRow rightAction={rightAction} borderRadius={0}>
      {({ close, isOpen }) => (
        <ContactCardContent
          contact={contact}
          metrics={metrics}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onPress();
          }}
          onLongPress={onLongPress}
        />
      )}
    </SwipeActionRow>
  );
}

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const ContactCard = memo(ContactCardBase);
