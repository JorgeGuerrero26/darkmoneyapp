import { resolveNotificationNavigationTarget } from "../lib/notification-navigation";

describe("navegacion de kinds nuevos", () => {
  test("price increase va al detalle de la suscripcion", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "subscription_price_increase", relatedEntityType: "subscription", relatedEntityId: 7,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/subscription/[id]");
    expect(t.params.id).toBe("7");
  });
  test("duplicate charge abre movimientos con quick-filter", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "possible_duplicate_charge",
      payload: { day: "2026-07-10", amountLabel: "S/ 11.60" },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickDateFrom).toBe("2026-07-10");
    expect(t.params.quickDateTo).toBe("2026-07-10");
  });
  test("suggestions pending va a la bandeja", () => {
    expect(resolveNotificationNavigationTarget({ kind: "detected_suggestions_pending" })).toBe("/notifications");
  });
  test("income missed va a ingresos fijos", () => {
    expect(resolveNotificationNavigationTarget({ kind: "expected_income_missed" })).toBe("/recurring-income");
  });
  test("recap abre movimientos del mes cerrado", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "monthly_recap",
      payload: { monthFrom: "2026-06-01", monthTo: "2026-06-30", monthLabel: "junio" },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickDateFrom).toBe("2026-06-01");
  });
  test("milestone va al detalle de la obligacion (id del payload)", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "obligation_milestone", payload: { obligationId: 42 },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/obligation/[id]");
    expect(t.params.id).toBe("42");
  });
  test("predictivas van a cuentas y obligaciones", () => {
    expect(resolveNotificationNavigationTarget({ kind: "cash_runway_alert" })).toBe("/(app)/accounts");
    expect(resolveNotificationNavigationTarget({ kind: "commitments_vs_balance" })).toBe("/(app)/obligations");
  });
});

describe("familia diaria", () => {
  test("resumen del dia abre dashboard con sheet del dia", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_workspace_summary" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/dashboard");
    expect(t.params.daySheet).toBe("today");
    expect(t.params.daySheetToken).toBeTruthy();
  });
  test("daily_digest y daily_ai_digest igual que el resumen", () => {
    for (const kind of ["daily_digest", "daily_ai_digest"]) {
      const t = resolveNotificationNavigationTarget({ kind }) as { pathname: string };
      expect(t.pathname).toBe("/(app)/dashboard");
    }
  });
  test("chequeo de flujo abre movimientos del mes con etiqueta", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_cashflow_check" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickLabel).toBe("Chequeo de flujo del mes");
    expect(t.params.quickDateFrom).toBeTruthy();
  });
  test("revision diaria abre presupuestos con nota", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_budget_review" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/budgets");
    expect(t.params.reason).toContain("Revisión diaria");
    expect(t.params.reasonToken).toBeTruthy();
  });
});

describe("reason en destinos", () => {
  test("budget_alert va al presupuesto puntual con nota", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "budget_alert", relatedEntityType: "budget", relatedEntityId: 12, payload: { usedPercent: 92 },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/budget/[id]");
    expect(t.params.id).toBe("12");
    expect(t.params.from).toBe("notifications");
    expect(t.params.reason).toContain("92%");
  });
  test("budget_alert sin id cae a la lista con nota", () => {
    const t = resolveNotificationNavigationTarget({ kind: "budget_alert" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/budgets");
    expect(t.params.reason).toBeTruthy();
  });
  test("obligation_overdue lleva nota al detalle", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "obligation_overdue", relatedEntityType: "obligation", relatedEntityId: 5,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/obligation/[id]");
    expect(t.params.id).toBe("5");
    expect(t.params.reason).toContain("vencida");
  });
  test("low_balance lleva nota al detalle de cuenta", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "low_balance", relatedEntityType: "account", relatedEntityId: 3,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/account/[id]");
    expect(t.params.id).toBe("3");
    expect(t.params.reason).toBeTruthy();
  });
  test("subscription_reminder lleva nota al detalle", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "subscription_reminder", relatedEntityType: "subscription", relatedEntityId: 7,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/subscription/[id]");
    expect(t.params.id).toBe("7");
    expect(t.params.reason).toBeTruthy();
  });
});
