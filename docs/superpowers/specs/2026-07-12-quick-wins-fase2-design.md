# Quick Wins Fase 2.-1 — Design

> Diseño validado con el usuario el 2026-07-12. Origen: sección "Quick Wins
> Pre-Epicas (P0.5)" de `docs/DARKMONEY_PHASE_2_INCOMING_FEATURES.md`.
> Estado verificado contra código: los QW de lista (pagar suscripción, llegó
> ingreso) y el historial de pagos en detalle de suscripción YA existen; este
> ciclo cubre los 4 pendientes reales.

## Alcance

Cuatro features independientes, un commit cada una, orden de entrega de menor a
mayor riesgo: **B → C → A → D**. Todo es JS puro (sale por OTA). Cada task entra
con tests de su lógica pura (regla de Fase 2). No se publica OTA sin confirmar
con el usuario.

Fuera de alcance: acción de pago para obligaciones en el dashboard (flujo más
complejo, queda solo-navegación); editor completo de grupos split (solo
conversión simple→split, decidido por el usuario); voz/IA (épicas posteriores).

---

## A. Acciones rápidas en dashboard "Próximos"

**Qué:** las filas de suscripción e ingreso fijo en `UpcomingSection` ganan un
botón circular compacto (✓) al lado derecho que abre el sheet de confirmación
correspondiente. El tap en el resto de la fila navega al detalle como hoy. Las
filas de obligación no cambian.

**Decisión de affordance (usuario):** botón de icono visible por fila — un tap,
descubrible, no altera la navegación existente.

