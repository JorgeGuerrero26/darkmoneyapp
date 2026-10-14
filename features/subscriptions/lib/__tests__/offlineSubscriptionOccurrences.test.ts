import { buildLocalSubscriptionOccurrences } from "../offlineSubscriptionOccurrences";

const row = (extra: Record<string, unknown>) => ({
  id: 1, subscription_id: 5, due_date: "2026-10-05", expected_amount: "29.90", status: "paid", movement_id: 77, paid_at: "2026-10-05T12:00:00Z", notes: null, ...extra,
});

describe("historial de una suscripción desde la copia local", () => {
  it("solo las de esa suscripción, ordenadas por vencimiento", () => {
    const rows = buildLocalSubscriptionOccurrences([row({ id: 2, due_date: "2026-11-05" }), row({ id: 1 }), row({ id: 3, subscription_id: 9 })], 5);
    expect(rows.map((r) => [r.id, r.dueDate])).toEqual([[1, "2026-10-05"], [2, "2026-11-05"]]);
  });

  it("deja los datos como los muestra la pantalla", () => {
    expect(buildLocalSubscriptionOccurrences([row({ due_date: "2026-10-05T00:00:00+00:00", movement_id: null, paid_at: null })], 5)).toEqual([
      { id: 1, subscriptionId: 5, dueDate: "2026-10-05", expectedAmount: 29.9, status: "paid", movementId: null, paidAt: null, notes: null },
    ]);
  });
});
