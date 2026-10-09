import { notificationBadgeCount } from "../notification-counts";

describe("notification badge", () => {
  const rows = [{ status: "read" }, { status: "sent" }, { status: "pending" }, { status: "failed" }];
  it("uses the same persisted status rule as the inbox", () => {
    expect(notificationBadgeCount(rows)).toBe(3);
    expect(notificationBadgeCount([])).toBe(0);
  });
  it("does not truncate the badge to loaded rows", () => {
    expect(notificationBadgeCount(rows, 730)).toBe(730);
    expect(notificationBadgeCount(rows, 0)).toBe(0);
  });
  it("rejects invalid counts", () => {
    expect(notificationBadgeCount(rows, -1)).toBe(3);
    expect(notificationBadgeCount(rows, NaN)).toBe(3);
  });
});
