# Revisión 52: movimientos por revisar

La tarjeta vive en **Resumen avanzado**, debajo de Fin de mes y antes de Siguiente paso.
Requiere acceso PRO verificado por el servidor. Se conserva el alcance autorizado para
correo: no aparece en simple. El ZIP de diseño también propone simple; esa ampliación
queda pendiente de la aclaración del usuario.

## Estado y registro

- Dashboard y Notificaciones usan `notification_detected_movement_suggestions.status`.
  Leer un aviso no guarda ni descarta su detección.
- La consulta de pendientes incluye `pending` y `needs_review`, del usuario y workspace
  activos. La cola se actualiza al resolver una detección, al volver al dashboard,
  cada 30 segundos con la app activa y con la reconciliación global al volver de
  segundo plano o recibir un push. Respeta la política del proyecto sin Realtime.
- Ambas superficies usan el mismo controlador y ventana de revisión. Cada guardado
  tiene un bloqueo síncrono contra pulsaciones repetidas y la clave idempotente
  `suggestion:<id>` ya utilizada por el registro de detecciones.
- La tarjeta empieza por la detección más reciente, incluida la caché de versiones
  anteriores. Los ajustes de cuenta sugerida se cargan sin bloquear la tarjeta;
  si llegan después, completan la cuenta mientras el usuario no la haya editado.
- La carga de pendientes y los errores de consulta o verificación PRO tienen un
  estado visible en Resumen y un reintento cuando falla la consulta. Una respuesta
  vacía confirmada sigue ocultando el bloque sin dejar espacio.
- La migración `202610070002` bloquea la fila de la detección y la resuelve dentro de
  la transacción que inserta el movimiento. Rechaza otro registro si ya está resuelta.
  Las divisiones existentes mantienen su cierre al terminar todas sus líneas.
- Descartar permite Deshacer. El estado del aviso sigue siendo independiente.
- Los errores conservan los campos editados. Los duplicados requieren una decisión
  explícita y permiten abrir el movimiento existente conservando el origen de navegación.

## Presentación

`ResourceCard`, `DetailFieldRow`, `DetailActionBar` y `ResourceSectionList` aportan
la presentación común. La lista y el formulario ocupan un mismo `BottomSheet`;
los selectores se abren dentro del mismo modal para evitar problemas de iOS.
La animación usa `springFade`, con los tiempos compartidos del proyecto.

Las transferencias usan `COLORS.transfer`, sin signo. No se propone un destino
arbitrario. Las conversiones usan tipos de cambio persistidos; editar cuánto llega
actualiza la tasa, y editar la tasa actualiza cuánto llega. El scroll del dashboard
tiene margen adicional para el botón flotante.

## Validación

Pruebas del controlador: pulsaciones repetidas, conservación de cambios tras errores
y actualizaciones, decisión de duplicado y descarte con Deshacer. Pruebas de reglas:
cuentas y categorías elegibles, fechas de Perú, destinos y tipos de cambio persistidos.
La integración SQL usa usuarios y movimientos ficticios en una transacción revertida.
Se prueba el render de la tarjeta con la revisión cerrada y los ajustes todavía
cargando, además de la llegada tardía de propuestas sin sobrescribir ediciones.

La revisión visual y de gestos en un iPhone físico queda pendiente. Se conserva
`detachInactiveScreens` activo. ESLint no tiene una configuración compatible disponible.
El diccionario local de base de datos documenta la nueva función y el trigger.
