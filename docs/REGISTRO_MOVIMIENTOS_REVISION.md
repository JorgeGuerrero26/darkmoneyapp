# Registro de movimientos — Documento de revisión técnica

> Contexto para revisión por otro programador. Cubre las **4 vías** para registrar un
> movimiento, con foco en el **registro rápido desde notificaciones Android** (vía nativa),
> que es la más compleja. Incluye los cambios recientes, mejoras futuras y riesgos.

---

## 1. Las 4 vías de registro

| # | Vía | Entrada | Componente | Tipo |
|---|-----|---------|------------|------|
| 1 | Dashboard FAB | Botón `+` del dashboard | `components/forms/MovementForm.tsx` | Formulario completo |
| 2 | Módulo Movimientos FAB | Botón `+` del módulo | `components/forms/MovementForm.tsx` (mismo) | Formulario completo |
| 3 | Módulo Notificaciones | Tap en sugerencia detectada | `components/domain/QuickDetectedMovementEntry.tsx` | Registro rápido (React) |
| 4 | Notificación nativa Android | "Registro rápido" en la notif | `plugins/notification-detection/.../QuickMovementOverlay.kt` | Registro rápido (overlay Kotlin nativo) |

**Dato clave:** vías 1/2/3 son React y comparten los mismos hooks de IA
(`useMovementCategoryAiSuggestion`, `useMovementCounterpartyAiSuggestion`, etc.).
La **vía 4 es 100% nativa (Kotlin)** y reimplementa su propia UI + lógica de sugerencias.
Cualquier cambio de comportamiento de IA/sugerencias debe replicarse en **ambos mundos**.

### Estándar común
Las 4 vías deben llamar a la IA (DeepSeek vía Supabase edge functions) y registrar con el
mismo criterio, salvando la diferencia de formulario completo vs registro rápido.

---

## 2. Arquitectura del registro rápido por notificación (vías 3 y 4)

### 2.1 Detección (nativo, siempre activo)
- `DarkMoneyNotificationListenerService.kt` (`NotificationListenerService`) escucha
  notificaciones. `onNotificationPosted` → `processStatusBarNotification`.
- Filtros/gates en orden (cualquiera corta con `return` temprano):
  1. paquete permitido + detección habilitada
  2. Gmail: `isFinancialGmailNotification` (reconoce banco + monto + señal transaccional)
  3. `isPromotionalNotification` (descarta promos)
  4. `isDiscardedFingerprint` (huella de descarte del usuario)
  5. `hasRecentRegisteredSuggestion` (anti re-disparo del MISMO movimiento)
  6. `hasPendingSuggestionForAmount` (dedupe cruzado 5 min por monto, SOLO entre fuentes/paquetes distintos)
  7. `inferMovementDetection` (clasifica expense/income/transfer + confianza)
- Si pasa: `NotificationDetectionStore.upsertSuggestion` (SharedPreferences) + muestra la
  notificación "movimiento detectado" + dispara **pre-cómputo de IA** (`startAiCategoryEnrichment`
  → headless task `aiCategoryEnrichment`).

### 2.2 Persistencia local
- `NotificationDetectionStore.kt` (SharedPreferences): sugerencias (30 días), huellas de
  descarte (60 días), `runtime_context_json` (contexto que la app sincroniza: cuentas,
  categorías, patrones, `frequentTransferPair`, `notifCleanupKey`).
- El **overlay nativo lee el `runtimeContext` persistido** — por eso funciona con la app cerrada.

### 2.3 Registro (dos caminos)
- **Overlay nativo (vía 4) con app cerrada:** `NotificationDetectionSaveTaskService` →
  headless JS `lib/notification-detection-headless.ts` → inserta en Supabase directamente.
- **React (vía 3) o app abierta:** `QuickDetectedMovementEntry` → `useCreateMovementMutation`.

