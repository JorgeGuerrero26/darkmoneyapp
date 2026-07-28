import { extractAmount } from "../logic";

describe("extractAmount", () => {
  it("lee soles con y sin separador de miles", () => {
    expect(extractAmount("Pagaste S/ 30.00 en RENIEC")).toEqual({ amount: 30, currencyCode: "PEN" });
    expect(extractAmount("Consumo por S/ 1,234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
    expect(extractAmount("Monto S/ 1 234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
  });

  it("lee dólares", () => {
    expect(extractAmount("Compra por US$ 12.50")).toEqual({ amount: 12.5, currencyCode: "USD" });
    expect(extractAmount("Cargo de USD 8")).toEqual({ amount: 8, currencyCode: "USD" });
  });

  it("lee el monto aunque el banco lo separe con tabulación", () => {
    // Yape maqueta el monto en su propia celda: "S/\t180.00".
    expect(extractAmount("Monto de yapeo*\n\nS/\t180.00")).toEqual({ amount: 180, currencyCode: "PEN" });
  });

  it("devuelve null si no hay monto", () => {
    expect(extractAmount("Tu estado de cuenta ya está disponible")).toBeNull();
  });
});
