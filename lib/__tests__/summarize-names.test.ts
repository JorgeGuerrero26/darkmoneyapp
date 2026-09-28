import { summarizeNames } from "../summarize-names";

describe("summarizeNames", () => {
  it("nombra una, dos, y cuenta el resto", () => {
    expect(summarizeNames([])).toBeNull();
    expect(summarizeNames(["Comida"])).toBe("Comida");
    expect(summarizeNames(["Comida", "Taxi"])).toBe("Comida y Taxi");
    expect(summarizeNames(["Comida", "Taxi", "Cine"])).toBe("Comida, Taxi y 1 más");
    expect(summarizeNames(["Comida", "Taxi", "Cine", "Luz"])).toBe("Comida, Taxi y 2 más");
  });

  it("ignora nombres vacíos", () => {
    expect(summarizeNames(["", " Comida ", "  "])).toBe("Comida");
  });
});