### 2.4 Sincronización nativo ↔ React
- `hooks/useNotificationDetectionRuntimeSync.ts` (montado en `app/(app)/_layout.tsx`):
  - Calcula y envía el `runtimeContext` al nativo (`setRuntimeContext`).
  - Lee sugerencias nativas pendientes → `syncNativeDetectedSuggestion` → tabla
    `notification_detected_movement_suggestions` + crea notificación in-app (kind
    `detected_movement_suggestion`) → aparece en el **módulo de Notificaciones**.
- `hooks/useNotificationDetectionForegroundReconcile.ts`: al volver a foreground, invalida
  `["movements"]`/`["workspace-snapshot"]`, **re-escanea la bandeja + rebind del listener**
  (`requestActiveNotificationScan` — rescata notifs que llegaron con el listener muerto),
  reprocesa la cola de reintentos de guardado y reconcilia sugerencias ya registradas.

### 2.5 Build nativo (NO negociable)
Cambios en `plugins/notification-detection/native-src/**/*.kt` requieren, según
`docs/BUILD_APK.md`:
1. Sincronizar `plugins/` → `android/app/src/main/java/com/darkmoney/app/notificationdetection/`
   (Gradle compila SOLO desde `android/`; `android/` está **gitignored**, se versiona `plugins/`).
2. Limpiar caches (`android/.gradle`, `kotlin-classes`, `intermediates/dex`).
3. `assembleRelease` con `-P` **quoteado** en PowerShell.
4. **Verificar que los strings nuevos aparezcan en el DEX** antes de declarar el APK listo.
   `BUILD SUCCESSFUL` no garantiza que el cambio entró.
- `Log.d` se filtra en release (Samsung); usar `Log.w` para diagnóstico capturable por ADB.

---

## 3. Cambios realizados (16 commits)

### Transparencia de IA
- `301dd560` — Hook `useMovementCategoryAiSuggestion`: estado `outcome`
  (idle/running/resolved/no_suggestion/error), gate `proAccessEnabled`, `withTimeout` ~12s.
  Bloques distinguen "IA no disponible" (error) de "IA sin sugerencia".
- `01fa9f50` — Overlay nativo: estados terminales de IA visibles (antes corría invisible).
- `7bb42a90` — Headless escribe `local_confirmed` cuando la IA confía en la local (antes lo
  marcaba como `unavailable`); overlay muestra "IA confirmó tu categoría".

### Transferencias (dirección)
- `d13a9b51` — `useFrequentTransferPairQuery` + prellenar origen→destino con el par más usado
  en vías React (registro rápido + formulario).
- `01fa9f50` — Overlay nativo: `frequentTransferSourceIndex` (el ORIGEN honra el par frecuente).
- `cf9e3c3b`/`c1e74381` — Confirmado vía ADB que el par llega correcto; el síntoma
  "Principal→Sueldo" era **timing** (par aún no sincronizado → fallback), no código.

### Anti-duplicado / detección (notificaciones)
- `e737629a` — Guard `hasRegisteredSuggestionForFingerprint` (no re-disparar ya registrado).
- `c262cd39` — **Fix del fix:** ese guard usaba huella sin-monto → bloqueaba TODO pago nuevo
  del mismo banco. Cambiado a `hasRecentRegisteredSuggestion` (huella + monto exacto + ventana 30 min).
- `7235a983` — Detección de transferencias por correo BCP (`looksLikeBcpTransferEmail`, NBSP).
- `5b06de6b` — **Causa raíz "no detecta nada":** `markSuggestionRegistered` agregaba la huella
  genérica a la lista de descartes al registrar → bloqueaba futuras transacciones de la misma
  plantilla. Quitado. `clearDiscardFingerprints` purga huellas viejas vía `notifCleanupKey`.

### Listener vivo / registro con app cerrada
- `cf9e3c3b` — `onListenerDisconnected` ahora llama `requestRebind()` (Samsung mataba el
  listener; sin esto no detectaba en tiempo real con app cerrada).
