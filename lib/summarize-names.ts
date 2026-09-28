/**
 * La segunda línea de un aviso sobre varios elementos: "Comida, Taxi y 2 más".
 *
 * "3 categorías actualizadas" dice cuántas pero no cuáles, que es lo que uno quiere comprobar
 * tras una acción masiva. Nombra las dos primeras y cuenta el resto: tres o más nombres enteros
 * no caben en la línea del aviso.
 */
export function summarizeNames(names: readonly string[], shown = 2): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];
  if (clean.length <= shown) return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
  return `${clean.slice(0, shown).join(", ")} y ${clean.length - shown} más`;
}
