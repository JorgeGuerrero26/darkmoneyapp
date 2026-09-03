import { useEffect, useRef } from "react";

import { useToast } from "../../hooks/useToast";

type Props = {
  visible: boolean;
  message: string;
  onUndo: () => void;
  /** Debe coincidir con el temporizador de borrado de quien lo llama. */
  durationMs?: number;
  /**
   * @deprecated Lo ignora: el aviso se coloca solo, encima de la barra de pestañas.
   *
   * Se conserva para no tocar las siete pantallas que lo pasan. Cada una calculaba su propia
   * distancia al borde —80, 90, `insets.bottom + 80`— y por eso el aviso caía a distinta altura
   * según dónde estuvieras.
   */
  bottomOffset?: number;
};

/**
 * El aviso de "eliminado · Deshacer" de las listas, ahora dibujado por el **único** aviso de
 * la app.
 *
 * Había dos componentes haciendo el mismo trabajo: Movimientos usaba el aviso de confirmación
 * y las otras siete listas este, con su propia superficie, el logo de la app metido en un
 * círculo, "Deshacer" en menta y su barra de plazo. La revisión 26 aterrizó en uno solo, así
 * que al borrar una suscripción seguía saliendo el de antes — con los colores y el ícono que
 * acabábamos de retirar.
 *
 * Este componente ya no dibuja nada: traduce su forma declarativa (`visible`) a la imperativa
 * del aviso (`showRichToast`). Las siete pantallas se quedan como estaban y el aspecto lo
 * decide un solo sitio.
 */
export function UndoBanner({ visible, message, onUndo, durationMs = 5000 }: Props) {
  const { showRichToast } = useToast();

  // Refs para que el aviso use SIEMPRE el callback y el texto de ahora, sin re-dispararse
  // cada vez que la pantalla vuelve a renderizar.
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const shownMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !message) {
      shownMessageRef.current = null;
      return;
    }
    // Si se borra otra fila mientras el aviso sigue en pantalla, el texto cambia ("2
    // eliminadas") y toca reemplazarlo, reiniciando el plazo con él.
    if (shownMessageRef.current === message) return;
    shownMessageRef.current = message;

    showRichToast({
      type: "delete",
      title: message,
      duration: durationMs,
      onUndo: () => onUndoRef.current(),
    });
  }, [visible, message, durationMs, showRichToast]);

  return null;
}
