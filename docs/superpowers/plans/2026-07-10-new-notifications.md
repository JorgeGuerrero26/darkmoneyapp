# 8 Notificaciones Nuevas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 8 kinds de notificación (6 client-side + 2 predictivas server-side) según `docs/superpowers/specs/2026-07-10-new-notifications-design.md`.

**Architecture:** Las reglas de detección client-side viven como funciones puras en `features/notifications/lib/alertBuilders.ts` (testeables con jest), y `hooks/useNotificationGenerator.ts` las invoca y sube las filas con su mecanismo existente (upsert `ignoreDuplicates` + cleanup por kinds). Las 2 predictivas se calculan en el cron `send-daily-notification-digest` e insertan filas `important` → el webhook de INSERT dispara el push existente.

**Tech Stack:** React Native/Expo + TypeScript, jest (tests puros en `__tests__/`), Supabase (Postgres + Edge Functions Deno).

**Convenciones transversales (usar en TODOS los tasks):**
- Tipo de fila: reutilizar el shape de `NotificationRow` del hook (`user_id, channel:"in_app", status:"pending", kind, title, body, scheduled_for, related_entity_type, related_entity_id, payload`). El builder puro devuelve `Omit<NotificationRow, "user_id" | "channel" | "status" | "scheduled_for">` y el hook completa el resto (ver Task 10).
- Esquema de `related_entity_id` por kind (estable, no colisiona porque el índice único incluye `kind`):
  - `subscription_price_increase` → `subscriptionId`
  - `possible_duplicate_charge` → menor `movement.id` del par
  - `detected_suggestions_pending` → `workspaceId`
  - `expected_income_missed` → `recurringIncomeId`
  - `monthly_recap` → `Number(YYYYMM)` del mes cerrado
  - `obligation_milestone` → `obligationId * 1000 + milestone` (así 25→50 crea fila nueva y el cleanup retira la del hito anterior)
- Vigencia: cada builder devuelve la fila MIENTRAS su condición siga activa; el generador corre en cada apertura y `cleanupStaleNotifications` borra las que ya no se emiten. `ignoreDuplicates: true` garantiza que las existentes no pierden su status leído.
- Validación estándar de cada task: `npm run typecheck` y `npx jest __tests__/alert-builders.test.ts` (donde aplique).

**Desviación aprobada del spec:** `possible_duplicate_charge` compara `mismo día + mismo monto + misma categoría` (el snapshot `CategoryPostedMovement` no trae descripción; agregarla requeriría query extra — YAGNI).

---

### Task 1: Prioridades de los kinds nuevos

**Files:**
- Modify: `lib/notification-priority.ts:16-36` (set `IMPORTANT_KINDS`)
- Modify: `supabase/functions/_shared/notification-priority.ts` (mismo set — mantener en sync)
- Test: `__tests__/notification-priority.test.ts` (crear)

Los 5 kinds informativos NO necesitan cambios (informational es el default del `getNotificationPriority`). Solo los 3 ⚡.

- [x] **Step 1: Test que falla**

```ts
// __tests__/notification-priority.test.ts
import { getNotificationPriority } from "../lib/notification-priority";

describe("prioridad de kinds nuevos", () => {
  it("marca los 3 kinds push como important", () => {
    expect(getNotificationPriority("possible_duplicate_charge")).toBe("important");
    expect(getNotificationPriority("cash_runway_alert")).toBe("important");
    expect(getNotificationPriority("commitments_vs_balance")).toBe("important");
  });
  it("deja los kinds informativos como informational", () => {
    for (const kind of [
      "subscription_price_increase",
      "detected_suggestions_pending",
      "expected_income_missed",
      "monthly_recap",
      "obligation_milestone",
    ]) {
      expect(getNotificationPriority(kind)).toBe("informational");
    }
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/notification-priority.test.ts` → FAIL (los 3 salen "informational").

- [x] **Step 3: Implementar** — en `lib/notification-priority.ts`, dentro de `IMPORTANT_KINDS`, después de `"detected_movement_suggestion",` agregar:

```ts
  "possible_duplicate_charge",
  "cash_runway_alert",
  "commitments_vs_balance",
```

Aplicar la MISMA edición en `supabase/functions/_shared/notification-priority.ts` (buscar el set equivalente; si el archivo difiere en estructura, agregar los 3 strings a su lista de important).

- [x] **Step 4: Ver pasar** — `npx jest __tests__/notification-priority.test.ts` → PASS. `npm run typecheck` → sin errores nuevos.

- [x] **Step 5: Commit** — `git add lib/notification-priority.ts supabase/functions/_shared/notification-priority.ts __tests__/notification-priority.test.ts && git commit -m "feat(notifications): prioridades de los 8 kinds nuevos"`

---

### Task 2: Navegación del tap

**Files:**
- Modify: `lib/notification-navigation.ts` (switch de `resolveNotificationNavigationTarget`)
- Test: `__tests__/notification-navigation.test.ts` (crear)

- [x] **Step 1: Test que falla**

