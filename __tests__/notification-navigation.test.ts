import { resolveNotificationNavigationTarget } from "../lib/notification-navigation";

describe("navegacion de kinds nuevos", () => {
  test("price increase va al detalle de la suscripcion", () => {
    expect(
      resolveNotificationNavigationTarget({ kind: "subscription_price_increase", relatedEntityType: "subscription", relatedEntityId: 7 }),
    ).toBe("/subscription/7");
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
    expect(
      resolveNotificationNavigationTarget({ kind: "obligation_milestone", payload: { obligationId: 42 } }),
    ).toBe("/obligation/42");
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
