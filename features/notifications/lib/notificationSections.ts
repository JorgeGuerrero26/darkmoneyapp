import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import {
  getNotificationPriority,
  getNotificationPriorityMeta,
  type NotificationPriority,
} from "../../../lib/notification-priority";
import type { NotificationItem, PendingObligationShareInviteItem } from "../../../types/domain";

export type NotificationFilter = "all" | NotificationPriority;

export const NOTIFICATION_FILTERS: Array<{ label: string; value: NotificationFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Críticas", value: "critical" },
  { label: "Importantes", value: "important" },
  { label: "Informativas", value: "informational" },
];

export type NotificationListItem =
  | {
    kind: "invite";
    key: string;
    invite: PendingObligationShareInviteItem;
  }
  | {
    kind: "notification";
    key: string;
    notification: NotificationItem;
    priority: NotificationPriority;
  };

export type NotificationListSection = ResourceSection<
  NotificationListItem,
  "invites" | NotificationPriority
>;

export function buildNotificationSections(
  notifications: NotificationItem[],
  invites: PendingObligationShareInviteItem[],
  activeFilter: NotificationFilter,
): NotificationListSection[] {
  const sections: NotificationListSection[] = [];

  if (invites.length > 0 && activeFilter === "all") {
    sections.push({
      key: "invites",
      label: `Invitaciones pendientes (${invites.length})`,
      data: invites.map((invite) => ({
        kind: "invite" as const,
        key: `invite-${invite.token}`,
        invite,
      })),
      headerVariant: "default",
    });
  }

  const grouped: Record<NotificationPriority, NotificationItem[]> = {
    critical: [],
    important: [],
    informational: [],
  };

  for (const notification of notifications) {
    const priority = getNotificationPriority(notification.kind);
    grouped[priority].push(notification);
  }

  for (const priority of ["critical", "important", "informational"] as const) {
    if (activeFilter !== "all" && activeFilter !== priority) continue;
    const items = grouped[priority];
    if (items.length === 0) continue;
    const meta = getNotificationPriorityMeta(priority);
    const unreadCount = items.filter((item) => item.status !== "read").length;
    sections.push({
      key: priority,
      label: `${meta.title}${unreadCount > 0 ? ` (${unreadCount})` : ""}`,
      hint: meta.subtitle,
      data: items.map((notification) => ({
        kind: "notification" as const,
        key: `notification-${notification.id}`,
        notification,
        priority,
      })),
      headerVariant: "default",
    });
  }

  return sections;
}

export function getNotificationFilterLabel(filter: NotificationFilter) {
  return NOTIFICATION_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}
