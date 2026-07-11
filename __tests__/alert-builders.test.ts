import {
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildMonthlyRecapAlert,
  buildObligationMilestoneAlerts,
  buildSubscriptionPriceIncreaseAlerts,
} from "../features/notifications/lib/alertBuilders";

const sub = (over = {}) => ({ id: 5, name: "Netflix", currencyCode: "PEN", status: "active", ...over }) as any;
const pago = (id: number, occurredAt: string, sourceAmount: number) =>
  ({ id, subscriptionId: 5, occurredAt, sourceAmount, destinationAmount: null }) as any;
const mv = (id: number, occurredAt: string, categoryId: number, sourceAmount: number | null) =>
  ({ id, categoryId, occurredAt, sourceAmount, destinationAmount: null }) as any;
const catKinds = new Map([[10, "expense"], [20, "income"]]);
const ingreso = (over = {}) =>
  ({ id: 3, name: "Sueldo", status: "active", nextExpectedDate: "2026-07-05", currencyCode: "PEN", amount: 3000, ...over }) as any;

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

describe("buildExpectedIncomeMissedAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando la fecha esperada paso hace >=2 dias sin ingreso posterior", () => {
    const rows = buildExpectedIncomeMissedAlerts([ingreso()], [], catKinds, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("expected_income_missed");
    expect(rows[0].related_entity_id).toBe(3);
  });
  it("no alerta si hay un ingreso registrado despues de la fecha esperada", () => {
    const rows = buildExpectedIncomeMissedAlerts(
      [ingreso()],
      [mv(9, "2026-07-06T09:00:00Z", 20, null)],
      catKinds, now,
    );
    expect(rows).toHaveLength(0);
  });
  it("no alerta si aun no pasan 2 dias, o el ingreso esta pausado", () => {
    expect(buildExpectedIncomeMissedAlerts([ingreso({ nextExpectedDate: "2026-07-09" })], [], catKinds, now)).toHaveLength(0);
    expect(buildExpectedIncomeMissedAlerts([ingreso({ status: "paused" })], [], catKinds, now)).toHaveLength(0);
  });
});

describe("buildMonthlyRecapAlert", () => {
  it("emite el recap los primeros 7 dias del mes con comparativa", () => {
    const row = buildMonthlyRecapAlert(
      { lastMonthExpenses: 1200, lastMonthIncome: 3000, prevMonthExpenses: 1500, topCategoryName: "Comida" },
      new Date("2026-07-03T12:00:00Z"),
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("monthly_recap");
    expect(row!.related_entity_id).toBe(202606);
    expect(row!.payload.monthFrom).toBe("2026-06-01");
    expect(row!.payload.monthTo).toBe("2026-06-30");
    expect(row!.body).toContain("20%"); // 1200 vs 1500 = -20%
  });
  it("no emite despues del dia 7 ni sin datos del mes cerrado", () => {
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 1, lastMonthIncome: 1, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-08T12:00:00Z"))).toBeNull();
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 0, lastMonthIncome: 0, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-03T12:00:00Z"))).toBeNull();
  });
});

const ob = (over = {}) =>
  ({ id: 8, title: "Préstamo auto", status: "active", progressPercent: 55, pendingAmount: 4500, currencyCode: "PEN", ...over }) as any;

describe("buildObligationMilestoneAlerts", () => {
  it("emite el hito mas alto cruzado (55% -> hito 50)", () => {
    const rows = buildObligationMilestoneAlerts([ob()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(8 * 1000 + 50);
    expect(rows[0].payload.milestone).toBe(50);
    expect(rows[0].payload.obligationId).toBe(8);
  });
  it("100% pagado usa mensaje de cierre", () => {
    const rows = buildObligationMilestoneAlerts([ob({ progressPercent: 100 })]);
    expect(rows[0].payload.milestone).toBe(100);
    expect(rows[0].title).toContain("completa");
  });
  it("sin hito bajo 25% y sin obligaciones inactivas", () => {
    expect(buildObligationMilestoneAlerts([ob({ progressPercent: 10 })])).toHaveLength(0);
    expect(buildObligationMilestoneAlerts([ob({ status: "settled" })])).toHaveLength(0);
  });
});
