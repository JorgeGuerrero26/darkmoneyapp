export type SwipeReleaseInput = {
  /** Dónde estaba la fila cuando el dedo la agarró, en píxeles. */
  grabbedAt: number;
  /** Cuánto se movió el dedo. Positivo hacia la derecha. */
  dx: number;
  /** Velocidad al soltar. Positiva hacia la derecha. */
  vx: number;
  /** `"right"` = abierta hacia la derecha (se ve la acción izquierda). `null` = en el centro. */
  openDir: "right" | "left" | null;
  hasLeftAction: boolean;
  hasRightAction: boolean;
  revealWidth: number;
};

/** Un gesto más rápido que esto manda sobre la posición donde quedó el dedo. */
const FLING_VELOCITY = 0.4;

/**
 * Dónde tiene que quedarse la fila al soltarla: 0, o abierta a un lado.
 *
 * **Volver al medio tiene que ser posible desde cualquier lado.** La versión anterior dejaba que
 * la velocidad decidiera sola: un gesto rápido hacia la derecha abría la acción izquierda
 * *aunque el dedo estuviera cerrando* una fila abierta al otro lado. Con las dos acciones
 * puestas —que es el caso de créditos y deudas— la fila saltaba de un extremo al otro y no había
 * manera de dejarla en el centro.
 *
 * La regla es la dirección: un impulso hacia el centro cierra; solo el que va hacia afuera abre.
 * Sin impulso, manda dónde quedó el dedo.
 */
export function resolveSwipeTarget({
  grabbedAt,
  dx,
  vx,
  openDir,
  hasLeftAction,
  hasRightAction,
  revealWidth,
}: SwipeReleaseInput): number {
  const finalX = grabbedAt + dx;
  const fling = Math.abs(vx) > FLING_VELOCITY ? Math.sign(vx) : 0;

  if (fling > 0) {
    if (openDir === "left") return 0;
    return hasLeftAction ? revealWidth : 0;
  }
  if (fling < 0) {
    if (openDir === "right") return 0;
    return hasRightAction ? -revealWidth : 0;
  }
  if (hasLeftAction && finalX > revealWidth / 2) return revealWidth;
  if (hasRightAction && finalX < -revealWidth / 2) return -revealWidth;
  return 0;
}
