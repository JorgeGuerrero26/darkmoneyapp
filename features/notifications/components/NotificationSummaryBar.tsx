import { Bell, CheckCheck, Mail } from "lucide-react-native";

import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  unreadCount: number;
  readCount: number;
  inviteCount: number;
  onMarkAllRead?: () => void;
  onMarkAllUnread?: () => void;
  onDeleteAllRead?: () => void;
  actionsDisabled?: boolean;
};

export function NotificationSummaryBar({
  unreadCount,
  readCount,
  inviteCount,
  onMarkAllRead,
  onMarkAllUnread,
  onDeleteAllRead,
  actionsDisabled,
}: Props) {
  return (
    <MetricSummaryBar
      items={[
        {
          key: "unread",
          icon: Bell,
          value: String(unreadCount),
          label: "sin leer",
          color: unreadCount > 0 ? COLORS.primary : COLORS.storm,
          strong: true,
          helpTitle: "Notificaciones sin leer",
          helpDescription: "Notificaciones pendientes de revisar. Incluye alertas financieras, recordatorios y avisos relevantes.",
        },
        {
          key: "read",
          icon: CheckCheck,
          value: String(readCount),
          label: "leídas",
          color: COLORS.income,
          helpTitle: "Notificaciones leídas",
          helpDescription: "Notificaciones que ya fueron marcadas como revisadas.",
        },
        {
          key: "invites",
          icon: Mail,
          value: String(inviteCount),
          label: "invitaciones",
          color: inviteCount > 0 ? COLORS.pine : COLORS.storm,
          helpTitle: "Invitaciones",
          helpDescription: "Invitaciones relacionadas con workspaces compartidos o colaboración.",
        },
      ]}
      actions={[
        ...(onMarkAllRead ? [{
          key: "read-all",
          label: "Leer todas",
          disabled: unreadCount === 0 || actionsDisabled,
          onPress: onMarkAllRead,
        }] : []),
        ...(onMarkAllUnread ? [{
          key: "unread-all",
          label: "No leer",
          disabled: readCount === 0 || actionsDisabled,
          onPress: onMarkAllUnread,
        }] : []),
        ...(onDeleteAllRead ? [{
          key: "delete-read",
          label: "Eliminar leídas",
          disabled: readCount === 0 || actionsDisabled,
          onPress: onDeleteAllRead,
          destructive: true,
        }] : []),
      ]}
    />
  );
}
