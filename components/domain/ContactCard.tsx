import { StyleSheet, Text, View } from "react-native";
import { Archive, ArchiveRestore, Building2, Landmark, Store, Trash2, User, Wrench, Circle } from "lucide-react-native";

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";
import type { CounterpartyOverview, CounterpartyType } from "../../types/domain";

export type ContactMetrics = {
  movementCount: number;
  receivablePendingTotal: number;
  payablePendingTotal: number;
  subscriptionCount: number;
  recurringIncomeCount: number;
};

type Props = {
  contact: CounterpartyOverview;
  metrics?: ContactMetrics;
  canDelete: boolean;
  onPress: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
};

const TYPE_LABEL: Record<CounterpartyType, string> = {
  person: "Persona",
  company: "Empresa",
  merchant: "Comercio",
  service: "Servicio",
  bank: "Banco",
  other: "Otro",
};

const TYPE_ICON: Record<CounterpartyType, typeof Circle> = {
  person: User,
  company: Building2,
  merchant: Store,
  service: Wrench,
  bank: Landmark,
  other: Circle,
};

function ContactCardContent({
  contact,
  metrics,
  onPress,
}: {
  contact: CounterpartyOverview;
  metrics?: ContactMetrics;
  onPress: () => void;
}) {
  const ContactIcon = TYPE_ICON[contact.type] ?? Circle;
  const typeLabel = TYPE_LABEL[contact.type] ?? contact.type;
  const primaryDetail =
    contact.phone?.trim() ||
    contact.email?.trim() ||
    (contact.documentNumber?.trim() ? `Doc. ${contact.documentNumber.trim()}` : null);
  const movementCount = metrics?.movementCount ?? contact.movementCount;

  return (
    <ResourceCard
      title={contact.name}
      subtitle={primaryDetail || typeLabel}
      archived={contact.isArchived}
      onPress={onPress}
      leading={<ResourceCardIcon icon={ContactIcon} color={COLORS.primary} />}
      meta={
        <>
          <ResourceCardBadge label={typeLabel} color={COLORS.primary} />
          {metrics?.receivablePendingTotal ? <ResourceCardBadge label="Cobra" color={COLORS.pine} /> : null}
          {metrics?.payablePendingTotal ? <ResourceCardBadge label="Debe" color={COLORS.rosewood} /> : null}
          {movementCount > 0 ? <ResourceCardMetaText>{movementCount} mov.</ResourceCardMetaText> : null}
          {metrics?.subscriptionCount ? <ResourceCardMetaText>{metrics.subscriptionCount} subs.</ResourceCardMetaText> : null}
          {metrics?.recurringIncomeCount ? <ResourceCardMetaText>{metrics.recurringIncomeCount} ingresos</ResourceCardMetaText> : null}
        </>
      }
      trailing={
        contact.isArchived ? (
          <View style={styles.archivedPill}>
            <Text style={styles.archivedText}>Archivado</Text>
          </View>
        ) : null
      }
    />
  );
}

export function ContactCard({
  contact,
  metrics,
  canDelete,
  onPress,
  onArchive,
  onDelete,
  onRestore,
}: Props) {
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
    <SwipeActionRow rightAction={rightAction} borderRadius={RADIUS.xl}>
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
        />
      )}
    </SwipeActionRow>
  );
}

const styles = StyleSheet.create({
  archivedPill: {
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.storm + "18",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  archivedText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
