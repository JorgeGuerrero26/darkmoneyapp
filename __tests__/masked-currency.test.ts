import { maskedCurrencyLabel } from "../lib/format-currency";

describe("maskedCurrencyLabel", () => {
  it("conserva el símbolo y oculta la cifra", () => {
    expect(maskedCurrencyLabel("PEN")).toBe("S/ ••••");
    expect(maskedCurrencyLabel("USD")).toBe("USD ••••");
  });
  it("código inválido cae al código como prefijo", () => {
    expect(maskedCurrencyLabel("XXX_BAD")).toBe("XXX_BAD ••••");
  });
});
