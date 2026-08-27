import { groupMovementsByDate } from "../features/movements/lib/group-by-date";
import type { MovementRecord } from "../types/domain";

/**
 * Rediseño fase 6 — el encabezado de día pegajoso lleva el neto del día.
 *
 * Es la orientación que antes pretendía dar la tarjeta de cada movimiento, y es matemática de
 * dinero: un signo al revés o una transferencia contada como gasto le dice al usuario que
 * perdió plata que no perdió.
 *
 * La regla que más importa está en las monedas mezcladas: sumar soles con dólares daría un
 * total falso, así que ahí no se enseña ninguno. Mejor sin dato que con un dato inventado.
 */
const base = {
  id: 0,
  workspaceId: 1,
  status: "posted",
  description: "x",
  occurredAt: "2026-08-27T15:00:00.000Z",
  sourceAccountId: 1,
  destinationAccountId: null,
  sourceCurrencyCode: "PEN",
  destinationCurrencyCode: null,
} as unknown as MovementRecord;

function movement(over: Partial<MovementRecord> & { id: number }): MovementRecord {
  return { ...base, ...over } as MovementRecord;
}

describe("neto del dia en el encabezado", () => {
  it("resta gastos y suma ingresos", () => {
    const [day] = groupMovementsByDate([
      movement({ id: 1, movementType: "income", sourceAmount: null, destinationAmount: 1000, destinationAccountId: 1, sourceAccountId: null }),
      movement({ id: 2, movementType: "expense", sourceAmount: 400 }),
    ] as MovementRecord[]);

    expect(day.netAmount).toBe(600);
    expect(day.netCurrencyCode).toBe("PEN");
  });

  it("una transferencia no mueve el neto: la plata ni se gana ni se pierde", () => {
    const [day] = groupMovementsByDate([
      movement({
        id: 1,
        movementType: "transfer",
        sourceAmount: 500,
        destinationAmount: 500,
        destinationAccountId: 2,
      }),
    ] as MovementRecord[]);

    expect(day.netAmount).toBe(0);
  });

  it("no da total cuando el dia mezcla monedas", () => {
    const [day] = groupMovementsByDate([
      movement({ id: 1, movementType: "expense", sourceAmount: 100, sourceCurrencyCode: "PEN" }),
      movement({ id: 2, movementType: "expense", sourceAmount: 30, sourceCurrencyCode: "USD" }),
    ] as MovementRecord[]);

    expect(day.netCurrencyCode).toBeNull();
  });

  it("separa el neto por dia, no lo acumula entre dias", () => {
    const days = groupMovementsByDate([
      movement({ id: 1, movementType: "expense", sourceAmount: 100, occurredAt: "2026-08-27T15:00:00.000Z" }),
      movement({ id: 2, movementType: "expense", sourceAmount: 50, occurredAt: "2026-08-26T15:00:00.000Z" }),
    ] as MovementRecord[]);

    expect(days).toHaveLength(2);
    expect(days[0].netAmount).toBe(-100);
    expect(days[1].netAmount).toBe(-50);
  });

  it("un dia solo de gastos da neto negativo", () => {
    const [day] = groupMovementsByDate([
      movement({ id: 1, movementType: "expense", sourceAmount: 42.9 }),
      movement({ id: 2, movementType: "expense", sourceAmount: 125.5 }),
    ] as MovementRecord[]);

    expect(day.netAmount).toBeCloseTo(-168.4, 2);
  });
});
