/** Persisted inbox only: priority, read_at and local reminders do not redefine unread. */
export function notificationBadgeCount(items: readonly { status: string }[], serverUnread?: number) {
  if (typeof serverUnread === "number" && Number.isSafeInteger(serverUnread) && serverUnread >= 0) return serverUnread;
  return items.filter((item) => item.status !== "read").length;
}