```ts
// __tests__/notification-navigation.test.ts
import { resolveNotificationNavigationTarget } from "../lib/notification-navigation";

describe("navegacion de kinds nuevos", () => {
  it("price increase va al detalle de la suscripcion", () => {
    expect(
      resolveNotificationNavigationTarget({ kind: "subscription_price_increase", relatedEntityType: "subscription", relatedEntityId: 7 }),
    ).toBe("/subscription/7");
  });
  it("duplicate charge abre movimientos con quick-filter", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "possible_duplicate_charge",
      payload: { day: "2026-07-10", amountLabel: "S/ 11.60" },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickDateFrom).toBe("2026-07-10");
    expect(t.params.quickDateTo).toBe("2026-07-10");
  });
  it("suggestions pending va a la bandeja", () => {
    expect(resolveNotificationNavigationTarget({ kind: "detected_suggestions_pending" })).toBe("/notifications");
  });
  it("income missed va a ingresos fijos", () => {
    expect(resolveNotificationNavigationTarget({ kind: "expected_income_missed" })).toBe("/recurring-income");
  });
  it("recap abre movimientos del mes cerrado", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "monthly_recap",
      payload: { monthFrom: "2026-06-01", monthTo: "2026-06-30", monthLabel: "junio" },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickDateFrom).toBe("2026-06-01");
  });
  it("milestone va al detalle de la obligacion (id decodificado del entity id)", () => {
    expect(
      resolveNotificationNavigationTarget({ kind: "obligation_milestone", payload: { obligationId: 42 } }),
    ).toBe("/obligation/42");
  });
  it("predictivas van a cuentas y obligaciones", () => {
    expect(resolveNotificationNavigationTarget({ kind: "cash_runway_alert" })).toBe("/(app)/accounts");
    expect(resolveNotificationNavigationTarget({ kind: "commitments_vs_balance" })).toBe("/(app)/obligations");
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/notification-navigation.test.ts` → FAIL (caen al default `/notifications`).

- [x] **Step 3: Implementar** — en el `switch` de `lib/notification-navigation.ts`, antes del `default:`, agregar:

```ts
    case "subscription_price_increase":
      return id ? `/subscription/${id}` : "/subscriptions";
    case "possible_duplicate_charge": {
      const day = payloadString(payload, "day");
      const amountLabel = payloadString(payload, "amountLabel");
      return movementsQuickLink({
        label: amountLabel ? `Posible cobro duplicado: ${amountLabel}` : "Posible cobro duplicado",
        type: "expense",
        dateFrom: day ?? undefined,
        dateTo: day ?? undefined,
      });
    }
    case "detected_suggestions_pending":
      return "/notifications";
    case "expected_income_missed":
      return "/recurring-income";
    case "monthly_recap": {
      const from = payloadString(payload, "monthFrom");
      const to = payloadString(payload, "monthTo");
      const monthLabel = payloadString(payload, "monthLabel");
      return from && to
        ? movementsQuickLink({ label: `Resumen de ${monthLabel ?? "el mes"}`, dateFrom: from, dateTo: to })
        : "/(app)/movements";
    }
    case "obligation_milestone":
      return obligationIdFromPayload ? `/obligation/${obligationIdFromPayload}` : "/(app)/obligations";
    case "cash_runway_alert":
      return "/(app)/accounts";
    case "commitments_vs_balance":
      return "/(app)/obligations";
```

Nota: `movementsQuickLink` acepta `dateFrom/dateTo` solo si vienen ambos (ya es así en su firma actual).

- [x] **Step 4: Ver pasar** — `npx jest __tests__/notification-navigation.test.ts` → PASS. `npm run typecheck`.

- [x] **Step 5: Commit** — `git add lib/notification-navigation.ts __tests__/notification-navigation.test.ts && git commit -m "feat(notifications): navegacion del tap para los 8 kinds nuevos"`

---

### Task 3: Presentación (íconos en bandeja)

**Files:**
- Modify: `features/notifications/lib/notificationPresentation.ts` (switch de icono/color, ~línea 28)

- [x] **Step 1: Implementar** — agregar al switch (usar íconos ya importados de lucide o sumar imports al bloque existente):

```ts
    case "subscription_price_increase":
      return { icon: TrendingUp, color: COLORS.warning };
    case "possible_duplicate_charge":
      return { icon: Copy, color: COLORS.danger };
    case "detected_suggestions_pending":
      return { icon: Bell, color: COLORS.primary };
    case "expected_income_missed":
      return { icon: Clock, color: COLORS.warning };
    case "monthly_recap":
      return { icon: BarChart2, color: COLORS.primary };
    case "obligation_milestone":
      return { icon: TrendingUp, color: COLORS.success };
    case "cash_runway_alert":
      return { icon: AlertTriangle, color: COLORS.danger };
    case "commitments_vs_balance":
      return { icon: Scale, color: COLORS.danger };
```

Agregar a los imports de `lucide-react-native` los que falten: `Copy`, `AlertTriangle` (verificar cuáles ya están; `TrendingUp`, `Clock`, `Bell`, `BarChart2`, `Scale` ya existen según el switch actual). Si `COLORS.success` no existe en el theme, usar `COLORS.primary`.

- [x] **Step 2: Validar** — `npm run typecheck` → sin errores nuevos.

- [x] **Step 3: Commit** — `git add features/notifications/lib/notificationPresentation.ts && git commit -m "feat(notifications): iconos de los 8 kinds nuevos"`

---

### Task 4: Scaffolding de alertBuilders + subscription_price_increase

**Files:**
- Create: `features/notifications/lib/alertBuilders.ts`
- Test: `__tests__/alert-builders.test.ts` (crear)

- [x] **Step 1: Test que falla**

