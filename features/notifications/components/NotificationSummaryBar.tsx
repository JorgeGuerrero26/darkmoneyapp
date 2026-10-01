
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS } from "../../../constants/theme";

type Props = {
  unreadCount: number;
  readCount: number;
  inviteCount: number;
};

export function NotificationSummaryBar({
  unreadCount,
  readCount,
  inviteCount,
}: Props) {
  const partes: string[] = [];
  if (readCount > 0) partes.push(`${readCount} leída${readCount === 1 ? "" : "s"}`);
  if (inviteCount > 0) partes.push(`${inviteCount} invitación${inviteCount === 1 ? "" : "es"} pendiente${inviteCount === 1 ? "" : "s"}`);

  return (
    <MetricSummaryBar
      label="Sin leer"
      value={String(unreadCount)}
      valueColor={unreadCount > 0 ? COLORS.ink : COLORS.storm}
      support={partes.length > 0 ? partes.join(" · ") : "Todo al día"}
      help={{
        title: "Notificaciones sin leer",
        description: "Pendientes de revisar: alertas financieras, recordatorios y pagos detectados.",
      }}
    />
  );
}
