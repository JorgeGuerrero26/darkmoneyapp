# Presupuestos: fix PIN, período visible y ciclo de vida de vencidos

**Fecha:** 2026-07-16 · **Estado:** aprobado por el usuario · **Alcance:** 3 tareas independientes, todas OTA (sin migraciones, sin tablas nuevas).

## Contexto

Tres problemas reportados en el módulo Presupuestos:

1. Las cards no muestran el rango de fechas del presupuesto; hay que entrar a cada uno.
2. Fijar (PIN) un presupuesto no persiste: la lista refresca y lo des-fija.
3. Los presupuestos vencidos se mezclan con los vigentes; renovar uno es 100% manual
   (detectar que venció → entrar → duplicar). El usuario quiere: lista por defecto solo
   con vigentes, histórico accesible por filtro, y una notificación accionable al vencer
   que abra el formulario prellenado para el siguiente período.

## Tarea A — Bug del PIN (causa raíz verificada)

La vista `v_budget_progress` **sí** expone `is_pinned` (migración
`202606050002_v_budget_progress_pinned.sql`), pero los dos selects del cliente en
`services/queries/workspace-data.ts` (snapshot ~L883 y refresh por dominios ~L1333) no
piden la columna. El mapper hace `isPinned: row.is_pinned ?? false`, así que el refetch
de fondo posterior al optimistic update siempre des-fija.

**Fix:** agregar `is_pinned` a ambos selects. Nada más.

**Verificación:** manual en dispositivo — pin → esperar refresh de fondo → sigue fijado.
Los otros módulos (contactos, categorías, suscripciones, ingresos) ya piden `is_pinned`;
no están afectados.

## Tarea B — Período visible en la card

`BudgetCard` (`components/domain/BudgetCard.tsx`) muestra el rango del período
(ej. "1 jul – 31 jul") como meta-texto. `periodStart`/`periodEnd` ya vienen mapeados en
`BudgetOverview`; formatear con los helpers de `lib/date` y tokens del theme. Sin cambios
de datos.

## Tarea C — Ciclo de vida de vencidos

### Vigencia en la lista (sin tabla de históricos)

Un presupuesto vencido es su propio histórico: su período cerró y sus métricas se
recalculan de los movimientos de ese rango. Decisión: **no** persistir snapshots.
Trade-off aceptado: editar movimientos retroactivamente recalcula las cifras del vencido
(refleja siempre la verdad).

- Helper puro `isBudgetExpired(budget, todayISO)` → `periodEnd < hoy` (fecha local).
- **Default de la lista:** solo vigentes (`periodEnd >= hoy`, incluye futuros).
- **Filtro nuevo "Vencidos"** en `BUDGET_FILTERS` (`features/budgets/lib/budgetFilters.ts`):
  al activarlo se muestran SOLO los vencidos con sus números finales. Sin el filtro,
  los vencidos no aparecen.
- Summary bar, export CSV y selección múltiple ya operan sobre `filteredBudgets` —
  respetan el default y el filtro sin cambios.

### Notificación accionable al vencer

- **Builder puro** `buildBudgetPeriodEndedAlerts(budgets, todayISO)` en
  `features/notifications/lib/alertBuilders.ts`, mismo patrón y dedupe
  (entidad + kind) que `buildBudgetLimitAlerts`. Kind nuevo: `budget_period_ended`.
  Texto: `"«{nombre}» terminó: gastaste {gastado} de {límite} ({pct}%). Toca para
  crear el siguiente período."` Se genera una sola vez por presupuesto vencido.
- **Push local** al día siguiente del `periodEnd` (09:00 local), patrón de
  `scheduleSubscriptionReminders` en `hooks/usePushNotifications.ts`.
- **Canal:** in-app (centro de notificaciones) + push local. Decisión del usuario.

### Tap → formulario prellenado (no crea nada hasta confirmar)

- `lib/notification-navigation.ts` (`resolveNotificationNavigationTarget`): kind
  `budget_period_ended` → `/budgets?duplicateFrom=<budgetId>`.
- La pantalla de presupuestos lee `duplicateFrom`, busca el presupuesto (aunque esté
  vencido/filtrado) y abre el formulario de crear **prellenado** con `nextPeriodFor()`
  (fechas corridas al siguiente período, mismo nombre/scope/límite/alerta). El usuario
  ajusta lo que quiera y guarda. Decisión del usuario: prellenar, no auto-duplicar.
- Reusar la lógica existente de `duplicateBudgetToNextPeriod.ts` para el cálculo del
  período; el form ya soporta valores iniciales (modo edición).

## Testing

- Jest: `isBudgetExpired` + partición vigentes/vencidos del filtro; `buildBudgetPeriodEndedAlerts`
  (genera al vencer, no genera para vigentes, dedupe, texto con cifras).
- Manual en dispositivo: pin persiste tras refresh; card muestra período; vencido
  desaparece del default y aparece con filtro "Vencidos"; notificación llega y el tap
  abre el form prellenado.

## Orden de entrega

A (bug, OTA inmediato) → B (card, mismo OTA) → C (plan propio: filtros → builder+push → navegación+prefill).
