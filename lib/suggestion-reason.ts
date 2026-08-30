/**
 * La razón más fuerte de una sugerencia, en palabras y con mayúscula inicial.
 *
 * Las listas de razones vienen ordenadas de más a menos fuerte, así que la primera es la que
 * vale. Antes se encadenaban todas con punto medio junto a un porcentaje —"Descripción limpia ·
 * 78 % · detectamos servicio de movilidad · nor…"— y la línea no alcanzaba: cuatro datos, uno
 * cortado y ninguno accionable. Una sola, corta, y si hace falta el detalle está en la hoja que
 * abre la fila.
 */
export function suggestionReason(reasons: readonly string[] | undefined, fallback = "") {
  const first = reasons?.find((reason) => reason.trim().length > 0)?.trim() ?? fallback;
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}
