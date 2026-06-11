# Auditoría del registro de movimientos (proceso CORE)

> Auditoría senior (2026-06-10) de las 4 vías de registro: MovementForm (vías 1/2),
> QuickDetectedMovementEntry (vía 3) y overlay Kotlin nativo + headless (vía 4).
> Tres frentes: vías React, pipeline nativo Android, y capa de datos/seguridad.
> Los hallazgos críticos fueron verificados manualmente contra el código.
> Complementa `docs/REGISTRO_MOVIMIENTOS_REVISION.md` (arquitectura y cambios previos).

**Estado:** los ítems P0/P1 tienen plan de implementación aprobado. Los P2/P3 quedan
como backlog al final de este documento.

---

## 1. Seguridad

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| S1 | `movements` y `accounts` SIN políticas RLS. Ninguna migración las crea; `DATABASE_DICTIONARY.md` §3 lo admite. Con la anon key (extraíble del APK) un usuario autenticado puede leer/escribir datos de otros workspaces. | CRÍTICA | P0 en curso |
| S2 | Password de postgres en texto plano en `DATABASE_DICTIONARY.md` (6 ocurrencias). Gitignored y nunca en git history, pero circula al compartir el archivo. Requiere además rotación en el dashboard. | ALTA | P0 en curso |
| S3 | Sesión Supabase (JWT) persistida en AsyncStorage sin cifrar (`lib/supabase.ts:14`). | ALTA | P0 en curso |
| S4 | Datos financieros (montos, bancos, descripciones, cuentas, runtime context) en SharedPreferences sin cifrar (`NotificationDetectionStore.kt`). Legibles con root o backup sin cifrar. | ALTA | P0 en curso |
| S5 | Texto de notificaciones de terceros como vector de inyección: `cleanFinancialEmailMerchant` no valida que la salida sea un nombre plausible. Riesgo bajo en RN (no renderiza HTML) pero el merchant llega crudo a la BD. | MEDIA | Backlog |
| S6 | `setLastSaveError` guarda mensajes de error que pueden contener payloads de Supabase con detalles del usuario. Sanitizar antes de persistir. | BAJA | Backlog |
| S7 | Verificar `exported=false` en receivers internos del manifest (NotificationDetectionActionReceiver). | BAJA | Backlog |
| OK | DeepSeek API key solo en edge function (`Deno.env`), JWT validado con `authenticatedUser()`; service role nunca en cliente. | — | Correcto |

## 2. Integridad de datos

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| D1 | Insert de movimientos sin idempotencia: `createMovement` (`services/queries/workspace-data.ts`) es INSERT simple. Race overlay-headless + React, o retry tras timeout ambiguo, puede duplicar. El guard anti-doble-tap es solo UI. | ALTA | P0 en curso |
| D2 | Si el INSERT tiene éxito pero el `.select()` final falla (red), el cliente lanza error y un reintento duplicaría. La idempotencia (D1) lo cubre. | ALTA | P0 (con D1) |
| D3 | Montos como `number` (IEEE 754) en cliente vs `numeric(14,2)` en BD. Micro-discrepancias acumulables. Evaluar decimal.js o strings hasta presentación. | MEDIA | Backlog |
| D4 | `usage_date` de cuotas IA calculada en zona America/Lima en cliente y edge function por separado; documentar contrato y unificar con SQL `AT TIME ZONE`. | BAJA | Backlog |
| OK | Saldo por vista `v_account_balances` (sin update desnormalizado): sin estado que desincronizar. Verificar índice `(account_id, status, occurred_at)` si crece el volumen. | — | Correcto |

## 3. Pipeline nativo (detección/overlay/headless)

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| N1 | Dedupe cross-app comparaba `amountLabel` por string exacto: "S/ 67.00" (BCP email) ≠ "S/ 67.0" (Yape) → doble sugerencia de la misma compra. | ALTA | ✅ Resuelto (commit `31c31137`) |
| N2 | `useNotificationDetectionRuntimeSync` empujaba contexto con accounts/categorías vacíos mientras el snapshot cargaba, pisando el contexto bueno → overlay "Sin cuenta asignada" + "IA no disponible"; settings vacíos transitorios apagaban la detección. | ALTA | ✅ Resuelto (commit `abf04672`) |
| N3 | Registro headless ante fallo de red: el movimiento se pierde (solo notificación de error). Sin cola de reintentos. | MEDIA | P1 en curso |
| N4 | Duplicado detectado en headless no marca la sugerencia → queda `pending` y reintenta indefinidamente. Falta estado `duplicate`. | MEDIA | P1 en curso |
| N5 | Token expirado en headless (app cerrada >1h): el insert falla contra RLS y no hay refresh. La cola de reintentos (N3) + reproceso al foreground mitigan. | MEDIA | Parcial con N3 |
| N6 | Parsing de montos frágil: `normalizeAmountString` borra todos los `.`/`,` del entero asumiendo miles; montos malformados o con espacios de miles se rechazan en silencio. | MEDIA | P1 en curso |
| N7 | Claim de registro (`tryClaimRegistration`) con timeout 60 s: si Supabase falla el claim bloquea retries hasta expirar. Revisar al implementar la cola. | MEDIA | Backlog |
| N8 | Overlay se cierra antes de la confirmación del servidor: si el save headless falla después, el usuario cree que se guardó. Notificación de error persistente con acción "Reintentar". | MEDIA | Backlog (P2) |
| N9 | Polling de IA del overlay agota presupuesto (~5 s) y muestra "IA no disponible" aunque siga corriendo. Mostrar "tomará más tiempo" o extender schedule. | MEDIA | Backlog |
| N10 | `humanAppLabel()` llama PackageManager en el main thread del listener (ANR potencial). Cachear labels. | MEDIA | Backlog |
| N11 | Leak potencial de WindowManager en `QuickMovementOverlay` si `addView` falla u open/close rápido desordenan los Handler callbacks. Flag `isDisplayed` explícito. | MEDIA | Backlog |
| N12 | Ventanas de dedupe (30 min registrado / 5 min pendiente) sin documentación de diseño; usar `createdAt` (no `updatedAt`) para no resetear con refresh de IA. | BAJA | Backlog |
| N13 | `parseRuntimeContext` retorna `{}` silencioso ante JSON corrupto; sin validación de schema (zod) en datos deserializados. | BAJA | Backlog |
| N14 | Sin tests unitarios de `extractAmount`/categorización (Kotlin) — cambios de regex rompen en silencio. | MEDIA | Parcial con P1-9 (tests TS) |
| N15 | `buildOverlay` ~600 líneas; constantes mágicas (600_000, polling schedule) sin agrupar. | BAJA | Backlog |