- `9e9b1cf1` — **Registro fallaba por timeout:** headless usaba `auth.getUser()` (valida contra
  servidor, se cuelga en headless). Cambiado a `auth.getSession()` (lee token local).
- `df565091` — Reconcile al volver a foreground (refresca + marca registradas + cancela notif vieja).
- (2026-06-12) **Re-escaneo de bandeja al abrir/foreground**: `requestActiveNotificationScan()` en el
  reconcile. Caso real: correo BCP llegó con el listener muerto (Samsung) y quedaba en bandeja sin
  procesar para siempre — abrir la app no lo rescataba, solo la pantalla "Detección automática".
- (2026-06-12) **Re-upsert estable**: `upsertSuggestion` preserva `notificationId`, `createdAt` y los
  campos de IA pre-computados al re-procesar la misma sugerencia (re-escaneos ya no duplican tiles ni
  borran el enriquecimiento); el listener no re-dispara DeepSeek si ya hay recomendación terminal.
- (2026-06-12) **Logs de descarte**: cada gate del listener loguea `drop[motivo]` con `Log.w`
  (visible en release) — diagnóstico de "no detectó X" en 1 min vía `adb logcat | grep DarkMoneyND`.
- (2026-06-12) **Dedupe por monto solo cross-source**: dos compras reales del mismo monto y misma
  fuente en <5 min ya no se comen la segunda (caso vending machine).

### UX overlay nativo
- `22f94c55` — Aplicar oculta el chip (fade out); espaciado entre chips local/IA;
  recalcular sugerencia **local** en vivo al editar descripción (debounce 500 ms; la IA no se
  recalcula desde el overlay).

### Módulos / rendimiento
- `31bd452d` — `staleTime` de `workspace-snapshot` 5 min → 30 s + `refetchOnReconnect`
  (refrescar al entrar a un módulo).
- `85eec6e0` — Notificaciones: `NotificationCard` memoizado + updates optimistas en mutaciones
  (acciones masivas instantáneas).
- `0389595b` — Movimientos: **guard anti-doble-tap** (useRef síncrono en `submit`/`handleSubmit`
  — causa de registros duplicados/triplicados); invalidación **inmediata** al guardar (antes
  diferida por `InteractionManager`); `RefreshControl` con `colors[]`+`progressBackgroundColor`
  (feedback de pull-to-refresh en Android).

---

## 4. Posibles mejoras futuras

1. **IA en vivo en el overlay nativo:** hoy al editar la descripción solo se recalcula la
   sugerencia local. Recalcular la IA requeriría llamar a DeepSeek desde Kotlin (latencia/costo).
   Evaluar si vale la pena con debounce + indicador.
2. **`frequentTransferPair` siempre fresco:** depende de que la app corra el sync. Podría
   recalcularse/refrescarse también en el pre-cómputo headless al detectar, para no depender de
   abrir la app.
3. **Recencia en `getFrequentTransferPair`:** hoy es frecuencia cruda de los últimos 100
   transfers. Ponderar por recencia daría mejor default si cambia el patrón del usuario.
4. **Dedupe a nivel de datos (defensa en profundidad):** el guard anti-doble-tap es síncrono en
   UI; añadir un constraint/idempotencia por `suggestionId` o `dedupeKey` en el insert evitaría
   duplicados incluso ante condiciones de carrera entre vías (overlay headless + React).
5. **Exclusión de batería guiada:** Samsung mata el listener; el `requestRebind` ayuda, pero la
   garantía real es "Sin restricciones" de batería. Un onboarding que lo configure reduciría
   tickets de "no detecta con app cerrada".
6. **Telemetría de fallos de registro:** `recordDetectionEvent` ya existe; añadir eventos de
   "registro fallido" con causa (timeout, RLS, red) facilitaría diagnóstico remoto.
7. **Limpieza de logs `Log.w` de diagnóstico:** confirmar que no quedó ninguno temporal
   (el del par de transferencia se removió en `c1e74381`).

---

## 5. Riesgos / puntos de atención para el revisor

