import { queryRootsToRefresh } from "../invalidation";

describe("qué se vuelve a leer cuando cambian los datos locales", () => {
  it("un movimiento nuevo refresca la lista, el detalle, Categorías, los presupuestos, la analítica de cuenta y Categorizar", () => {
    expect(queryRootsToRefresh(["movements"]).sort()).toEqual(["account-analytics", "budget-scope-movements", "categories-overview", "movement", "movements", "uncategorized-movements"]);
  });

  it("una categoría o una suscripción refresca el resumen de Categorías", () => {
    expect(queryRootsToRefresh(["categories"])).toEqual(["categories-overview"]);
    expect(queryRootsToRefresh(["subscriptions"])).toEqual(["categories-overview"]);
  });

  it("los catálogos con lectura propia refrescan la suya", () => {
    expect(queryRootsToRefresh(["subscription_occurrences"])).toEqual(["subscription-occurrences"]);
    expect(queryRootsToRefresh(["accounts"]).sort()).toEqual(["account-analytics", "budget-scope-movements"]);
    expect(queryRootsToRefresh(["spend_types"])).toEqual(["spend-types"]);
    expect(queryRootsToRefresh(["movement_templates"])).toEqual(["movement-templates"]);
    expect(queryRootsToRefresh(["recurring_income_occurrences"])).toEqual(["recurring-income-occurrences"]);
  });

  it("varias tablas juntas no repiten consultas", () => {
    const roots = queryRootsToRefresh(["movements", "categories", "budgets"]);
    expect(new Set(roots).size).toBe(roots.length);
    expect(roots).toContain("categories-overview");
  });

  it("una tabla sin lectura propia no refresca nada", () => {
    expect(queryRootsToRefresh(["counterparties", "obligations"])).toEqual([]);
  });

  it("una descarga completa (sin tablas) refresca todo lo que lee de local", () => {
    const roots = queryRootsToRefresh([]);
    for (const expected of ["movements", "categories-overview", "spend-types", "movement-templates", "recurring-income-occurrences", "budget-scope-movements"]) {
      expect(roots).toContain(expected);
    }
  });
});
