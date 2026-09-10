import {
  categorySuggestionCacheKey,
  counterpartySuggestionCacheKey,
} from "../aiSuggestionKeys";

const BASE = {
  workspaceId: 1,
  surface: "movement_form" as const,
  movementType: "expense" as const,
  amount: 2,
  currencyCode: "PEN",
  description: "Del valle Granadilla",
  occurredAt: "2026-09-10T19:15:00.000Z",
  categories: [{ id: 1, name: "Alimentacion", kind: "expense" }],
  localSuggestion: null,
};

/**
 * El incidente del 2026-09-10: tres llamadas al modelo para un solo movimiento y la ultima
 * contesto 460 ms DESPUES de guardar. Cada vez que la clave cambia, la respuesta que ya habia
 * llegado se tira y el reloj vuelve a cero contra un modelo de 2 a 9 segundos, asi que lo que
 * entra en la clave decide cuanto espera el usuario.
 */
describe("categorySuggestionCacheKey", () => {
  it("cambiar el monto NO vuelve a preguntar: la categoria la decide lo que dice, no lo que costo", () => {
    expect(categorySuggestionCacheKey({ ...BASE, amount: 200 })).toBe(
      categorySuggestionCacheKey(BASE),
    );
  });

  it("cambiar la hora tampoco", () => {
    expect(categorySuggestionCacheKey({ ...BASE, occurredAt: "2026-09-10T21:40:00.000Z" })).toBe(
      categorySuggestionCacheKey(BASE),
    );
  });

  it("cambiar la descripcion SI: es otra pregunta", () => {
    expect(categorySuggestionCacheKey({ ...BASE, description: "Cine" })).not.toBe(
      categorySuggestionCacheKey(BASE),
    );
  });

  it("las mayusculas y los espacios de sobra no son otra pregunta", () => {
    expect(categorySuggestionCacheKey({ ...BASE, description: "  DEL VALLE GRANADILLA " })).toBe(
      categorySuggestionCacheKey(BASE),
    );
  });

  it("una categoria nueva en el catalogo SI cambia la respuesta posible", () => {
    expect(
      categorySuggestionCacheKey({
        ...BASE,
        categories: [...BASE.categories, { id: 2, name: "Antojos", kind: "expense" }],
      }),
    ).not.toBe(categorySuggestionCacheKey(BASE));
  });
});

const CONTRAPARTE = {
  workspaceId: 1,
  surface: "movement_form" as const,
  movementType: "expense" as const,
  description: "YAPE ***123 KEVIN",
  amount: 10,
  currencyCode: "PEN",
  counterparties: [{ id: 4, name: "Kevin", type: "person" }],
};

describe("counterpartySuggestionCacheKey", () => {
  it("el monto no cambia de quien es el gasto", () => {
    expect(counterpartySuggestionCacheKey({ ...CONTRAPARTE, amount: 200 })).toBe(
      counterpartySuggestionCacheKey(CONTRAPARTE),
    );
  });

  it("otro nombre en el texto SI", () => {
    expect(
      counterpartySuggestionCacheKey({ ...CONTRAPARTE, description: "YAPE ***123 ANA" }),
    ).not.toBe(counterpartySuggestionCacheKey(CONTRAPARTE));
  });

  it("una contraparte nueva en el catalogo tambien", () => {
    expect(
      counterpartySuggestionCacheKey({
        ...CONTRAPARTE,
        counterparties: [...CONTRAPARTE.counterparties, { id: 9, name: "Ana", type: "person" }],
      }),
    ).not.toBe(counterpartySuggestionCacheKey(CONTRAPARTE));
  });
});
