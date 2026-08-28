
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
  const partes: string[] = [];
  if (readCount > 0) partes.push(`${readCount} leída${readCount === 1 ? "" : "s"}`);
  if (inviteCount > 0) partes.push(`${inviteCount} invitación${inviteCount === 1 ? "" : "es"} pendiente${inviteCount === 1 ? "" : "s"}`);

  const actions = [
    onMarkAllRead && unreadCount > 0
      ? { key: "read-all", label: "Leer todas", disabled: actionsDisabled, onPress: onMarkAllRead }
      : null,
    onMarkAllUnread && readCount > 0
      ? { key: "unread-all", label: "No leer", disabled: actionsDisabled, onPress: onMarkAllUnread }
      : null,
    onDeleteAllRead && readCount > 0
      ? { key: "delete-read", label: "Eliminar leídas", destructive: true, disabled: actionsDisabled, onPress: onDeleteAllRead }
      : null,
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <MetricSummaryBar
      label="Sin leer"
      value={String(unreadCount)}
      valueColor={unreadCount > 0 ? COLORS.ink : COLORS.storm}
      support={partes.length > 0 ? partes.join(" · ") : "Todo al día"}
      actions={actions}
      help={{
        title: "Notificaciones sin leer",
        description: "Pendientes de revisar: alertas financieras, recordatorios y pagos detectados.",
      }}
    />
  );
}