```ts
// __tests__/alert-builders.test.ts
import { buildSubscriptionPriceIncreaseAlerts } from "../features/notifications/lib/alertBuilders";

const sub = (over = {}) => ({ id: 5, name: "Netflix", currencyCode: "PEN", status: "active", ...over }) as any;
const pago = (id: number, occurredAt: string, sourceAmount: number) =>
  ({ id, subscriptionId: 5, occurredAt, sourceAmount, destinationAmount: null }) as any;

describe("buildSubscriptionPriceIncreaseAlerts", () => {
  it("alerta cuando el ultimo pago sube >=5% vs el anterior", () => {
    const rows = buildSubscriptionPriceIncreaseAlerts([sub()], [
      pago(1, "2026-06-05T10:00:00Z", 34.9),
      pago(2, "2026-07-05T10:00:00Z", 44.9),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_price_increase");
    expect(rows[0].related_entity_id).toBe(5);
    expect(rows[0].body).toContain("34.90");
    expect(rows[0].body).toContain("44.90");
  });
  it("no alerta con subida menor a 5%", () => {
    expect(
      buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 100), pago(2, "2026-07-05", 104)]),
    ).toHaveLength(0);
  });
  it("no alerta si el ultimo pago bajo, con un solo pago, o suscripcion inactiva", () => {
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 50), pago(2, "2026-07-05", 40)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-07-05", 50)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub({ status: "paused" })], [pago(1, "2026-06-05", 30), pago(2, "2026-07-05", 60)])).toHaveLength(0);
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL (módulo no existe).

- [x] **Step 3: Implementar**

```ts
// features/notifications/lib/alertBuilders.ts
/**
 * Builders puros de las alertas nuevas (spec 2026-07-10). Cada builder devuelve
 * filas parciales; useNotificationGenerator completa user_id/channel/status/
 * scheduled_for y aplica idempotencia + cleanup por vigencia.
 */
import type {
  CategoryPostedMovement,
  ObligationSummary,
  RecurringIncomeSummary,
  SubscriptionPostedMovement,
  SubscriptionSummary,
} from "../../../types/domain";

export type AlertRow = {
  kind: string;
  title: string;
  body: string;
  related_entity_type: string;
  related_entity_id: number;
  payload: Record<string, unknown>;
};

const fmt = (n: number) => n.toFixed(2);

export function buildSubscriptionPriceIncreaseAlerts(
  subscriptions: SubscriptionSummary[],
  posted: SubscriptionPostedMovement[],
): AlertRow[] {
  const rows: AlertRow[] = [];
  const activos = new Map(subscriptions.filter((s) => s.status === "active").map((s) => [s.id, s]));

  const porSub = new Map<number, SubscriptionPostedMovement[]>();
  for (const m of posted) {
    if (!activos.has(m.subscriptionId)) continue;
    const arr = porSub.get(m.subscriptionId) ?? [];
    arr.push(m);
    porSub.set(m.subscriptionId, arr);
  }

  for (const [subId, pagos] of porSub) {
    if (pagos.length < 2) continue;
    pagos.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const ultimo = pagos[pagos.length - 1].sourceAmount ?? 0;
    const anterior = pagos[pagos.length - 2].sourceAmount ?? 0;
    if (anterior <= 0 || ultimo < anterior * 1.05) continue;
    const sub = activos.get(subId)!;
    rows.push({
      kind: "subscription_price_increase",
      title: "Suscripción subió de precio",
      body: `"${sub.name}" pasó de ${fmt(anterior)} a ${fmt(ultimo)} ${sub.currencyCode} en su último cobro.`,
      related_entity_type: "subscription",
      related_entity_id: subId,
      payload: { subscriptionId: subId, previousAmount: anterior, currentAmount: ultimo, currencyCode: sub.currencyCode },
    });
  }
  return rows;
}
```

- [x] **Step 4: Ver pasar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck`.

- [x] **Step 5: Commit** — `git add features/notifications/lib/alertBuilders.ts __tests__/alert-builders.test.ts && git commit -m "feat(notifications): builder de subida de precio de suscripcion"`

---

### Task 5: possible_duplicate_charge

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts`
- Test: `__tests__/alert-builders.test.ts`

- [x] **Step 1: Test que falla** (agregar al mismo archivo de test)

```ts
import { buildDuplicateChargeAlerts } from "../features/notifications/lib/alertBuilders";

const mv = (id: number, occurredAt: string, categoryId: number, sourceAmount: number | null) =>
  ({ id, categoryId, occurredAt, sourceAmount, destinationAmount: null }) as any;
const catKinds = new Map([[10, "expense"], [20, "income"]]);

describe("buildDuplicateChargeAlerts", () => {
  const now = new Date("2026-07-10T20:00:00Z");
  it("alerta con dos gastos de mismo dia, monto y categoria en la ultima semana", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 11.6), mv(2, "2026-07-09T15:00:00Z", 10, 11.6)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(1); // menor id del par
    expect(rows[0].payload.day).toBe("2026-07-09");
  });
  it("ignora pares fuera de la ventana de 7 dias, montos distintos, categorias distintas e ingresos", () => {
    expect(buildDuplicateChargeAlerts([mv(1, "2026-06-20T10:00:00Z", 10, 5), mv(2, "2026-06-20T11:00:00Z", 10, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 10, 6)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 99, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 20, 5), mv(2, "2026-07-09T11:00:00Z", 20, 5)], catKinds, now)).toHaveLength(0);
  });
  it("un trio del mismo dia genera UNA alerta (no tres pares)", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 9), mv(2, "2026-07-09T11:00:00Z", 10, 9), mv(3, "2026-07-09T12:00:00Z", 10, 9)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
  });
});
```

- [x] **Step 2: Ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar** (agregar a `alertBuilders.ts`)

```ts
const dayKey = (iso: string) => iso.slice(0, 10);

