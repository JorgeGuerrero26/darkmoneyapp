# Deshacer detecciones: contrato compartido

9 de octubre de 2026. Código preparado, migración y actualización móvil no desplegadas.

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

Aplicar una sola vez `202610090002_detected_movement_undo.sql` después de los contratos previos
de detecciones, validar con fixtures y publicar el cliente móvil. No se desplegó aquí.
El diccionario local `DATABASE_DICTIONARY.md` se actualizó y se mantuvo fuera de Git.
Crear divisiones detectadas en web, aprendizaje/IA e integración entre dispositivos siguen pendientes.
