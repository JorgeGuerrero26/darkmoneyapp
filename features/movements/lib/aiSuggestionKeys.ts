export type CategorySuggestionKeyInput = {
  workspaceId: number;
  surface: string;
  movementType: string;
  description: string;
  categories: Array<{ id: number; name: string; kind: string }>;
  localSuggestion?: unknown;
  /* Se reciben porque vienen en la peticion, y se ignoran a proposito: ver el comentario de
     abajo. Declararlos deja constancia de que la omision es una decision, no un olvido. */
  amount?: number | null;
  currencyCode?: string | null;
  occurredAt?: string | null;
};

/**
 * Lo que hace que la respuesta de la IA sea OTRA. Nada más.
 *
 * **El monto y la fecha no entran, y estaban.** Cada vez que el usuario los tocaba, la respuesta
 * que ya había llegado se descartaba y el reloj volvía a empezar — contra un modelo que tarda
 * entre 2 y 9 segundos. Incidente del 2026-09-10 con "Del valle Granadilla": tres llamadas para
 * un solo movimiento (3.8 s, 2.6 s y 7.1 s) y la última contestó **460 ms después** de que el
 * movimiento ya estuviera guardado a mano.
 *
 * La categoría de un gasto la decide lo que dice, no cuánto costó: "Del valle Granadilla" es
 * Alimentación a 2 soles y a 200. El monto se sigue **mandando** en la petición —es contexto útil
 * para el modelo—; lo único que cambia es que ya no invalida lo que se preguntó antes.
 */
export function categorySuggestionCacheKey(input: CategorySuggestionKeyInput): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    movementType: input.movementType,
    description: input.description.trim().toLowerCase(),
    categories: input.categories.map((category) => [category.id, category.name, category.kind]),
    localSuggestion: input.localSuggestion ?? null,
  });
}

export type CounterpartySuggestionKeyInput = {
  workspaceId: number;
  surface: string;
  movementType: string;
  description: string;
  counterparties: Array<{ id: number; name: string; type: string }>;
  amount?: number | null;
  currencyCode?: string | null;
};

/**
 * Lo mismo para la contraparte, y aquí el monto pinta todavía menos.
 *
 * El prompt de contrapartes es entero sobre el texto —"YAPE ***123 KEVIN" es Kevin, "CONSUMO
 * PLAZA VEA" es Plaza Vea— y ninguna de sus reglas mira cuánto costó. Con el monto dentro, tocarlo
 * tiraba una respuesta ya pagada y volvía a preguntar contra un modelo cuya mediana son 6.4 s.
 */
export function counterpartySuggestionCacheKey(input: CounterpartySuggestionKeyInput): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    description: input.description.trim().toLowerCase(),
    movementType: input.movementType,
    counterparties: input.counterparties.map((counterparty) => [
      counterparty.id,
      counterparty.name,
      counterparty.type,
    ]),
  });
}