export function buildDuplicateChargeAlerts(
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  now: Date,
): AlertRow[] {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const grupos = new Map<string, CategoryPostedMovement[]>();
  for (const m of movements) {
    if (categoryKinds.get(m.categoryId) !== "expense") continue;
    if (m.sourceAmount === null || m.sourceAmount <= 0) continue;
    if (new Date(m.occurredAt) < weekAgo) continue;
    const key = `${dayKey(m.occurredAt)}|${m.categoryId}|${m.sourceAmount}`;
    const arr = grupos.get(key) ?? [];
    arr.push(m);
    grupos.set(key, arr);
  }

  const rows: AlertRow[] = [];
  for (const [key, grupo] of grupos) {
    if (grupo.length < 2) continue;
    const [day, , amount] = key.split("|");
    const minId = Math.min(...grupo.map((m) => m.id));
    rows.push({
      kind: "possible_duplicate_charge",
      title: "Posible cobro duplicado",
      body: `Registraste ${grupo.length} gastos idénticos de ${fmt(Number(amount))} el ${day}. Revisa si es un doble cobro.`,
      related_entity_type: "movement",
      related_entity_id: minId,
      payload: { day, amountLabel: fmt(Number(amount)), movementIds: grupo.map((m) => m.id) },
    });
  }
  return rows;
}
```

- [x] **Step 4: Ver pasar** — jest + `npm run typecheck`.
- [x] **Step 5: Commit** — `git add -u __tests__ features && git commit -m "feat(notifications): builder de posible cobro duplicado"`

---

### Task 6: expected_income_missed

**Files:** mismos del Task 5.

- [x] **Step 1: Test que falla**

```ts
import { buildExpectedIncomeMissedAlerts } from "../features/notifications/lib/alertBuilders";

const ingreso = (over = {}) =>
  ({ id: 3, name: "Sueldo", status: "active", nextExpectedDate: "2026-07-05", currencyCode: "PEN", amount: 3000, ...over }) as any;

describe("buildExpectedIncomeMissedAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando la fecha esperada paso hace >=2 dias sin ingreso posterior", () => {
    const rows = buildExpectedIncomeMissedAlerts([ingreso()], [], catKinds, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("expected_income_missed");
    expect(rows[0].related_entity_id).toBe(3);
  });
  it("no alerta si hay un ingreso registrado despues de la fecha esperada", () => {
    const rows = buildExpectedIncomeMissedAlerts(
      [ingreso()],
      [mv(9, "2026-07-06T09:00:00Z", 20, null)],
      catKinds, now,
    );
    expect(rows).toHaveLength(0);
  });
  it("no alerta si aun no pasan 2 dias, o el ingreso esta pausado", () => {
    expect(buildExpectedIncomeMissedAlerts([ingreso({ nextExpectedDate: "2026-07-09" })], [], catKinds, now)).toHaveLength(0);
    expect(buildExpectedIncomeMissedAlerts([ingreso({ status: "paused" })], [], catKinds, now)).toHaveLength(0);
  });
});
```

Nota: `mv` y `catKinds` son los helpers del Task 5 (mismo archivo). Para el caso "hay ingreso": `destinationAmount` null está bien — cuenta cualquier movimiento de categoría kind `income` con `occurredAt` posterior.

- [x] **Step 2: Ver fallar.**

- [x] **Step 3: Implementar**

```ts
export function buildExpectedIncomeMissedAlerts(
  incomes: RecurringIncomeSummary[],
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  now: Date,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const income of incomes) {
    if (income.status !== "active" || !income.nextExpectedDate) continue;
    const [y, mo, d] = income.nextExpectedDate.split("-").map(Number);
    const expected = new Date(y, mo - 1, d);
    const daysLate = Math.floor((now.getTime() - expected.getTime()) / 86_400_000);
    if (daysLate < 2) continue;
    const hayIngresoPosterior = movements.some(
      (m) => categoryKinds.get(m.categoryId) === "income" && new Date(m.occurredAt) >= expected,
    );
    if (hayIngresoPosterior) continue;
    rows.push({
      kind: "expected_income_missed",
      title: "¿Ya te pagaron?",
      body: `"${income.name}" se esperaba el ${income.nextExpectedDate} y no hay ingresos registrados desde entonces.`,
      related_entity_type: "recurring_income",
      related_entity_id: income.id,
      payload: { recurringIncomeId: income.id, expectedDate: income.nextExpectedDate, daysLate },
    });
  }
  return rows;
}
```

- [x] **Step 4: Ver pasar** + typecheck. **Step 5: Commit** — `git add -u __tests__ features && git commit -m "feat(notifications): builder de ingreso esperado no registrado"`

---

### Task 7: monthly_recap

**Files:** mismos del Task 5.

- [x] **Step 1: Test que falla**

```ts
import { buildMonthlyRecapAlert } from "../features/notifications/lib/alertBuilders";

