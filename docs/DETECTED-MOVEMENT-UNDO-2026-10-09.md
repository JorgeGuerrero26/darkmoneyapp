# Deshacer detecciones: contrato compartido

Implementación del 9 de octubre de 2026; migración desplegada y OTA disponible desde el 11.
Recepción y validación en dispositivos reales pendientes.

El flujo anterior borraba solo el primer movimiento de una división y reabría la detección
en otra petición. Se sustituye por `undo_detected_movement_registration(workspace, suggestion,
expected_movement)`, con el mismo SQL y contrato puro que web.

- Una transacción borra el registro propio y reabre la detección como `pending` sin cambiar
  lectura, archivo ni payload de avisos. Si falla cualquier paso, revierte todo.
- En divisiones completas valida todas las claves `suggestion:<id>` / `suggestion:<id>:split-N`,
  índices y procedencia antes de borrar todas las partes.
- Respeta RLS, sesión, membresía, propietario y PRO por correo. Captura el espacio original,
  aunque el usuario lo cambie antes de pulsar Deshacer en el toast.
- Rechaza registros editados, manuales/duplicados, vinculados a obligaciones, con comprobantes,
  grupos incompletos/contaminados y referencias de otras detecciones. Esos casos deben revisarse
  desde Movimientos. Un helper de solo lectura detecta vínculos de otros usuarios sin exponerlos.
- `metadata.registrationUndo` guarda ID anterior, IDs borrados y fecha para reintentos tras
  perder una respuesta. Un registro posterior no puede borrarse con el ID antiguo.
- Sin RPC disponible no hay fallback de borrado/actualización. Consultas se invalidan también
  ante una respuesta incierta. Errores se muestran aunque el diálogo original haya cerrado.

## Validación

Typecheck móvil y 19 pruebas en `detection-undo.test.ts` / `review-draft.test.ts` pasan.
Desde el repositorio web, `npm run test:detected-movement-undo` ejecuta el SQL real en Postgres
en memoria: RLS, FK, rollback, división completa/incompleta, permisos, otros avisos y reintentos.
El test compara byte a byte migración y contrato puro de ambos repositorios.

No se accedió a registros reales. La prueba en memoria no valida contención entre sesiones,
todos los triggers del servidor ni la UI en dispositivos. No se ejecutó Jest completo.

Se aplicó únicamente `202610090002_detected_movement_undo.sql` al servidor compartido,
después de comprobar los contratos previos. Un directorio temporal con el historial remoto
evitó incluir otras migraciones locales pendientes. El dry-run mostró solo ese archivo.
Se verificaron el historial, los cuerpos de ambas funciones contra el SQL local, `search_path`
vacío y permisos: Deshacer es `security invoker`; el helper de lectura es `security definer`;
`authenticated` puede ejecutar y `anon`/PUBLIC no. Las consultas remotas fueron de esquema,
permisos e historial; no se invocó Deshacer ni se registraron o eliminaron movimientos reales.
Al desplegar SQL aún faltaba publicar el cliente móvil. La OTA posterior se documenta abajo;
desplegar solo SQL no actualizaba el flujo del teléfono. Falta la validación entre dispositivos.
El diccionario local `DATABASE_DICTIONARY.md` se actualizó y se mantuvo fuera de Git.
Crear divisiones detectadas en web, aprendizaje/IA e integración entre dispositivos siguen pendientes.

## Publicación y verificación: 11 de octubre de 2026

- Se validó una copia aislada del commit `86bf65a2`, sin incluir ediciones locales de
  Suscripciones, Invitaciones o del Asistente que estaban en curso. Typecheck pasó,
  al igual que cinco pruebas del validador OTA y 88 pruebas en diez suites de detecciones
  y conteo de avisos. No se ejecutó Jest completo.
- La suite del hook de revisión tenía un mock desactualizado: faltaba la nueva mutación
  de Deshacer. Se actualizó y se añadieron casos del botón tras cambiar de espacio y
  de fallo tras cerrar la revisión, sin fallback de borrar/actualizar por separado.
- Se exportaron iOS y Android para los tres runtimes con caché limpia y se validaron
  4.978/4.985 entradas en mapas de código, 32 fuentes tipográficas y 63 recursos por plataforma.
  Se comprobaron los archivos de Deshacer en los mapas y la ausencia de las credenciales
  privadas de la base de datos en bundles/mapas; no se publicaron los mapas de fuentes.
- Esta continuación publicó los grupos `27aa3d30-82a8-4faf-b8b0-c42b4f512195` (1.0.10)
  y `3986048e-bd7b-41b6-9f24-63cb28cf8e40` (1.0.9), en `preview`, para ambas plataformas.
- Se detectó una publicación concurrente del Asistente, basada en commits posteriores
  que incluyen esta corrección. No se publicó encima la exportación anterior de 1.0.8.
  La publicación posterior de `4cae82e8` conserva Deshacer y campana, incorpora el Asistente
  y limpia los errores al salir del formulario. Se preservó esa versión más reciente.
- Disponibilidad final en `preview`, para iOS y Android:

  | Runtime | Grupo publicado |
  | --- | --- |
  | 1.0.10 | `e9d50a95-9555-4fd6-ac88-d801066f95ce` |
  | 1.0.9 | `417b4814-ac47-46df-9879-5ff075682e6b` |
  | 1.0.8 | `2e7e9347-84c6-4ebd-b787-3eca8b0d4c69` |

- Se consultó el endpoint que usan los clientes con plataforma/runtime/canal, siguiendo
  [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/). Los seis manifiestos
  entregan 63 recursos y 32 fuentes. Se descargó solo el bundle de código en memoria usando
  los encabezados de recursos indicados por el servidor: SHA-256 coincide con el manifiesto
  y el bundle contiene `undo_detected_movement_registration`. No se descargaron fotos.
- Una consulta agregada de arranques no encontró sesiones ejecutando esos seis IDs al
  verificar. Eso no demuestra que no se hayan descargado: recepción y prueba en el teléfono
  siguen sin confirmación. No se probó Deshacer en datos reales.
- Al ampliar la ejecución en el directorio principal, Jest incluyó una copia temporal
  de la otra publicación y contó dos veces los casos; TypeScript también incluyó sus
  Edge Functions de Deno. No se editó ese checkout ajeno ni se cambió tsconfig para ocultarlo.
  Tras retirarse ese checkout, `npm run typecheck` volvió a pasar sin cambios de configuración.
  La ejecución por diez rutas explícitas pasó 90 pruebas sobre la versión actual, sin contar
  copias temporales. Una OTA disponible no prueba que el teléfono la haya descargado o ejecutado.
- Las comprobaciones remotas fueron de esquema/permisos y paquetes publicados. No se
  crearon ni eliminaron movimientos reales. La prueba de guardar/deshacer entre dos
  dispositivos, la contención real de Postgres y las demás funciones de paridad siguen
  pendientes. El directorio temporal de esta publicación se retiró, sin tocar el principal.
