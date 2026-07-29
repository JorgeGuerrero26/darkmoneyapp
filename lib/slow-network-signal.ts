/**
 * Señal de "la red va lenta", pura y sin dependencias de React Native.
 *
 * Vive aparte del componente a propósito: importar `OfflineBanner` en un test arrastra
 * `error-logger` → supabase → AsyncStorage, que no existe bajo jest y tumbaba la suite entera.
 */

/**
 * Una query "bloquea" al usuario solo si aún no tiene datos que mostrar. Una refetch en
 * segundo plano de algo ya visible no bloquea nada y no debe disparar el aviso.
 *
 * Con `useIsFetching()` a secas el aviso era un falso positivo constante: cuenta también las
 * refetch de datos ya visibles, así que bastaba una query de fondo para que saliera "conexión
 * lenta" con el dashboard entero cargado y 143 Mbps de fibra. El ancho de banda nunca fue el
 * problema: la señal medía lo que no debía.
 */
export function isBlockingQuery(query: { state: { data: unknown } }): boolean {
  return query.state.data === undefined;
}

/**
 * Cuántas queries bloqueadas hacen falta para hablar de "la red". Con una sola no: hay
 * endpoints que se cuelgan solos —medido, `list-shared-obligations` acumuló 18 timeouts de
 * 20 s en una semana mientras el ping a la BD era de 115 ms— y culpar a la red en ese caso es
 * mentirle al usuario sobre algo que además no puede arreglar.
 *
 * Cuando el problema SÍ es de conexión cae toda la tanda a la vez: el incidente del 28-07 a
 * las 06:42 abortó ~10 queries en dos segundos. Eso es lo que este umbral detecta.
 */
export const MIN_BLOCKED_FOR_NETWORK_WARNING = 2;

/** Tiempo esperando algo que el usuario SÍ está mirando antes de admitir que la red va lenta. */
export const SLOW_AFTER_MS = 8000;

/** Cada cuánto se reevalúa mientras hay queries bloqueadas. */
export const SLOW_CHECK_INTERVAL_MS = 1000;