describe("buildMonthlyRecapAlert", () => {
  it("emite el recap los primeros 7 dias del mes con comparativa", () => {
    const row = buildMonthlyRecapAlert(
      { lastMonthExpenses: 1200, lastMonthIncome: 3000, prevMonthExpenses: 1500, topCategoryName: "Comida" },
      new Date("2026-07-03T12:00:00Z"),
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("monthly_recap");
    expect(row!.related_entity_id).toBe(202606);
    expect(row!.payload.monthFrom).toBe("2026-06-01");
    expect(row!.payload.monthTo).toBe("2026-06-30");
    expect(row!.body).toContain("20%"); // 1200 vs 1500 = -20%
  });
  it("no emite despues del dia 7 ni sin datos del mes cerrado", () => {
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 1, lastMonthIncome: 1, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-08T12:00:00Z"))).toBeNull();
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 0, lastMonthIncome: 0, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-03T12:00:00Z"))).toBeNull();
  });
});
```

- [x] **Step 2: Ver fallar.**

- [x] **Step 3: Implementar**

```ts
const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const pad2 = (n: number) => String(n).padStart(2, "0");

export function buildMonthlyRecapAlert(
  input: { lastMonthExpenses: number; lastMonthIncome: number; prevMonthExpenses: number; topCategoryName: string | null },
  now: Date,
): AlertRow | null {
  if (now.getDate() > 7) return null;
  if (input.lastMonthExpenses <= 0 && input.lastMonthIncome <= 0) return null;

  const cierre = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = MESES_ES[cierre.getMonth()];
  const monthFrom = `${cierre.getFullYear()}-${pad2(cierre.getMonth() + 1)}-01`;
  const lastDay = new Date(cierre.getFullYear(), cierre.getMonth() + 1, 0).getDate();
  const monthTo = `${cierre.getFullYear()}-${pad2(cierre.getMonth() + 1)}-${pad2(lastDay)}`;

  let comparativa = "";
  if (input.prevMonthExpenses > 0) {
    const delta = Math.round(((input.lastMonthExpenses - input.prevMonthExpenses) / input.prevMonthExpenses) * 100);
    comparativa = delta <= 0 ? ` Gastaste ${Math.abs(delta)}% menos que el mes anterior.` : ` Gastaste ${delta}% más que el mes anterior.`;
  }
  const top = input.topCategoryName ? ` Tu mayor gasto fue en ${input.topCategoryName}.` : "";

  return {
    kind: "monthly_recap",
    title: `Resumen de ${monthLabel}`,
    body: `Cerraste ${monthLabel} con ${fmt(input.lastMonthExpenses)} en gastos y ${fmt(input.lastMonthIncome)} en ingresos.${comparativa}${top}`,
    related_entity_type: "monthly_recap",
    related_entity_id: cierre.getFullYear() * 100 + (cierre.getMonth() + 1),
    payload: { monthFrom, monthTo, monthLabel },
  };
}
```

Nota para el wiring (Task 10): `prevMonthExpenses` (mes antepasado) requiere un tercer bucket de agregación que HOY no existe en el hook — se calcula ahí recorriendo `categoryPostedMovements` con el rango `startOfMonth(now.getMonth()-2)` a `endOfMonth(now.getMonth()-2)`; si el snapshot no alcanza tan atrás, pasar `0` (la comparativa simplemente se omite).

- [x] **Step 4: Ver pasar** + typecheck. **Step 5: Commit** — `git add -u __tests__ features && git commit -m "feat(notifications): builder de recap mensual"`

---

### Task 8: obligation_milestone

**Files:** mismos del Task 5.

- [x] **Step 1: Test que falla**

```ts
import { buildObligationMilestoneAlerts } from "../features/notifications/lib/alertBuilders";

const ob = (over = {}) =>
  ({ id: 8, title: "Préstamo auto", status: "active", progressPercent: 55, pendingAmount: 4500, currencyCode: "PEN", ...over }) as any;

describe("buildObligationMilestoneAlerts", () => {
  it("emite el hito mas alto cruzado (55% -> hito 50)", () => {
    const rows = buildObligationMilestoneAlerts([ob()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(8 * 1000 + 50);
    expect(rows[0].payload.milestone).toBe(50);
    expect(rows[0].payload.obligationId).toBe(8);
  });
  it("100% pagado usa mensaje de cierre", () => {
    const rows = buildObligationMilestoneAlerts([ob({ progressPercent: 100 })]);
    expect(rows[0].payload.milestone).toBe(100);
    expect(rows[0].title).toContain("completa");
  });
  it("sin hito bajo 25% y sin obligaciones inactivas", () => {
    expect(buildObligationMilestoneAlerts([ob({ progressPercent: 10 })])).toHaveLength(0);
    expect(buildObligationMilestoneAlerts([ob({ status: "settled" })])).toHaveLength(0);
  });
});
```

- [x] **Step 2: Ver fallar.**

- [x] **Step 3: Implementar**

```ts
const MILESTONES = [100, 75, 50, 25];

export function buildObligationMilestoneAlerts(obligations: ObligationSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const o of obligations) {
    if (o.status !== "active") continue;
    const milestone = MILESTONES.find((m) => o.progressPercent >= m);
    if (!milestone) continue;
    const esCierre = milestone === 100;
    rows.push({
      kind: "obligation_milestone",
      title: esCierre ? "¡Obligación completa!" : `Hito de pago: ${milestone}%`,
      body: esCierre
        ? `Terminaste de pagar "${o.title}". Una deuda menos.`
        : `Ya pagaste el ${milestone}% de "${o.title}". Saldo pendiente: ${fmt(o.pendingAmount)} ${o.currencyCode}.`,
      related_entity_type: "obligation_milestone",
      related_entity_id: o.id * 1000 + milestone,
      payload: { obligationId: o.id, milestone, progressPercent: o.progressPercent },
    });
  }
  return rows;
}
```

- [x] **Step 4: Ver pasar** + typecheck. **Step 5: Commit** — `git add -u __tests__ features && git commit -m "feat(notifications): builder de hitos de obligacion"`

---

### Task 9: detected_suggestions_pending

**Files:** mismos del Task 5. (La cuenta de pendientes la hace el hook con una query en Task 10; el builder es puro.)

- [x] **Step 1: Test que falla**

```ts
import { buildDetectedSuggestionsPendingAlert } from "../features/notifications/lib/alertBuilders";

describe("buildDetectedSuggestionsPendingAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("emite con >=3 pendientes y la mas vieja de hace mas de 24h", () => {
    const row = buildDetectedSuggestionsPendingAlert(4, "2026-07-08T10:00:00Z", 1, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("detected_suggestions_pending");
    expect(row!.related_entity_id).toBe(1);
    expect(row!.body).toContain("4");
  });
  it("null con menos de 3, o si la mas vieja es reciente", () => {
    expect(buildDetectedSuggestionsPendingAlert(2, "2026-07-08T10:00:00Z", 1, now)).toBeNull();
    expect(buildDetectedSuggestionsPendingAlert(5, "2026-07-10T04:00:00Z", 1, now)).toBeNull();
    expect(buildDetectedSuggestionsPendingAlert(5, null, 1, now)).toBeNull();
  });
});
```

- [x] **Step 2: Ver fallar.**

- [x] **Step 3: Implementar**

```ts
export function buildDetectedSuggestionsPendingAlert(
  pendingCount: number,
  oldestPendingAt: string | null,
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (pendingCount < 3 || !oldestPendingAt) return null;
  if (now.getTime() - new Date(oldestPendingAt).getTime() < 24 * 3_600_000) return null;
  return {
    kind: "detected_suggestions_pending",
    title: "Movimientos detectados sin revisar",
    body: `Tienes ${pendingCount} movimientos detectados esperando tu confirmación desde hace más de un día.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { pendingCount, oldestPendingAt },
  };
}
```

- [x] **Step 4: Ver pasar** + typecheck. **Step 5: Commit** — `git add -u __tests__ features && git commit -m "feat(notifications): builder de sugerencias detectadas sin revisar"`

---

### Task 10: Wiring en useNotificationGenerator

**Files:**
- Modify: `hooks/useNotificationGenerator.ts`

- [x] **Step 1: Registrar kinds** — agregar a `ALL_KINDS` (línea ~105, antes del cierre del array):

```ts
  // Kinds nuevos (spec 2026-07-10) — los 2 predictivos server-side NO van aquí
  // (los genera el cron y este cleanup los borraría).
  "subscription_price_increase",
  "possible_duplicate_charge",
  "detected_suggestions_pending",
  "expected_income_missed",
  "monthly_recap",
  "obligation_milestone",
```

- [x] **Step 2: Importar builders** (junto a los imports existentes del hook):

```ts
import {
  buildDetectedSuggestionsPendingAlert,
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildMonthlyRecapAlert,
  buildObligationMilestoneAlerts,
  buildSubscriptionPriceIncreaseAlerts,
  type AlertRow,
} from "../features/notifications/lib/alertBuilders";
```

- [x] **Step 3: Helper de conversión** (cerca de `countLabel`, ~línea 167):

```ts
function toNotificationRow(userId: string, nowIso: string, alert: AlertRow): NotificationRow {
  return { user_id: userId, channel: "in_app", status: "pending", scheduled_for: nowIso, ...alert };
}
```

- [x] **Step 4: Agregación del mes antepasado** — dentro de `generateNotifications`, junto a los buckets `lastMonth*` existentes (~línea 287), agregar `prevMonthExpenses` con el mismo patrón de bucle (rango `new Date(now.getFullYear(), now.getMonth() - 2, 1)` hasta `new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999)`), y un `lastMonthTopCategory` (nombre de la categoría con mayor total en `lastMonthByCat`, vía `categoryNameMap`).

- [x] **Step 5: Invocar builders** — inmediatamente ANTES de `appendDailyBaselineNotifications({...})` (~línea 751), para que las alertas nuevas cuenten contra el mínimo diario de informativas:

```ts
  // ── Kinds nuevos (spec 2026-07-10) ────────────────────────────────────────
  const nuevos: AlertRow[] = [
    ...buildSubscriptionPriceIncreaseAlerts(snapshot.subscriptions, snapshot.subscriptionPostedMovements),
    ...buildDuplicateChargeAlerts(snapshot.categoryPostedMovements, categoryKindMap, now),
    ...buildExpectedIncomeMissedAlerts(snapshot.recurringIncome, snapshot.categoryPostedMovements, categoryKindMap, now),
    ...buildObligationMilestoneAlerts(snapshot.obligations),
  ];
  const recap = buildMonthlyRecapAlert(
    { lastMonthExpenses, lastMonthIncome, prevMonthExpenses, topCategoryName: lastMonthTopCategory },
    now,
  );
  if (recap) nuevos.push(recap);

  // Sugerencias detectadas pendientes (query directa; fallo silencioso)
  try {
    const { data: pendientes } = await supabase
      .from("notification_detected_movement_suggestions")
      .select("created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    const pendingAlert = buildDetectedSuggestionsPendingAlert(
      pendientes?.length ?? 0,
      pendientes?.[0]?.created_at ?? null,
      workspaceId,
      now,
    );
    if (pendingAlert) nuevos.push(pendingAlert);
  } catch { /* sin bloqueo del resto */ }

  rows.push(...nuevos.map((alert) => toNotificationRow(userId, nowIso, alert)));
```

Verificar el nombre real de la tabla de sugerencias con `grep -rn "detected_movement_suggestions" services/queries/notification-detection.ts` y ajustar si difiere.

**Advertencia idempotencia:** el `existingSet` del hook (~línea 780) filtra por `scheduled_for` = HOY, pero `ignoreDuplicates: true` en el upsert protege las filas de días anteriores — no tocar ese mecanismo.

- [x] **Step 6: Validar** — `npm run typecheck` limpio; `npx jest __tests__` → PASS todos.

- [x] **Step 7: Commit** — `git add hooks/useNotificationGenerator.ts && git commit -m "feat(notifications): generar los 6 kinds nuevos client-side"`

---

### Task 11: Migración + toggle "Alertas predictivas"

**Files:**
- Create: `supabase/migrations/202607110001_notification_preferences_predictive_toggle.sql`
- Create: `DATABASE_DICTIONARY.md` (no existe aún — crearlo mínimo)
- Modify: `services/queries/notifications.ts` (~líneas 110-160: select/map/upsert de preferences)
- Modify: `app/settings.tsx` (~líneas 303, 349, 515: patrón del toggle del digest)

- [x] **Step 1: Migración** (mismo patrón que `202604270001_notification_preferences_digest_toggle.sql`):

```sql
-- Toggle de alertas predictivas (cash_runway_alert, commitments_vs_balance).
-- El cron send-daily-notification-digest lo respeta antes de calcular/insertar.
alter table public.notification_preferences
add column if not exists predictive_alerts_enabled boolean;

update public.notification_preferences
set predictive_alerts_enabled = true
where predictive_alerts_enabled is null;

alter table public.notification_preferences
alter column predictive_alerts_enabled set default true,
alter column predictive_alerts_enabled set not null;
```

- [x] **Step 2: DATABASE_DICTIONARY.md** — crear con secciones mínimas y la columna nueva documentada:

```markdown
# Diccionario de datos — DarkMoney

> Nota: diccionario iniciado el 2026-07-11; documenta cambios desde esa fecha.
> Las tablas históricas se documentan al tocarse (regla en CLAUDE.md).

## notification_preferences (parcial)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| predictive_alerts_enabled | boolean | no (default true) | Habilita las alertas predictivas del cron diario (`cash_runway_alert`, `commitments_vs_balance`). |
```

- [x] **Step 3: Query + mutación** — en `services/queries/notifications.ts`, siguiendo el patrón exacto de `daily_digest_enabled` en las líneas 110/119/147/156: agregar `predictive_alerts_enabled` al `.select(...)`, mapear `predictiveAlertsEnabled: data?.predictive_alerts_enabled !== false`, y agregarlo a los dos objetos del upsert de la mutación (`predictive_alerts_enabled: input.predictiveAlertsEnabled`). Extender los tipos de input/output donde el TS lo exija (el typecheck te guía).

- [x] **Step 4: Toggle en settings** — en `app/settings.tsx`, replicar el patrón del digest (state en ~303, mutación en ~349, `Switch` en ~515) con: label `Alertas predictivas`, descripción `Aviso cuando tu saldo proyectado no cubre el mes o tus compromisos.`, campo `predictiveAlertsEnabled`.

- [x] **Step 5: Validar** — `npm run typecheck`; abrir Ajustes en el emulador y ver el toggle (manual).

- [x] **Step 6: Aplicar migración** — REQUIERE APROBACIÓN DEL USUARIO (BD real): `npx supabase db push` o SQL directo vía `DATABASE_URL`. No cerrar el task sin aplicarla y sin el diccionario commiteado.

- [x] **Step 7: Commit** — `git add supabase/migrations/202607110001_notification_preferences_predictive_toggle.sql DATABASE_DICTIONARY.md services/queries/notifications.ts app/settings.tsx && git commit -m "feat(notifications): toggle de alertas predictivas + migracion"`

---

### Task 12: Predictivas server-side en el cron del digest

**Files:**
- Modify: `supabase/functions/send-daily-notification-digest/index.ts` (antes del armado del digest, dentro del loop por usuario; el fetch de prefs está en ~línea 222)

- [x] **Step 1: Implementar el cálculo** — agregar una función al final del archivo:

```ts
type PredictiveInput = {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  todayKey: string; // YYYY-MM-DD en Lima
};

async function insertPredictiveAlerts({ supabase, userId, todayKey }: PredictiveInput): Promise<void> {
  // Idempotencia: 1 por día por kind (related_entity_id = YYYYMMDD)
  const entityId = Number(todayKey.replace(/-/g, ""));

  // 1) Workspace y cuentas líquidas del usuario
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, workspace_id, type, currency_code, current_balance, is_archived")
    .eq("owner_user_id", userId);
  const liquid = (accounts ?? []).filter(
    (a) => !a.is_archived && ["bank", "cash", "savings"].includes(a.type),
  );
  if (!liquid.length) return;

  // 2) Tasas persistidas → todo a moneda base del perfil
  const { data: profile } = await supabase
    .from("profiles").select("base_currency_code").eq("id", userId).single();
  const base = profile?.base_currency_code;
  if (!base) return;
  const { data: rates } = await supabase
    .from("exchange_rates").select("from_currency, to_currency, rate");
  const toBase = (amount: number, currency: string): number | null => {
    if (currency === base) return amount;
    const direct = (rates ?? []).find((r) => r.from_currency === currency && r.to_currency === base);
    if (direct) return amount * Number(direct.rate);
    const inverse = (rates ?? []).find((r) => r.from_currency === base && r.to_currency === currency);
    if (inverse && Number(inverse.rate) !== 0) return amount / Number(inverse.rate);
    return null; // sin tasa: excluir, no asumir 1:1
  };

  let disponible = 0;
  for (const a of liquid) {
    const v = toBase(Number(a.current_balance), a.currency_code);
    if (v !== null) disponible += v;
  }

  // 3) Gasto neto promedio diario del mes en curso
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const { data: mvts } = await supabase
    .from("movements")
    .select("kind, source_amount, source_currency_code, occurred_at")
    .eq("owner_user_id", userId)
    .eq("status", "posted")
    .gte("occurred_at", monthStart);
  const dayOfMonth = Number(todayKey.slice(8, 10));
  let gastoMes = 0;
  for (const m of mvts ?? []) {
    if (m.kind !== "expense") continue;
    const v = toBase(Number(m.source_amount ?? 0), m.source_currency_code ?? base);
    if (v !== null) gastoMes += v;
  }
  const gastoDiario = dayOfMonth > 0 ? gastoMes / dayOfMonth : 0;

  // 4) cash_runway_alert: saldo proyectado llega a 0 antes de fin de mes
  const lastDay = new Date(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)), 0).getDate();
  const diasRestantes = lastDay - dayOfMonth;
  if (gastoDiario > 0) {
    const diasDeCaja = disponible / gastoDiario;
    if (diasDeCaja < diasRestantes) {
      const fechaCero = new Date(Date.now() + diasDeCaja * 86_400_000).toISOString().slice(0, 10);
      await supabase.from("notifications").upsert([{
        user_id: userId, channel: "in_app", status: "pending",
        kind: "cash_runway_alert",
        title: "Tu saldo no llega a fin de mes",
        body: `A tu ritmo de gasto actual, tu saldo disponible se agota alrededor del ${fechaCero}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "cash_runway", related_entity_id: entityId,
        payload: { projectedZeroDate: fechaCero, available: disponible, dailySpend: gastoDiario, bypass_daily_limit: true },
      }], { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true });
    }
  }

  // 5) commitments_vs_balance: compromisos del resto del mes vs disponible
  const monthEnd = `${todayKey.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  const { data: obligations } = await supabase
    .from("obligations")
    .select("pending_amount:principal_current_amount, currency_code, due_date, status")
    .eq("owner_user_id", userId).eq("status", "active")
    .gte("due_date", todayKey).lte("due_date", monthEnd);
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("amount, currency_code, next_due_date, status")
    .eq("owner_user_id", userId).eq("status", "active")
    .gte("next_due_date", todayKey).lte("next_due_date", monthEnd);
  let compromisos = 0;
  for (const o of obligations ?? []) {
    const v = toBase(Number(o.pending_amount ?? 0), o.currency_code);
    if (v !== null) compromisos += v;
  }
  for (const s of subs ?? []) {
    const v = toBase(Number(s.amount ?? 0), s.currency_code);
    if (v !== null) compromisos += v;
  }
  if (compromisos > disponible) {
    await supabase.from("notifications").upsert([{
      user_id: userId, channel: "in_app", status: "pending",
      kind: "commitments_vs_balance",
      title: "Compromisos superan tu saldo",
      body: `Entre hoy y fin de mes vencen ${compromisos.toFixed(2)} ${base} en obligaciones y suscripciones, y tu saldo disponible es ${disponible.toFixed(2)} ${base}.`,
      scheduled_for: new Date().toISOString(),
      related_entity_type: "commitments_check", related_entity_id: entityId,
      payload: { committed: compromisos, available: disponible, gap: compromisos - disponible },
    }], { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true });
  }
}
```

