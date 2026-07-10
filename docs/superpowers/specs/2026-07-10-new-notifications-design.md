# Spec: 8 notificaciones nuevas (predictivas, higiene de datos, motivación)

**Fecha:** 2026-07-10
**Estado:** aprobado por el usuario (diseño + 3 ajustes)
**Enfoque:** híbrido — 6 kinds client-side en el generador existente, 2 predictivas server-side en el cron del digest diario.

## Contexto

DarkMoney ya genera ~25 kinds de alertas client-side en `hooks/useNotificationGenerator.ts`
(inserta en la tabla `notifications`, idempotente por índice único
`user_id + related_entity_type + related_entity_id + kind`). Las informativas se resumen
en el digest diario (cron `send-daily-notification-digest`); las importantes disparan push
inmediato vía webhook de INSERT → `send-push-notifications` (con límite diario
`DAILY_IMPORTANT_PUSH_LIMIT`). El tap de push lo maneja `onGenericNotificationTap` →
`resolveNotificationNavigationTarget`.

Este spec agrega 8 kinds nuevos. Sin cambios nativos: todo sale por OTA + deploy de edge
function + 1 migración pequeña.

## Kinds nuevos

### Client-side (bloques nuevos en `useNotificationGenerator.ts`)

| Kind | Prioridad | Regla | Tap → | Ventana de vigencia |
|---|---|---|---|---|
| `subscription_price_increase` | informational | Últimos 2 pagos de la misma suscripción en `subscriptionPostedMovements`: el más reciente supera al anterior en ≥5% | `/subscription/{id}` | Mientras el último pago siga siendo el más caro |
| `possible_duplicate_charge` | **important (push)** | 2 gastos posted con mismo día + mismo monto + misma categoría y descripción normalizada, ids distintos, en los últimos 7 días | Movimientos con quick-filter (día + label del monto) | Mientras ambos movimientos existan y estén dentro de los 7 días |
| `detected_suggestions_pending` | informational | ≥3 sugerencias detectadas con status pending sin revisar hace >24h | `/notifications` | Mientras el conteo pendiente siga ≥3 |
| `expected_income_missed` | informational | `recurringIncome.nextExpectedDate` pasó hace ≥2 días y no hay ingreso posted que la cubra desde esa fecha | `/recurring-income` | Mientras no se registre el ingreso ni avance `nextExpectedDate` |
| `monthly_recap` | informational | Primera corrida del generador en mes nuevo: comparativa mes cerrado vs anterior (gastos, ingresos, top categoría de gasto). `related_entity_id` sintético = YYYYMM del mes cerrado | Movimientos quick-filter con rango del mes cerrado | Días 1–7 del mes nuevo |
| `obligation_milestone` | informational | Fracción pagada de obligación activa cruza 25 / 50 / 75 / 100%. `related_entity_id` = obligation.id; payload.milestone; upsert reemplaza el hito anterior | `/obligation/{id}` | Mientras la fracción pagada siga sobre el último umbral cruzado |

**Regla de vigencia (ajuste 1 del diseño):** `cleanupStaleNotifications` borra kinds
ausentes de la corrida actual. Los kinds "one-shot" de la tabla deben **re-emitirse en cada
corrida mientras dure su ventana** (mismo entity id → el índice único evita duplicados) para
que el cleanup no los borre prematuramente ni se regeneren en loop. Al expirar la ventana,
dejan de emitirse y el cleanup los retira solo.

Todos los kinds nuevos se agregan a `ALL_KINDS`.

### Server-side (en `send-daily-notification-digest`, antes de armar el digest)

| Kind | Prioridad | Regla | Tap → | Idempotencia |
|---|---|---|---|---|
| `cash_runway_alert` | **important (push, `bypass_daily_limit`)** | Saldo disponible (cuentas bank/cash/savings, convertido a moneda base con tasas persistidas) ÷ gasto neto promedio diario del mes en curso. Si el saldo proyectado llega a 0 antes de fin de mes → alerta con la fecha estimada | `/(app)/accounts` | `related_entity_id` = fecha (YYYYMMDD); 1 por día |
| `commitments_vs_balance` | **important (push, respeta límite)** | Suma de obligaciones + suscripciones que vencen antes de fin de mes vs saldo disponible. Si compromisos > saldo → alerta con el monto del gap | `/(app)/obligations` | `related_entity_id` = fecha (YYYYMMDD); 1 por día |

- El INSERT con prioridad important dispara el push por el webhook existente; no se llama a
  Expo directamente desde el digest para estos kinds.
- **Ajuste 2:** solo `cash_runway_alert` marca `bypass_daily_limit` (es la alerta más
  crítica); `commitments_vs_balance` y `possible_duplicate_charge` respetan el límite diario.
- Conversión de monedas con tasas persistidas/sincronizadas. Prohibido hardcodear PEN/USD.
- Cálculo envuelto en try/catch por usuario: un fallo no rompe el digest.

## Toggle "Alertas predictivas" (ajuste 3)

- Migración: columna `predictive_alerts_enabled boolean not null default true` en
  `notification_preferences` (misma mecánica que el toggle del digest).
- El cron la respeta antes de calcular/insertar `cash_runway_alert` y
  `commitments_vs_balance`.
- Switch en `app/settings.tsx` junto al toggle del digest.
- Documentar la columna en el diccionario de datos del proyecto (si el archivo no existe,
  crearlo o documentar en la migración misma).

## Cableado transversal (los 8 kinds)

1. `lib/notification-priority.ts` **y** `supabase/functions/_shared/notification-priority.ts`
   (mantener ambos en sync): 3 ⚡ como important, resto informational.
2. `lib/notification-navigation.ts`: rutas de las tablas de arriba.
3. `features/notifications/lib/notificationPresentation.ts` (+ `notificationSections.ts` si
   aplica): ícono/label por kind.
4. Sin tocar el pipeline de tap: `onGenericNotificationTap` → resolver ya cubre kinds nuevos.

## Manejo de errores

- Client-side: cada bloque generador falla en silencio sin romper los demás (patrón actual).
- Server-side: try/catch por usuario y por kind; log con `console.warn`, el digest continúa.
- Divisas sin tasa disponible: excluir la cuenta/compromiso del cálculo (no asumir 1:1).

## Validación

- `npm run typecheck` y `git diff --check`.
- Prueba manual por kind: sembrar datos que crucen cada umbral y verificar bandeja, digest,
  push (los ⚡) y navegación del tap con app cerrada (cold start) y abierta.
- Deploy de la edge function requiere aprobación explícita del usuario (toca Supabase real).

## Fuera de alcance

- Toggles por kind individual (solo el toggle agrupado de predictivas).
- Metas de ahorro, streaks de registro, alertas de tipo de cambio.
- Cambios nativos Android/iOS.

## Orden de implementación sugerido

1. Cableado transversal (prioridades, navegación, presentación) — base para todo.
2. 6 kinds client-side (un commit por kind o por grupo lógico).
3. Migración + toggle de predictivas.
4. 2 kinds server-side en el cron del digest.
5. Validación end-to-end y OTA + deploy.