1. **Doble fuente de verdad nativo ↔ React (vía 4 vs 3):** el overlay Kotlin reimplementa la
   lógica de sugerencias. Un cambio en React NO se refleja en el overlay y viceversa. Revisar
   ambos al tocar comportamiento de IA/categorías/transfer.
2. **`discardFingerprint` ignora el monto** (a propósito, para "descartar plantilla"). **Nunca**
   reutilizarlo para deduplicar transacciones por igualdad: bloquea pagos legítimos del mismo
   banco. Ver `notif-discard-fingerprint-gotcha` (memoria del proyecto) y commits `c262cd39`/`5b06de6b`.
3. **`android/` es gitignored y se compila desde ahí.** Si no se sincroniza `plugins/`→`android/`,
   el build usa Kotlin viejo y `BUILD SUCCESSFUL` engaña. Verificar hashes + strings en DEX.
4. **Procesar notif ya en bandeja vs nuevas:** las notificaciones que ya estaban antes de
   instalar/abrir solo se procesan al forzar re-escaneo (entrar a "Detección automática" →
   `requestActiveNotificationScan` o toggle del permiso). Las nuevas entran solas vía
   `onNotificationPosted`. No confundir un caso con el otro al testear.
5. **Headless = contexto sin React:** no asumir `queryClient`, hooks ni `auth.getUser` (red).
   Usar lecturas locales (`auth.getSession`) y `withTimeout`/`withRetry`
   (`HEADLESS_QUERY_TIMEOUT_MS=10s`, `HEADLESS_RETRIES=2`).
6. **Guard anti-doble-tap con returns múltiples:** `submit()` en `QuickDetectedMovementEntry`
   tiene varias salidas (validación, diálogo de duplicado, transfer, éxito, error). El ref debe
   liberarse en TODAS. Revisar que no quede una ruta que lo deje "trabado" (bloquearía registrar).
7. **Invalidación inmediata vs background notice:** `useCreateMovementMutation` ya no usa
   `runBackgroundQueryRefresh` (que mostraba el aviso de "guardando"). Si se quiere ese aviso de
   vuelta, reintroducirlo sin volver a diferir la invalidación.
8. **`notifCleanupKey`** dispara limpiezas one-shot al abrir (notifs stale + huellas de descarte).
   Bumpear con criterio (`YYYY-MM-DD-vN`); un bump innecesario borra huellas de descarte legítimas
   del usuario.
9. **Limitación conocida — dedupe de la capa sync:** `syncNativeDetectedSuggestion`
   (`services/queries/notification-detection.ts` ~282-305) colapsa en el MÓDULO sugerencias pending
   del mismo monto+moneda en <10 min con merchant solapado. Dos compras genuinas idénticas (mismo
   monto y comercio) pueden verse como una sola en el módulo aunque el nativo detecte ambas. No se
   tocó: ese dedupe cubre el caso legítimo cross-source. Si se ataca, hay que distinguir por
   `nativeSuggestionId`/paquete, no por monto+texto.

---

## 6. Cómo probar (matriz mínima)

- **Detección:** pago nuevo (gasto/ingreso/transfer, incl. correo BCP) → aparece "movimiento
  detectado" en bandeja Y en módulo de Notificaciones.
- **Registro app abierta:** registrar desde registro rápido → movimiento + saldo se actualizan
  al instante (sin pull-to-refresh).
- **Registro app cerrada:** registrar → reabrir: NO re-dispara, movimiento guardado, saldos OK.
- **Anti-duplicado:** tap rápido/doble en Guardar → un solo movimiento.
- **Transferencia:** default = par más usado (origen→destino correctos).
- **IA transparente:** estados visibles (analizando / mejor sugerencia / confirmó / sin
  sugerencia / no disponible) en overlay y en React.
- **Pull-to-refresh:** arrastrar en cualquier módulo → spinner visible.
- **Build nativo:** verificar strings nuevos en DEX antes de instalar.
