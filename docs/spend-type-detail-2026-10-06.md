# Detalle de Tipo de gasto

Al tocar una fila, la principal abre `/spend-type/[id]?from=spend-types` como pantalla del Stack con la transición nativa común. El detalle de una entidad ya no usa `SpendTypeDetailSheet`.

La pantalla reutiliza `ResourceModuleTemplate`, `ScreenHeader`, `DetailFieldRow` y `DetailActionBar`. Editar queda a la izquierda y Clasificar a la derecha. Activar/desactivar y eliminar permanecen en el menú. Los formularios y la clasificación conservan sus hojas.

`useOriginBackNavigation` cubre la flecha, Android BackHandler e iOS beforeRemove. Con historial vuelve a la lista existente y conserva filtros; sin historial usa `/(app)/spend-types?from=more`. Los datos se consultan por el espacio activo; una carga fallida distingue error de entidad inexistente.

## Validación en dispositivo pendiente

- Abrir desde Más, tocar un tipo y comprobar la transición lateral.
- Volver por la flecha y el gesto nativo; comprobar que conserva búsqueda y filtros.
- Editar, activar/desactivar, clasificar y cancelar/eliminar un tipo de prueba.
- Comprobar las filas 1, 2 y 4 antes y después de alternar módulos, con y sin scroll. `detachInactiveScreens` se conserva activo.

TypeScript verifica las rutas y props, pero no las coordenadas nativas de los gestos ni la transición en el iPhone.
