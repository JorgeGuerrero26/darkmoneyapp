import type { NotificationItem, PendingObligationShareInviteItem } from "../../../../types/domain";
import { buildNotificationSections } from "../notificationSections";

const today = new Date().toISOString();

const notifications = [
  { id: 1, title: "Cobro pendiente", body: "Cuenta Sueldo", kind: "obligation_due", status: "pending", scheduledFor: today },
  { id: 2, title: "Pago detectado", body: "Taxi", kind: "detected_movement_suggestion", status: "read", scheduledFor: today },
] as NotificationItem[];

const invites = [
  { token: "invite-1", obligationTitle: "Préstamo", ownerDisplayName: "Ana" },
] as PendingObligationShareInviteItem[];

describe("secciones de notificaciones", () => {
  it("combina búsqueda, tipo y no leídas sin alterar el grupo de fecha", () => {
    const sections = buildNotificationSections(notifications, invites, "all", true, "obligations", "sueldo");
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("today");
    expect(sections[0].headerVariant).toBe("divider");
    expect(sections[0].trailing).toBe("1 sin leer");
    expect(sections[0].data.map((item) => item.key)).toEqual(["notification-1"]);
  });

  it("encuentra invitaciones por remitente y oculta las que no coinciden", () => {
    const found = buildNotificationSections(notifications, invites, "all", false, "invites", "ana");
    expect(found.map((section) => section.key)).toEqual(["invites"]);
    expect(found[0].data[0].key).toBe("invite-invite-1");

    const missing = buildNotificationSections(notifications, invites, "all", false, "invites", "otra persona");
    expect(missing).toHaveLength(0);
  });
});
