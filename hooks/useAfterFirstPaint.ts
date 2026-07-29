import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * `false` hasta que la pantalla terminó de pintar. Sirve para diferir datos **secundarios**, los
 * que no hacen falta para el primer dibujo.
 *
 * Medido con la instrumentación del aviso de red lenta: en el arranque, `budget-scope-movements`
 * y `pending-obligation-share-invites` quedaban buscando sin datos al mismo tiempo que las
 * consultas que sí se necesitan para pintar. Con dos bloqueadas se disparaba el aviso de "la red
 * va lenta" sin que el usuario estuviera esperando nada visible — y encima le robaban turno a lo
 * que sí estaba esperando, porque cada viaje a la BD cuesta ~150 ms de pura distancia.
 *
 * No usar para datos que la pantalla necesita para su primer render: eso alarga el arranque
 * percibido en vez de acortarlo.
 */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => handle.cancel();
  }, []);

  return ready;
}
