# Categorías: lista y detalle

El detalle de una entidad se abre como una pantalla del Stack, igual que Cuenta y Movimiento. Categorías usa `app/category/[id].tsx`, con presentación `card`, y la lista navega con `?from=categories`. Se eliminó `CategoryDetailSheet`: una hoja inferior no sustituye esta pantalla.

La pantalla usa `ResourceModuleTemplate`, `ScreenHeader`, características en `DetailFieldRow` y `DetailActionBar` fijo al pie. Editar está a la izquierda; Ver analítica, a la derecha. Fijar, cambiar estado y eliminar están en los tres puntos. Las categorías del sistema no se editan, desactivan ni eliminan. El borrado también exige que no haya movimientos, suscripciones ni subcategorías.

La principal usa filas `ResourceCard`, agrupaciones con barra `divider`, búsqueda, filtro por tipo y un botón de filtros junto al buscador. Estado, origen y fijadas se combinan y tienen chips removibles. Los resúmenes y los conteos de cada sección corresponden al resultado filtrado.

## Validación en dispositivo pendiente

Se conserva `detachInactiveScreens` activo. No se pudo probar un iPhone desde este entorno. Comprobar:

- Abrir una categoría: debe entrar como Cuenta, con transición lateral y botón de volver.
- Volver: se conservan búsqueda, filtros y scroll de la lista.
- Alternar módulos y deslizar filas 1, 2 y 4, con y sin scroll previo: solo se desplaza la fila tocada.
- Editar, fijar y activar/desactivar: el detalle y la lista reflejan el cambio.
- Abrir una categoría del sistema: Editar está deshabilitado con su explicación; las acciones protegidas no aparecen.
- Abrir analítica antes de cargar el historial: aparece el skeleton, sin presentar ceros como datos definitivos.
