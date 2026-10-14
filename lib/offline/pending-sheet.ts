/**
 * Abierto/cerrado de la hoja de cambios pendientes. Vive fuera de React porque la abre la línea de
 * estado del encabezado (en cualquier pantalla) y la monta una sola vez la raíz de la app.
 */
let open = false;
const listeners = new Set<() => void>();

export function isPendingSheetOpen(): boolean {
  return open;
}

export function subscribePendingSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPendingSheetOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}
