# Aprendizaje personal de movimientos detectados

La tarjeta del dashboard y la revisión desde Notificaciones usan el mismo controlador y las mismas propuestas. Guardar sigue siendo una decisión del usuario.

## Evidencia y alcance

- Se leen hasta 1.000 movimientos vigentes, ordenados por última actualización, y hasta 1.000 detecciones resueltas del mismo usuario y espacio.
- En espacios compartidos se incluyen registros creados por el usuario que no hayan sido editados por otra persona. Los registros sin autor solo se incluyen cuando el servidor confirma espacio personal, propietario actual y un único miembro.
- Se separan gastos, ingresos y transferencias. Se normalizan acentos, puntuación, textos de pago y números de terminal; se exige coincidencia del comercio o concepto, sin inferir por palabras genéricas como «pago».
- Una propuesta habitual necesita dos registros y al menos 80% de acuerdo. Una corrección reciente puede sustituir el hábito anterior. Categorías inactivas y cuentas archivadas no se proponen; la cuenta principal debe tener la moneda detectada.
- Se excluyen ajustes de saldo, movimientos anulados, divisiones con varias categorías y registros repetidos por id/clave de idempotencia. Una detección duplicada aporta una referencia al movimiento existente, sin incrementar el número de ejemplos.

## Referencias del comprobante

La función `inbound-email-detection` extrae referencias enmascaradas bajo etiquetas explícitas de cuenta o tarjeta. Conserva únicamente tipo y últimos cuatro dígitos, por lado de la operación. No usa celulares de beneficiarios, números de operación ni números de cuenta completos.

Al confirmar el movimiento se conserva en `movements.metadata.detectionLearning` la descripción original, canal, referencias y campos elegidos manualmente. El vínculo de una detección resuelta también permite reconocer descripciones renombradas. Se consultan siempre las cuentas/categorías actuales del movimiento enlazado.

Una referencia confirmada de banco y cuenta tiene prioridad sobre el hábito del comercio. Si no existe una relación inequívoca, esa cuenta queda por elegir. La primera confirmación puede establecer una relación; los conflictos quedan vacíos salvo corrección reciente. Las referencias de una conciliación automática no entrenan ese vínculo.

En transferencias, el destino necesita una referencia confirmada o un concepto específico repetido con el mismo origen. No se propone un destino a partir de «Transferencia BCP». Los yapeos a terceros siguen como gastos. No se aprenden montos ni tipos de cambio; la revisión utiliza las tasas persistidas del módulo de tipos de cambio.

## Ciclo de vida

No existe una tabla de hábitos persistidos independiente del libro mayor. Editar cambia la evidencia; borrar, anular o deshacer la retira. Omitir no produce evidencia. Leer un aviso tampoco modifica el aprendizaje.

Las mutaciones de movimientos, la clasificación masiva, las detecciones resueltas y el regreso a la app invalidan `detection-learning`. La consulta es opcional, no bloquea la tarjeta, y las propuestas tardías respetan los campos que el usuario ya modificó. Los borradores conservan esos campos manuales al cambiar de detección. La IA permanece como alternativa para categorías cuando no hay un patrón personal claro.

La interfaz muestra «Según tus movimientos anteriores» cuando usa una propuesta aprendida, sin porcentajes ni términos técnicos. Se conserva la ventana nativa de revisión durante el guardado y el avance al siguiente pendiente.

## Validación

Pruebas de reglas: repetición, ambigüedad, separación por tipo y moneda, correcciones, referencias bancarias, omisiones, duplicados, ajustes, transferencias, retirada de evidencia y cambios de descripción.

Pruebas de consultas: aislamiento por usuario/espacio, historial antiguo y fallos. Pruebas del controlador: propuestas tardías, elección manual, referencias desconocidas y metadatos del guardado. Pruebas del receptor: solo se conservan referencias enmascaradas.

La comprobación visual y de gestos en un iPhone físico sigue pendiente; las pruebas automatizadas no verifican la asociación nativa de gestos ni las coordenadas táctiles.
