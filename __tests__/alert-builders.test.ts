import { buildDuplicateChargeAlerts, buildSubscriptionPriceIncreaseAlerts } from "../features/notifications/lib/alertBuilders";

const sub = (over = {}) => ({ id: 5, name: "Netflix", currencyCode: "PEN", status: "active", ...over }) as any;
const pago = (id: number, occurredAt: string, sourceAmount: number) =>
  ({ id, subscriptionId: 5, occurredAt, sourceAmount, destinationAmount: null }) as any;
const mv = (id: number, occurredAt: string, categoryId: number, sourceAmount: number | null) =>
  ({ id, categoryId, occurredAt, sourceAmount, destinationAmount: null }) as any;
const catKinds = new Map([[10, "expense"], [20, "income"]]);

describe("buildSubscriptionPriceIncreaseAlerts", () => {
  it("alerta cuando el ultimo pago sube >=5% vs el anterior", () => {
    const rows = buildSubscriptionPriceIncreaseAlerts([sub()], [
      pago(1, "2026-06-05T10:00:00Z", 34.9),
      pago(2, "2026-07-05T10:00:00Z", 44.9),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_price_increase");
    expect(rows[0].related_entity_id).toBe(5);
    expect(rows[0].body).toContain("34.90");
    expect(rows[0].body).toContain("44.90");
  });
  it("no alerta con subida menor a 5%", () => {
    expect(
      buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 100), pago(2, "2026-07-05", 104)]),
    ).toHaveLength(0);
  });
  it("no alerta si el ultimo pago bajo, con un solo pago, o suscripcion inactiva", () => {
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 50), pago(2, "2026-07-05", 40)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-07-05", 50)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub({ status: "paused" })], [pago(1, "2026-06-05", 30), pago(2, "2026-07-05", 60)])).toHaveLength(0);
  });
});

describe("buildDuplicateChargeAlerts", () => {
  const now = new Date("2026-07-10T20:00:00Z");
  it("alerta con dos gastos de mismo dia, monto y categoria en la ultima semana", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 11.6), mv(2, "2026-07-09T15:00:00Z", 10, 11.6)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(1); // menor id del par
    expect(rows[0].payload.day).toBe("2026-07-09");
  });
  it("ignora pares fuera de la ventana de 7 dias, montos distintos, categorias distintas e ingresos", () => {
    expect(buildDuplicateChargeAlerts([mv(1, "2026-06-20T10:00:00Z", 10, 5), mv(2, "2026-06-20T11:00:00Z", 10, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 10, 6)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 99, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 20, 5), mv(2, "2026-07-09T11:00:00Z", 20, 5)], catKinds, now)).toHaveLength(0);
  });
  it("un trio del mismo dia genera UNA alerta (no tres pares)", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 9), mv(2, "2026-07-09T11:00:00Z", 10, 9), mv(3, "2026-07-09T12:00:00Z", 10, 9)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
  });
});
