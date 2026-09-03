import {
  describeDeletedMovement,
  describeDeletedMovements,
} from "../describeDeletedMovement";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const accounts: Record<number, string> = { 2: "Cuenta Principal", 6: "Cuenta Sueldo" };
const accountName = (id: number | null | undefined) => (id != null ? accounts[id] ?? null : null);

const describe1 = (movement: Parameters<typeof describeDeletedMovement>[0]["movement"]) =>
  describeDeletedMovement({ movement, accountName, formatAmount: money });

describe("describeDeletedMovement", () => {
  it("nombra el movimiento: la fila ya desaparecio y el nombre es lo unico que queda", () => {
    const result = describe1({
      description: "Chicle",
      movementType: "expense",
      sourceAccountId: 2,
      sourceAmount: 1.5,
    });
    expect(result.title).toBe("Se eliminó «Chicle»");
    expect(result.subtitle).toBe("S/ 1.50 · devuelto a Cuenta Principal");
  });

  it("un ingreso borrado se DESCUENTA, no se devuelve", () => {
    const result = describe1({
      description: "Sueldo agosto",
      movementType: "income",
      destinationAccountId: 6,
      destinationAmount: 2800,
    });
    expect(result.subtitle).toBe("S/ 2800.00 · descontado de Cuenta Sueldo");
  });

  it("un traspaso no afirma direccion", () => {
    const result = describe1({
      description: "A ahorros",
      movementType: "transfer",
      sourceAccountId: 2,
      destinationAccountId: 6,
      sourceAmount: 100,
    });
    expect(result.subtitle).toBe("S/ 100.00 · Cuenta Principal");
  });

  it("sin nombre cae al texto generico, sin inventar comillas vacias", () => {
    const result = describe1({ movementType: "expense", sourceAccountId: 2, sourceAmount: 8 });
    expect(result.title).toBe("Movimiento eliminado");
  });

  it("sin cuenta conocida se dice el monto y ya", () => {
    const result = describe1({
      description: "Chicle",
      movementType: "expense",
      sourceAccountId: 99,
      sourceAmount: 1.5,
    });
    expect(result.subtitle).toBe("S/ 1.50");
  });

  it("sin monto util no se inventa una segunda linea", () => {
    expect(describe1({ description: "Chicle", movementType: "expense", sourceAmount: 0 }).subtitle).toBeNull();
  });

  it("con seleccion multiple el conteo vuelve a servir", () => {
    expect(describeDeletedMovements(1)).toBe("Se eliminó 1 movimiento");
    expect(describeDeletedMovements(3)).toBe("Se eliminaron 3 movimientos");
  });
});
