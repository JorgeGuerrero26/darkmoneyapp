# Confirmación IA de duplicados en detección (Pro) — Diseño

**Fecha:** 2026-07-14 · **Estado:** aprobado

## Problema

La detección suprime como "duplicado" cualquier notificación cuyo monto+día+cuenta+descripción normalizada coincidan con un movimiento ya registrado (`findPossibleDuplicateMovement`, `services/queries/notification-detection.ts:593`). Dos casos reales donde eso traga movimientos legítimos:

1. Registro manual primero (el yape no llegó a tiempo) → cuando la notificación llega, se cierra sola como duplicada.
2. Dos yapes del mismo monto el mismo día: el primero se registra por registro rápido → el segundo se cierra como duplicado del movimiento del primero. En la bandeja de Android hay 2 notificaciones de Yape y en DarkMoney solo 1 movimiento — ese desbalance debería validarse.

Además, a nivel visual, dos yapes simultáneos del mismo monto **colapsan en un solo tile** por el ID nativo (`appName:amount:bucket de 10 min`, `DarkMoneyNotificationListenerService.kt:189`), aunque el store nativo sí guarda ambas sugerencias (el suggestionId incluye el texto).

## Decisiones validadas

- IA (DeepSeek) **solo para Pro**; el gating vive **server-side** en la edge function. No Pro = comportamiento actual.
- Veredicto `distinct` en el flujo automático → **registra directo** (el usuario ya tocó "Registro rápido").
- Fallo de IA (`unknown`) → **no cerrar ni registrar**: pasa a revisión manual del usuario.
- Alcance: capa IA (OTA) **y** fix del tile nativo (APK), ambos ahora.

## Arquitectura

### 1. Edge function `movement-duplicate-ai-check` (nueva)

Patrón de `movement-category-ai-suggestion`. Entrada: `{ workspaceId, suggestion: { description, amountLabel, occurredAt, sourceApp, rawText }, candidateMovement: { id, description, occurredAt, amount }, counts }`. Pasos:

1. Valida entitlement Pro del usuario (service role). No Pro → `{ verdict: "skipped" }` sin llamar a DeepSeek.
2. Prompt a DeepSeek con ambos lados y los conteos, con la regla explícita: *si las señales detectadas del día (sugerencias de ese monto/app, registradas o no) superan los movimientos coincidentes registrados, es señal fuerte de que NO es duplicado*. Pide veredicto estructurado.
3. Respuesta: `{ verdict: "duplicate" | "distinct" | "unknown", reason: string, source: "deepseek" }`. Cualquier error/parse inválido → `unknown`.

### 2. Conteos del día (cliente, determinista)

`countSameDayDetectionSignals(workspaceId, amountLabel, sourceApp, day)` en `services/queries/notification-detection.ts`: cuenta (a) sugerencias del día con ese monto y app (todas: pending/registered/duplicate/discarded), (b) cuántas terminaron `registered`, (c) movimientos coincidentes del día (reutiliza el criterio de `findPossibleDuplicateMovement`). Va como `counts` a la edge function.

### 3. Helper cliente `confirmDuplicateWithAi`

En `services/queries/notification-detection.ts` (junto al resto de la capa detección): invoca la edge function con timeout de 8s; cualquier fallo → `{ verdict: "unknown" }`. Un solo punto de verdad para los dos consumidores.

### 4. Flujo headless (registro rápido desde la notificación)

En `lib/notification-detection-headless.ts` (~680), cuando `findPossibleDuplicateMovement` encuentra candidato:

- `distinct` → seguir con el registro normal (saltar el cierre).
- `duplicate` → cerrar como hoy (`status: "duplicate"` + movement_id) y guardar el `reason` de la IA en la sugerencia (el plan verifica la columna jsonb disponible en la tabla; si no existe, va en la migración junto con `needs_review`).
- `skipped` (no Pro) → cerrar como hoy (comportamiento actual intacto).
- `unknown` → `status: "needs_review"` en la sugerencia; la notificación in-app pasa a título/cuerpo "Posible duplicado — confírmalo" y NO se marca leída; el tile bancario se cancela (ya hubo intento de registro). El card de la bandeja abre el quick entry, cuyo Alert de duplicado existente es la confirmación humana.
- Sin retries automáticos de IA (evitar el loop N4): un solo intento por registro.

### 5. Quick entry en la app (`components/domain/QuickDetectedMovementEntry.tsx` ~782)

Pro: antes de mostrar el Alert de duplicado, llamar al helper. `distinct` → registrar sin Alert; `duplicate` → Alert actual + reason de la IA en el cuerpo; `unknown` → Alert actual. No Pro → Alert actual sin cambios.

### 6. Migración `needs_review`

El `status` tiene CHECK constraint (`202605130001_notification_detection_final.sql:16`). Nueva migración: recrear el CHECK incluyendo `'needs_review'`. Documentarla en `DATABASE_DICTIONARY.md` (gitignored — crearlo local si no existe). Verificar en el plan que la bandeja no filtra sugerencias por status de forma que oculte `needs_review`.

### 7. Fix nativo del tile (APK)

En `DarkMoneyNotificationListenerService.kt`: el tile id pasa de `"${appName}:${amount}:${bucket}"` a `"${appName}:${amount}:${bucket}:${counterpartyToken}"`, donde `counterpartyToken` es un extracto conservador del remitente (regex del nombre antes de "te envió|te yapeó|te pagó", normalizado; vacío si no hay match → comportamiento actual). Con esto: 2 yapes simultáneos de personas distintas = 2 tiles; re-fires de Gmail y push+email del mismo evento (mismo remitente) siguen colapsando. Proceso nativo completo: sync dual `plugins/`→`android/`, limpieza de caches Gradle, verificación de strings en DEX, bump de `version`/`versionCode` en app.json (runtimeVersion policy appVersion — **corta compatibilidad de OTAs viejos**), `npm run build:android` (EAS). Actualizar la sección "Notification ID estable" de CLAUDE.md y de la skill `darkmoney-notification-detection`.

## Criterios de aceptación

1. **Caso 2 yapes** (Pro): registrar el primero por registro rápido; llega el segundo (mismo monto, distinta persona) → registro rápido lo registra (IA `distinct`), quedan 2 movimientos.
2. **Caso manual primero** (Pro): movimiento registrado a mano; llega la notificación del mismo monto/día → si la IA confirma que es el mismo (`duplicate`), se cierra como hoy con el reason guardado; si es distinto, se registra.
3. **Fallo de IA** (Pro): DeepSeek caído → la sugerencia queda "Posible duplicado — confírmalo" en la bandeja de DarkMoney; el usuario decide desde el quick entry; nada se pierde ni se auto-duplica.
4. **No Pro**: cero llamadas a DeepSeek (verificable en la edge function) y comportamiento idéntico al actual.
5. **Tile nativo** (tras el APK): dos yapes simultáneos de distinto remitente muestran 2 tiles; un re-fire de Gmail del mismo evento sigue mostrando 1.
6. Tests puros: construcción del prompt/parse del veredicto, decisión post-veredicto (tabla verdict→acción), conteos.

## Fuera de alcance

- Cambiar el criterio determinista de `findPossibleDuplicateMovement` (sigue siendo el primer filtro barato).
- IA para sugerencias sin candidato a duplicado (no hay ambigüedad que resolver).
- Backfill de sugerencias ya cerradas como duplicate.
- iOS (la detección es Android-only).
