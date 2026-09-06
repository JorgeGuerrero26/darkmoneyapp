import { groupKeyOf, groupUncategorized } from "../groupUncategorized";
import { buildPatternMaps } from "../../../../lib/movement-patterns";

const mov = (id: number, description: string | null, amount: number) => ({
  id,
  description,
  amount,
  occurredAt: "2026-09-01T12:00:00.000Z",
});

describe("groupKeyOf", () => {
  it("junta la misma cosa escrita de formas distintas", () => {
    expect(groupKeyOf("Moto")).toBe(groupKeyOf("moto"));
    expect(groupKeyOf("MOTO.")).toBe(groupKeyOf("Moto"));
    expect(groupKeyOf("Moto 5")).toBe(groupKeyOf("Moto"));
  });

  it("quita tildes: la misma palabra con y sin acento es la misma", () => {
    expect(groupKeyOf("Almuerzo")).toBe(groupKeyOf("almuérzo"));
  });

  it("no junta cosas distintas", () => {
    expect(groupKeyOf("Chifa")).not.toBe(groupKeyOf("Chicle"));
  });

  it("las palabras de dos letras o menos no cuentan", () => {
    expect(groupKeyOf("Yape a Marcos")).toBe("yape marcos");
  });
});

describe("groupUncategorized", () => {
  it("agrupa lo repetido: 401 decisiones se vuelven unas pocas", () => {
    const groups = groupUncategorized(
      [mov(1, "Moto", 2), mov(2, "moto", 2), mov(3, "MOTO", 3), mov(4, "Chicle", 1.5)],
      null,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].movements).toHaveLength(3);
    expect(groups[0].total).toBeCloseTo(7, 2);
  });

  /** Lo que arregla tus cifras es la plata sin clasificar, no el numero de filas. */
  it("ordena por monto, no por cantidad", () => {
    const groups = groupUncategorized(
      [
        mov(1, "Pasaje", 2), mov(2, "Pasaje", 2), mov(3, "Pasaje", 2),
        mov(4, "Pasaje", 2), mov(5, "Pasaje", 2),
        mov(6, "Cena", 300),
      ],
      null,
    );
    expect(groups[0].label).toBe("Cena");
    expect(groups[1].movements).toHaveLength(5);
  });

  it("el nombre del grupo es la forma que mas se repite, tal cual la escribiste", () => {
    const groups = groupUncategorized(
      [mov(1, "moto", 2), mov(2, "Moto", 2), mov(3, "Moto", 2)],
      null,
    );
    expect(groups[0].label).toBe("Moto");
  });

  it("sin descripcion cada uno va suelto, no todos en un mismo saco", () => {
    const groups = groupUncategorized([mov(1, null, 5), mov(2, "", 7)], null);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.label === "Sin descripción")).toBe(true);
  });

  it("propone categoria con tus propios patrones, sin preguntarle a nadie", () => {
    // Historial: "moto" clasificado en Transporte (id 7) varias veces.
    const maps = buildPatternMaps([
      { description: "Moto centro", category_id: 7, counterparty_id: null, movement_type: "expense", source_account_id: 2, destination_account_id: null },
      { description: "Moto casa", category_id: 7, counterparty_id: null, movement_type: "expense", source_account_id: 2, destination_account_id: null },
      { description: "Moto trabajo", category_id: 7, counterparty_id: null, movement_type: "expense", source_account_id: 2, destination_account_id: null },
    ] as never);

    const groups = groupUncategorized([mov(1, "Moto", 2), mov(2, "Moto", 2)], maps);
    expect(groups[0].suggestedCategoryId).toBe(7);
    expect(groups[0].confidence).toBeGreaterThan(0);
  });

  it("sin patrones que lo respalden no inventa una categoria", () => {
    const maps = buildPatternMaps([] as never);
    const groups = groupUncategorized([mov(1, "Algo nuevo", 10)], maps);
    expect(groups[0].suggestedCategoryId).toBeNull();
  });
});
