import { filterBudgets, isBudgetExpired } from "../features/budgets/lib/budgetFilters";

const TODAY = "2026-07-16";

const budget = (over = {}) =>
  ({
    id: 1,
    name: "Comida",
    scopeKind: "general",
    scopeLabel: "General",
    categoryName: null,
    accountName: null,
    notes: null,
    isPinned: false,
    isNearLimit: false,
    isOverLimit: false,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    ...over,
  }) as any;

describe("isBudgetExpired", () => {
  it("vencido solo si periodEnd es anterior a hoy", () => {
    expect(isBudgetExpired(budget({ periodEnd: "2026-07-15" }), TODAY)).toBe(true);
    expect(isBudgetExpired(budget({ periodEnd: TODAY }), TODAY)).toBe(false);
    expect(isBudgetExpired(budget({ periodEnd: "2026-08-01" }), TODAY)).toBe(false);
  });
});

describe("filterBudgets — vigencia", () => {
  const vigente = budget({ id: 1, name: "Vigente" });
  const vencido = budget({ id: 2, name: "Vencido", periodEnd: "2026-06-30" });
  const futuro = budget({ id: 3, name: "Futuro", periodStart: "2026-08-01", periodEnd: "2026-08-31" });

  it("por defecto muestra vigentes y futuros, oculta vencidos", () => {
    const result = filterBudgets([vigente, vencido, futuro], [], "", TODAY);
    expect(result.map((b) => b.id)).toEqual([1, 3]);
  });

  it("con filtro 'expired' muestra SOLO vencidos", () => {
    const result = filterBudgets([vigente, vencido, futuro], ["expired"], "", TODAY);
    expect(result.map((b) => b.id)).toEqual([2]);
  });

  it("'expired' se combina con búsqueda y otros filtros", () => {
    const vencidoPinned = budget({ id: 4, name: "Viejo fijado", periodEnd: "2026-05-31", isPinned: true });
    expect(filterBudgets([vencido, vencidoPinned], ["expired", "pinned"], "", TODAY).map((b) => b.id)).toEqual([4]);
    expect(filterBudgets([vencido, vencidoPinned], ["expired"], "viejo", TODAY).map((b) => b.id)).toEqual([4]);
  });

  it("los filtros existentes solo operan sobre vigentes", () => {
    const vencidoAlerta = budget({ id: 5, periodEnd: "2026-06-30", isOverLimit: true });
    const vigenteAlerta = budget({ id: 6, isOverLimit: true });
    expect(filterBudgets([vencidoAlerta, vigenteAlerta], ["attention"], "", TODAY).map((b) => b.id)).toEqual([6]);
  });
});
