/**
 * Quita un movimiento del cache paginado, **sin asumir que todo lo que cuelga de
 * `["movements"]` sea una lista paginada**.
 *
 * De ahí salió el fallo: el borrado optimista hacía `old.pages.map(...)` sobre *todas* las
 * queries con ese prefijo, y el prefijo también lo usa el total del filtro
 * (`["movements", "summary", …]`), que devuelve `{ incomeTotal, expenseTotal, … }` y no tiene
 * `pages`. El `.map` de undefined reventaba dentro de `onMutate`, y cuando `onMutate` lanza,
 * React Query **aborta la mutación antes de ejecutarla**: el movimiento no se borraba nunca.
 * En pantalla se veía desaparecer igual —la fila queda oculta mientras corre el "Deshacer"— y
 * volvía al recargar. Dos borrados perdidos así el 2026-09-03.
 *
 * La lección no es "añadir un if": es que un prefijo de query key es un contrato compartido, y
 * quien escribe en él a ciegas rompe a todos los que cuelgan de ahí.
 */
export function dropMovementFromPages<T>(old: T, movementId: number): T {
  if (!old || typeof old !== "object") return old;
  const paginated = old as unknown as { pages?: { data?: { id: number }[] }[] };
  if (!Array.isArray(paginated.pages)) return old;

  return {
    ...old,
    pages: paginated.pages.map((page) => ({
      ...page,
      data: Array.isArray(page?.data) ? page.data.filter((m) => m.id !== movementId) : page?.data,
    })),
  } as T;
}
