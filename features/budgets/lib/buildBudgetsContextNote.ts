type Args = {
  visibleCount: number;
  totalCount: number;
};

export function buildBudgetsContextNote({ visibleCount, totalCount }: Args): string {
  if (visibleCount === totalCount) {
    return "Presupuestos calculados con movimientos del período configurado en cada presupuesto.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} presupuestos activos.`;
}
