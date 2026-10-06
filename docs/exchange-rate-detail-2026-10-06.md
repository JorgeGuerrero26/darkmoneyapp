# Detalle de Tipo de cambio

La principal abre `/exchange-rate/[id]?from=exchange-rates` como pantalla del Stack con la transición nativa común. Se elimina `ExchangeRateDetailSheet`.

La ruta consulta las tasas persistidas y conserva origen, destino, tasa, fecha, fuente, fijado y notas. Reutiliza `ResourceModuleTemplate`, `ScreenHeader`, `DetailFieldRow` y `DetailActionBar`: Editar a la izquierda y Actualizar a la derecha. Fijar y Eliminar quedan en el menú. Actualizar mantiene la sincronización existente del par directo e inverso. Eliminar conserva cinco segundos para deshacer; salir confirma el pendiente, igual que en la lista.

`useOriginBackNavigation` cubre la flecha, Android BackHandler e iOS beforeRemove. Con historial vuelve a la lista existente conservando filtros; sin historial usa `/(app)/exchange-rates?from=more`. Los formularios siguen en hojas.

## Prueba en dispositivo pendiente

- Abrir desde Más, tocar una fila y comprobar la transición lateral.
- Regresar mediante flecha y gesto nativo; comprobar búsqueda, filtros y scroll.
- Editar, actualizar, fijar y eliminar/deshacer un registro de prueba.
- Alternar módulos y comprobar swipe en filas 1, 2 y 4, con y sin scroll. `detachInactiveScreens` continúa activo.

TypeScript y pruebas de reglas de navegación no verifican coordenadas nativas ni animaciones en el iPhone.
