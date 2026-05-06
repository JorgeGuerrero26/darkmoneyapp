import { StyleSheet, Text, View } from "react-native";
import { Archive, Trash2 } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import {
  getNotificationPriority,
  getNotificationPriorityMeta,
} from "../../lib/notification-priority";
import {
  getNotificationKindMeta,
  payloadString,
} from "../../features/notifications/lib/notificationPresentation";
import type { NotificationItem } from "../../types/domain";

type Props = {
  notification: NotificationItem;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function formatScheduledFor(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "d MMM · HH:mm", { locale: es });
}

export function NotificationCard({
  notification,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  onArchive,
  onDelete,
}: Props) {
  const unread = notification.status !== "read";
  const priority = getNotificationPriority(notification.kind);
  const priorityMeta = getNotificationPriorityMeta(priority);
  const kindMeta = getNotificationKindMeta(notification.kind);
  const obligationTitle = payloadString(notification.payload, "obligationTitle");

  return (
    <ResourceCard
      title={notification.title}
      subtitle={notification.body}
      selected={selected}
      archived={!unread}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={kindMeta.icon} color={kindMeta.color} />}
      actions={selectionMode ? [] : [
        ...(unread ? [{
          key: "archive",
          icon: Archive,
          onPress: onArchive,
          accessibilityLabel: "Archivar notificación",
          color: COLORS.primary,
        }] : []),
        {
          key: "delete",
          icon: Trash2,
          onPress: onDelete,
          accessibilityLabel: "Eliminar notificación",
          color: COLORS.danger,
        },
      ]}
      meta={
        <>
          <ResourceCardBadge label={priorityMeta.label} color={priorityMeta.color} />
          {unread ? <ResourceCardBadge label="Nueva" color={kindMeta.color} /> : null}
          {selected ? <ResourceCardBadge label="Seleccionada" color={COLORS.primary} /> : null}
          {obligationTitle ? <ResourceCardMetaText>{obligationTitle}</ResourceCardMetaText> : null}
        </>
      }
      footer={
        <View style={styles.footer}>
          <Text style={styles.time}>{formatScheduledFor(notification.scheduledFor)}</Text>
          <Text style={styles.status}>{notification.status}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  time: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textDisabled,
  },
  status: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
});
