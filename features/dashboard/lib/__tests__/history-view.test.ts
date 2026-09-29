import { displayCategoryName } from "../../../../lib/category-display-name";
import { historyYearTotals, monthReading, observedHistoryMonths, periodSavingsRate, recentNetComparison, type HistoryMonth } from "../history-view";

function month(index: number, income: number, expense: number): HistoryMonth {
  const key = `2026-${String(index).padStart(2, "0")}`;
  return { label: key, dateFrom: `${key}-01`, dateTo: `${key}-28`, income, expense, net: income - expense, isFuture: false };
}

describe("lecturas de Historial", () => {
  it("reconcilia el neto anual y el ahorro desde los mismos meses que dibuja", () => {
    const months = [month(1, 100, 60), month(2, 50, 70), { ...month(3, 0, 0), isFuture: true }];
    expect(observedHistoryMonths(months)).toHaveLength(2);
    expect(historyYearTotals(months)).toEqual({ income: 150, expense: 130, net: 20, savingsRate: 20 / 150 * 100 });
  });

  it("calcula el ahorro de seis meses con los ingresos y gastos reales, no con meses vacíos", () => {
    expect(periodSavingsRate([{ income: 100, expense: 40 }, { income: 0, expense: 0 }, { income: 300, expense: 180 }])).toBe(45);
    expect(periodSavingsRate([{ income: 0, expense: 0 }])).toBeNull();
  });

  it("compara los tres meses recientes con los tres anteriores en montos", () => {
    const months = [month(1, 100, 50), month(2, 100, 50), month(3, 100, 50), month(4, 100, 0), month(5, 100, 0), month(6, 100, 0)];
    expect(recentNetComparison(months)).toMatchObject({ title: "Te queda el doble cada mes", previousAverage: 50, recentAverage: 100 });
  });

  it("describe un mes negativo por sus gastos y corrige la tilde heredada", () => {
    const months = [month(1, 100, 50), month(2, 100, 180)];
    expect(monthReading(months[1], months, false)).toBe("Gastaste mucho más de lo habitual");
    expect(displayCategoryName("Tecnologia")).toBe("Tecnología");
    expect(displayCategoryName("Tecnología propia")).toBe("Tecnología propia");
  });
});
