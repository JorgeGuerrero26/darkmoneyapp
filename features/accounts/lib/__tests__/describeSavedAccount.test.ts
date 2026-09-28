/** Segunda línea del aviso de cuenta: nombre y saldo DESPUÉS de guardar. */
import { describeSavedAccount } from "../describeSavedAccount";

const fmt = (amount: number, currency: string) => `${currency === "PEN" ? "S/" : currency} ${amount.toFixed(2)}`;

describe("describeSavedAccount", () => {
  it("al crear, el saldo es el inicial", () => {
    expect(describeSavedAccount({ name: "Ahorros", currencyCode: "PEN", openingBalance: 100, formatAmount: fmt })).toBe(
      "Ahorros · S/ 100.00",
    );
  });

  it("al editar sin tocar el saldo inicial, muestra el saldo actual (el de la captura)", () => {
    expect(
      describeSavedAccount({
        name: "Cuenta Sueldo",
        currencyCode: "PEN",
        openingBalance: 50,
        previous: { openingBalance: 50, currentBalance: 35.29 },
        formatAmount: fmt,
      }),
    ).toBe("Cuenta Sueldo · S/ 35.29");
  });

  it("si la edición sube el saldo inicial, el actual se mueve la misma diferencia", () => {
    expect(
      describeSavedAccount({
        name: "Cuenta Sueldo",
        currencyCode: "PEN",
        openingBalance: 60,
        previous: { openingBalance: 50, currentBalance: 35.29 },
        formatAmount: fmt,
      }),
    ).toBe("Cuenta Sueldo · S/ 45.29");
  });

  it("usa la moneda con la que queda la cuenta", () => {
    expect(
      describeSavedAccount({
        name: "Dólares",
        currencyCode: "USD",
        openingBalance: 0,
        previous: { openingBalance: 0, currentBalance: 16.68 },
        formatAmount: fmt,
      }),
    ).toBe("Dólares · USD 16.68");
  });
});
