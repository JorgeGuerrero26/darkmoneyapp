import { buildMovementCreateInput, buildMovementUpdateInput } from "../movement-save-contract";

const base = {
  status: "posted" as const,
  occurredAt: "2026-09-05T10:00:00.000Z",
  description: "Yape",
  sourceAccountId: 2,
  destinationAccountId: null as number | null,
  sourceAmount: 9.4,
  destinationAmount: 0,
};

describe("buildMovementUpdateInput", () => {
  /**
   * El caso reportado: un gasto que en realidad era un ingreso. La base tiene un check
   * (`movements_source_pair_check`) que exige que cuenta y monto de origen sean las dos nulas o
   * ninguna. Mandar el monto como `undefined` significaba "no lo toques", asi que la cuenta se
   * vaciaba, el monto se quedaba, y la fila entera se rechazaba: el usuario solo notaba una
   * vibracion al guardar.
   */
  it("convertir un gasto en ingreso VACIA el lado de origen", () => {
    const result = buildMovementUpdateInput({
      ...base,
      movementType: "income",
      sourceAccountId: null,
      destinationAccountId: 2,
      sourceAmount: 0,
      destinationAmount: 9.4,
    });
    expect(result.sourceAccountId).toBeNull();
    expect(result.sourceAmount).toBeNull(); // null, no undefined: hay que borrarlo
    expect(result.destinationAccountId).toBe(2);
    expect(result.destinationAmount).toBe(9.4);
  });

  it("y al reves, convertir un ingreso en gasto vacia el destino", () => {
    const result = buildMovementUpdateInput({
      ...base,
      movementType: "expense",
      sourceAccountId: 2,
      destinationAccountId: null,
      sourceAmount: 9.4,
      destinationAmount: 0,
    });
    expect(result.destinationAccountId).toBeNull();
    expect(result.destinationAmount).toBeNull();
    expect(result.sourceAmount).toBe(9.4);
  });

  it("manda el tipo: sin el, el movimiento se quedaba con el que tenia", () => {
    expect(buildMovementUpdateInput({ ...base, movementType: "income" }).movementType).toBe("income");
    expect(buildMovementUpdateInput({ ...base, movementType: "expense" }).movementType).toBe("expense");
    expect(buildMovementUpdateInput({ ...base, movementType: "transfer" }).movementType).toBe("transfer");
  });

  it("un gasto editado queda igual que si se hubiera creado como gasto", () => {
    const create = buildMovementCreateInput({ ...base, movementType: "expense" });
    const update = buildMovementUpdateInput({ ...base, movementType: "expense" });
    expect(update.movementType).toBe(create.movementType);
    expect(update.sourceAccountId).toBe(create.sourceAccountId);
    expect(update.sourceAmount).toBe(create.sourceAmount);
    expect(update.destinationAccountId).toBe(create.destinationAccountId);
    expect(update.destinationAmount).toBe(create.destinationAmount);
  });

  it("un traspaso conserva las dos cuentas y los dos montos", () => {
    const result = buildMovementUpdateInput({
      ...base,
      movementType: "transfer",
      sourceAccountId: 2,
      destinationAccountId: 6,
      sourceAmount: 100,
      destinationAmount: 100,
    });
    expect(result.sourceAccountId).toBe(2);
    expect(result.destinationAccountId).toBe(6);
    expect(result.sourceAmount).toBe(100);
    expect(result.destinationAmount).toBe(100);
  });
});
