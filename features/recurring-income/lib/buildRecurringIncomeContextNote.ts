type Args = {
  visibleCount: number;
  totalCount: number;
};

export function buildRecurringIncomeContextNote({
  visibleCount,
  totalCount,
}: Args): string {
  if (visibleCount === totalCount) {
    /* Describía el mecanismo interno —"agrupados por estado", "equivalente mensual"— y vivía
       fija en la pantalla. La pantalla ya enseña las secciones; esto se muestra una vez. */
    return "Desliza para confirmar la llegada o eliminar · pausar y fijar están en el detalle.";
  }
  return `Mostrando ${visibleCount} de ${totalCount} ingresos fijos.`;
}
