import { scoreCategoryFromDescription, type PatternMaps } from "../../../lib/movement-patterns";

export type UncategorizedMovement = {
  id: number;
  description: string | null;
  amount: number;
  occurredAt: string;
};

export type UncategorizedGroup = {
  /** Clave de agrupación: la descripción normalizada. */
  key: string;
  /** Cómo se llama el grupo en pantalla: la descripción más frecuente, tal cual se escribió. */
  label: string;
  movements: UncategorizedMovement[];
  total: number;
  /** Lo que proponen tus propios patrones. `null` = no hay con qué proponer. */
  suggestedCategoryId: number | null;
  confidence: number;
};

/**
 * Normaliza una descripción para agrupar.
 *
 * Misma idea que `normalizeWords` de los patrones —minúsculas, sin signos— pero conservando el
 * orden y descartando los números: "Moto 5", "moto" y "MOTO." son el mismo gasto repetido, y
 * "Yape a Marcos 20" no debe separarse de "Yape a Marcos".
 */
export function groupKeyOf(description: string | null | undefined): string {
  return (description ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .join(" ")
    .trim();
}

/**
 * Los movimientos sin categoría, agrupados por lo que son y ordenados por lo que pesan.
 *
 * **Por qué agrupar.** Categorizar de uno en uno no escala: 401 movimientos sin categoría son
 * 401 decisiones, y por eso nadie lo hace nunca. Pero no son 401 cosas distintas — son unas
 * pocas repetidas: "Moto" veintitrés veces, "Chicle" quince. Agrupados, la misma limpieza son
 * quince decisiones.
 *
 * **Por qué se ordenan por monto y no por cantidad.** Lo que arregla tus cifras es la plata que
 * está sin clasificar, no el número de filas: un grupo de dos cenas de S/ 300 corrige más el
 * ranking de gastos que veinte pasajes de S/ 2.
 *
 * **La sugerencia sale primero de tus propios patrones**, que son gratis y ya existen: si has
 * puesto "Moto" en Transporte veinte veces, no hace falta preguntarle a nadie. La IA es para lo
 * que los patrones no saben resolver, y por eso este cálculo va aparte y sin red.
 */
export function groupUncategorized(
  movements: UncategorizedMovement[],
  maps: PatternMaps | null,
): UncategorizedGroup[] {
  const groups = new Map<string, UncategorizedMovement[]>();
  const labels = new Map<string, Map<string, number>>();

  for (const movement of movements) {
    const key = groupKeyOf(movement.description);
    // Sin descripción no hay nada que agrupar: cada uno va suelto, con su id por clave.
    const effectiveKey = key || `__sin_descripcion_${movement.id}`;
    if (!groups.has(effectiveKey)) {
      groups.set(effectiveKey, []);
      labels.set(effectiveKey, new Map());
    }
    groups.get(effectiveKey)!.push(movement);
    const raw = (movement.description ?? "").trim();
    if (raw) {
      const counts = labels.get(effectiveKey)!;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }

  const result: UncategorizedGroup[] = [];
  for (const [key, items] of groups) {
    const counts = labels.get(key) ?? new Map<string, number>();
    let label = "Sin descripción";
    let best = 0;
    for (const [text, count] of counts) {
      if (count > best) {
        best = count;
        label = text;
      }
    }

    const suggestion = maps ? scoreCategoryFromDescription(label, maps) : null;
    result.push({
      key,
      label,
      movements: items,
      total: items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0),
      suggestedCategoryId: suggestion?.categoryId ?? null,
      confidence: suggestion?.confidence ?? 0,
    });
  }

  return result.sort((a, b) => b.total - a.total || b.movements.length - a.movements.length);
}