**IMPORTANTE — verificar nombres de columnas contra el esquema real antes de escribir** (con `DATABASE_URL`): `accounts.owner_user_id` vs `workspace_id`+join, `movements.kind/source_amount/status`, `obligations.principal_current_amount/due_date`, `subscriptions.next_due_date`, `exchange_rates.from_currency/to_currency/rate`, `profiles.base_currency_code`. Ajustar el código a lo que exista — este bloque asume nombres razonables y DEBE validarse.

- [x] **Step 2: Invocar por usuario** — en el loop de usuarios del digest (después del fetch de prefs ~línea 222), respetando el toggle:

```ts
    if (pref.predictive_alerts_enabled !== false) {
      try {
        await insertPredictiveAlerts({ supabase, userId, todayKey: digestDate });
      } catch (e) {
        console.warn("[Digest] predictive alerts failed:", userId, e instanceof Error ? e.message : e);
      }
    }
```

Agregar `predictive_alerts_enabled` al `.select(...)` del fetch de prefs (~línea 222).

- [x] **Step 3: Manejo del bypass del límite de push** — en `supabase/functions/send-push-notifications/index.ts`, el `bypassDailyLimit` existente se decide por... verificar con `grep -n "bypassDailyLimit" index.ts` cómo se activa hoy (~línea 151); si lee un flag del payload, `cash_runway_alert` ya lo trae en `payload.bypass_daily_limit`; si es por lista de kinds, agregar `cash_runway_alert` a esa lista.

