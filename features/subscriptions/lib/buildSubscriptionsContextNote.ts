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
    return "Desliza para pagar o eliminar · pausar y fijar están en el detalle.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} suscripciones${
    dueDateRangeLabel ? ` con próximo pago ${dueDateRangeLabel.toLowerCase()}` : ""
  }.`;
}
