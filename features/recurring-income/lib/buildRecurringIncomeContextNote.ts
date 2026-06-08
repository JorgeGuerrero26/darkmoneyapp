type Args = {
  visibleCount: number;
  totalCount: number;
};

export function buildRecurringIncomeContextNote({
  visibleCount,
  totalCount,
}: Args): string {
  if (visibleCount === totalCount) {
    return "Ingresos fijos agrupados por estado y calculados como ingreso mensual equivalente.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} ingresos fijos.`;
}
