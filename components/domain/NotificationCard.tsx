import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Archive, Trash2 } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { ResourceCard, ResourceCardIcon, ResourceCardMetaText } from "../ui/ResourceCard";
import { SwipeActionRow } from "../ui/SwipeActionRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, SURFACE } from "../../constants/theme";
import { getNotificationKindMeta, payloadString } from "../../features/notifications/lib/notificationPresentation";
import type { NotificationItem } from "../../types/domain";

type Props = {
  notification: NotificationItem;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: (notification: NotificationItem) => void;
  onLongPress: (notification: NotificationItem) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
};

function formatScheduledFor(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "d MMM · HH:mm", { locale: es });
}

function NotificationCardComponent({
  notification, selected, selectionMode, onPress, onLongPress, onArchive, onDelete,
}: Props) {
  const unread = notification.status !== "read";
  const { icon } = getNotificationKindMeta(notification.kind);
  const obligationTitle = payloadString(notification.payload, "obligationTitle");
  const row = (onRowPress: () => void) => (
    <ResourceCard
      variant="row"
      title={notification.title}
      subtitle={notification.body}
      meta={obligationTitle ? <ResourceCardMetaText>{obligationTitle}</ResourceCardMetaText> : null}
      selected={selected}
      muted={!unread}
      onPress={onRowPress}
      onLongPress={() => onLongPress(notification)}
      leading={
        <View>
          <ResourceCardIcon icon={icon} color={COLORS.storm} />
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
      }
      trailing={<View style={styles.trailing}>
        <Text style={styles.date}>{formatScheduledFor(notification.scheduledFor)}</Text>
        {notification.status === "pending" || notification.status === "failed" ? (
          <Text style={[styles.status, notification.status === "failed" && styles.statusError]}>
            {notification.status === "pending" ? "Pendiente" : "Error al enviar"}
          </Text>
        ) : null}
      </View>}
    />
  );

  if (selectionMode) return row(() => onPress(notification));

  return (
    <SwipeActionRow
      borderRadius={0}
      leftAction={unread ? {
        label: "Leída",
        icon: Archive,
        color: COLORS.fog,
        backgroundColor: SURFACE.cardActive,
        onPress: () => onArchive(notification.id),
      } : null}
      rightAction={{
        label: "Eliminar",
        icon: Trash2,
        color: COLORS.danger,
        backgroundColor: COLORS.danger + "28",
        haptic: "warning",
        onPress: () => onDelete(notification.id),
      }}
    >
      {({ close, isOpen }) => row(() => {
        if (isOpen()) { close(); return; }
        onPress(notification);
      })}
    </SwipeActionRow>
  );
}

export const NotificationCard = memo(NotificationCardComponent);

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end", gap: 3 },
  unreadDot: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.rosewood,
  },
  date: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  status: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  statusError: { color: COLORS.danger },
});
