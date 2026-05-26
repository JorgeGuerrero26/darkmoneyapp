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

/** Groups every notification `kind` into a higher-level bucket suitable for filtering UI. */
export type NotificationKindGroup =
  | "all"
  | "detected_movements"
  | "obligations"
  | "subscriptions"
  | "balance"
  | "invites"
  | "digest"
  | "other";

export const NOTIFICATION_KIND_GROUPS: Array<{ label: string; value: NotificationKindGroup }> = [
  { label: "Todos los tipos", value: "all" },
  { label: "Movimientos detectados", value: "detected_movements" },
  { label: "Obligaciones", value: "obligations" },
  { label: "Suscripciones", value: "subscriptions" },
  { label: "Saldos", value: "balance" },
  { label: "Invitaciones", value: "invites" },
  { label: "Resumen IA", value: "digest" },
  { label: "Otros", value: "other" },
];

export function getNotificationKindGroup(kind: string): NotificationKindGroup {
  if (kind === "detected_movement_suggestion") return "detected_movements";
  if (kind.startsWith("obligation_")) return "obligations";
  if (kind.startsWith("subscription_") || kind === "multiple_subscriptions_due") return "subscriptions";
  if (kind === "low_balance" || kind === "negative_balance") return "balance";
  if (kind === "workspace_invite" || kind === "obligation_share_invite") return "invites";
  if (kind === "daily_ai_digest" || kind === "weekly_ai_digest") return "digest";
  return "other";
}

export function getNotificationKindGroupLabel(group: NotificationKindGroup) {
  return NOTIFICATION_KIND_GROUPS.find((item) => item.value === group)?.label ?? group;
}

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
  kindGroup: NotificationKindGroup = "all",
): NotificationListSection[] {
  const sections: NotificationListSection[] = [];

  const baseFiltered = unreadOnly ? notifications.filter((n) => n.status !== "read") : notifications;
  const filteredByPriority =
    activeFilter === "all"
      ? baseFiltered
      : baseFiltered.filter((n) => getNotificationPriority(n.kind) === activeFilter);
  const filtered = kindGroup === "all"
    ? filteredByPriority
    : filteredByPriority.filter((n) => getNotificationKindGroup(n.kind) === kindGroup);

  // Invites get their own section only when neither filter is narrowing.
  if (invites.length > 0 && activeFilter === "all" && (kindGroup === "all" || kindGroup === "invites")) {
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
