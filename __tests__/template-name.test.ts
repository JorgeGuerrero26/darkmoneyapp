import { normalizeTemplateName } from "../features/movements/lib/template-name";

describe("normalizeTemplateName", () => {
  it("recorta espacios y devuelve el nombre limpio", () => {
    expect(normalizeTemplateName("  Taxi al trabajo  ")).toBe("Taxi al trabajo");
  });
  it("null para vacio o solo espacios", () => {
    expect(normalizeTemplateName("")).toBeNull();
    expect(normalizeTemplateName("   ")).toBeNull();
  });
});