## 4. Vías React (formularios)

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| R1 | `submit()` de QuickDetectedMovementEntry libera el guard anti-doble-tap en 6 returns dispersos; una ruta de error nueva podría dejarlo trabado o abierto. try/finally. | ALTA | P1 en curso |
| R2 | Al cambiar movementType no se resetean `counterpartyId`/`destinationAmount`/`transferFxRate` → valores fantasma de un tipo anterior. | MEDIA | P1 en curso |
| R3 | Validaciones inline en QuickEntry en vez de `validateMovementForm` compartido (MovementForm sí lo usa) → criterios divergentes entre vías. | MEDIA | P1 en curso |
| R4 | Parsing de montos `Number(x.replace(",", "."))` sin locale, duplicado en varios archivos. | MEDIA | P1 en curso |
| R5 | `useCreateMovementMutation` no invalida `["notifications"]` ni la sugerencia cuando el registro viene de una detección → notificación queda "pendiente" visualmente. | MEDIA | P1 en curso |
| R6 | Utilidades duplicadas línea a línea entre MovementForm y QuickEntry (`patternMovementAmount`, `textSimilarity`, `learnedConfidence`). | MEDIA | Backlog (P2) |
| R7 | MovementForm: 1730 líneas, 60+ useState, pasos como ternarios anidados, props drilling de 25-30 props por step. Dividir en hooks/subcomponentes. | MEDIA | Backlog |
| R8 | Effect de descripción con debounce puede ejecutar callback stale (sin requestId). | MEDIA | Backlog |
| R9 | Sync de FX en transfer sin cancelación de requests anteriores (responses fuera de orden). | BAJA | Backlog |
| R10 | rgba hardcodeados en QuickEntry (líneas ~1184, ~1198) en vez de tokens SURFACE. | BAJA | Backlog (P2) |
| R11 | Accesibilidad: inputs sin `accessibilityLabel`, chips sin `accessibilityRole`. | MEDIA | Backlog |
| R12 | Sin feedback inline durante el check de duplicado; copy del Alert no explica por qué puede ser duplicado. | MEDIA | Backlog |

## 5. Backlog de funcionalidades (P3 — ideas de producto)

- **Undo / edición rápida post-registro**: toast "Movimiento guardado" con acción "Deshacer" (30 s) o "Editar".
- **Búsqueda en el picker de categorías** (con 50+ categorías el scroll no escala).
- **Notas en el registro rápido** (paridad con MovementForm).
- **Plantillas de movimientos frecuentes** ("Guardar como plantilla").
- **Split de montos** entre varias contrapartes.
- **Sugerencia de monto por historial** ("tu promedio en Mercado es S/ 85").
- ~~Onboarding de exclusión de batería~~ — YA EXISTÍA: `PermissionRow` "Sin restricción de batería" en `app/(app)/notification-detection.tsx` + paso en `notification-onboarding.tsx`.
- **IA en vivo en el overlay** al editar descripción (hoy solo recalcula la sugerencia local).
- **`frequentTransferPair` refrescado desde headless** (hoy depende de abrir la app).
- **Telemetría de fallos de registro** (`recordDetectionEvent` con causa: timeout, RLS, red).

## 6. Referencias

- Plan de implementación P0+P1 aprobado: ver historial de la sesión 2026-06-10.
- Gotcha del proyecto: `discardFingerprint` ignora el monto a propósito — nunca usarlo
  para dedupe de transacciones (ver memoria `notif-discard-fingerprint-gotcha`).
- Nuevo gotcha (N1): cada fuente formatea el mismo monto distinto; **nunca comparar
  `amountLabel` por igualdad de strings** — usar `canonicalAmountKey`/`amountLabelsMatch`
  de `NotificationDetectionStore.kt`.
