# Omitir detecciones al deslizar

La lista «Por revisar» reutiliza `SwipeActionRow`, con el mismo ancho de
revelado (80), resorte, umbrales y cierre al tocar que Movimientos.
Deslizar hacia la izquierda muestra «Omitir». La acción usa el controlador
existente de omisiones y su aviso con Deshacer. «Omitir todos» mantiene su
confirmación y conserva las notificaciones con su estado actual.

La lista mantiene `ResourceSectionList` y su gestión de filas abiertas y scroll.
El contenedor del modal incluye una raíz de Gesture Handler.
`detachInactiveScreens` sigue activo.

## Validación

- Typecheck y `git diff --check`: correctos.
- 18 pruebas de lista, controlador de omisiones y ciclo del swipe: correctas.
- Prueba en dispositivo iOS: pendiente. Las pruebas simuladas no verifican
  coordenadas ni la asociación de la vista nativa con el detector.

En iPhone, comprobar filas 1, 2 y 4 con y sin scroll; omitir una fila, continuar
desplazándose y volver a abrir la lista. Alternar Movimientos → Cuentas →
Movimientos varias veces y comprobar los mismos gestos, una fila abierta al
salir y el regreso desde segundo plano. La fila deslizada debe coincidir con
la omitida y debe conservarse la posibilidad de deshacer.
