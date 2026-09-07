import type { UncategorizedGroup } from "./groupUncategorized";

/**
 * A partir de qué se ofrece la propuesta de un toque.
 *
 * Es la misma barra que usa `suggestCategoryFromDescription` para el formulario: por debajo, la
 * palabra coincide con varias categorías o con muy pocas veces, y una propuesta que falla la
 * mitad de las veces obliga a revisar las 23 filas que acaba de tocar — más trabajo que hacerlo
 * a mano. Lo que no llega se sigue viendo: se elige la categoría en la lista, como siempre.
 */
export const SUGGESTION_MIN_CONFIDENCE = 0.6;

export function hasConfidentSuggestion(group: UncategorizedGroup): boolean {
  return group.suggestedCategoryId !== null && group.confidence >= SUGGESTION_MIN_CONFIDENCE;
}

export type InboxSummary = {
  groups: number;
  movements: number;
  total: number;
  withSuggestion: number;
};

/**
 * Lo que dice la barra de arriba: cuánta plata está sin clasificar y en cuántas decisiones cabe.
 *
 * Las dos cifras juntas son el argumento de la pantalla. "225 movimientos sin categoría" suena a
 * tarde entera; "129 grupos" es lo que de verdad hay que decidir, y de esos 75 vienen con
 * propuesta.
 */
export function summarizeInbox(groups: UncategorizedGroup[]): InboxSummary {
  let movements = 0;
  let total = 0;
  let withSuggestion = 0;
  for (const group of groups) {
    movements += group.movements.length;
    total += group.total;
    if (hasConfidentSuggestion(group)) withSuggestion += 1;
  }
  return { groups: groups.length, movements, total, withSuggestion };
}

/** "23 movimientos" / "1 movimiento": el singular importa porque la mitad de los grupos son de uno. */
export function movementCountLabel(count: number): string {
  return count === 1 ? "1 movimiento" : `${count} movimientos`;
}

/**
 * La frase de la barra: los grupos primero, porque son las decisiones que se piden.
 */
export function inboxSupportPhrase(summary: InboxSummary): string {
  if (summary.groups === 0) return "";
  const grupos = summary.groups === 1 ? "1 grupo" : `${summary.groups} grupos`;
  const base = `${grupos} · ${movementCountLabel(summary.movements)}`;
  if (summary.withSuggestion === 0) return base;
  return `${base} · ${summary.withSuggestion} con propuesta`;
}

/**
 * Lo que se lee al confirmar, en plata y no en filas.
 *
 * "Listo" no dice nada; "Transporte · 23 movimientos, S/ 46.00" deja ver de un vistazo si se
 * tocó lo que se quería tocar, que es justo lo que da miedo de una acción en tanda.
 */
export function assignedToastTitle(categoryName: string, count: number): string {
  return `${categoryName} · ${movementCountLabel(count)}`;
}
