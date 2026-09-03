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
    /* El manual de gestos vivía fijo en la pantalla, repitiéndose para siempre a quien ya lo
       sabe. Lo devuelve igual, pero la pantalla solo lo enseña la primera vez (misma regla que
       los textos didácticos de los formularios). */
    return "Desliza para pagar o eliminar · pausar y fijar están en el detalle.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} suscripciones${
    dueDateRangeLabel ? ` con próximo pago ${dueDateRangeLabel.toLowerCase()}` : ""
  }.`;
}
