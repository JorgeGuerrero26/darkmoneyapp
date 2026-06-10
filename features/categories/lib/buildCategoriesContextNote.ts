type Args = {
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
};

export function buildCategoriesContextNote({
  visibleCount,
  totalCount,
  hasFilters,
}: Args): string {
  if (hasFilters) {
    return `Mostrando ${visibleCount} de ${totalCount} categorías.`;
  }
  return "Toca una categoría para editarla. Desliza para activar, desactivar o eliminar cuando aplique.";
}
