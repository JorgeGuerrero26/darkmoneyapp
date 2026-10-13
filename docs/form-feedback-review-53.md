# Revisión 53: avisos en formularios

Referencia: `Diseño de app móvil.zip`, revisión 53, del 11 de octubre de 2026. El HTML se revisó desde el ZIP de Descargas.

## Comportamiento compartido

- `FormFeedbackProvider` coordina reglas explícitas del formulario, foco y guardado. `useFormField` conecta cada control con una regla.
- Cada campo muestra un único estado: falta un dato (dorado), dato inválido después de Guardar (rojo) o correcto.
- Guardar permanece disponible cuando faltan datos. Abre el primer selector pendiente. Al elegir, continúa con el siguiente y guarda una sola vez si todos los datos son válidos. Escribir el primer carácter de un importe no envía el formulario.
- Un dato inválido se revela en su fila; no abre automáticamente el selector. Los contenedores de las hojas permiten desplazar el campo hasta la zona visible.
- `FormSaveFailure` presenta los fallos operativos sobre los botones. `FormSubmitBar` reserva Reintentar y su icono circular para esos fallos. Mantiene los cambios y bloquea pulsaciones repetidas.
- El botón de tres puntos junto a Guardar abre las opciones adicionales. En la revisión de detecciones incluye Omitir.
- Cerrar una revisión o pasar a otra detección limpia los errores temporales. El estado canónico de la detección y la lectura de notificaciones siguen separados.

## Alcance

Formularios de movimientos, cuentas, categorías, contactos, tipos de gasto, tipos de cambio, presupuestos, suscripciones, ingresos fijos, créditos y deudas; cobros/pagos, ajustes de capital, solicitudes de cambios, plan de pagos y reparto entre categorías. También las hojas de confirmación de pagos/llegadas, renombrado de plantillas, invitaciones, creación de workspace y configuración biométrica.

Las reglas financieras siguen en los validadores y builders. Los componentes compartidos no consultan Supabase. Los errores de transporte de las confirmaciones e invitaciones devuelven su promesa al formulario para presentar el aviso en el mismo lugar.

## Revisión de formularios restantes (12 de octubre)

Se revisaron los controles editables activos y sus llamadas de guardado:

| Grupo | Formularios revisados |
| --- | --- |
| Acceso y perfil | Iniciar sesión, registro, recuperación, nueva contraseña, bienvenida y perfil |
| Recursos | Movimientos, cuentas, créditos/deudas, presupuestos, contactos, categorías, tipos de gasto, tipos de cambio, suscripciones e ingresos fijos |
| Pagos y solicitudes | Pago/cobro, ajuste de capital, solicitud de pago, solicitud de edición, respuestas del propietario, rechazo y vinculación de cuenta desde detalle y analítica |
| Opcionales | Más detalles de obligación, plan de pagos, bruto/descuentos, cambios de monto, fechas de vigencia, confirmación de llegada/pago y ajuste rápido de presupuesto |
| Auxiliares | Invitaciones, workspace, biometría, renombrar plantilla/conversación y mensaje del reporte PDF |

- Las filas añadidas a descuentos y cambios de monto deben completarse o quitarse. La diferencia entre bruto, descuentos y neto sigue siendo informativa.
- Validación y guardado interpretan igual las comas y los separadores de miles. Las tasas conservan sus decimales y el saldo inicial admite valores negativos.
- Se comprueba que las fechas existan en el calendario. Se conservan las restricciones de fechas propias de cada módulo.
- Los errores del servidor que identifican un campo aparecen en ese campo; los errores ambiguos o de conexión permanecen sobre los botones.
- Un reintento de una acción secundaria repite esa acción. Por ejemplo, reintentar Rechazar no ejecuta Aprobar.
- Cerrar la ventana o cambiar de registro limpia los errores temporales. La tecla Siguiente mantiene el paso al campo siguiente.
- Búsquedas, filtros, chat del asistente y selectores conservan su interacción; no son formularios de registro. Los campos de las hojas opcionales heredan el estado del formulario que las abre.

## Verificación

- TypeScript, whitespace y ESLint.
- Suite Jest completa: 173 suites y 1.427 pruebas en la primera pasada; se añadieron después pruebas de reglas de campo para detecciones.
- Pruebas de selección consecutiva, guardado único, entrada manual sin envío automático, validación local, fallo asíncrono y cierre sin arrastrar errores.
- Pruebas de ciclo de vida de la ventana de detecciones: se conserva el mismo Modal mientras se resuelve una detección.
- Se conserva `detachInactiveScreens` activo. No se modificó `SwipeActionRow` ni la navegación de pestañas.
- **Pendiente en iPhone real:** scroll tras guardar/cerrar, teclado y desplazamiento al campo inválido; filas 1, 2 y 4 antes/después de Movimientos → Cuentas → Movimientos, con scroll previo y regreso de segundo plano. Las pruebas automatizadas no validan coordenadas de gestos nativos.

La OTA se exporta desde un worktree del commit publicado, con validación de rutas y fuentes para impedir volver a distribuir el diseño anterior por un bundle incompleto.
