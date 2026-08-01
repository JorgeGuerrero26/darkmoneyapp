# Notificaciones útiles al tocarlas — Diseño

**Fecha:** 2026-07-13 · **Estado:** aprobado (enfoque A)

## Problema

Tocar una notificación debe ser útil: mostrar por qué te llevó ahí (mensaje/señalamiento) o, si reporta un problema, dónde está y cómo resolverlo. Hoy conviven 4 estados en los 52 tipos de `lib/notification-navigation.ts`:

1. **Útiles (8)** — Movimientos pre-filtrado con etiqueta del porqué vía `movementsQuickLink` (`quickScope`/`quickToken`/`quickLabel`). No se tocan.
2. **Detalle correcto sin porqué (~20)** — aterrizan en la obligación/suscripción/cuenta correcta pero nada explica qué mirar ni qué hacer.
3. **Lista genérica sin explicación (~10)** — p. ej. `budget_alert` → lista de presupuestos en vez del presupuesto puntual.
4. **Inútiles (5)** — familia diaria (`daily_digest`, `daily_workspace_summary`, `daily_ai_digest`, `daily_cashflow_check`, `daily_budget_review`) → dashboard pelado. **Bug reportado.**

Ambas vías de tap comparten el resolver (`app/notifications.tsx:472` bandeja; `app/_layout.tsx` push), así que todo cambio en el resolver cubre push + in-app.

## Mecanismos

### M1 — Sheet "Resumen del día" (dashboard)

El resolver devuelve `{ pathname: "/(app)/dashboard", params: { daySheet: "today", daySheetToken: <Date.now()> } }`. El dashboard ya tiene `DayMovementsSheet` montado con estado `daySheet`; un `useEffect` sobre los params (keyed por `daySheetToken` para retrigger) hace `setDaySheet({ dayStart, dayEnd, mode: "all" })` con el rango de hoy y limpia el param. Cero UI nueva.

### M2 — `notificationReason` (nota del porqué en el destino)

El resolver adjunta a la ruta destino: `reason` (texto accionable) + `reasonToken` (único por tap, mismo truco que `quickToken`).

- **Textos**: builder puro `features/notifications/lib/reason-labels.ts` — `buildNotificationReason(kind, payload): string | null`. Accionable, no genérico: *"Esta deuda venció — registra el pago o ajusta la fecha"*, *"Este presupuesto va en 92% con 6 días por delante"*. Testeado en jest.
- **Consumo**: hook compartido `hooks/useNotificationReason.ts` → lee `reason`/`reasonToken` de `useLocalSearchParams`, retorna `{ reason, dismiss }`; se re-activa al cambiar el token; `dismiss` lo oculta (estado local, no persiste).
- **Listas** (módulos ResourceModuleTemplate): renderizan `<ResourceContextNote>{reason}</ResourceContextNote>` en el slot `context` (ya existe en el orden del template). El componente actual no es descartable (solo texto) — se acepta así en F2; descartable = tocar `ResourceContextNote` una vez, no por módulo.
- **Detalles** (obligación, suscripción, cuenta, presupuesto): componente nuevo compartido `components/ui/NotificationReasonBanner.tsx` — banner compacto bajo el header, icono + texto + botón cerrar, tokens del theme (COLORS/GLASS/SPACING), sin lógica de negocio.

### M3 — Destinos específicos

Reusar patrones existentes: detalle puntual con `?from=notifications` y, donde el módulo ya expone filtros activables por param, aplicarlos (como hace Movimientos). Si un filtro no es activable por param, NO construir infraestructura nueva en esa fase: solo la nota M2.

## Mapeo por grupo

| Grupo | Tipos | Destino nuevo | Mecanismo |
|---|---|---|---|
| Diaria: resumen | `daily_digest`, `daily_workspace_summary`, `daily_ai_digest` | Dashboard + sheet del día abierto | M1 |
| Diaria: flujo | `daily_cashflow_check` | Movimientos mes actual, etiqueta "Chequeo de flujo del mes" | `movementsQuickLink` |
| Diaria: revisión | `daily_budget_review` | Lista presupuestos + nota | M2 |
| Presupuestos | `budget_alert`, `budget_period_ending` | `/budget/<relatedEntityId>?from=notifications` + banner (payload trae `usedPercent`/`limitAmount`) | M3 + M2 |
| Listas débiles | `multiple_subscriptions_due`, `subscription_cost_heavy`, `multiple_obligations_overdue`, `commitments_vs_balance`, `net_worth_negative`, `cash_runway_alert`, `recurring_income_reminder`, `expected_income_missed` | Su lista + nota; filtro aplicado solo si el módulo ya lo expone por param (verificar por módulo en el plan) | M2 (+M3) |
| Detalles sin porqué | `obligation_due/overdue/no_payment`, `high_interest_obligation`, `low_balance`, `negative_balance`, `account_dormant`, `subscription_reminder/overdue`, `subscription_price_increase`, `upcoming_annual_subscription`, `obligation_milestone` | Mismo destino + banner M2 con texto accionable | M2 |
| Ya útiles | 8 de `movementsQuickLink` + `monthly_recap` | Sin cambios | — |
| Colaboración | `obligation_share_invite`, `workspace_invite`, `obligation_event_*`, `obligation_payment_request`, `obligation_request_*` | Sin cambios (ya llevan params y flujos propios) | — |
| Otras | `detected_suggestions_pending` (bandeja con quick-entry: ya útil) | Sin cambios | — |

## Fases (cada una = commits + validación propios)

- **F1 — Familia diaria** (el bug): M1 + `daily_cashflow_check` a quick-link + `daily_budget_review` con M2 mínimo (hook + ResourceContextNote en presupuestos).
- **F2 — Mecanismo reason completo**: builder de textos, `NotificationReasonBanner`, wiring en los 4 detalles + grupo presupuestos.
- **F3 — Barrido de listas débiles**: los 8 tipos del grupo, módulo por módulo.

## Criterios de aceptación

1. Tocar "Resumen financiero del día" (push o bandeja) abre el dashboard con el sheet del día visible; cerrarlo deja el dashboard normal; tocar la notificación otra vez lo reabre (token).
2. Tocar una alerta de presupuesto abre ESE presupuesto con banner explicando el estado; el back respeta el origen.
3. Todo tipo del grupo "detalles sin porqué" muestra banner accionable descartable; al descartarlo no reaparece hasta un nuevo tap.
4. Las 8 de Movimientos y los flujos de colaboración se comportan idéntico a hoy.
5. `__tests__/notification-navigation.test.ts` cubre los mapeos nuevos; test nuevo para `reason-labels`.

## Fuera de alcance

- Cambios en el contenido/emisión de pushes (edge functions) — solo la experiencia del tap en la app.
- Persistencia del descarte del banner entre sesiones.
- Rediseño de la bandeja de notificaciones.
