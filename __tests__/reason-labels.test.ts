import { buildNotificationReason } from "../features/notifications/lib/reason-labels";

describe("buildNotificationReason", () => {
  test("budget_alert interpola usedPercent", () => {
    expect(buildNotificationReason("budget_alert", { usedPercent: 92.4 }))
      .toBe("Este presupuesto va en 92% de su límite — revisa qué lo está empujando.");
  });
  test("budget_alert sin payload usa fallback", () => {
    expect(buildNotificationReason("budget_alert", null))
      .toBe("Este presupuesto está cerca de su límite — revisa qué lo está empujando.");
  });
  test("kinds estáticos devuelven texto accionable", () => {
    expect(buildNotificationReason("obligation_overdue", null))
      .toBe("Esta deuda está vencida — registra el pago o renegocia la fecha.");
    expect(buildNotificationReason("daily_budget_review", null))
      .toBe("Revisión diaria: mira el avance de tus presupuestos y ajusta lo que se esté pasando.");
    expect(buildNotificationReason("low_balance", null))
      .toBe("Esta cuenta quedó con saldo bajo — considera moverle fondos.");
  });
  test("kind sin texto devuelve null", () => {
    expect(buildNotificationReason("monthly_recap", null)).toBeNull();
  });
});
