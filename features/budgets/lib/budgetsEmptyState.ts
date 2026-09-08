export type BudgetsEmptyState = {
  title?: string;
  description: string;
  /** `create` abre el formulario, `expired` enciende el filtro "Vencidos", `clear` los apaga. */
  action: { label: string; kind: "create" | "expired" | "clear" };
  variant?: "empty" | "no-results";
};

type Args = {
  /** Todos los que existen, vencidos incluidos. */
  total: number;
  /** Cuántos de esos ya cerraron su período. */
  expired: number;
  /** Hay filtros puestos o búsqueda escrita: algo que el usuario pueda quitar. */
  hasFilters: boolean;
  /** Cuándo cerró el último, ya formateado ("1 ago"). */
  lastPeriodEnd: string | null;
};

/**
 * Qué dice la lista de presupuestos cuando no muestra ninguno.
 *
 * **El caso que lo motivó.** Con tres presupuestos, todos con el período ya cerrado, la pantalla
 * decía "Tus 3 presupuestos están fuera de este filtro" y ofrecía "Limpiar filtros" — que no
 * hacía nada, porque no había ningún filtro puesto. Los escondía la regla por defecto: los
 * vencidos son historial y solo salen bajo su propio filtro. Una regla que el usuario no puso no
 * se puede quitar con un botón que quita lo que el usuario puso.
 *
 * Así que hay tres situaciones distintas y cada una necesita su frase y su salida:
 *
 * 1. No hay ninguno → invitar a crear el primero.
 * 2. Los hay, pero un filtro tuyo los tapa → quitar los filtros, que aquí sí hace algo.
 * 3. Los hay y todos terminaron → decirlo con la fecha, y ofrecer verlos. Que es lo que pasaba.
 */
export function buildBudgetsEmptyState({ total, expired, hasFilters, lastPeriodEnd }: Args): BudgetsEmptyState {
  if (total === 0) {
    return {
      title: "Sin presupuestos activos",
      description: "Pon un límite de gasto por categoría y recibe una alerta cuando estés cerca de alcanzarlo.",
      action: { label: "Crear primer presupuesto", kind: "create" },
    };
  }

  if (!hasFilters && expired === total) {
    const cuantos = total === 1 ? "Tu presupuesto" : `Tus ${total} presupuestos`;
    const cerro = lastPeriodEnd ? ` El último cerró el ${lastPeriodEnd}.` : "";
    return {
      variant: "no-results",
      description: `${cuantos} ya terminaron su período, así que pasaron al historial.${cerro} Crea uno para este mes o míralos.`,
      action: { label: total === 1 ? "Ver el vencido" : "Ver los vencidos", kind: "expired" },
    };
  }

  return {
    variant: "no-results",
    // Nombrar los que SÍ tienes: "sin resultados" hacía pensar que no había ninguno.
    description: `Tus ${total} presupuesto${total === 1 ? "" : "s"} están fuera de este filtro.`,
    action: { label: "Limpiar filtros", kind: "clear" },
  };
}
