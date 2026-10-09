# Conciliación de detecciones y movimientos manuales

La migración `202610090001_detected_movement_reconciliation.sql` agrega una RPC
compartida por el dashboard y Notificaciones. No crea, elimina ni modifica
movimientos, importes, saldos o la lectura de las notificaciones.

## Criterios

- Solo movimientos `posted`, del mismo workspace, con el importe, tipo y moneda
  del lado correcto y la fecha de Perú. Respeta cuentas propuestas conocidas y,
  en transferencias, el destino conocido. Excluye líneas de pagos divididos.
- Resuelve automáticamente un candidato único cuando existe un vínculo explícito
  por `metadata.suggestionId`, el mismo número de operación del mismo banco, o
  una descripción específica idéntica y la misma hora al minuto. El último caso
  requiere confianza alta, fecha de la operación y una sola detección coincidente;
  para correo exige remitente autenticado y para transferencias ambos extremos.
- Una coincidencia solo por importe/día, descripciones genéricas, horas distintas,
  varios candidatos o varias detecciones similares continúa pendiente y muestra
  **Posible duplicado**. El usuario abre el registro y elige **Es el mismo** o
  **Guardar igual**. Editar los datos vuelve a comprobar el duplicado al guardar.
- El estado resuelto es `duplicate`, con `movement_id` y auditoría en
  `metadata.reconciliation`. Leer el aviso no resuelve la detección. La RPC
  conserva `read_at`, `status` de lectura y `archived_at` del aviso.

## Omitir detecciones

**Omitir** es una acción visible en la tarjeta del dashboard y en la revisión de
Notificaciones, incluso ante un posible duplicado. Persiste `discarded` en la
misma detección; no crea movimientos ni cambia saldos. Sale de los pendientes y
el aviso sigue disponible: al abrirlo muestra **Detección omitida**.

El banner permite **Deshacer**, que recupera `pending` o `needs_review` según el
estado anterior, incluso si era el último pendiente. Solo modifica la caché del
usuario y workspace correspondientes. Resolver marca el aviso leído; deshacer
mantiene esa lectura y leer por sí solo no resuelve una detección. Mientras se
omite se indica el progreso y se bloquean las pulsaciones repetidas.

## Ejecución y permisos

`reconcile_after_manual_movement` corre después de registrar o editar un movimiento
manual. Las queries de pendientes y de revisión también concilian: cubren el
histórico y correos recibidos después de haber anotado el movimiento.

La RPC exige sesión y membresía y opera solo sobre las detecciones del usuario.
Correo mantiene la verificación PRO del servidor. Los helpers privados no tienen
EXECUTE para usuarios. Un lock por usuario/workspace coalesce llamadas simultáneas;
las resoluciones bloquean y vuelven a validar el candidato y la detección. Las
queries se invalidan tras crear o editar para actualizar ambas superficies.

## Validación y despliegue

- `node scripts/test-detection-reconciliation.mjs`: datos ficticios, migración y
  triggers en una transacción revertida; permisos, fechas de Perú, ingresos,
  transferencias, ambigüedad, lectura independiente e idempotencia.
- `node scripts/apply-detection-reconciliation.mjs --dry-run`: instala y comprueba
  la migración en una transacción revertida. Con `--user UUID --workspace ID`
  también comprueba el histórico del usuario sin conservar los cambios.
- El mismo comando sin `--dry-run` aplica esta migración concreta y registra su
  versión en `supabase_migrations`. Los parámetros opcionales concilian ese
  histórico y muestran solo los conteos.
- Typecheck, suite Jest completa y `git diff --check` antes de OTA. La revisión
  visual en el iPhone queda pendiente; no se tocaron listas nativas ni gestos.
