# Revisión del deslizamiento de filas

## Resultado

Se corrigieron `SwipeActionRow` y su integración con `ResourceSectionList`. La entrega conserva las acciones de cada módulo y las reglas de cierre hacia el centro. No cambia las operaciones financieras ni el flujo de confirmación/deshacer.

El síntoma de mover una fila distinta todavía requiere reproducción en un teléfono. La imagen permite observar una fila desplazada, pero no demuestra qué detector recibió el toque. Los problemas siguientes sí se verificaron en el código.

## Hallazgos y correcciones

1. **Alta: la lista desmontaba filas durante actualizaciones.** Antes de 700 ms devolvía `StaggeredItem > fila`; después devolvía directamente `fila`. Cambiar el tipo del padre recreaba la fila y sus detectores aunque su clave no cambiase. Ahora el padre permanece durante toda la vida de la celda. La decisión de animar se toma al montarla. Una prueba comprueba que pasar el plazo y cambiar el índice no vuelve a montar el contenido.
2. **Alta: faltaba coordinación entre filas y con la lista.** Cada fila conservaba su desplazamiento al tocar otra, hacer scroll, cambiar de pantalla o pasar al fondo. Ahora cada lista mantiene un único propietario del gesto. Scroll, inercia, pérdida de foco y segundo plano invalidan ese propietario. Los eventos tardíos del gesto anterior se descartan.
3. **Alta: la recuperación de una interrupción podía dejar una fila abierta.** El código anterior resolvía las cancelaciones activas por posición desde `onEnd`. Ahora `onFinalize` cierra un arrastre cancelado, incluso si no se recibió el callback de liberación. Añadir un segundo dedo también cancela y cierra.
4. **Media: el detector horizontal estaba unido a la vista que se trasladaba.** Ahora está unido al contenedor fijo, con `collapsable={false}`. El contenido interior es lo único que se desplaza. Se desactiva el recorte de subvistas en ambas plataformas para mantener conectados esos contenedores nativos; se conserva la virtualización de la lista.
5. **Media: ejecutar una acción dependía de terminar un resorte.** Interrumpir esa animación podía descartar el callback. Ahora la pulsación válida cierra y ejecuta la acción una sola vez, sin esperar a la animación. Los botones ocultos y los eventos repetidos no ejecutan acciones.
6. **Media: el contenido abierto podía seguir recibiendo pulsaciones.** Un gesto de toque consume la pulsación sobre el contenido abierto y lo cierra. Esto también cubre consumidores que pasan hijos normales en lugar de la función `close/isOpen`. Los toques y pulsaciones largas de una fila cerrada siguen disponibles.

## Alcance

El componente compartido se usa en movimientos, movimientos de una cuenta, cuentas, contactos, créditos/deudas, presupuestos, suscripciones, categorías, ingresos recurrentes y tipos de cambio. Sus wrappers conservan etiquetas, colores y callbacks. Las claves de movimientos siguen siendo sus IDs, no los índices visuales. `useSwipeTab` no tiene consumidores activos y no participa en estas pantallas.

## Validación automatizada

- `npm.cmd test -- --runInBand __tests__/swipe-lifecycle.test.ts lib/__tests__/swipe-row-target.test.ts`: 19 pruebas aprobadas.
- Las pruebas cubren exclusión entre filas, cancelación, finalización sin liberación, eventos tardíos, multitáctil, límites, cierre hacia el centro, callbacks actualizados, desaparición de acciones, pulsaciones repetidas, scroll, segundo plano, navegación y estabilidad de montaje.
- Los gestos nativos y los resortes se simulan: estas pruebas validan el estado y las transiciones, pero no prueban las coordenadas táctiles ni el arbitraje nativo con el scroll.
- `npm.cmd run typecheck` y `git diff --check`: aprobados.
- ESLint está bloqueado por la ausencia de `eslint.config.js`, `.mjs` o `.cjs` en el repositorio.

## Prueba pendiente en dispositivo

No había dispositivos conectados a ADB durante la revisión. Comprobar en Android e iOS:

1. Deslizar las filas 1 y 4 sucesivamente; solo debe seguir al dedo la fila tocada. Repetir después de recorrer varias pantallas de datos y volver al principio.
2. Abrir una fila y tocar otra; la anterior debe cerrarse. Abrirla otra vez y hacer scroll vertical, incluso desde una cabecera o una acción expuesta.
3. Mezclar arrastres horizontales lentos, rápidos y diagonales; cancelar con un segundo dedo. Ninguna fila debe quedar a medio desplazar.
4. Abrir una fila y cambiar de pestaña, abrir un detalle o mandar la app al fondo. Al regresar debe estar cerrada.
5. Tocar el contenido abierto: debe cerrar. Tocar y mantener una fila cerrada: deben funcionar navegación y selección.
6. Eliminar, repetir, archivar y restaurar desde sus módulos. Una pulsación debe ejecutar una sola acción y mantener confirmaciones/deshacer.
7. Repetir mientras llegan nuevas páginas, se actualizan datos y se aplican filtros. Medir fluidez/memoria en listas largas: desactivar el recorte conserva más vistas nativas dentro de la ventana virtualizada.

## Referencias

Se contrastó el comportamiento con el código instalado de Gesture Handler 2.28 y con su documentación de [Pan](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/) y [GestureDetector](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/gesture-detector/). El patrón de contenedor fijo y contenido que consume los toques cuando está abierto también se usa en `ReanimatedSwipeable` de la dependencia instalada.
