import { displayCategoryName } from "../../../../lib/category-display-name";
import { healthBaselineFromMonths, reserveDays } from "../health-view";
import { buildSystemState } from "../system-state";

describe("Salud y calidad del dato", () => {
  it("usa el ahorro ponderado de meses completos y la misma base para la reserva", () => {
    const baseline = healthBaselineFromMonths([
      { income: 1000, expense: 900 },
      { income: 3000, expense: 2600 },
      { income: 0, expense: 0 },
    ]);
    expect(baseline).toEqual({ averageIncome: 2000, averageExpense: 1750, averageNet: 250, monthsUsed: 2 });
    expect(baseline.averageNet / baseline.averageIncome * 100).toBe(12.5);
    expect(reserveDays(1750, baseline.averageExpense)).toBe(30);
    expect(reserveDays(1750, 0)).toBe(0);
  });

  it("comparte el umbral real de 80% entre resumen y Salud", () => {
    expect(buildSystemState(79, 2, 1)).toMatchObject({ status: "Por limpiar", threshold: 80 });
    expect(buildSystemState(80, 2, 1)).toMatchObject({ status: "Confiable", threshold: 80 });
  });

  it("corrige las tildes heredadas al mostrar categorías", () => {
    expect(displayCategoryName("Alimentacion")).toBe("Alimentación");
    expect(displayCategoryName("Diversion")).toBe("Diversión");
  });
});
