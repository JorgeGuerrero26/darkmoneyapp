import { monthlyDiscretionarySpend, type SpendHistoryMovement } from "../discretionary-history";

const NOW = new Date("2026-09-16T12:00:00.000Z");

type Row = SpendHistoryMovement & { amount: number };

function movement(occurredAt: string, amount: number, movementType = "expense", status = "posted"): Row {
  return { occurredAt, amount, movementType, status };
}

const amountOf = (row: Row) => row.amount;

function run(movements: Row[], months = 3) {
  return monthlyDiscretionarySpend({ movements, months, expenseAmountOf: amountOf, now: NOW });
}

describe("monthlyDiscretionarySpend", () => {
  it("devuelve un total por mes terminado, del más viejo al más reciente", () => {
    const totals = run([
      movement("2026-06-10T12:00:00.000Z", 700),
      movement("2026-07-10T12:00:00.000Z", 800),
      movement("2026-08-10T12:00:00.000Z", 900),
      movement("2026-08-20T12:00:00.000Z", 50),
    ]);

    expect(totals).toEqual([700, 800, 950]);
  });

  it("no cuenta el mes en curso: lleva media cuenta y tiraría la mediana hacia abajo", () => {
    const totals = run([
      movement("2026-08-10T12:00:00.000Z", 900),
      movement("2026-09-10T12:00:00.000Z", 400),
    ]);

    expect(totals).toEqual([0, 0, 900]);
  });

  it("deja fuera lo que el calendario ya proyecta con su propia línea", () => {
    const totals = run([
      movement("2026-08-05T12:00:00.000Z", 53.9, "subscription_payment"),
      movement("2026-08-10T12:00:00.000Z", 500, "obligation_payment"),
      movement("2026-08-15T12:00:00.000Z", 2000, "obligation_opening"),
      movement("2026-08-20T12:00:00.000Z", 900),
    ]);

    expect(totals).toEqual([0, 0, 900]);
  });

  it("ignora lo que no está aplicado", () => {
    const totals = run([
      movement("2026-08-10T12:00:00.000Z", 900, "expense", "planned"),
      movement("2026-08-11T12:00:00.000Z", 120, "expense", "voided"),
      movement("2026-08-12T12:00:00.000Z", 300),
    ]);

    expect(totals).toEqual([0, 0, 300]);
  });

  it("un mes sin gasto vale 0 y conserva su sitio en la lista", () => {
    const totals = run([movement("2026-08-10T12:00:00.000Z", 900)]);
    expect(totals).toHaveLength(3);
    expect(totals).toEqual([0, 0, 900]);
  });

  it("descarta lo anterior a la ventana y las fechas ilegibles", () => {
    const totals = run([
      movement("2026-01-10T12:00:00.000Z", 5000),
      movement("no es una fecha", 400),
      movement("2026-07-10T12:00:00.000Z", 800),
    ]);

    expect(totals).toEqual([0, 800, 0]);
  });

  it("sin meses pedidos devuelve una lista vacía, no una división por cero", () => {
    expect(run([movement("2026-08-10T12:00:00.000Z", 900)], 0)).toEqual([]);
  });
});
