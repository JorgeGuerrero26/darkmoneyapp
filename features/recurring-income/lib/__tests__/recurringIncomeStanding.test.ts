import { recurringIncomeStanding } from "../recurringIncomeStanding";
import type { RecurringIncomeSummary } from "../../../../types/domain";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const day = (ymd: string) => `${Number(ymd.slice(8))} ${ymd.slice(5, 7)}`;

function build(overrides: Partial<RecurringIncomeSummary> = {}): RecurringIncomeSummary {
  return {
    id: 1,
    workspaceId: 1,
    name: "Suelgo AGV",
    payer: "",
    status: "active",
    amount: 2630.5,
    currencyCode: "PEN",
    frequency: "monthly",
    frequencyLabel: "Mensual",
    intervalCount: 1,
    startDate: "2026-05-29",
    nextExpectedDate: "2026-07-29",
    remindDaysBefore: 3,
    isPinned: false,
    ...overrides,
  };
}

const standing = (item: RecurringIncomeSummary, today: string) =>
  recurringIncomeStanding({ item, today, formatAmount: money, formatDate: day });

describe("recurringIncomeStanding", () => {
  it("el caso que lo motivo: 29 jul y hoy 3 de setiembre", () => {
    const result = standing(build(), "2026-09-03");
    expect(result.tone).toBe("unconfirmed");
    expect(result.missedArrivals).toBe(2); // 29 jul y 29 ago
    expect(result.missedAmount).toBeCloseTo(5261, 2);
    expect(result.detail).toBe("Se esperaba el 29 07 · 2 llegadas sin anotar");
  });

  it("una sola llegada se dice en singular", () => {
    const result = standing(build({ nextExpectedDate: "2026-08-29" }), "2026-09-03");
    expect(result.missedArrivals).toBe(1);
    expect(result.detail).toContain("1 llegada sin anotar");
  });

  it("el dia esperado todavia no es un atraso", () => {
    const result = standing(build({ nextExpectedDate: "2026-09-03" }), "2026-09-03");
    expect(result.tone).toBe("soon");
    expect(result.missedArrivals).toBe(0);
    expect(result.detail).toBe("Llega hoy");
  });

  it("lo que viene dice a que cuenta llega, que es lo que cambia entre filas", () => {
    const result = standing(
      build({ nextExpectedDate: "2026-09-15", accountName: "Cuenta Principal" }),
      "2026-09-03",
    );
    expect(result.tone).toBe("later");
    expect(result.detail).toBe("Llega el 15 09 · a Cuenta Principal");
  });

  it("pausado no acumula llegadas perdidas aunque la fecha haya pasado", () => {
    const result = standing(build({ status: "paused", nextExpectedDate: "2026-08-05" }), "2026-09-03");
    expect(result.tone).toBe("paused");
    expect(result.missedArrivals).toBe(0);
    expect(result.detail).toBe("Pausado · la llegada quedó en el 5 08");
  });

  it("cancelado ya no se espera", () => {
    expect(standing(build({ status: "cancelled" }), "2026-09-03").tone).toBe("cancelled");
  });

  it("un quincenal cuenta quincenas, no meses", () => {
    const result = standing(
      build({ frequency: "custom", intervalCount: 14, nextExpectedDate: "2026-08-01", amount: 480 }),
      "2026-09-03",
    );
    expect(result.missedArrivals).toBe(3); // 1 ago, 15 ago, 29 ago
    expect(result.missedAmount).toBeCloseTo(1440, 2);
  });

  it("respeta el ancla de fin de mes al contar", () => {
    const result = standing(
      build({ nextExpectedDate: "2026-01-31", dayOfMonth: 31, amount: 100 }),
      "2026-04-01",
    );
    // 31 ene, 28 feb y 31 mar: sin ancla, la cuenta se habria desviado al 28.
    expect(result.missedArrivals).toBe(3);
  });
});

describe("las llegadas que faltan, en fechas", () => {
  it("devuelve las fechas exactas, no solo cuantas: son las filas que hay que pintar", () => {
    // El caso reportado: ultima anotada 26 jun, proxima esperada 29 jul, hoy 6 sep.
    const standing = recurringIncomeStanding({
      item: build({ nextExpectedDate: "2026-07-29", amount: 2630.5 }),
      today: "2026-09-06",
      formatAmount: (n) => `S/ ${n.toFixed(2)}`,
      formatDate: (ymd) => ymd.slice(8) + " " + ymd.slice(5, 7),
    });
    expect(standing.pendingDates).toEqual(["2026-07-29", "2026-08-29"]);
    expect(standing.missedArrivals).toBe(2);
    expect(standing.missedAmount).toBeCloseTo(5261);
  });

  it("la capsula dice el numero, que es lo que la pantalla escondia", () => {
    const standing = recurringIncomeStanding({
      item: build({ nextExpectedDate: "2026-07-29" }),
      today: "2026-09-06",
      formatAmount: (n) => `S/ ${n.toFixed(2)}`,
      formatDate: () => "29 jul",
    });
    expect(standing.label).toBe("2 sin confirmar");
  });

  it("la tarjeta enumera las dos fechas y la plata sin anotar", () => {
    const standing = recurringIncomeStanding({
      item: build({ nextExpectedDate: "2026-07-29", amount: 2630.5 }),
      today: "2026-09-06",
      formatAmount: (n) => `S/ ${n.toFixed(2)}`,
      formatDate: (ymd) => (ymd === "2026-07-29" ? "29 jul" : "29 ago"),
    });
    expect(standing.summary).toBe("Debió llegar el 29 jul y el 29 ago. Son S/ 5261.00 sin anotar.");
  });

  it("con muchas atrasadas dice el numero y no enumera ocho fechas", () => {
    const standing = recurringIncomeStanding({
      item: build({ nextExpectedDate: "2026-01-29" }),
      today: "2026-09-06",
      formatAmount: (n) => `S/ ${n.toFixed(2)}`,
      formatDate: (ymd) => ymd,
    });
    expect(standing.missedArrivals).toBe(8);
    expect(standing.summary).toContain("8 veces desde el 2026-01-29");
  });

  it("al dia no inventa fechas pendientes ni una capsula de alarma", () => {
    const standing = recurringIncomeStanding({
      item: build({ nextExpectedDate: "2026-09-29" }),
      today: "2026-09-06",
      formatAmount: (n) => `S/ ${n.toFixed(2)}`,
      formatDate: () => "29 sep",
    });
    expect(standing.pendingDates).toEqual([]);
    expect(standing.label).toBe("Al día");
  });
});
