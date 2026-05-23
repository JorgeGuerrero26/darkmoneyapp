import { startOfDay, differenceInCalendarDays } from "date-fns";
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

type DateBucket = "today" | "yesterday" | "this_week" | "earlier";

export type NotificationListSection = ResourceSection<
  NotificationListItem,
  "invites" | DateBucket
>;

const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  this_week: "Esta semana",
  earlier: "Anteriores",
};

function getDateBucket(dateStr: string): DateBucket {
  const today = startOfDay(new Date());
  const date = startOfDay(new Date(dateStr));
  const diff = differenceInCalendarDays(today, date);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 7) return "this_week";
  return "earlier";
}

export function buildNotificationSections(
  notifications: NotificationItem[],
  invites: PendingObligationShareInviteItem[],
  activeFilter: NotificationFilter,
  unreadOnly?: boolean,
): NotificationListSection[] {
  const sections: NotificationListSection[] = [];

  const baseFiltered = unreadOnly ? notifications.filter((n) => n.status !== "read") : notifications;
  const filtered =
    activeFilter === "all"
      ? baseFiltered
      : baseFiltered.filter((n) => getNotificationPriority(n.kind) === activeFilter);

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

  const grouped: Record<DateBucket, NotificationItem[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    earlier: [],
  };

  for (const notification of filtered) {
    const bucket = getDateBucket(notification.scheduledFor);
    grouped[bucket].push(notification);
  }

  for (const bucket of ["today", "yesterday", "this_week", "earlier"] as const) {
    const items = grouped[bucket];
    if (items.length === 0) continue;
    const unreadCount = items.filter((item) => item.status !== "read").length;
    sections.push({
      key: bucket,
      label: `${DATE_BUCKET_LABELS[bucket]}${unreadCount > 0 ? ` · ${unreadCount} nuevas` : ""}`,
      data: items.map((notification) => ({
        kind: "notification" as const,
        key: `notification-${notification.id}`,
        notification,
        priority: getNotificationPriority(notification.kind),
      })),
      headerVariant: "default",
    });
  }

  return sections;
}

export function getNotificationFilterLabel(filter: NotificationFilter) {
  return NOTIFICATION_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}
