import { buildBudgetsEmptyState } from "../budgetsEmptyState";

describe("buildBudgetsEmptyState", () => {
  it("sin ninguno, invita a crear el primero", () => {
    const state = buildBudgetsEmptyState({ total: 0, expired: 0, hasFilters: false, lastPeriodEnd: null });
    expect(state.title).toBe("Sin presupuestos activos");
    expect(state.action.kind).toBe("create");
  });

  it("el caso reportado: tres vencidos y ningun filtro puesto", () => {
    // Decia "estan fuera de este filtro" y ofrecia limpiar filtros que no existian: los escondia
    // la regla por defecto de que los vencidos son historial.
    const state = buildBudgetsEmptyState({ total: 3, expired: 3, hasFilters: false, lastPeriodEnd: "1 ago" });
    expect(state.description).toContain("ya terminaron su período");
    expect(state.description).toContain("1 ago");
    expect(state.description).not.toContain("fuera de este filtro");
    expect(state.action).toEqual({ label: "Ver los vencidos", kind: "expired" });
  });

  it("uno solo vencido se dice en singular", () => {
    const state = buildBudgetsEmptyState({ total: 1, expired: 1, hasFilters: false, lastPeriodEnd: "1 ago" });
    expect(state.description).toContain("Tu presupuesto");
    expect(state.action.label).toBe("Ver el vencido");
  });

  it("sin saber cuando cerro, no inventa la fecha", () => {
    const state = buildBudgetsEmptyState({ total: 2, expired: 2, hasFilters: false, lastPeriodEnd: null });
    expect(state.description).not.toContain("El último cerró");
  });

  it("con filtros puestos, limpiar filtros SI es la salida", () => {
    const state = buildBudgetsEmptyState({ total: 3, expired: 3, hasFilters: true, lastPeriodEnd: "1 ago" });
    expect(state.action).toEqual({ label: "Limpiar filtros", kind: "clear" });
  });

  it("si alguno sigue vigente, es cosa del filtro y no del vencimiento", () => {
    const state = buildBudgetsEmptyState({ total: 3, expired: 2, hasFilters: true, lastPeriodEnd: "1 ago" });
    expect(state.description).toContain("fuera de este filtro");
    expect(state.action.kind).toBe("clear");
  });
});