**Arquitectura (regla del repo: app/* orquesta, componentes visuales reciben
datos listos):**

- `app/(app)/dashboard.tsx` monta:
  - `useMarkSubscriptionPaidMutation` + `MarkSubscriptionPaidSheet`
    (`features/subscriptions/components/` — autocontenido: props `visible`,
    `subscription`, `accounts`, `isPending`, `onClose`, `onConfirm`).
  - `useConfirmRecurringIncomeArrivalMutation` + `RecurringIncomeArrivalSheet`
    (`features/recurring-income/components/` — componente CONTROLADO: el estado
    de date/amount/accountId/baseChangeMode/newBaseAmount/error vive hoy inline
    en `app/recurring-income.tsx`).
- **Refactor dirigido:** extraer ese estado + validación del arrival sheet a un
  hook `useArrivalSheetController` en `features/recurring-income/lib/`,
  consumido por `app/recurring-income.tsx` (sin cambio de comportamiento) y por
  el dashboard. Evita duplicar ~10 estados y la validación de descuento
  permanente.
- `UpcomingSection` recibe dos callbacks nuevos opcionales
  (`onPaySubscription(id)`, `onConfirmIncome(id)`); el dashboard resuelve el
  summary completo desde el snapshot por id (las filas de UpcomingSection usan
  objetos recortados).

**UX/estilo:** botón con tokens de `constants/theme.ts` (COLORS, RADIUS), hit
area cómoda, sin marginHorizontal dentro de la fila. Toasts idénticos a los de
las listas (`Pago registrado · Próximo cobro: X` / el de llegada existente).
Estado pending: el sheet ya muestra `isPending`.

**Cache/perf:** `markSubscriptionPaid` ya parchea el snapshot
(`patchSnapshotSubscriptionNextDue` + saldo, plan de fluidez) — la fila de
Próximos se reordena/actualiza sin refetch completo. La mutación de ingreso usa
su invalidación existente.

**Tests:** la lógica de qué filas muestran botón (kind + callback presente) y el
resolver de summaries se extraen como funciones puras testeables si no son
triviales; la validación del arrival controller ya existe inline — al moverla a
`features/recurring-income/lib` gana tests unitarios propios.

---

## B. Alertas del dashboard → presupuesto puntual

**Qué:** en `UrgentAlertsCard` (dashboard simple), los items de alerta de
presupuesto navegan hoy a `/(app)/budgets` (lista genérica). Pasan a navegar a
`/budget/<id>?from=dashboard` (el detalle `app/budget/[id].tsx` ya existe y el
patrón `from=dashboard` ya se usa en `BudgetsSection`).

**Cómo:** el item de alerta lleva el `id` del presupuesto que la generó y la
`route` se construye con él. Verificar que el back del detalle respete el
origen (useOriginBackNavigation / patrón existente del repo).

**Tests:** si la construcción de items de alerta es función pura (o se puede
extraer trivialmente), test que fija la ruta puntual; si no, typecheck + smoke.

---

## C. Renombrar plantillas de movimiento

**Qué:** hoy el nombre de una plantilla nace de la descripción y no se puede
editar. Se agrega "Renombrar" al long-press de plantilla en `QuickAddSheet`
(`features/movements/components/QuickAddSheet.tsx`, ya tiene `onLongPress`).

**Cómo:**

- Nueva `useUpdateMovementTemplateMutation` en
  `services/queries/movement-templates.ts` (hoy solo hay create/delete): update
  de `name` por id + invalidación de `useMovementTemplatesQuery`.
- UI: el long-press pasa de acción única a menú (o se agrega opción junto a la
  existente) con "Renombrar" → diálogo con TextInput precargado con el nombre
  actual; guardar deshabilitado si queda vacío; trim.
- El orquestador es la pantalla que monta QuickAddSheet (movements) — el sheet
  emite callback, no muta.

**Tests:** normalización del rename (trim, vacío → inválido) como helper puro si
se extrae; la mutation sigue el patrón de las existentes.

---

## D. Split en edición y en registro rápido de detección

**Decisión de alcance (usuario):** solo conversión simple→split. Los
movimientos que YA pertenecen a un `split_group` se siguen editando
individualmente (sin editor de grupo).

**D1 — MovementForm (edición):**

- Habilitar el editor de split en edición SOLO si: es gasto, y el movimiento NO
  tiene `metadata.split_group`. (Hoy: `splitLines={isEditing ? null : splitLines}`.)
- Al guardar una edición con split activo (≥2 líneas válidas por
  `validateSplit`): el movimiento original se ACTUALIZA como línea 1 (conserva
  id, adjuntos y `client_dedupe_key`) y se CREAN N−1 movimientos hermanos con el
  mismo `split_group` nuevo, reutilizando `splitLineDescription` y el contrato
  `buildMovementCreateInput`. Misma semántica de montos/categorías que la
  creación.
- Si el split queda desactivado o con 1 línea, el guardado es el update normal
  de hoy (cero cambio).

**D2 — QuickDetectedMovementEntry (registro rápido):**

- Agregar el mismo editor de líneas de split (componente compartido del form)
  para gastos detectados; al confirmar con split, crear N movimientos como en la
  creación manual (vía existente ya usa el contrato compartido).

**Zonas de alto cuidado:** `MovementForm.tsx` y
`QuickDetectedMovementEntry.tsx` están listadas como zonas delicadas en el doc
de Fase 2 — cambios mínimos, sin reordenar el resto del form, smoke manual
obligatorio (crear, editar sin split, editar convirtiendo a split, registro
rápido con y sin split).

**Tests:** extender `__tests__/split-movement.test.ts` con la lógica pura de
conversión (elegibilidad: gasto sin split_group; construcción de la línea-1 como
update + hermanas como creates; validación de suma). La lógica de conversión
vive en `features/movements/lib/split-movement.ts` (o módulo hermano), NUNCA
inline en el componente.

**Riesgo D conocido:** duplicación por reintentos — las hermanas nuevas llevan
`client_dedupe_key` propio (misma regla que creación por línea, que ya existe
"incluso por línea de split" según el estado post-Fase 1).

---

## Criterios de aceptación

1. Desde el dashboard puedo pagar una suscripción próxima y confirmar la llegada
   de un ingreso en ≤2 taps, con el mismo sheet y toast que en las listas.
2. Una alerta de presupuesto abre EL presupuesto que la generó y el back vuelve
   al dashboard.
3. Puedo renombrar una plantilla y el nuevo nombre persiste y se muestra.
4. Puedo editar un gasto simple y convertirlo en split (la suma cuadra, quedan N
   movimientos con el mismo split_group, el original conserva sus adjuntos); un
   gasto detectado puede registrarse ya dividido.
5. `npm run typecheck`, `git diff --check` y `npx jest` verdes; tests nuevos de
   lógica pura por cada QW donde aplique.
6. Sin regresión en listas: pagar/llegó desde lista siguen funcionando igual
   (mismo controller extraído).
