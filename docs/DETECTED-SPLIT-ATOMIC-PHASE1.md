# Divisiones detectadas: fase 1, 13 de octubre de 2026

Contrato y migración `202610130002_detected_movement_split.sql` iguales en web y móvil.
Esta fase prepara el registro transaccional, pero **no habilita ni completa la funcionalidad**.

- RPC `register_detected_movement_split`: solo gasto/ingreso Aplicado sin vínculos de recurrencia/obligación. Propietario, membresía, RLS, PRO de correo y referencias activas en el mismo espacio.
- 2–100 categorías distintas, importes positivos en centavos exactos, cuenta en moneda original. Una transacción guarda todas las partes y resuelve la detección, o revierte todo.
- Clave canónica de la primera fila `suggestion:<id>` y posteriores `suggestion:<id>:split-N`. Metadatos de origen/grupo del servidor. Petición normalizada y versión original en la primera fila para reintentos; no se reparan grupos parciales ni se reutiliza un registro simple/editado o un intento diferente.
- `features/detected-movements/lib/detection-split.ts`: validación pura y cliente RPC. Conserva la precisión de la versión, captura la petición antes de esperar y exige confirmación completa del mismo espacio/detección. Sin fallback por partes ante error/RPC ausente.
- Deshacer completo usa el contrato existente. Lectura y archivo de avisos quedan intactos.

## Verificación local

Desde web, `npm run test:detected-movement-split` ejecuta SQL real en PGlite y los triggers originales de resolución y guardas PRO con fixtures de autorización, referencias y RLS. Comprueba rollback en la segunda parte/permisos/estado cambiado, centavos, reintentos, grupos alterados, otros enlaces y Deshacer. Compara ambos archivos SQL/cliente byte a byte. La prueba móvil `detectionSplit.test.ts` cubre el mismo contrato puro y su transporte simulado.

No usa credenciales ni conecta con Supabase. PGlite de una conexión **no demuestra locking entre sesiones**, servidor desplegado, todos los triggers productivos ni dispositivos reales.

## Pendientes antes de exponerlo

1. Contrato de cobro agrupado para suscripciones/ingresos fijos: varias partes deben contar como **un cobro por su total**, no varias ocurrencias ni solo el monto de la primera.
2. Comprobación de duplicados por grupo completo y controles de cancelación/versión en el flujo móvil.
3. Integrar formularios web/móvil sin guardado secuencial de detecciones; comprobante/feedback y lectura siguen operaciones separadas y deben comunicar fallos sin repetir la parte financiera.
4. Pruebas locales de los formularios reales; después, despliegue explícitamente autorizado y validación de concurrencia/servidor/dispositivos.

El usuario eligió **solo pruebas locales**. No se desplegó SQL ni OTA, no se creó espacio de pruebas remoto ni se tocaron registros reales. No equivale a paridad total.
