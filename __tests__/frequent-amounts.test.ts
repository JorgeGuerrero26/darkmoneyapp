import { getFrequentAmounts } from "../features/movements/lib/frequent-amounts";
import type { PatternMovement } from "../services/queries/movement-patterns";

let nextId = 1;
function movement(overrides: Partial<PatternMovement>): PatternMovement {
  return {
    id: nextId++,
    description: "test",
    status: "posted",
    occurred_at: "2026-07-01T12:00:00Z",
    source_amount: null,
    destination_amount: null,
    category_id: null,
    counterparty_id: null,
    source_account_id: null,
    destination_account_id: null,
    movement_type: "expense",
    ...overrides,
  } as PatternMovement;
}

const expense = (amount: number, occurredAt = "2026-07-01T12:00:00Z", accountId = 1) =>
  movement({ movement_type: "expense", source_amount: amount, source_account_id: accountId, occurred_at: occurredAt });

describe("getFrequentAmounts", () => {
  test("requiere 2+ ocurrencias y ordena por frecuencia", () => {
    const history = [
      expense(10), expense(10), expense(10),
      expense(25.5), expense(25.5),
      expense(99), // una sola vez: no califica
    ];
    expect(getFrequentAmounts({ movements: history, movementType: "expense", accountId: 1 })).toEqual([10, 25.5]);
  });

  test("empate en frecuencia lo gana el más reciente", () => {
    const history = [
      expense(10, "2026-06-01T00:00:00Z"), expense(10, "2026-06-02T00:00:00Z"),
      expense(20, "2026-07-01T00:00:00Z"), expense(20, "2026-07-02T00:00:00Z"),
    ];
    expect(getFrequentAmounts({ movements: history, movementType: "expense", accountId: 1 })).toEqual([20, 10]);
  });

  test("filtra por cuenta y tipo (la moneda del chip debe coincidir con el input)", () => {
    const history = [
      expense(10, undefined, 1), expense(10, undefined, 1),
      expense(77, undefined, 2), expense(77, undefined, 2), // otra cuenta
      movement({ movement_type: "income", destination_amount: 500, destination_account_id: 1 }),
      movement({ movement_type: "income", destination_amount: 500, destination_account_id: 1 }),
    ];
    expect(getFrequentAmounts({ movements: history, movementType: "expense", accountId: 1 })).toEqual([10]);
    expect(getFrequentAmounts({ movements: history, movementType: "income", accountId: 1 })).toEqual([500]);
  });

  test("sin cuenta seleccionada o sin historial no sugiere", () => {
    expect(getFrequentAmounts({ movements: [expense(10), expense(10)], movementType: "expense", accountId: null })).toEqual([]);
    expect(getFrequentAmounts({ movements: undefined, movementType: "expense", accountId: 1 })).toEqual([]);
  });

  test("respeta el límite (top 3 por defecto)", () => {
    const history = [
      expense(1), expense(1), expense(2), expense(2),
      expense(3), expense(3), expense(4), expense(4),
    ];
    expect(getFrequentAmounts({ movements: history, movementType: "expense", accountId: 1 })).toHaveLength(3);
  });
});
