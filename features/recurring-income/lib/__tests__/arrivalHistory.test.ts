import {
  arrivalAmountPhrase,
  arrivalDelayPhrase,
  buildArrivalRows,
} from "../arrivalHistory";
import type { RecurringIncomeOccurrenceSummary } from "../../../../types/domain";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const day = (ymd: string) => `${Number(ymd.slice(8))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

function occurrence(
  over: Partial<RecurringIncomeOccurrenceSummary> = {},
): RecurringIncomeOccurrenceSummary {
  return {
    id: 1,
    recurringIncomeId: 1,
    workspaceId: 1,
    expectedDate: "2026-06-29",
    actualDate: "2026-06-26",
    amount: 2630.5,
    currencyCode: "PEN",
    status: "on_time",
    ...over,
  };
}

describe("arrivalDelayPhrase", () => {
  it("dice cuantos dias y hacia que lado, en vez de una capsula de color", () => {
    expect(arrivalDelayPhrase("2026-06-29", "2026-06-26")).toBe("Llegó 3 días antes");
    expect(arrivalDelayPhrase("2026-04-29", "2026-04-30")).toBe("Llegó 1 día después");
  });

  it("el dia exacto no dice nada: la fecha ya lo cuenta", () => {
    expect(arrivalDelayPhrase("2026-06-29", "2026-06-29")).toBe("");
  });

  it("sin fecha esperada no inventa un desfase", () => {
    expect(arrivalDelayPhrase(null, "2026-06-29")).toBe("");
  });
});

describe("arrivalAmountPhrase", () => {
  it("saca el dato que la capsula tapaba: ese mes llegaron S/ 1.47 mas", () => {
    expect(arrivalAmountPhrase(2631.97, 2630.5, money)).toBe("S/ 1.47 más");
  });

  it("y tambien cuando llega de menos", () => {
    expect(arrivalAmountPhrase(2600, 2630.5, money)).toBe("S/ 30.50 menos");
  });

  it("lo pactado exacto no gasta una linea", () => {
    expect(arrivalAmountPhrase(2630.5, 2630.5, money)).toBe("");
  });

  it("no confunde el redondeo de centimos con una diferencia", () => {
    expect(arrivalAmountPhrase(2630.499999, 2630.5, money)).toBe("");
  });
});

describe("buildArrivalRows", () => {
  const args = {
    occurrences: [
      occurrence({ id: 9, expectedDate: "2026-06-29", actualDate: "2026-06-26", amount: 2630.5 }),
      occurrence({ id: 4, expectedDate: "2026-04-29", actualDate: "2026-04-30", amount: 2631.97 }),
    ],
    expectedAmount: 2630.5,
    fallbackCurrencyCode: "PEN",
    formatAmount: money,
    formatDate: day,
  };

  it("lo que falta va primero, de la mas vieja a la mas nueva: es la cola de trabajo", () => {
    const rows = buildArrivalRows({ ...args, pendingDates: ["2026-08-29", "2026-07-29"] });
    expect(rows.map((row) => [row.kind, row.date])).toEqual([
      ["pending", "2026-07-29"],
      ["pending", "2026-08-29"],
      ["confirmed", "2026-06-26"],
      ["confirmed", "2026-04-30"],
    ]);
  });

  it("solo la mas vieja se puede anotar: saltarse una la haria desaparecer", () => {
    // El puntero avanza de una llegada a la siguiente. Confirmar agosto antes que julio lo
    // movería a septiembre, y julio dejaría de estar pendiente sin quedar anotada.
    const rows = buildArrivalRows({ ...args, pendingDates: ["2026-08-29", "2026-07-29"] });
    expect(rows.filter((row) => row.kind === "pending").map((row) => row.actionable))
      .toEqual([true, false]);
  });

  it("la fila que espera dice por que: nombra la que va delante", () => {
    const rows = buildArrivalRows({ ...args, pendingDates: ["2026-08-29", "2026-07-29"] });
    expect(rows.slice(0, 2).map((row) => row.support)).toEqual([
      "Sin confirmar · la más antigua",
      "Sin confirmar · después del 29 jul",
    ]);
  });

  it("con una sola pendiente no hay orden que explicar", () => {
    const [row] = buildArrivalRows({ ...args, pendingDates: ["2026-07-29"] });
    expect(row.support).toBe("Sin confirmar");
  });

  it("cada llegada anotada lleva su desfase y su diferencia en palabras", () => {
    const rows = buildArrivalRows({ ...args, pendingDates: [] });
    expect(rows[0]).toMatchObject({ support: "Llegó 3 días antes" });
    expect(rows[1]).toMatchObject({ support: "Llegó 1 día después · S/ 1.47 más" });
  });

  it("sin nada pendiente sigue mostrando el historial", () => {
    expect(buildArrivalRows({ ...args, pendingDates: [] })).toHaveLength(2);
  });

  it("sin historial, las que faltan ya son la lista: eran las invisibles", () => {
    const rows = buildArrivalRows({ ...args, occurrences: [], pendingDates: ["2026-07-29"] });
    expect(rows).toEqual([
      {
        kind: "pending",
        key: "pending-2026-07-29",
        date: "2026-07-29",
        actionable: true,
        support: "Sin confirmar",
      },
    ]);
  });

  it("una llegada sin moneda propia usa la del ingreso", () => {
    const [row] = buildArrivalRows({
      ...args,
      occurrences: [occurrence({ currencyCode: "" })],
      pendingDates: [],
    });
    expect(row).toMatchObject({ currencyCode: "PEN" });
  });
});
