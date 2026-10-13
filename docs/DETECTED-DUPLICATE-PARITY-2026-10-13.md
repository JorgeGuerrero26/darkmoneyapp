# Duplicados detectados: fecha, búsqueda y evidencia

## Alcance

Corrección del comprobador móvil para coincidir con la web en las consultas previas a registrar una detección. No se modificaron Kotlin, el esquema, la función IA ni el motor offline; no se publicó OTA ni se operó sobre registros reales.

La skill del repositorio `darkmoney-notification-detection` orientó la revisión de ambos consumidores: el hook React y `notification-detection-headless.ts`, usado por el registro rápido de Android. No se aplica el checklist de APK/DEX a este cambio exclusivamente TypeScript.

## Cambios

- Día de Perú, no día UTC del instante: intervalo cerrado al inicio y abierto al siguiente día (`05:00Z` a `05:00Z`). El límite excluye exactamente el día siguiente y no depende del huso del teléfono. Una fecha inválida se rechaza, no se sustituye por hoy. La regla pura vive en `features/detected-movements/lib/duplicate-day.ts`.
- La búsqueda deja de comparar solo los primeros 10 resultados. Consulta Aplicado, espacio, tipo, cuenta e importe y pagina 500 filas por petición, con orden por fecha e ID. Ingresos usan el lado de destino; transferencias comparan también cuenta e importe de llegada. No se busca sin una cuenta válida.
- Los conteos de señales requieren usuario, espacio, moneda y tipo; solo incluyen `pending`, `needs_review` y `registered`, no omitidas o duplicadas. Total, registradas y movimientos coincidentes son tres conteos exactos del servidor: no se cuentan las filas recortadas por el límite de respuesta.
- Un error, un conteo inválido o registradas mayores que total no produce evidencia ficticia. En el hook React y en Android headless, una coincidencia sin evidencia válida queda para decisión manual sin llamar a la IA. La comprobación PRO existente y el contrato/veredictos del endpoint no cambian.
- Android headless ya no interpreta un fallo de búsqueda como ausencia de duplicados. El fallo alcanza su ruta existente de aviso de error, liberación del claim y reintento. Un fallo de conteos pasa la coincidencia a `needs_review`, sin crear un movimiento ni marcar el aviso leído.

## Verificación local

- `npm run typecheck`: pasa sobre el checkout actual. Se preservan las ediciones offline y de Suscripciones en curso.
- Jest por rutas: 55 casos pasan en cinco suites: nuevas consultas de duplicados, hook de revisión, nuevo test headless, conciliación y contrato de veredictos. Se prueban madrugada/medianoche de Perú, días adyacentes, 510 candidatos anteriores, 1,105 registradas, usuario/moneda/tipo/estado, ambos lados de transferencia, fallos de lectura, evidencia inconsistente y detención del guardado ante fallo. Los tests headless simulan el bridge y Supabase; no invocan Android nativo.
- Web `test:detection-duplicates`: ejecuta las funciones móviles reales y compara los límites, candidatos, conteos y cuerpo IA contra web, incluidos los casos que antes eran diferentes. También pasa `test:detected-movement-parity` y build web. No usa red ni modifica finanzas.
- `npm run lint`: termina sin errores, con 424 advertencias en el repositorio. No se aplicó `--fix` ni se amplió el alcance a limpiar otras pantallas.
- `git diff --check`: pasa.

## Límites: no es paridad total

- Las pruebas son con clientes/bridge simulados, no demuestran RLS remoto, contención entre dos dispositivos, cuotas ni funcionamiento real de DeepSeek. No se ejecutó la suite Jest completa.
- El cambio es online. No se rediseñó el flujo offline ni se certificó el binario instalado. El teléfono no incorpora esta corrección hasta recibir una actualización móvil.
- Se corrigió la búsqueda de transferencias usada por React; la ruta headless de transferencias tiene su registro propio antes de esta comprobación y no fue rediseñada en esta unidad.
- El registro headless conserva acciones previas de creación de categorías/contactos/recurrencias cuando el payload las solicita. No se convirtió todo ese flujo en una transacción; la detención ante error se refiere al nuevo movimiento financiero. Los fixtures de esta unidad no solicitan esas creaciones.
- Permanecen fuera de este cambio las divisiones detectadas web, la cancelación/verificación de versiones en todas las vías móviles, herramientas avanzadas y pruebas visuales/financieras en dispositivos reales. No se afirma que los módulos completos tengan paridad total.
