import { buildCashflowCalendar } from "../../../projection/lib/cashflow-calendar";
import { windowsFromFlowItems } from "../dashboard-builders";
import { projectionFlowItems } from "../projectionFlowItems";

const TODAY = new Date(2026, 8, 29, 12);

/** Setiembre 29: Kevin con cuota del 15 sin cobrar, sueldo el 30, Sergio el 20 de octubre. */
function calendar(months = 2) {
  return buildCashflowCalendar({
    startingBalance: 1000,
    fromDate: "2026-09-29",
    months,
    typicalDiscretionarySpend: 4675,
    convert: (amount) => amount,
    recurringIncome: [
      { id: 1, name: "Sueldo", amount: 3659, currencyCode: "PEN", frequency: "monthly", nextExpectedDate: "2026-10-30", status: "active" },
    ],
    subscriptions: [
      { id: 2, name: "YouTube", amount: 53.9, currencyCode: "PEN", frequency: "monthly", nextDueDate: "2026-10-05", status: "active" },
    ],
    plannedMovements: [],
    obligations: [
      {
        id: 3,
        title: "Kevin",
        direction: "receivable",
        status: "active",
        currencyCode: "PEN",
        pendingAmount: 22610,
        principalCurrentAmount: 25765,
        openingPrincipal: 7175,
        startDate: "2026-03-15",
        dueDate: "2027-01-31",
        payments: [{ amount: 3155, date: "2026-08-31" }],
        paymentPlan: {
          mode: "custom",
          firstDueDate: "2026-09-15",
          agreed: [
            { amount: 580, dueDate: "2026-09-15" },
            { amount: 500, dueDate: "2026-10-15" },
          ],
          tail: 610,
        },
      },
      {
        id: 40,
        title: "Sergio",
        direction: "receivable",
        status: "active",
        currencyCode: "PEN",
        pendingAmount: 180,
        principalCurrentAmount: 380,
        startDate: "2026-08-20",
        dueDate: "2026-11-20",
        installmentAmount: 100,
        lastPaymentDate: "2026-09-21",
        payments: [],
        paymentPlan: null,
      },
    ],
  });
}

describe("projectionFlowItems", () => {
  it("convierte las líneas en compromisos con su fecha y el registro al que apuntan", () => {
    const items = projectionFlowItems(calendar().months, TODAY);
    const kevin = items.find((item) => item.title === "Kevin (atrasada)");
    expect(kevin).toMatchObject({ source: "obligation", id: 3, direction: "inflow", amount: 580 });
    // La atrasada conserva la fecha en que venció.
    expect(kevin?.date.getDate()).toBe(15);
    expect(kevin?.date.getMonth()).toBe(8);
  });

  it("el gasto típico no es un compromiso", () => {
    const items = projectionFlowItems(calendar().months, TODAY);
    expect(items.some((item) => item.title.startsWith("Gasto típico"))).toBe(false);
  });

  it("nombra el origen de cada línea", () => {
    const sources = new Set(projectionFlowItems(calendar().months, TODAY).map((item) => item.source));
    expect(sources).toEqual(new Set(["obligation", "recurring-income", "subscription"]));
  });
});

describe("windowsFromFlowItems con las líneas del motor", () => {
  it("el cierre del primer mes coincide entre el horizonte de Resumen y el de Flujo", () => {
    expect(calendar(2).months[0].closingBalance).toBeCloseTo(calendar(6).months[0].closingBalance, 2);
  });

  it("la semana ya cuenta la cuota atrasada de Kevin, que la lectura vieja no veía", () => {
    const [week] = windowsFromFlowItems(projectionFlowItems(calendar().months, TODAY), 1000, TODAY);
    // En 7 días: Kevin atrasada (580) y YouTube el 5 (53.90). Sueldo y Sergio caen más tarde.
    expect(week.days).toBe(7);
    expect(week.expectedInflow).toBe(580);
    expect(week.expectedOutflow).toBeCloseTo(53.9, 2);
    expect(week.receivableCount).toBe(1);
  });

  it("a 30 días entran la cuota de octubre y Sergio; el sueldo del 30 de octubre queda justo fuera", () => {
    const windows = windowsFromFlowItems(projectionFlowItems(calendar().months, TODAY), 1000, TODAY);
    const month = windows[2];
    expect(month.days).toBe(30);
    // 580 atrasada + 500 del 15 de oct + 100 de Sergio el 20 + sueldo 3659 el 30 de oct (día 31 desde hoy: fuera).
    expect(month.expectedInflow).toBe(1180);
    expect(month.estimatedBalance).toBeCloseTo(1000 + 1180 - 53.9, 2);
  });
});
