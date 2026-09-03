import { computeNextRecurringDate, rollDueDateForward } from "../subscription-helpers";

const next = (ymd: string, anchor?: number | null, n = 1) =>
  computeNextRecurringDate(ymd, "monthly", n, anchor);

describe("computeNextRecurringDate con ancla", () => {
  /**
   * El caso reportado: cobros el ultimo dia de cada mes. Sin ancla, febrero recortaba al 28 y
   * ese 28 se convertia en la nueva base, asi que marzo salia 28 y el 31 no volvia nunca.
   */
  it("el ultimo dia del mes sobrevive a febrero", () => {
    expect(next("2026-01-31", 31)).toBe("2026-02-28");
    expect(next("2026-02-28", 31)).toBe("2026-03-31");
    expect(next("2026-03-31", 31)).toBe("2026-04-30");
    expect(next("2026-04-30", 31)).toBe("2026-05-31");
  });

  it("sin ancla se comporta como antes: la fecha recortada arrastra", () => {
    expect(next("2026-01-31")).toBe("2026-02-28");
    expect(next("2026-02-28")).toBe("2026-03-28"); // el desvio, documentado
  });

  it("el dia 30 quiere decir 30, no el ultimo", () => {
    expect(next("2026-01-30", 30)).toBe("2026-02-28"); // febrero no tiene 30
    expect(next("2026-02-28", 30)).toBe("2026-03-30"); // y vuelve al 30
    expect(next("2026-03-30", 30)).toBe("2026-04-30");
    expect(next("2026-04-30", 30)).toBe("2026-05-30"); // no salta al 31
  });

  it("el 29 vuelve despues de un febrero corto, y cae en 29 si es bisiesto", () => {
    expect(next("2026-01-29", 29)).toBe("2026-02-28");
    expect(next("2026-02-28", 29)).toBe("2026-03-29");
    expect(next("2028-01-29", 29)).toBe("2028-02-29"); // 2028 es bisiesto
  });

  it("trimestral y anual tambien anclan", () => {
    expect(computeNextRecurringDate("2026-05-31", "quarterly", 1, 31)).toBe("2026-08-31");
    expect(computeNextRecurringDate("2026-08-31", "quarterly", 1, 31)).toBe("2026-11-30");
    expect(computeNextRecurringDate("2028-02-29", "yearly", 1, 29)).toBe("2029-02-28");
  });

  it("cada 2 meses desde el 31 no pierde el dia por el camino", () => {
    expect(next("2026-01-31", 31, 2)).toBe("2026-03-31");
    expect(next("2026-03-31", 31, 2)).toBe("2026-05-31");
  });

  it("las cadencias por dias no usan ancla", () => {
    expect(computeNextRecurringDate("2026-01-31", "daily", 5, 31)).toBe("2026-02-05");
    expect(computeNextRecurringDate("2026-01-31", "weekly", 1, 31)).toBe("2026-02-07");
    expect(computeNextRecurringDate("2026-01-31", "custom", 14, 31)).toBe("2026-02-14");
  });

  it("un ancla invalida cae al dia de la fecha, sin romperse", () => {
    expect(next("2026-01-15", 0)).toBe("2026-02-15");
    expect(next("2026-01-15", null)).toBe("2026-02-15");
    expect(next("2026-01-15", 99)).toBe("2026-02-28"); // se recorta al mes
  });
});

describe("rollDueDateForward con ancla", () => {
  it("reactivar una pausada del ultimo dia no la deja en el 28", () => {
    // Pausada en enero, reactivada en junio: pasa por febrero sin quedarse ahi.
    expect(rollDueDateForward("2026-01-31", "monthly", 1, "2026-06-15", 31)).toBe("2026-06-30");
  });

  it("sin ancla, ese mismo caso se queda desviado", () => {
    expect(rollDueDateForward("2026-01-31", "monthly", 1, "2026-06-15")).toBe("2026-06-28");
  });
});
