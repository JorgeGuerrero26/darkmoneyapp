import { groupAmountDigits } from "../format-currency";

describe("groupAmountDigits", () => {
  it("agrupa de tres en tres y respeta los decimales", () => {
    expect(groupAmountDigits("2630.50")).toBe("2,630.50");
    expect(groupAmountDigits("2780.00")).toBe("2,780.00");
    expect(groupAmountDigits("1234567.89")).toBe("1,234,567.89");
  });

  it("no toca lo que cabe sin separador", () => {
    expect(groupAmountDigits("21.30")).toBe("21.30");
    expect(groupAmountDigits("999")).toBe("999");
  });

  it("respeta un decimal a medio escribir en vez de completarlo", () => {
    expect(groupAmountDigits("2630.")).toBe("2,630.");
    expect(groupAmountDigits("2630.5")).toBe("2,630.5");
  });

  it("vacio se queda vacio: el campo sin nada no muestra un cero", () => {
    expect(groupAmountDigits("")).toBe("");
    expect(groupAmountDigits("   ")).toBe("");
  });

  it("lo que no es un numero se devuelve intacto", () => {
    expect(groupAmountDigits("abc")).toBe("abc");
    expect(groupAmountDigits("-30")).toBe("-30");
  });
});
