type Args = {
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
};

export function buildExchangeRatesContextNote({
  visibleCount,
  totalCount,
  hasFilters,
}: Args): string {
  if (hasFilters) {
    return `Mostrando ${visibleCount} de ${totalCount} tipos de cambio.`;
  }
  return "Define cuántas unidades de la moneda destino equivalen a 1 unidad de la moneda origen.";
}
