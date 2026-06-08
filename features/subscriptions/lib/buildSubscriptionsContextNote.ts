type Args = {
  visibleCount: number;
  totalCount: number;
  dueDateRangeLabel?: string | null;
};

export function buildSubscriptionsContextNote({
  visibleCount,
  totalCount,
  dueDateRangeLabel,
}: Args): string {
  if (visibleCount === totalCount) {
    return "Suscripciones agrupadas por estado y calculadas como costo mensual equivalente.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} suscripciones${
    dueDateRangeLabel ? ` con próximo pago ${dueDateRangeLabel.toLowerCase()}` : ""
  }.`;
}
