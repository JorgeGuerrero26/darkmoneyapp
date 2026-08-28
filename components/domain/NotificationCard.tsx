import { memo } from "react";
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
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";
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
  // Callbacks reciben la notificación como argumento, para que el padre pase handlers
  // ESTABLES (no closures por-item). Junto con memo, evita re-renderizar toda la lista
  // en cada cambio de selección o refetch — causa principal del lag en acciones masivas.
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
      variant="row"
      title={notification.title}
      subtitle={notification.body}
      selected={selected}
      archived={!unread}
      onPress={() => onPress(notification)}
      onLongPress={() => onLongPress(notification)}
      leading={<View style={[styles.dot, unread ? styles.dotUnread : styles.dotRead]} />}
      actions={selectionMode ? [] : [
        ...(unread ? [{
          key: "archive",
          icon: Archive,
          onPress: () => onArchive(notification.id),
          accessibilityLabel: "Archivar notificación",
          color: COLORS.primary,
        }] : []),
        {
          key: "delete",
          icon: Trash2,
          onPress: () => onDelete(notification.id),
          accessibilityLabel: "Eliminar notificación",
          color: COLORS.danger,
        },
      ]}
      meta={
        // Solo lo que NO se deduce del punto, del encabezado de fecha ni del filtro activo.
        obligationTitle ? <ResourceCardMetaText>{obligationTitle}</ResourceCardMetaText> : null
      }
      footer={
        <View style={styles.footer}>
          <Text style={styles.time}>{formatScheduledFor(notification.scheduledFor)}</Text>
          {notification.status === "pending" || notification.status === "failed" ? (
            <Text style={[styles.statusLabel, notification.status === "failed" && styles.statusError]}>
              {notification.status === "pending" ? "Pendiente" : "Error al enviar"}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}

export const NotificationCard = memo(NotificationCardComponent);

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    // Alineado con la primera línea del título, no centrado en la fila: una fila de dos líneas
    // dejaría el punto flotando a media altura sin apuntar a nada.
    marginTop: 6,
  },
  dotUnread: { backgroundColor: COLORS.dangerStrong },
  dotRead: { backgroundColor: SURFACE.subtleBorder },
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
  statusLabel: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  statusError: {
    color: COLORS.danger,
  },
});
