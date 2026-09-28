/** Saldo disponible al editar: el movimiento editado ya está descontado de la cuenta. */
import { availableSourceBalance } from "../available-balance";

const gasto54 = { status: "posted", sourceAccountId: 1, sourceAmount: 54 };

describe("availableSourceBalance", () => {
  it("al crear, lo disponible es el saldo tal cual", () => {
    expect(availableSourceBalance({ currentBalance: 5, selectedSourceAccountId: 1, editing: null })).toBe(5);
  });

  /** El caso reportado: un gasto de 54 ya registrado, con 5 en la cuenta. */
  it("al editar suma de vuelta lo que el propio movimiento ya ocupa", () => {
    expect(availableSourceBalance({ currentBalance: 5, selectedSourceAccountId: 1, editing: gasto54 })).toBe(59);
  });

  it("así solo avisa por la diferencia: 54 cabe, 70 no", () => {
    const disponible = availableSourceBalance({ currentBalance: 5, selectedSourceAccountId: 1, editing: gasto54 })!;
    expect(54 > disponible).toBe(false);
    expect(70 > disponible).toBe(true);
  });

  it("si se cambió de cuenta, la nueva no tiene nada que devolver", () => {
    expect(availableSourceBalance({ currentBalance: 5, selectedSourceAccountId: 2, editing: gasto54 })).toBe(5);
  });

  it("un movimiento planificado no tocó el saldo: no se suma", () => {
    expect(
      availableSourceBalance({ currentBalance: 5, selectedSourceAccountId: 1, editing: { ...gasto54, status: "planned" } }),
    ).toBe(5);
  });

  it("sin saldo conocido no inventa uno", () => {
    expect(availableSourceBalance({ currentBalance: null, selectedSourceAccountId: 1, editing: gasto54 })).toBeNull();
  });
});
