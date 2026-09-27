# Revisión del deslizamiento de filas

## Estado tras la prueba real del usuario

**Actualización del 2026-09-27:** después de la OTA con `fea0ba31`, el usuario reportó: «parece que ya funciona bien». La entrega activa `detachInactiveScreens` en el navegador de pestañas. Esta comprobación inicial en su iPhone respalda la corrección; no consta que se haya ejecutado toda la matriz de regresión descrita abajo.

OTA del iPhone (runtime `1.0.8`): [grupo f0bba1ee-5dc4-4364-baed-e6a618dc49e3](https://expo.dev/accounts/adriangmori/projects/darkmoney/updates/f0bba1ee-5dc4-4364-baed-e6a618dc49e3). Se comprobó que el servidor entregaba la actualización iOS `01a0e138-8dfa-7435-83ea-6ee1dfe3d8c5`. Las reglas para evitar reintroducir la configuración están en `AGENTS.md` y `CLAUDE.md`.

La primera entrega (`63a0e3a`) **no resolvió el fallo en el iPhone**. Tras instalarla por OTA, el usuario confirmó que tocar una fila abre el movimiento correcto, pero deslizarla puede mover otra. El desencadenante es cambiar de módulo y volver. La última captura muestra la segunda fila resaltada mientras la cuarta expone una acción.

Las 19 pruebas anteriores simulan los gestos. Comprueban el estado y la coordinación, pero no la asociación entre un detector nativo de iOS y la vista que recibe el dedo. No se deben usar como prueba de que el fallo observado está resuelto.

## Hallazgo de navegación y cambio actual

`app/(app)/_layout.tsx` forzaba `detachInactiveScreens={false}`. Esa configuración se introdujo en `f23a1eb` y seguía presente en la primera corrección. El proyecto usa Fabric, Gesture Handler, Reanimated y react-native-screens.

Hay un [reporte reproducible de Gesture Handler #3560](https://github.com/software-mansion/react-native-gesture-handler/issues/3560) con esa combinación: en iOS, los gestos dejan de reconocerse después de cambiar de pestaña cuando `detachInactiveScreens` es `false`. El reporte se probó con versiones anteriores a las instaladas aquí y describe pérdida del gesto, no específicamente el desplazamiento de otra fila. La mejora reportada por el usuario tras activar la propiedad respalda este diagnóstico. No se capturó una traza nativa que demuestre el mecanismo exacto del cruce entre filas.

Un [reporte relacionado de Reanimated #7627](https://github.com/software-mansion/react-native-reanimated/issues/7627) documenta que esa configuración pierde información de animaciones al salir de la pantalla y no la restaura al volver. Su reproducción funciona al devolver la propiedad a `true`.

**Cambio aplicado:** activar `detachInactiveScreens`, que es el [valor predeterminado de Bottom Tabs](https://reactnavigation.org/docs/bottom-tab-navigator/#detachinactivescreens). Las pestañas inactivas salen de la jerarquía nativa; sus componentes React conservan el estado. No se fuerza un remontaje de listas. Comprobar también la conservación del scroll en el teléfono.

El cambio ejecutable de esta segunda entrega se limita a esa propiedad. Se mantienen las correcciones de estado de la primera entrega para poder evaluar el desencadenante de navegación sin introducir simultáneamente otro motor de gestos. Un prototipo con ScrollView horizontal se exploró localmente, pero no está integrado ni validado en dispositivo.

La confirmación de que el toque normal abre el registro correcto reduce la probabilidad de un problema de IDs de datos. La revisión encuentra claves estables por ID y no encuentra consumidores activos de `useSwipeTab`. El código nativo instalado de Gesture Handler enlaza el reconocedor a una vista por `viewTag`; las pruebas de JavaScript no ejercitan ese enlace. Esto orienta la investigación, pero no demuestra por sí solo dónde se pierde la asociación.

## Alternativas si la prueba sigue fallando

| Opción | Ventaja | Coste y límite |
| --- | --- | --- |
| Botón visible `⋯` por fila con acciones | Usa el mismo tipo de toque que el usuario confirma que funciona. Es la alternativa que recomiendo si la prioridad es evitar depender del swipe. | Añade un toque y ocupa espacio. Reutilizar `EntityActionSheet` y los callbacks actuales. |
| ScrollView horizontal nativo dentro de `SwipeActionRow` | El desplazamiento pasa al control nativo de scroll y evita los detectores Pan personalizados. | Requiere validar scroll vertical/horizontal, anchos, cierre y rendimiento de listas largas. El prototipo no constituye una solución comprobada. |
| `ReanimatedSwipeable` de Gesture Handler | Reduce código propio de apertura y cierre. | Comparte Gesture Handler, Reanimated y el ciclo nativo de las pantallas; sustituirlo por sí solo no evita la interacción investigada. |
| Actualizar dependencias nativas | Permite incorporar correcciones de las librerías. | Requiere comprobar versiones compatibles y construir un IPA nuevo. Una OTA no reemplaza el código nativo del iPhone. |

Si el cambio de navegación falla, priorizar el botón de acciones para que el usuario pueda operar de forma predecible. Mantener la confirmación al eliminar y los callbacks de dominio actuales.

## Hallazgos y correcciones de la primera entrega

1. **Alta: la lista desmontaba filas durante actualizaciones.** Antes de 700 ms devolvía `StaggeredItem > fila`; después devolvía directamente `fila`. Cambiar el tipo del padre recreaba la fila y sus detectores aunque su clave no cambiase. Ahora el padre permanece durante toda la vida de la celda. La decisión de animar se toma al montarla. Una prueba comprueba que pasar el plazo y cambiar el índice no vuelve a montar el contenido.
2. **Alta: faltaba coordinación entre filas y con la lista.** Cada fila conservaba su desplazamiento al tocar otra, hacer scroll, cambiar de pantalla o pasar al fondo. Ahora cada lista mantiene un único propietario del gesto. Scroll, inercia, pérdida de foco y segundo plano invalidan ese propietario. Los eventos tardíos del gesto anterior se descartan.
3. **Alta: la recuperación de una interrupción podía dejar una fila abierta.** El código anterior resolvía las cancelaciones activas por posición desde `onEnd`. Ahora `onFinalize` cierra un arrastre cancelado, incluso si no se recibió el callback de liberación. Añadir un segundo dedo también cancela y cierra.
4. **Media: el detector horizontal estaba unido a la vista que se trasladaba.** Ahora está unido al contenedor fijo, con `collapsable={false}`. El contenido interior es lo único que se desplaza. Se desactiva el recorte de subvistas en ambas plataformas para mantener conectados esos contenedores nativos; se conserva la virtualización de la lista.
5. **Media: ejecutar una acción dependía de terminar un resorte.** Interrumpir esa animación podía descartar el callback. Ahora la pulsación válida cierra y ejecuta la acción una sola vez, sin esperar a la animación. Los botones ocultos y los eventos repetidos no ejecutan acciones.
6. **Media: el contenido abierto podía seguir recibiendo pulsaciones.** Un gesto de toque consume la pulsación sobre el contenido abierto y lo cierra. Esto también cubre consumidores que pasan hijos normales en lugar de la función `close/isOpen`. Los toques y pulsaciones largas de una fila cerrada siguen disponibles.

## Alcance

El componente compartido se usa en movimientos, movimientos de una cuenta, cuentas, contactos, créditos/deudas, presupuestos, suscripciones, categorías, ingresos recurrentes y tipos de cambio. Sus wrappers conservan etiquetas, colores y callbacks. Las claves de movimientos siguen siendo sus IDs, no los índices visuales. `useSwipeTab` no tiene consumidores activos y no participa en estas pantallas.

## Validación automatizada

- Tras el cambio de navegación, se volvieron a ejecutar las pruebas existentes: `npm.cmd test -- --runInBand __tests__/swipe-lifecycle.test.ts lib/__tests__/swipe-row-target.test.ts`: 19 pruebas aprobadas.
- Las pruebas cubren exclusión entre filas, cancelación, finalización sin liberación, eventos tardíos, multitáctil, límites, cierre hacia el centro, callbacks actualizados, desaparición de acciones, pulsaciones repetidas, scroll, segundo plano, navegación y estabilidad de montaje.
- Los gestos nativos y los resortes se simulan: estas pruebas validan el estado y las transiciones, pero no prueban las coordenadas táctiles ni el arbitraje nativo con el scroll.
- `npm.cmd run typecheck` y `git diff --check`: aprobados.
- ESLint está bloqueado por la ausencia de `eslint.config.js`, `.mjs` o `.cjs` en el repositorio.

## Validación en dispositivo y prueba de regresión

El usuario reportó una mejora inicial en su iPhone el 2026-09-27. No se dispone de un iPhone ni de un simulador iOS en este entorno Windows y no consta una ejecución completa de los siguientes pasos. Conservarlos como prueba de regresión para futuros cambios en navegación, listas o gestos:

1. Reiniciar la aplicación después de instalar la actualización. En Movimientos, deslizar las filas 1, 2 y 4 en ambos sentidos y comprobar que la fila resaltada coincide con la que se desplaza.
2. Alternar Movimientos → Cuentas → Movimientos → Créditos/Deudas → Movimientos durante 20 ciclos. Repetir los gestos en cuanto se abre cada pestaña, tanto al inicio de la lista como después de hacer scroll.
3. Conservar filtros y posición del scroll al volver. Verificar que no hay filas que dejan de responder o quedan a medio abrir.
4. Repetir con una fila abierta antes de cambiar de pestaña y con una interrupción por segundo plano. Al regresar debe estar cerrada.

Además, mantener estas comprobaciones en Android e iOS:

1. Deslizar las filas 1 y 4 sucesivamente; solo debe seguir al dedo la fila tocada. Repetir después de recorrer varias pantallas de datos y volver al principio.
2. Abrir una fila y tocar otra; la anterior debe cerrarse. Abrirla otra vez y hacer scroll vertical, incluso desde una cabecera o una acción expuesta.
3. Mezclar arrastres horizontales lentos, rápidos y diagonales; cancelar con un segundo dedo. Ninguna fila debe quedar a medio desplazar.
4. Abrir una fila y cambiar de pestaña, abrir un detalle o mandar la app al fondo. Al regresar debe estar cerrada.
5. Tocar el contenido abierto: debe cerrar. Tocar y mantener una fila cerrada: deben funcionar navegación y selección.
6. Eliminar, repetir, archivar y restaurar desde sus módulos. Una pulsación debe ejecutar una sola acción y mantener confirmaciones/deshacer.
7. Repetir mientras llegan nuevas páginas, se actualizan datos y se aplican filtros. Medir fluidez/memoria en listas largas: desactivar el recorte conserva más vistas nativas dentro de la ventana virtualizada.

## Referencias

Se contrastó el comportamiento con el código instalado de Gesture Handler 2.28 y con su documentación de [Pan](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/) y [GestureDetector](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/gesture-detector/). El patrón de contenedor fijo y contenido que consume los toques cuando está abierto también se usa en `ReanimatedSwipeable` de la dependencia instalada.