- [x] **Step 4: Validar localmente** — `npx supabase functions serve send-daily-notification-digest` no está configurado en este repo; validación = revisión de tipos con Deno check si está disponible (`deno check supabase/functions/send-daily-notification-digest/index.ts`) o revisión manual + deploy a staging.

- [x] **Step 5: Deploy** — REQUIERE APROBACIÓN DEL USUARIO: `npx supabase functions deploy send-daily-notification-digest` (y `send-push-notifications` si se tocó). Verificar el run siguiente del cron en el dashboard de Supabase.

- [x] **Step 6: Commit** — `git add supabase/functions && git commit -m "feat(notifications): predictivas cash runway y compromisos vs saldo en el cron"`

---

### Task 13: Validación end-to-end + OTA

- [x] **Step 1:** `npm run typecheck` && `npx jest __tests__` && `git diff --check` — todo limpio.
- [x] **Step 2:** En emulador con cuenta real: sembrar datos que crucen un umbral fácil (p. ej. dos gastos idénticos hoy) → abrir la app → verificar fila en bandeja con ícono/título correctos → tap navega al destino.
- [x] **Step 3:** Verificar que el digest diario del día siguiente incluye los kinds informativos nuevos (bandeja + push del digest).
- [x] **Step 4:** Publicar OTA (REQUIERE APROBACIÓN): `npx eas-cli update --channel preview --message "feat: 8 notificaciones nuevas"`. Los cambios de este plan son solo JS + edge functions — sin APK nuevo.
- [x] **Step 5:** Actualizar `docs/superpowers/specs/2026-07-10-new-notifications-design.md` con la desviación del duplicate-charge (categoría en vez de descripción) y commitear.
