import {
  budgetRecurrenceSentence,
  firstBudgetPeriod,
  inferRecurrence,
  nextBudgetPeriod,
} from "../budgetRecurrence";

describe("firstBudgetPeriod", () => {
  it("mensual creado el 8: arranca hoy y cierra con el mes", () => {
    // Decidido en la fase 36: ni prorrateado ni esperando al dia 1. El limite entero desde hoy.
    expect(firstBudgetPeriod("2026-09-08", "monthly")).toEqual({
      periodStart: "2026-09-08",
      periodEnd: "2026-09-30",
    });
  });

  it("respeta los meses de 31 y febrero", () => {
    expect(firstBudgetPeriod("2026-07-15", "monthly").periodEnd).toBe("2026-07-31");
    expect(firstBudgetPeriod("2026-02-10", "monthly").periodEnd).toBe("2026-02-28");
  });

  it("trimestral cierra con el trimestre del calendario", () => {
    expect(firstBudgetPeriod("2026-09-08", "quarterly").periodEnd).toBe("2026-09-30");
    expect(firstBudgetPeriod("2026-04-02", "quarterly").periodEnd).toBe("2026-06-30");
  });

  it("anual cierra en diciembre", () => {
    expect(firstBudgetPeriod("2026-09-08", "yearly").periodEnd).toBe("2026-12-31");
  });

  it("semanal y quincenal cuentan dias desde hoy", () => {
    expect(firstBudgetPeriod("2026-09-08", "weekly").periodEnd).toBe("2026-09-14");
    expect(firstBudgetPeriod("2026-09-08", "biweekly").periodEnd).toBe("2026-09-21");
  });
});

describe("nextBudgetPeriod", () => {
  it("el segundo mes ya es un mes entero aunque el primero fuera corto", () => {
    const primero = firstBudgetPeriod("2026-09-08", "monthly");
    expect(nextBudgetPeriod(primero, "monthly")).toEqual({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
  });

  it("no deja huecos ni solapes: empieza el dia siguiente al cierre", () => {
    // "1 jun - 1 jul" y "2 jul - 1 ago" se pisaban un dia en los datos reales.
    const octubre = nextBudgetPeriod({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "monthly");
    expect(octubre?.periodStart).toBe("2026-10-01");
  });

  it("encadena varios meses seguidos sin desviarse", () => {
    let periodo = firstBudgetPeriod("2026-09-08", "monthly");
    for (let i = 0; i < 4; i += 1) periodo = nextBudgetPeriod(periodo, "monthly")!;
    expect(periodo).toEqual({ periodStart: "2027-01-01", periodEnd: "2027-01-31" });
  });

  it("cruza el fin de año", () => {
    expect(nextBudgetPeriod({ periodStart: "2026-12-01", periodEnd: "2026-12-31" }, "monthly"))
      .toEqual({ periodStart: "2027-01-01", periodEnd: "2027-01-31" });
  });

  it("lo que no se repite no genera nada", () => {
    expect(nextBudgetPeriod({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "none")).toBeNull();
  });
});

describe("budgetRecurrenceSentence", () => {
  it("dice lo que va a pasar, no el formato de la base de datos", () => {
    expect(budgetRecurrenceSentence("monthly", "2026-09-08"))
      .toBe("Empieza hoy y se renueva el 1 de cada mes. Cada mes cerrado queda en el historial.");
  });
});

describe("inferRecurrence", () => {
  it("deduce la cadencia de un presupuesto viejo por lo que dura", () => {
    // Los tres reales: 1-31 may, 1 jun-1 jul, 2 jul-1 ago. Todos mensuales.
    expect(inferRecurrence({ periodStart: "2026-05-01", periodEnd: "2026-05-31" })).toBe("monthly");
    expect(inferRecurrence({ periodStart: "2026-06-01", periodEnd: "2026-07-01" })).toBe("monthly");
    expect(inferRecurrence({ periodStart: "2026-07-02", periodEnd: "2026-08-01" })).toBe("monthly");
  });

  it("distingue semana, quincena, trimestre y año", () => {
    expect(inferRecurrence({ periodStart: "2026-09-01", periodEnd: "2026-09-07" })).toBe("weekly");
    expect(inferRecurrence({ periodStart: "2026-09-01", periodEnd: "2026-09-15" })).toBe("biweekly");
    expect(inferRecurrence({ periodStart: "2026-07-01", periodEnd: "2026-09-30" })).toBe("quarterly");
    expect(inferRecurrence({ periodStart: "2026-01-01", periodEnd: "2026-12-31" })).toBe("yearly");
  });

  it("un periodo larguisimo no es una cadencia, es un tramo suelto", () => {
    expect(inferRecurrence({ periodStart: "2026-01-01", periodEnd: "2028-12-31" })).toBe("none");
  });
});
