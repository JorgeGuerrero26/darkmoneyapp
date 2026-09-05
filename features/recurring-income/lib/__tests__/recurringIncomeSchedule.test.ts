import { describeRecurringCadence } from "../recurringIncomeSchedule";

const say = (frequency: Parameters<typeof describeRecurringCadence>[0]["frequency"],
             intervalCount: number, anchorDay: number | null) =>
  describeRecurringCadence({ frequency, intervalCount, anchorDay });

describe("describeRecurringCadence", () => {
  it("dice el resultado, no el mecanismo", () => {
    expect(say("monthly", 1, 29)).toBe(
      "Se repite el 29 cada mes. Si el mes no tiene 29, cae el último día.",
    );
  });

  it("la regla del mes corto solo cuando aplica", () => {
    // El dia 15 no necesita que le expliquen febrero.
    expect(say("monthly", 1, 15)).toBe("Se repite el 15 cada mes.");
    expect(say("monthly", 1, 28)).toBe("Se repite el 28 cada mes.");
    expect(say("monthly", 1, 30)).toContain("cae el último día");
  });

  it("el 31 se dice por su nombre", () => {
    expect(say("monthly", 1, 31)).toBe("Se repite el último día cada mes.");
  });

  it("con intervalo mayor que uno el periodo va en plural", () => {
    expect(say("monthly", 2, 5)).toBe("Se repite el 5 cada 2 meses.");
    expect(say("quarterly", 1, 5)).toBe("Se repite el 5 cada trimestre.");
  });

  it("las cadencias por dias o semanas no hablan del dia del mes", () => {
    expect(say("custom", 14, 29)).toBe("Se repite cada 14 días.");
    expect(say("weekly", 1, 29)).toBe("Se repite cada semana.");
    expect(say("weekly", 2, null)).toBe("Se repite cada 2 semanas.");
    expect(say("daily", 1, null)).toBe("Se repite cada día.");
  });

  it("sin fecha elegida todavia no promete un dia", () => {
    expect(say("monthly", 1, null)).toBe("Se repite cada mes.");
  });
});
