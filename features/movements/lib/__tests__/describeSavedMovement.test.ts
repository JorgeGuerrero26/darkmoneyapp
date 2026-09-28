/** El aviso al guardar: tipo, detalle y monto con signo (revisión 40). */
import { describeSavedMovement } from "../describeSavedMovement";

const fmt = (amount: number, currency: string) => `${currency === "PEN" ? "S/" : currency} ${amount.toFixed(2)}`;

describe("describeSavedMovement", () => {
  it("un gasto dice qué fue y cuánto salió, con signo menos", () => {
    expect(
      describeSavedMovement({
        movementType: "expense",
        description: "Cebada",
        sourceAmount: 3,
        sourceCurrency: "PEN",
        formatAmount: fmt,
      }),
    ).toEqual({ title: "Gasto guardado", subtitle: "Cebada · −S/ 3.00" });
  });

  it("un ingreso usa la cuenta de destino y signo más", () => {
    expect(
      describeSavedMovement({
        movementType: "income",
        description: "Sueldo",
        destinationAmount: 2500,
        destinationCurrency: "PEN",
        formatAmount: fmt,
      }),
    ).toEqual({ title: "Ingreso guardado", subtitle: "Sueldo · +S/ 2500.00" });
  });

  it("una transferencia no lleva signo: no entra ni sale plata del total", () => {
    expect(
      describeSavedMovement({
        movementType: "transfer",
        description: "A ahorros",
        sourceAmount: 100,
        sourceCurrency: "USD",
        formatAmount: fmt,
      }).subtitle,
    ).toBe("A ahorros · USD 100.00");
  });

  it("sin detalle queda solo el monto; sin monto válido, solo el detalle", () => {
    expect(
      describeSavedMovement({ movementType: "expense", sourceAmount: 3, sourceCurrency: "PEN", formatAmount: fmt })
        .subtitle,
    ).toBe("−S/ 3.00");
    expect(
      describeSavedMovement({ movementType: "expense", description: "Pan", sourceAmount: 0, formatAmount: fmt })
        .subtitle,
    ).toBe("Pan");
  });

  it("un tipo sin título propio cae en el genérico", () => {
    expect(describeSavedMovement({ movementType: "obligation_payment", formatAmount: fmt }).title).toBe(
      "Movimiento guardado",
    );
  });

  it("al editar cambia el titular y conserva detalle y monto (revisión 41b)", () => {
    expect(
      describeSavedMovement({
        action: "updated",
        movementType: "expense",
        description: "Agua",
        sourceAmount: 1.5,
        sourceCurrency: "PEN",
        formatAmount: fmt,
      }),
    ).toEqual({ title: "Movimiento actualizado", subtitle: "Agua · −S/ 1.50" });
  });
});
