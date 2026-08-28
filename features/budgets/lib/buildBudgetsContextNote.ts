type Args = {
  visibleCount: number;
  totalCount: number;
};

export function buildBudgetsContextNote({ visibleCount, totalCount }: Args): string {
  if (visibleCount === totalCount) {
    return "Toca un presupuesto para editarlo · desliza para eliminarlo.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} presupuestos activos.`;
}
