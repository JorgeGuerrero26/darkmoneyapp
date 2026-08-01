# Refactor pre-Fase 2: Builders Puros para Reglas Legacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar las ~20 reglas legacy inline de `hooks/useNotificationGenerator.ts` a funciones puras testeadas en `features/notifications/lib/alertBuilders.ts`, con CERO cambios de comportamiento.

**Architecture:** Cada regla se extrae como builder puro que recibe datos del snapshot (+ `now` o `daysFromToday` inyectado) y devuelve `AlertRow[]` o `AlertRow | null` — mismo patrón que los 6 builders existentes del spec 2026-07-10. El hook conserva su orquestación intacta (fingerprint, `InteractionManager`, `existingSet`, upsert `ignoreDuplicates`, `cleanupStaleNotifications`, `ALL_KINDS`) y solo reemplaza los bloques inline por llamadas a builders.

**Tech Stack:** React Native/Expo + TypeScript, jest (tests puros en `__tests__/alert-builders.test.ts`).

**Convenciones transversales (aplican a TODOS los tasks):**

- **CERO cambios de comportamiento.** Copiar los strings de `title`/`body`, kinds, `related_entity_type`, `related_entity_id`, payloads y umbrales EXACTOS del hook original. Es extraer + testear, no rediseñar. Los tests fijan los umbrales actuales para que un cambio accidental de regla financiera rompa CI.
- **`daysFromToday` inyectado:** las reglas que hoy llaman `calendarDaysFromTodayLocal(ymd)` (depende del reloj real, no de `now`) reciben un parámetro `daysFromToday: DaysFromToday` SIN default. El hook pasa `calendarDaysFromTodayLocal` (ya importado); los tests pasan un fake determinista. Así `alertBuilders.ts` no gana dependencias y el comportamiento en runtime es idéntico.
- **Ubicación:** builders se AGREGAN al final de `features/notifications/lib/alertBuilders.ts` (mismo archivo que el patrón establecido); tests se AGREGAN al final de `__tests__/alert-builders.test.ts` reutilizando las factories existentes (`sub`, `mv`, `ob`, `catKinds`).
- **Wiring en el hook:** Task 1 introduce un helper local `pushAlerts` dentro de `generateNotifications`; cada task siguiente reemplaza sus secciones inline por `pushAlerts(buildX(...))` EN LA MISMA POSICIÓN (se preserva el orden de las filas). Las secciones numeradas (`// ── N. ...`) del hook se migran en orden ascendente estricto.
- **NO tocar:** el mecanismo de idempotencia (`existingSet`, upsert con `ignoreDuplicates`, `cleanupStaleNotifications`), `ALL_KINDS`, el fingerprint del hook, la query de `notification_detected_movement_suggestions`, ni la sección "Kinds nuevos (spec 2026-07-10)".
- **Validación estándar de cada task:** `npx jest __tests__/alert-builders.test.ts` y `npm run typecheck`. En el último task, suite completa `npx jest` + `git diff --check`.
- **NO publicar OTA al final** — preguntar al usuario primero.

**Datos verificados del código actual (no re-derivar):**

- `snapshot.budgets: BudgetOverview[]`, `snapshot.accounts: AccountSummary[]` — ambos tipos en `types/domain.ts`, ya usados con los campos que necesitan los builders (`usedPercent`, `alertPercent`, `periodEnd`, `openingBalance`, `lastActivity: string`, etc.).
- Prioridades (`lib/notification-priority.ts`): `budget_alert`, `budget_period_ending`, `account_dormant`, `monthly_recap`, `no_movements_week`, etc. son **informational** (default); `low_balance`, `obligation_due`, `subscription_reminder` son important; `negative_balance`, `obligation_overdue`, `subscription_overdue`, `multiple_obligations_overdue` son critical. El baseline diario cuenta SOLO informativas.
- `lib/notification-priority.ts` ya es jest-safe (lo importa `__tests__/notification-priority.test.ts`).
- `calendarDaysFromTodayLocal(ymd)` devuelve días calendario desde HOY local (negativo = pasado; `9999` si el ymd es inválido).

---

### Task 1: Lote 1 — Presupuestos y recordatorios de suscripción

Migra las secciones 1–4 del hook: `budget_alert` (excedido / cerca del límite), `budget_period_ending`, `subscription_reminder`, `subscription_overdue`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar secciones `// ── 1.` a `// ── 4.`, líneas 366–453 del archivo original)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al FINAL de `__tests__/alert-builders.test.ts`:

```ts
// ─── Builders legacy (migrados de useNotificationGenerator) ─────────────────

const budget = (over = {}) =>
  ({ id: 30, name: "Comida", isActive: true, usedPercent: 40, alertPercent: 80, limitAmount: 800, periodEnd: "2026-07-31", workspaceId: 1, ...over }) as any;

const daysFromFixed = (todayYmd: string) => (ymd: string) => {
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
};

describe("buildBudgetLimitAlerts", () => {
  it("alerta 'excedido' al llegar a 100% usado", () => {
    const rows = buildBudgetLimitAlerts([budget({ usedPercent: 112.4 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("budget_alert");
    expect(rows[0].title).toBe("Presupuesto excedido");
    expect(rows[0].body).toContain("112%");
    expect(rows[0].related_entity_id).toBe(30);
    expect(rows[0].payload.limitAmount).toBe(800);
  });
  it("alerta 'cerca del limite' al cruzar alertPercent sin llegar a 100", () => {
    const rows = buildBudgetLimitAlerts([budget({ usedPercent: 85 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Presupuesto cerca del límite");
    expect(rows[0].body).toContain("85%");
    expect(rows[0].body).toContain("80%");
  });
  it("no alerta bajo alertPercent, con alertPercent 0, o presupuesto inactivo", () => {
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 79 })])).toHaveLength(0);
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 90, alertPercent: 0 })])).toHaveLength(0);
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 120, isActive: false })])).toHaveLength(0);
  });
});

describe("buildBudgetPeriodEndingAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta cuando cierra en <=3 dias con mas de 50% usado", () => {
    const rows = buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-12", usedPercent: 60 })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("budget_period_ending");
    expect(rows[0].payload.daysLeft).toBe(2);
    expect(rows[0].body).toContain("en 2 días");
  });
  it("'cierra hoy' cuando quedan 0 dias", () => {
    const rows = buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-10", usedPercent: 51 })], days);
    expect(rows[0].body).toContain("cierra hoy");
  });
  it("no alerta a 4 dias, con 50% exacto usado, o periodo ya cerrado", () => {
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-14", usedPercent: 90 })], days)).toHaveLength(0);
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-12", usedPercent: 50 })], days)).toHaveLength(0);
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-09", usedPercent: 90 })], days)).toHaveLength(0);
  });
});

describe("buildSubscriptionReminderAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta dentro de la ventana remindDaysBefore", () => {
    const rows = buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-12", remindDaysBefore: 3 })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_reminder");
    expect(rows[0].body).toContain("vence en 2 días");
    expect(rows[0].related_entity_id).toBe(5);
  });
  it("'vence hoy' y 'vencio hace 1 dia' siguen dentro de la ventana", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-10", remindDaysBefore: 3 })], days)[0].body).toContain("vence hoy");
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-09", remindDaysBefore: 3 })], days)[0].body).toContain("venció hace 1 día");
  });
  it("ventana minima de 1 dia aunque remindDaysBefore sea 0", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-11", remindDaysBefore: 0 })], days)).toHaveLength(1);
  });
  it("no alerta fuera de ventana, vencida hace 2+ dias, o inactiva", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-15", remindDaysBefore: 3 })], days)).toHaveLength(0);
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-08", remindDaysBefore: 3 })], days)).toHaveLength(0);
    expect(buildSubscriptionReminderAlerts([sub({ status: "paused", nextDueDate: "2026-07-11", remindDaysBefore: 3 })], days)).toHaveLength(0);
  });
});

describe("buildSubscriptionOverdueAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta cuando vencio hace 2+ dias", () => {
    const rows = buildSubscriptionOverdueAlerts([sub({ nextDueDate: "2026-07-07" })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_overdue");
    expect(rows[0].body).toContain("hace 3 días");
    expect(rows[0].payload.diffDays).toBe(-3);
  });
  it("no alerta vencida hace 1 dia (la cubre el reminder) ni inactiva", () => {
    expect(buildSubscriptionOverdueAlerts([sub({ nextDueDate: "2026-07-09" })], days)).toHaveLength(0);
    expect(buildSubscriptionOverdueAlerts([sub({ status: "canceled", nextDueDate: "2026-07-01" })], days)).toHaveLength(0);
  });
});
```

Y agregar los 4 nombres nuevos al import de `alertBuilders` al inicio del archivo de tests:

```ts
import {
  buildBudgetLimitAlerts,
  buildBudgetPeriodEndingAlerts,
  buildDetectedSuggestionsPendingAlert,
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildMonthlyRecapAlert,
  buildObligationMilestoneAlerts,
  buildSubscriptionOverdueAlerts,
  buildSubscriptionPriceIncreaseAlerts,
  buildSubscriptionReminderAlerts,
} from "../features/notifications/lib/alertBuilders";
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL (los builders no existen).

- [x] **Step 3: Implementar builders** — agregar al FINAL de `features/notifications/lib/alertBuilders.ts`. Además, agregar `BudgetOverview` al import de tipos existente de `../../../types/domain`:

```ts
// ─── Builders legacy (migrados de useNotificationGenerator) ─────────────────
// Comportamiento idéntico al hook original: mismos kinds, títulos, bodies,
// entity ids, payloads y umbrales. `daysFromToday` se inyecta (el hook pasa
// calendarDaysFromTodayLocal) para mantener los builders puros y testeables.

export type DaysFromToday = (ymd: string) => number;

export function buildBudgetLimitAlerts(budgets: BudgetOverview[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const budget of budgets) {
    if (!budget.isActive) continue;

    const isOverLimit = budget.usedPercent >= 100;
    const isNearLimit =
      !isOverLimit && budget.alertPercent > 0 && budget.usedPercent >= budget.alertPercent;

    if (isOverLimit) {
      rows.push({
        kind: "budget_alert",
        title: "Presupuesto excedido",
        body: `"${budget.name}" superó su límite (${Math.round(budget.usedPercent)}% usado).`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    } else if (isNearLimit) {
      rows.push({
        kind: "budget_alert",
        title: "Presupuesto cerca del límite",
        body: `"${budget.name}" va al ${Math.round(budget.usedPercent)}% de su límite (alerta: ${Math.round(budget.alertPercent)}%).`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { usedPercent: budget.usedPercent, limitAmount: budget.limitAmount },
      });
    }
  }
  return rows;
}

export function buildBudgetPeriodEndingAlerts(
  budgets: BudgetOverview[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const budget of budgets) {
    if (!budget.isActive) continue;
    const daysLeft = daysFromToday(budget.periodEnd);
    if (daysLeft >= 0 && daysLeft <= 3 && budget.usedPercent > 50) {
      rows.push({
        kind: "budget_period_ending",
        title: "Período de presupuesto cerrando",
        body: `"${budget.name}" cierra ${daysLeft === 0 ? "hoy" : `en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`} y lleva ${Math.round(budget.usedPercent)}% ejecutado.`,
        related_entity_type: "budget",
        related_entity_id: budget.id,
        payload: { daysLeft, usedPercent: budget.usedPercent },
      });
    }
  }
  return rows;
}

export function buildSubscriptionReminderAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    const window = Math.max(1, sub.remindDaysBefore);
    if (diffDays > window || diffDays < -1) continue;

    const dueLabel =
      diffDays < 0
        ? `venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`
        : diffDays === 0 ? "vence hoy"
        : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`;

    rows.push({
      kind: "subscription_reminder",
      title: "Suscripción próxima a vencer",
      body: `"${sub.name}" ${dueLabel}.`,
      related_entity_type: "subscription",
      related_entity_id: sub.id,
      payload: { nextDueDate: sub.nextDueDate, diffDays },
    });
  }
  return rows;
}

export function buildSubscriptionOverdueAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    if (diffDays < -1) {
      rows.push({
        kind: "subscription_overdue",
        title: "Suscripción vencida sin registrar",
        body: `"${sub.name}" venció hace ${Math.abs(diffDays)} días y aún no tiene movimiento registrado.`,
        related_entity_type: "subscription",
        related_entity_id: sub.id,
        payload: { nextDueDate: sub.nextDueDate, diffDays },
      });
    }
  }
  return rows;
}
```

- [x] **Step 4: Wiring en el hook** — en `hooks/useNotificationGenerator.ts`:

1. Agregar los 4 builders y el tipo `AlertRow` al import existente de `../features/notifications/lib/alertBuilders` (el `type AlertRow` ya está importado; agregar `buildBudgetLimitAlerts`, `buildBudgetPeriodEndingAlerts`, `buildSubscriptionReminderAlerts`, `buildSubscriptionOverdueAlerts`).
2. Dentro de `generateNotifications`, justo después de `const rows: NotificationRow[] = [];`, agregar:

```ts
  const pushAlerts = (alerts: AlertRow[] | AlertRow | null) => {
    const list = Array.isArray(alerts) ? alerts : alerts ? [alerts] : [];
    for (const alert of list) rows.push(toNotificationRow(userId, nowIso, alert));
  };
```

3. Reemplazar los CUATRO bloques completos `// ── 1. Budget alerts ──` … `// ── 4. Subscription overdue ──` (cada uno con su `for` completo) por:

```ts
  // ── 1. Budget alerts ──────────────────────────────────────────────────────
  pushAlerts(buildBudgetLimitAlerts(snapshot.budgets));

  // ── 2. Budget period ending soon ─────────────────────────────────────────
  pushAlerts(buildBudgetPeriodEndingAlerts(snapshot.budgets, calendarDaysFromTodayLocal));

  // ── 3. Subscription reminders ─────────────────────────────────────────────
  pushAlerts(buildSubscriptionReminderAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));

  // ── 4. Subscription overdue ───────────────────────────────────────────────
  pushAlerts(buildSubscriptionOverdueAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));
```

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 1 - builders puros de presupuestos y recordatorios de suscripcion"
```

---

### Task 2: Lote 2 — Vencimientos múltiples y obligaciones

Migra las secciones 5–8: `multiple_subscriptions_due`, `obligation_due`/`obligation_overdue` (un solo loop, dos kinds), `multiple_obligations_overdue`, `obligation_no_payment`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar secciones `// ── 5.` a `// ── 8.`, líneas 455–546 del archivo original)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final del archivo de tests (y los 4 nombres nuevos al import):

```ts
describe("buildMultipleSubscriptionsDueAlert", () => {
  const days = daysFromFixed("2026-07-10");
  const tres = [
    sub({ id: 1, name: "Netflix", nextDueDate: "2026-07-11", amount: 44.9 }),
    sub({ id: 2, name: "Spotify", nextDueDate: "2026-07-14", amount: 22.9 }),
    sub({ id: 3, name: "iCloud", nextDueDate: "2026-07-17", amount: 3.9 }),
  ];
  it("alerta con 3+ suscripciones activas venciendo en <=7 dias", () => {
    const row = buildMultipleSubscriptionsDueAlert(tres, 1, days);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("multiple_subscriptions_due");
    expect(row!.related_entity_id).toBe(1); // workspaceId
    expect(row!.payload.count).toBe(3);
    expect(row!.payload.totalAmount).toBeCloseTo(71.7);
    expect(row!.body).toContain("Netflix, Spotify, iCloud");
  });
  it("null con solo 2 en ventana o si una cae fuera de los 7 dias", () => {
    expect(buildMultipleSubscriptionsDueAlert(tres.slice(0, 2), 1, days)).toBeNull();
    expect(buildMultipleSubscriptionsDueAlert([tres[0], tres[1], sub({ id: 3, nextDueDate: "2026-07-20" })], 1, days)).toBeNull();
  });
});

describe("buildObligationDueAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("emite obligation_overdue con dias vencidos y saldo", () => {
    const rows = buildObligationDueAlerts([ob({ dueDate: "2026-07-05" })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("obligation_overdue");
    expect(rows[0].title).toBe("Obligación vencida");
    expect(rows[0].body).toContain("hace 5 días");
    expect(rows[0].body).toContain("4500");
    expect(rows[0].payload.diffDays).toBe(-5);
  });
  it("emite obligation_due dentro de 7 dias, con titulo especial si es hoy", () => {
    const rows = buildObligationDueAlerts([ob({ dueDate: "2026-07-15" })], days);
    expect(rows[0].kind).toBe("obligation_due");
    expect(rows[0].title).toBe("Obligación próxima a vencer");
    expect(rows[0].body).toContain("vence en 5 días");
    const hoy = buildObligationDueAlerts([ob({ dueDate: "2026-07-10" })], days);
    expect(hoy[0].title).toBe("Obligación vence hoy");
  });
  it("no alerta a 8 dias, sin dueDate, o inactiva", () => {
    expect(buildObligationDueAlerts([ob({ dueDate: "2026-07-18" })], days)).toHaveLength(0);
    expect(buildObligationDueAlerts([ob({ dueDate: null })], days)).toHaveLength(0);
    expect(buildObligationDueAlerts([ob({ status: "settled", dueDate: "2026-07-05" })], days)).toHaveLength(0);
  });
});

describe("buildMultipleObligationsOverdueAlert", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta con 2+ obligaciones vencidas", () => {
    const row = buildMultipleObligationsOverdueAlert(
      [ob({ id: 1, title: "Préstamo", dueDate: "2026-07-01" }), ob({ id: 2, title: "Tarjeta", dueDate: "2026-07-05" })],
      9, days,
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("multiple_obligations_overdue");
    expect(row!.related_entity_id).toBe(9);
    expect(row!.payload.count).toBe(2);
    expect(row!.body).toContain("Préstamo, Tarjeta");
  });
  it("null con solo 1 vencida, y las no vencidas no cuentan", () => {
    expect(buildMultipleObligationsOverdueAlert([ob({ dueDate: "2026-07-01" })], 9, days)).toBeNull();
    expect(buildMultipleObligationsOverdueAlert([ob({ id: 1, dueDate: "2026-07-01" }), ob({ id: 2, dueDate: "2026-07-15" })], 9, days)).toBeNull();
  });
});

describe("buildObligationNoPaymentAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  const cuota = (over = {}) => ob({ installmentAmount: 500, startDate: "2026-01-10", ...over });
  it("alerta sin pagos en 45+ dias", () => {
    const rows = buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: "2026-05-01T12:00:00Z" })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("obligation_no_payment");
    expect(rows[0].payload.daysSincePayment).toBe(70);
    expect(rows[0].body).toContain("Sin pagos en 70 días");
  });
  it("'sin pagos registrados aun' cuando nunca hubo pago (999 dias)", () => {
    const rows = buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: null })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("Sin pagos registrados");
    expect(rows[0].payload.daysSincePayment).toBe(999);
  });
  it("no alerta con pago hace 44 dias, sin cuotas, saldo 0, u obligacion de menos de 15 dias", () => {
    expect(buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: "2026-05-27T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ installmentAmount: null, lastPaymentDate: null })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ pendingAmount: 0, lastPaymentDate: null })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ startDate: "2026-07-01", lastPaymentDate: null })], now)).toHaveLength(0);
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar builders** — agregar al final de `alertBuilders.ts`:

```ts
const daysBetween = (a: Date, b: Date): number =>
  Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export function buildMultipleSubscriptionsDueAlert(
  subscriptions: SubscriptionSummary[],
  workspaceId: number,
  daysFromToday: DaysFromToday,
): AlertRow | null {
  const subsDueThisWeek = subscriptions.filter((s) => {
    if (s.status !== "active") return false;
    const d = daysFromToday(s.nextDueDate);
    return d >= 0 && d <= 7;
  });
  if (subsDueThisWeek.length < 3) return null;
  const totalAmt = subsDueThisWeek.reduce((acc, s) => acc + s.amount, 0);
  return {
    kind: "multiple_subscriptions_due",
    title: "Varias suscripciones vencen esta semana",
    body: `${subsDueThisWeek.length} suscripciones vencen en los próximos 7 días: ${subsDueThisWeek.map((s) => s.name).join(", ")}.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { count: subsDueThisWeek.length, totalAmount: totalAmt },
  };
}

export function buildObligationDueAlerts(
  obligations: ObligationSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.dueDate) continue;
    const diffDays = daysFromToday(ob.dueDate);

    if (diffDays < 0) {
      rows.push({
        kind: "obligation_overdue",
        title: "Obligación vencida",
        body: `"${ob.title}" venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}. Saldo pendiente: ${ob.pendingAmount} ${ob.currencyCode}.`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    } else if (diffDays <= 7) {
      rows.push({
        kind: "obligation_due",
        title: diffDays === 0 ? "Obligación vence hoy" : "Obligación próxima a vencer",
        body: `"${ob.title}" ${diffDays === 0 ? "vence hoy" : `vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`}. Saldo: ${ob.pendingAmount} ${ob.currencyCode}.`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { dueDate: ob.dueDate, diffDays, pendingAmount: ob.pendingAmount },
      });
    }
  }
  return rows;
}

export function buildMultipleObligationsOverdueAlert(
  obligations: ObligationSummary[],
  workspaceId: number,
  daysFromToday: DaysFromToday,
): AlertRow | null {
  const overdueObligations = obligations.filter((o) => {
    if (o.status !== "active" || !o.dueDate) return false;
    return daysFromToday(o.dueDate) < 0;
  });
  if (overdueObligations.length < 2) return null;
  return {
    kind: "multiple_obligations_overdue",
    title: "Varias obligaciones vencidas",
    body: `Tienes ${overdueObligations.length} obligaciones vencidas: ${overdueObligations.map((o) => o.title).join(", ")}.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { count: overdueObligations.length },
  };
}

export function buildObligationNoPaymentAlerts(
  obligations: ObligationSummary[],
  now: Date,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.installmentAmount || ob.installmentAmount <= 0) continue;
    if (ob.pendingAmount <= 0) continue;

    const lastPay = ob.lastPaymentDate ? new Date(ob.lastPaymentDate) : null;
    const daysSincePayment = lastPay ? daysBetween(lastPay, now) : 999;
    const startDate = new Date(ob.startDate);
    const daysSinceStart = daysBetween(startDate, now);

    if (daysSincePayment >= 45 && daysSinceStart >= 15) {
      const msg = lastPay
        ? `Sin pagos en ${daysSincePayment} días.`
        : "Sin pagos registrados aún.";
      rows.push({
        kind: "obligation_no_payment",
        title: "Obligación sin pagos recientes",
        body: `"${ob.title}" tiene saldo pendiente de ${ob.pendingAmount} ${ob.currencyCode}. ${msg}`,
        related_entity_type: "obligation",
        related_entity_id: ob.id,
        payload: { daysSincePayment, pendingAmount: ob.pendingAmount },
      });
    }
  }
  return rows;
}
```

- [x] **Step 4: Wiring en el hook** — agregar los 4 builders al import y reemplazar los bloques `// ── 5.` a `// ── 8.` completos (incluyendo el `const subsDueThisWeek = ...` y `const overdueObligations = ...`) por:

```ts
  // ── 5. Multiple subscriptions due this week ───────────────────────────────
  pushAlerts(buildMultipleSubscriptionsDueAlert(snapshot.subscriptions, workspaceId, calendarDaysFromTodayLocal));

  // ── 6. Obligation due & overdue ───────────────────────────────────────────
  pushAlerts(buildObligationDueAlerts(snapshot.obligations, calendarDaysFromTodayLocal));

  // ── 7. Multiple obligations overdue ──────────────────────────────────────
  pushAlerts(buildMultipleObligationsOverdueAlert(snapshot.obligations, workspaceId, calendarDaysFromTodayLocal));

  // ── 8. Obligation with no recent payment ──────────────────────────────────
  pushAlerts(buildObligationNoPaymentAlerts(snapshot.obligations, now));
```

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 2 - builders de vencimientos multiples y obligaciones"
```

---

### Task 3: Lote 3 — Tasa alta y salud de cuentas

Migra las secciones 9–12: `high_interest_obligation`, `low_balance`, `negative_balance`, `account_dormant`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final; agregar `AccountSummary` al import de tipos)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar secciones `// ── 9.` a `// ── 12.` y eliminar `daysBetween` del hook, ya sin usos)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final (y los 4 nombres al import):

```ts
const cuenta = (over = {}) =>
  ({ id: 12, name: "BCP Soles", type: "bank", currencyCode: "PEN", openingBalance: 1000, currentBalance: 500, isArchived: false, includeInNetWorth: true, lastActivity: "2026-07-01T10:00:00Z", workspaceId: 1, ...over }) as any;

describe("buildHighInterestObligationAlerts", () => {
  it("alerta con tasa >=10% y saldo pendiente", () => {
    const rows = buildHighInterestObligationAlerts([ob({ interestRate: 45 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("high_interest_obligation");
    expect(rows[0].body).toContain("45%");
    expect(rows[0].payload.interestRate).toBe(45);
  });
  it("no alerta con tasa 9.9, sin tasa, saldo 0, o inactiva", () => {
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 9.9 })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: null })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 20, pendingAmount: 0 })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 20, status: "settled" })])).toHaveLength(0);
  });
});

describe("buildLowBalanceAlerts", () => {
  it("alerta bajo el umbral (10% de apertura, minimo 50)", () => {
    const rows = buildLowBalanceAlerts([cuenta({ currentBalance: 80 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("low_balance");
    expect(rows[0].payload.threshold).toBe(100); // 10% de 1000
    expect(rows[0].body).toContain("80.00");
  });
  it("umbral minimo de 50 cuando la apertura es chica", () => {
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 100, currentBalance: 30 })])).toHaveLength(1);
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 100, currentBalance: 60 })])).toHaveLength(0);
  });
  it("no alerta sobre umbral, saldo <=0, apertura <=0, tipo credito, o archivada", () => {
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: 150 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: 0 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: -20 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 0, currentBalance: 10 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ type: "credit_card", currentBalance: 10 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ isArchived: true, currentBalance: 10 })])).toHaveLength(0);
  });
});

describe("buildNegativeBalanceAlerts", () => {
  it("alerta con saldo negativo en cuenta no-credito", () => {
    const rows = buildNegativeBalanceAlerts([cuenta({ currentBalance: -120.5 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("negative_balance");
    expect(rows[0].body).toContain("-120.50");
  });
  it("no alerta con saldo >=0, tipo credito, o archivada", () => {
    expect(buildNegativeBalanceAlerts([cuenta({ currentBalance: 0 })])).toHaveLength(0);
    expect(buildNegativeBalanceAlerts([cuenta({ type: "credit_card", currentBalance: -50 })])).toHaveLength(0);
    expect(buildNegativeBalanceAlerts([cuenta({ isArchived: true, currentBalance: -50 })])).toHaveLength(0);
  });
});

describe("buildAccountDormantAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta con 60+ dias sin actividad y saldo distinto de 0 (aplica a cualquier tipo)", () => {
    const rows = buildAccountDormantAlerts([cuenta({ lastActivity: "2026-05-01T12:00:00Z" })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("account_dormant");
    expect(rows[0].payload.daysSince).toBe(70);
  });
  it("no alerta con 59 dias, saldo 0, sin lastActivity, o archivada", () => {
    expect(buildAccountDormantAlerts([cuenta({ lastActivity: "2026-05-12T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ currentBalance: 0, lastActivity: "2026-01-01T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ lastActivity: "" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ isArchived: true, lastActivity: "2026-01-01T12:00:00Z" })], now)).toHaveLength(0);
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar builders** — agregar al final de `alertBuilders.ts` (y `AccountSummary` al import de `types/domain`):

```ts
// Cuentas que representan dinero propio (excluye préstamos/tarjetas).
const NON_LOAN_ACCOUNT_TYPES = new Set(["bank", "cash", "savings", "investment", "other"]);

export function buildHighInterestObligationAlerts(obligations: ObligationSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const ob of obligations) {
    if (ob.status !== "active") continue;
    if (!ob.interestRate || ob.interestRate < 10) continue;
    if (ob.pendingAmount <= 0) continue;

    rows.push({
      kind: "high_interest_obligation",
      title: "Obligación con tasa alta",
      body: `"${ob.title}" tiene tasa del ${ob.interestRate}% con ${ob.pendingAmount} ${ob.currencyCode} pendiente. Considera priorizar este pago.`,
      related_entity_type: "obligation",
      related_entity_id: ob.id,
      payload: { interestRate: ob.interestRate, pendingAmount: ob.pendingAmount },
    });
  }
  return rows;
}

export function buildLowBalanceAlerts(accounts: AccountSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (!NON_LOAN_ACCOUNT_TYPES.has(acc.type)) continue;
    if (acc.currentBalance <= 0) continue; // covered by negative_balance

    // Threshold: 10% of opening balance, minimum 50 units of currency
    const threshold = Math.max(50, Math.abs(acc.openingBalance) * 0.10);
    if (acc.currentBalance < threshold && acc.openingBalance > 0) {
      rows.push({
        kind: "low_balance",
        title: "Saldo bajo en cuenta",
        body: `"${acc.name}" tiene solo ${acc.currentBalance.toFixed(2)} ${acc.currencyCode} disponibles.`,
        related_entity_type: "account",
        related_entity_id: acc.id,
        payload: { currentBalance: acc.currentBalance, threshold },
      });
    }
  }
  return rows;
}

export function buildNegativeBalanceAlerts(accounts: AccountSummary[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (!NON_LOAN_ACCOUNT_TYPES.has(acc.type)) continue;
    if (acc.currentBalance >= 0) continue;

    rows.push({
      kind: "negative_balance",
      title: "Saldo negativo en cuenta",
      body: `"${acc.name}" tiene saldo negativo: ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
      related_entity_type: "account",
      related_entity_id: acc.id,
      payload: { currentBalance: acc.currentBalance },
    });
  }
  return rows;
}

export function buildAccountDormantAlerts(accounts: AccountSummary[], now: Date): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const acc of accounts) {
    if (acc.isArchived) continue;
    if (acc.currentBalance === 0) continue;
    if (!acc.lastActivity) continue;

    const lastAct = new Date(acc.lastActivity);
    const daysSince = daysBetween(lastAct, now);
    if (daysSince >= 60) {
      rows.push({
        kind: "account_dormant",
        title: "Cuenta sin actividad",
        body: `"${acc.name}" lleva ${daysSince} días sin movimientos y tiene saldo de ${acc.currentBalance.toFixed(2)} ${acc.currencyCode}.`,
        related_entity_type: "account",
        related_entity_id: acc.id,
        payload: { daysSince, currentBalance: acc.currentBalance },
      });
    }
  }
  return rows;
}
```

Nota: `account_dormant` NO filtra por tipo de cuenta — así está en el hook original; preservar.

- [x] **Step 4: Wiring en el hook** — agregar los 4 builders al import; reemplazar los bloques `// ── 9.` a `// ── 12.` completos (incluyendo `const nonLoanTypes = ...` de la sección 10) por:

```ts
  // ── 9. High-interest obligation ───────────────────────────────────────────
  pushAlerts(buildHighInterestObligationAlerts(snapshot.obligations));

  // ── 10. Low balance ───────────────────────────────────────────────────────
  pushAlerts(buildLowBalanceAlerts(snapshot.accounts));

  // ── 11. Negative balance ──────────────────────────────────────────────────
  pushAlerts(buildNegativeBalanceAlerts(snapshot.accounts));

  // ── 12. Account dormant ───────────────────────────────────────────────────
  pushAlerts(buildAccountDormantAlerts(snapshot.accounts, now));
```

Además, eliminar la función `daysBetween` del hook (líneas 116–118 del archivo original) — su último uso inline desaparece con este lote.

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 3 - builders de tasa alta y salud de cuentas"
```

---

### Task 4: Lote 4 — Agregados mensuales puros + ingresos/gastos del mes

Extrae el bloque de agregados mensuales (líneas 311–364 del hook original: totales por mes, mapas por categoría y top category del mes cerrado) como `computeMonthlyMovementAggregates`, y migra las secciones 13–14: `no_income_month`, `high_expense_month`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar bloque de agregados + secciones `// ── 13.` y `// ── 14.`; eliminar helpers de fecha `startOfMonth`, `startOfLastMonth`, `endOfLastMonth`, `startOfPrevMonth`, `endOfPrevMonth`)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final (y `computeMonthlyMovementAggregates`, `buildNoIncomeMonthAlert`, `buildHighExpenseMonthAlert` al import):

```ts
const mvIn = (id: number, occurredAt: string, categoryId: number, destinationAmount: number) =>
  ({ id, categoryId, occurredAt, sourceAmount: null, destinationAmount }) as any;

describe("computeMonthlyMovementAggregates", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  const kinds = new Map([[10, "expense"], [11, "expense"], [20, "income"], [30, "transfer"]]);
  const nombres = new Map([[10, "Comida"], [11, "Transporte"], [20, "Sueldo"]]);
  it("separa este mes, mes pasado y mes anterior, ignorando transferencias", () => {
    const agg = computeMonthlyMovementAggregates(
      [
        mv(1, "2026-07-02T10:00:00Z", 10, 100),
        mvIn(2, "2026-07-05T10:00:00Z", 20, 3000),
        mv(3, "2026-06-15T10:00:00Z", 10, 400),
        mv(4, "2026-06-20T10:00:00Z", 11, 150),
        mvIn(5, "2026-06-28T10:00:00Z", 20, 2800),
        mv(6, "2026-05-10T10:00:00Z", 10, 900),
        mv(7, "2026-07-03T10:00:00Z", 30, 999), // transfer: fuera
        mv(8, "2026-07-04T10:00:00Z", 99, 777), // categoria desconocida: fuera
      ],
      kinds, nombres, now,
    );
    expect(agg.thisMonthExpenses).toBe(100);
    expect(agg.thisMonthIncome).toBe(3000);
    expect(agg.lastMonthExpenses).toBe(550);
    expect(agg.lastMonthIncome).toBe(2800);
    expect(agg.prevMonthExpenses).toBe(900);
    expect(agg.thisMonthByCategory.get(10)).toBe(100);
    expect(agg.lastMonthByCategory.get(11)).toBe(150);
    expect(agg.lastMonthTopCategoryName).toBe("Comida"); // 400 > 150
  });
  it("sin movimientos devuelve todo en cero y sin top category", () => {
    const agg = computeMonthlyMovementAggregates([], kinds, nombres, now);
    expect(agg.thisMonthExpenses).toBe(0);
    expect(agg.lastMonthIncome).toBe(0);
    expect(agg.lastMonthTopCategoryName).toBeNull();
  });
});

describe("buildNoIncomeMonthAlert", () => {
  it("alerta desde el dia 15 sin ingresos en el mes", () => {
    const row = buildNoIncomeMonthAlert(0, 7, new Date("2026-07-15T12:00:00Z"));
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("no_income_month");
    expect(row!.related_entity_id).toBe(7);
    expect(row!.payload.dayOfMonth).toBe(15);
  });
  it("null antes del dia 15 o si hay ingresos", () => {
    expect(buildNoIncomeMonthAlert(0, 7, new Date("2026-07-14T12:00:00Z"))).toBeNull();
    expect(buildNoIncomeMonthAlert(100, 7, new Date("2026-07-20T12:00:00Z"))).toBeNull();
  });
});

describe("buildHighExpenseMonthAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando el gasto supera al mes pasado en mas de 30% (desde el dia 7)", () => {
    const row = buildHighExpenseMonthAlert({ thisMonthExpenses: 1400, lastMonthExpenses: 1000 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("high_expense_month");
    expect(row!.body).toContain("40%");
  });
  it("null con subida de exactamente 30%, antes del dia 7, o sin base del mes pasado", () => {
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 1300, lastMonthExpenses: 1000 }, 7, now)).toBeNull();
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 2000, lastMonthExpenses: 1000 }, 7, new Date("2026-07-06T12:00:00Z"))).toBeNull();
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 2000, lastMonthExpenses: 0 }, 7, now)).toBeNull();
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar** — agregar al final de `alertBuilders.ts`:

```ts
// ─── Agregados mensuales (una pasada sobre los movimientos del snapshot) ────

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 1);
const endOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
const startOfPrevMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 2, 1);
const endOfPrevMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 0, 23, 59, 59, 999);

export type MonthlyMovementAggregates = {
  thisMonthExpenses: number;
  thisMonthIncome: number;
  lastMonthExpenses: number;
  lastMonthIncome: number;
  prevMonthExpenses: number;
  thisMonthByCategory: Map<number, number>;
  lastMonthByCategory: Map<number, number>;
  lastMonthTopCategoryName: string | null;
};

export function computeMonthlyMovementAggregates(
  movements: CategoryPostedMovement[],
  categoryKinds: Map<number, string>,
  categoryNames: Map<number, string>,
  now: Date,
): MonthlyMovementAggregates {
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfLastMonth(now);
  const lastMonthEnd = endOfLastMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  const prevMonthEnd = endOfPrevMonth(now);

  let thisMonthExpenses = 0;
  let thisMonthIncome = 0;
  let lastMonthExpenses = 0;
  let lastMonthIncome = 0;
  let prevMonthExpenses = 0;

  const thisMonthByCategory = new Map<number, number>();
  const lastMonthByCategory = new Map<number, number>();

  for (const m of movements) {
    const d = new Date(m.occurredAt);
    const kind = categoryKinds.get(m.categoryId);
    if (!kind || kind === "transfer") continue;

    if (d >= thisMonthStart) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        thisMonthExpenses += amt;
        thisMonthByCategory.set(m.categoryId, (thisMonthByCategory.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        thisMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= lastMonthStart && d <= lastMonthEnd) {
      if (kind === "expense") {
        const amt = m.sourceAmount ?? 0;
        lastMonthExpenses += amt;
        lastMonthByCategory.set(m.categoryId, (lastMonthByCategory.get(m.categoryId) ?? 0) + amt);
      } else if (kind === "income") {
        lastMonthIncome += m.destinationAmount ?? 0;
      }
    } else if (d >= prevMonthStart && d <= prevMonthEnd) {
      if (kind === "expense") {
        prevMonthExpenses += m.sourceAmount ?? 0;
      }
    }
  }

  let lastMonthTopCategoryName: string | null = null;
  let lastMonthTopAmount = 0;
  for (const [catId, amt] of lastMonthByCategory) {
    if (amt > lastMonthTopAmount) {
      lastMonthTopAmount = amt;
      lastMonthTopCategoryName = categoryNames.get(catId) ?? null;
    }
  }

  return {
    thisMonthExpenses,
    thisMonthIncome,
    lastMonthExpenses,
    lastMonthIncome,
    prevMonthExpenses,
    thisMonthByCategory,
    lastMonthByCategory,
    lastMonthTopCategoryName,
  };
}

export function buildNoIncomeMonthAlert(
  thisMonthIncome: number,
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (now.getDate() < 15 || thisMonthIncome !== 0) return null;
  return {
    kind: "no_income_month",
    title: "Sin ingresos registrados este mes",
    body: "No se ha registrado ningún ingreso en lo que va del mes. Recuerda mantener tus movimientos actualizados.",
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { dayOfMonth: now.getDate() },
  };
}

export function buildHighExpenseMonthAlert(
  input: { thisMonthExpenses: number; lastMonthExpenses: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (input.lastMonthExpenses <= 0 || input.thisMonthExpenses <= 0) return null;
  const ratio = input.thisMonthExpenses / input.lastMonthExpenses;
  if (ratio <= 1.3 || now.getDate() < 7) return null;
  const pct = Math.round((ratio - 1) * 100);
  return {
    kind: "high_expense_month",
    title: "Gastos elevados este mes",
    body: `Tus gastos este mes ya superan los del mes pasado en un ${pct}%.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { thisMonth: input.thisMonthExpenses, lastMonth: input.lastMonthExpenses, ratio },
  };
}
```

- [x] **Step 4: Wiring en el hook** —

1. Agregar `computeMonthlyMovementAggregates`, `buildNoIncomeMonthAlert`, `buildHighExpenseMonthAlert` al import.
2. Reemplazar TODO el bloque `// ── Monthly movement aggregates ──` (desde `const thisMonthStart = ...` hasta el cierre del `for` de top category, líneas 311–364 del archivo original) por un destructure que CONSERVA los nombres de variables que usan las secciones aún inline (15–19) y el recap:

```ts
  // ── Monthly movement aggregates (builder puro) ───────────────────────────
  const {
    thisMonthExpenses,
    thisMonthIncome,
    lastMonthExpenses,
    lastMonthIncome,
    prevMonthExpenses,
    thisMonthByCategory: thisMonthByCat,
    lastMonthByCategory: lastMonthByCat,
    lastMonthTopCategoryName: lastMonthTopCategory,
  } = computeMonthlyMovementAggregates(
    snapshot.categoryPostedMovements,
    categoryKindMap,
    categoryNameMap,
    now,
  );
```

3. Reemplazar las secciones `// ── 13.` y `// ── 14.` por:

```ts
  // ── 13. No income this month (after day 15) ───────────────────────────────
  pushAlerts(buildNoIncomeMonthAlert(thisMonthIncome, workspaceId, now));

  // ── 14. High expense month (30%+ vs last month) ───────────────────────────
  pushAlerts(buildHighExpenseMonthAlert({ thisMonthExpenses, lastMonthExpenses }, workspaceId, now));
```

4. Eliminar del hook los helpers de fecha ya sin uso: `startOfMonth`, `startOfLastMonth`, `endOfLastMonth`, `startOfPrevMonth`, `endOfPrevMonth` (líneas 96–114 del archivo original). `usageDateInLima` SE QUEDA (lo usa `todayKey`/`existingSet`).

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 4 - agregados mensuales puros + alertas de ingresos y gastos del mes"
```

---

### Task 5: Lote 5 — Spike de categoría, desbalance y patrimonio

Migra las secciones 15–17: `category_spending_spike`, `expense_income_imbalance`, `net_worth_negative`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar secciones `// ── 15.` a `// ── 17.`)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final (y los 3 nombres al import):

```ts
describe("buildCategorySpendingSpikeAlerts", () => {
  it("alerta cuando una categoria sube mas de 50% con gasto > 50", () => {
    const rows = buildCategorySpendingSpikeAlerts(
      new Map([[10, 160]]), new Map([[10, 100]]), new Map([[10, "Comida"]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("category_spending_spike");
    expect(rows[0].related_entity_id).toBe(10);
    expect(rows[0].title).toBe('Gasto elevado en "Comida"');
    expect(rows[0].body).toContain("60% más");
    expect(rows[0].payload.categoryName).toBe("Comida");
  });
  it("no alerta con subida de exactamente 50%, monto <=50, o sin base del mes pasado", () => {
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 150]]), new Map([[10, 100]]), new Map())).toHaveLength(0);
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 45]]), new Map([[10, 20]]), new Map())).toHaveLength(0);
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 300]]), new Map(), new Map())).toHaveLength(0);
  });
});

describe("buildExpenseIncomeImbalanceAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando los gastos superan 85% de los ingresos (desde el dia 10)", () => {
    const row = buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 1000 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("expense_income_imbalance");
    expect(row!.body).toContain("90%");
  });
  it("null con 85% exacto, antes del dia 10, o sin ingresos", () => {
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 850, thisMonthIncome: 1000 }, 7, now)).toBeNull();
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 1000 }, 7, new Date("2026-07-09T12:00:00Z"))).toBeNull();
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 0 }, 7, now)).toBeNull();
  });
});

describe("buildNetWorthNegativeAlert", () => {
  it("alerta cuando la suma en moneda base es negativa (incluye prestamos)", () => {
    const row = buildNetWorthNegativeAlert(
      [
        cuenta({ currentBalance: 500, currentBalanceInBaseCurrency: 500 }),
        cuenta({ id: 13, type: "loan", currentBalance: -3000, currentBalanceInBaseCurrency: -800 }),
      ],
      1,
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("net_worth_negative");
    expect(row!.payload.netWorth).toBe(-300);
    expect(row!.body).toContain("-300.00");
  });
  it("usa currentBalance como fallback sin valor en moneda base", () => {
    const row = buildNetWorthNegativeAlert([cuenta({ currentBalance: -100, currentBalanceInBaseCurrency: null })], 1);
    expect(row!.payload.netWorth).toBe(-100);
  });
  it("null con patrimonio >=0; ignora archivadas y excluidas del net worth", () => {
    expect(buildNetWorthNegativeAlert([cuenta({ currentBalanceInBaseCurrency: 100 })], 1)).toBeNull();
    expect(
      buildNetWorthNegativeAlert(
        [
          cuenta({ currentBalanceInBaseCurrency: 100 }),
          cuenta({ id: 14, isArchived: true, currentBalanceInBaseCurrency: -900 }),
          cuenta({ id: 15, includeInNetWorth: false, currentBalanceInBaseCurrency: -900 }),
        ],
        1,
      ),
    ).toBeNull();
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar builders** — agregar al final de `alertBuilders.ts`:

```ts
export function buildCategorySpendingSpikeAlerts(
  thisMonthByCategory: Map<number, number>,
  lastMonthByCategory: Map<number, number>,
  categoryNames: Map<number, string>,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const [catId, thisAmt] of thisMonthByCategory) {
    const lastAmt = lastMonthByCategory.get(catId) ?? 0;
    if (lastAmt <= 0) continue; // need baseline
    const ratio = thisAmt / lastAmt;
    // Only alert on meaningful amounts and significant spikes
    if (ratio > 1.5 && thisAmt > 50) {
      const catName = categoryNames.get(catId) ?? "Categoría";
      const pct = Math.round((ratio - 1) * 100);
      rows.push({
        kind: "category_spending_spike",
        title: `Gasto elevado en "${catName}"`,
        body: `Has gastado ${pct}% más en "${catName}" este mes comparado con el mes pasado.`,
        related_entity_type: "category",
        related_entity_id: catId,
        payload: { thisMonth: thisAmt, lastMonth: lastAmt, ratio, categoryName: catName },
      });
    }
  }
  return rows;
}

export function buildExpenseIncomeImbalanceAlert(
  input: { thisMonthExpenses: number; thisMonthIncome: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (input.thisMonthIncome <= 0 || input.thisMonthExpenses <= 0) return null;
  const ratio = input.thisMonthExpenses / input.thisMonthIncome;
  if (ratio <= 0.85 || now.getDate() < 10) return null;
  const pct = Math.round(ratio * 100);
  return {
    kind: "expense_income_imbalance",
    title: "Gastos cerca del total de ingresos",
    body: `Este mes tus gastos representan el ${pct}% de tus ingresos. Queda poco margen de ahorro.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { expenses: input.thisMonthExpenses, income: input.thisMonthIncome, ratio },
  };
}

export function buildNetWorthNegativeAlert(
  accounts: AccountSummary[],
  workspaceId: number,
): AlertRow | null {
  const netWorth = accounts
    .filter((a) => !a.isArchived && a.includeInNetWorth)
    .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);

  if (netWorth >= 0) return null;
  return {
    kind: "net_worth_negative",
    title: "Patrimonio neto negativo",
    body: `Tu patrimonio neto total es negativo (${netWorth.toFixed(2)}). Tus deudas superan tus activos.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { netWorth },
  };
}
```

- [x] **Step 4: Wiring en el hook** — agregar los 3 builders al import; reemplazar los bloques `// ── 15.` a `// ── 17.` completos (incluyendo el cálculo `const netWorth = ...`) por:

```ts
  // ── 15. Category spending spike (50%+ vs last month) ──────────────────────
  pushAlerts(buildCategorySpendingSpikeAlerts(thisMonthByCat, lastMonthByCat, categoryNameMap));

  // ── 16. Expense/income imbalance ──────────────────────────────────────────
  pushAlerts(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses, thisMonthIncome }, workspaceId, now));

  // ── 17. Net worth negative ────────────────────────────────────────────────
  pushAlerts(buildNetWorthNegativeAlert(snapshot.accounts, workspaceId));
```

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 5 - builders de spike de categoria, desbalance y patrimonio"
```

---

### Task 6: Lote 6 — Analíticas avanzadas y semana sin movimientos

Migra las secciones 18–21: `savings_rate_low`, `subscription_cost_heavy`, `upcoming_annual_subscription`, `no_movements_week`.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar secciones `// ── 18.` a `// ── 21.`)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final (y los 4 nombres al import):

```ts
describe("buildSavingsRateLowAlert", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  it("alerta con tasa de ahorro bajo 10% desde el dia 20", () => {
    const row = buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 950 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("savings_rate_low");
    expect(row!.body).toContain("5%");
  });
  it("null con tasa de exactamente 10%, tasa negativa, o antes del dia 20", () => {
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 900 }, 7, now)).toBeNull();
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 1100 }, 7, now)).toBeNull();
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 950 }, 7, new Date("2026-07-19T12:00:00Z"))).toBeNull();
  });
});

describe("buildSubscriptionCostHeavyAlert", () => {
  it("alerta cuando el costo mensualizado supera 30% del ingreso del mes pasado", () => {
    const row = buildSubscriptionCostHeavyAlert([sub({ amount: 350, frequency: "monthly" })], 1000, 7);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("subscription_cost_heavy");
    expect(row!.body).toContain("35%");
    expect(row!.payload.subCount).toBe(1);
  });
  it("mensualiza anuales, trimestrales, semanales y diarias", () => {
    const row = buildSubscriptionCostHeavyAlert(
      [
        sub({ id: 1, amount: 1200, frequency: "yearly" }),   // 100/mes
        sub({ id: 2, amount: 300, frequency: "quarterly" }), // 100/mes
        sub({ id: 3, amount: 23.1, frequency: "weekly" }),   // ~100/mes (x4.33)
        sub({ id: 4, amount: 2, frequency: "daily" }),       // 60/mes (x30)
      ],
      1000, 7,
    );
    expect(row).not.toBeNull();
    expect(row!.payload.monthlySubCost as number).toBeCloseTo(360, 0);
  });
  it("null con 30% exacto, sin subs activas, o sin ingreso del mes pasado", () => {
    expect(buildSubscriptionCostHeavyAlert([sub({ amount: 300, frequency: "monthly" })], 1000, 7)).toBeNull();
    expect(buildSubscriptionCostHeavyAlert([sub({ status: "paused", amount: 900, frequency: "monthly" })], 1000, 7)).toBeNull();
    expect(buildSubscriptionCostHeavyAlert([sub({ amount: 900, frequency: "monthly" })], 0, 7)).toBeNull();
  });
});

describe("buildUpcomingAnnualSubscriptionAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta para renovacion anual entre 14 y 30 dias", () => {
    const rows = buildUpcomingAnnualSubscriptionAlerts(
      [sub({ frequency: "yearly", nextDueDate: "2026-07-30", amount: 120 })], days,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("upcoming_annual_subscription");
    expect(rows[0].payload.diffDays).toBe(20);
    expect(rows[0].body).toContain("120"); // monto; la fecha localizada no se fija (depende del ICU)
  });
  it("no alerta a 13 o 31 dias, ni para frecuencia mensual", () => {
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "yearly", nextDueDate: "2026-07-23" })], days)).toHaveLength(0);
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "yearly", nextDueDate: "2026-08-10" })], days)).toHaveLength(0);
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "monthly", nextDueDate: "2026-07-30" })], days)).toHaveLength(0);
  });
});

describe("buildNoMovementsWeekAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta sin movimientos en 7 dias pero con actividad la semana previa", () => {
    const row = buildNoMovementsWeekAlert([mv(1, "2026-06-30T10:00:00Z", 10, 50)], 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("no_movements_week");
    expect(row!.related_entity_id).toBe(7);
    expect(row!.payload.daysSinceLastMovement).toBe(7);
  });
  it("null si hay movimientos recientes o si tampoco hubo actividad previa", () => {
    expect(buildNoMovementsWeekAlert([mv(1, "2026-07-08T10:00:00Z", 10, 50)], 7, now)).toBeNull();
    expect(buildNoMovementsWeekAlert([], 7, now)).toBeNull();
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar builders** — agregar al final de `alertBuilders.ts`:

```ts
export function buildSavingsRateLowAlert(
  input: { thisMonthIncome: number; thisMonthExpenses: number },
  workspaceId: number,
  now: Date,
): AlertRow | null {
  if (now.getDate() < 20 || input.thisMonthIncome <= 0 || input.thisMonthExpenses <= 0) return null;
  const savingsRate = (input.thisMonthIncome - input.thisMonthExpenses) / input.thisMonthIncome;
  if (savingsRate < 0 || savingsRate >= 0.10) return null;
  const pct = Math.round(savingsRate * 100);
  return {
    kind: "savings_rate_low",
    title: "Tasa de ahorro muy baja",
    body: `Solo estás ahorrando el ${pct}% de tus ingresos este mes. Intenta reducir gastos variables para mejorar tu margen.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { savingsRate, income: input.thisMonthIncome, expenses: input.thisMonthExpenses },
  };
}

export function buildSubscriptionCostHeavyAlert(
  subscriptions: SubscriptionSummary[],
  lastMonthIncome: number,
  workspaceId: number,
): AlertRow | null {
  if (lastMonthIncome <= 0) return null;
  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const monthlySubCost = activeSubs.reduce((sum, s) => {
    const monthly =
      s.frequency === "yearly" ? s.amount / 12
      : s.frequency === "quarterly" ? s.amount / 3
      : s.frequency === "weekly" ? s.amount * 4.33
      : s.frequency === "daily" ? s.amount * 30
      : s.amount;
    return sum + monthly;
  }, 0);
  const ratio = monthlySubCost / lastMonthIncome;
  if (ratio <= 0.30 || activeSubs.length === 0) return null;
  const pct = Math.round(ratio * 100);
  return {
    kind: "subscription_cost_heavy",
    title: "Suscripciones consumen mucho de tus ingresos",
    body: `Tus suscripciones activas equivalen al ${pct}% de tus ingresos del mes pasado. Revisa cuáles realmente usas.`,
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { monthlySubCost, ratio, subCount: activeSubs.length },
  };
}

export function buildUpcomingAnnualSubscriptionAlerts(
  subscriptions: SubscriptionSummary[],
  daysFromToday: DaysFromToday,
): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    if (sub.frequency !== "yearly") continue;
    const diffDays = daysFromToday(sub.nextDueDate);
    if (diffDays >= 14 && diffDays <= 30) {
      const parts = sub.nextDueDate.split("-").map(Number);
      const dueDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(sub.nextDueDate);
      rows.push({
        kind: "upcoming_annual_subscription",
        title: "Renovación anual próxima",
        body: `"${sub.name}" se renueva en ${diffDays} días (${dueDate.toLocaleDateString("es", { day: "numeric", month: "long" })}). Monto: ${sub.amount} ${sub.currencyCode}.`,
        related_entity_type: "subscription",
        related_entity_id: sub.id,
        payload: { diffDays, amount: sub.amount, nextDueDate: sub.nextDueDate },
      });
    }
  }
  return rows;
}

export function buildNoMovementsWeekAlert(
  movements: CategoryPostedMovement[],
  workspaceId: number,
  now: Date,
): AlertRow | null {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const veryRecentMvts = movements.filter((m) => new Date(m.occurredAt) >= sevenDaysAgo);
  const priorWeekMvts = movements.filter((m) => {
    const d = new Date(m.occurredAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });
  if (veryRecentMvts.length !== 0 || priorWeekMvts.length === 0) return null;
  return {
    kind: "no_movements_week",
    title: "Sin movimientos esta semana",
    body: "No has registrado movimientos en los últimos 7 días. ¿Olvidaste registrar tus gastos e ingresos?",
    related_entity_type: "workspace",
    related_entity_id: workspaceId,
    payload: { daysSinceLastMovement: 7 },
  };
}
```

Nota: `buildNoMovementsWeekAlert` cuenta TODOS los `categoryPostedMovements` (incluye transferencias) — así está en el hook original; preservar.

- [x] **Step 4: Wiring en el hook** — agregar los 4 builders al import; reemplazar los bloques `// ── 18.` a `// ── 21.` completos (incluyendo `const sevenDaysAgo = ...` etc.) por:

```ts
  // ── 18. Savings rate low (after day 20) ──────────────────────────────────
  pushAlerts(buildSavingsRateLowAlert({ thisMonthIncome, thisMonthExpenses }, workspaceId, now));

  // ── 19. Subscriptions cost heavy (> 30% of last month income) ────────────
  pushAlerts(buildSubscriptionCostHeavyAlert(snapshot.subscriptions, lastMonthIncome, workspaceId));

  // ── 20. Upcoming annual subscription (14–30 days away) ───────────────────
  pushAlerts(buildUpcomingAnnualSubscriptionAlerts(snapshot.subscriptions, calendarDaysFromTodayLocal));

  // ── 21. No movements in last 7 days (but had activity in prior 7 days) ────
  pushAlerts(buildNoMovementsWeekAlert(snapshot.categoryPostedMovements, workspaceId, now));
```

- [x] **Step 5: Validar** — `npx jest __tests__/alert-builders.test.ts` → PASS. `npm run typecheck` → sin errores.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 6 - builders de analiticas avanzadas y semana sin movimientos"
```

---

### Task 7: Lote 7 — Baseline diario puro y limpieza final del hook

Extrae `appendDailyBaselineNotifications` (las 3 alertas diarias `daily_workspace_summary`, `daily_cashflow_check`, `daily_budget_review`) como `buildDailyBaselineAlerts`, y limpia el hook de helpers muertos.

**Files:**
- Modify: `features/notifications/lib/alertBuilders.ts` (agregar al final; importar `getNotificationPriority`)
- Modify: `hooks/useNotificationGenerator.ts` (reemplazar `appendDailyBaselineNotifications` + su llamada; eliminar helpers muertos; actualizar doc comment)
- Test: `__tests__/alert-builders.test.ts` (agregar al final)

- [x] **Step 1: Tests que fallan** — agregar al final (y `buildDailyBaselineAlerts` al import):

```ts
describe("buildDailyBaselineAlerts", () => {
  const base = {
    budgets: [budget()],
    subscriptions: [sub()],
    obligations: [ob()],
    accounts: [cuenta()],
    movementCount: 12,
    todayKey: "2026-07-10",
    workspaceId: 7,
    thisMonthIncome: 2000,
    thisMonthExpenses: 500,
  };
  it("completa hasta 3 informativas cuando no hay ninguna", () => {
    const rows = buildDailyBaselineAlerts({ ...base, existingKinds: [] });
    expect(rows.map((r) => r.kind)).toEqual([
      "daily_workspace_summary",
      "daily_cashflow_check",
      "daily_budget_review",
    ]);
    expect(rows[0].related_entity_id).toBe(202607101); // Number("20260710")*10 + 1
    expect(rows[1].related_entity_id).toBe(202607102);
    expect(rows[1].body).toContain("25%"); // 500/2000
  });
  it("agrega solo las que faltan; important y critical no cuentan", () => {
    // low_balance = important, negative_balance = critical: no cuentan como informativas
    const rows = buildDailyBaselineAlerts({
      ...base,
      existingKinds: ["monthly_recap", "account_dormant", "low_balance", "negative_balance"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("daily_workspace_summary");
  });
  it("no agrega nada con 3 informativas", () => {
    expect(
      buildDailyBaselineAlerts({ ...base, existingKinds: ["monthly_recap", "account_dormant", "no_movements_week"] }),
    ).toHaveLength(0);
  });
  it("cuerpos alternos sin ingresos y sin presupuestos activos", () => {
    const rows = buildDailyBaselineAlerts({
      ...base,
      thisMonthIncome: 0,
      budgets: [budget({ isActive: false })],
      existingKinds: [],
    });
    expect(rows[1].body).toContain("Todavía no hay ingresos");
    expect(rows[2].body).toContain("Aún no tienes presupuestos");
  });
});
```

- [x] **Step 2: Correr y ver fallar** — `npx jest __tests__/alert-builders.test.ts` → FAIL.

- [x] **Step 3: Implementar builder** — en `alertBuilders.ts`, agregar el import (arriba, junto al import de tipos):

```ts
import { getNotificationPriority } from "../../../lib/notification-priority";
```

y al final del archivo:

```ts
// ─── Baseline diario: completa hasta 3 informativas por día ─────────────────

const DAILY_INFORMATIONAL_MINIMUM = 3;

const dailyBaselineEntityId = (dayKey: string, index: number): number =>
  Number(dayKey.replace(/-/g, "")) * 10 + index + 1;

const countLabel = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

export function buildDailyBaselineAlerts(input: {
  existingKinds: string[];
  budgets: BudgetOverview[];
  subscriptions: SubscriptionSummary[];
  obligations: ObligationSummary[];
  accounts: AccountSummary[];
  movementCount: number;
  todayKey: string;
  workspaceId: number;
  thisMonthIncome: number;
  thisMonthExpenses: number;
}): AlertRow[] {
  const informationalCount = input.existingKinds.filter(
    (kind) => getNotificationPriority(kind) === "informational",
  ).length;
  const missingCount = DAILY_INFORMATIONAL_MINIMUM - informationalCount;
  if (missingCount <= 0) return [];

  const activeBudgetCount = input.budgets.filter((budget) => budget.isActive).length;
  const activeSubscriptionCount = input.subscriptions.filter((sub) => sub.status === "active").length;
  const activeObligationCount = input.obligations.filter((obligation) => obligation.status === "active").length;
  const openAccountCount = input.accounts.filter((account) => !account.isArchived).length;
  const expenseIncomeRatio = input.thisMonthIncome > 0
    ? Math.round((input.thisMonthExpenses / input.thisMonthIncome) * 100)
    : null;

  const baselineRows: AlertRow[] = [
    {
      kind: "daily_workspace_summary",
      title: "Resumen financiero del día",
      body: `Tu workspace tiene ${countLabel(openAccountCount, "cuenta activa", "cuentas activas")}, ${countLabel(activeBudgetCount, "presupuesto", "presupuestos")} y ${countLabel(input.movementCount, "movimiento registrado", "movimientos registrados")}.`,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 0),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        accountCount: openAccountCount,
        budgetCount: activeBudgetCount,
        movementCount: input.movementCount,
      },
    },
    {
      kind: "daily_cashflow_check",
      title: "Chequeo de flujo",
      body: expenseIncomeRatio === null
        ? "Todavía no hay ingresos suficientes este mes para calcular tu margen. Mantén tus movimientos al día."
        : `Este mes tus gastos representan el ${expenseIncomeRatio}% de tus ingresos registrados.`,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 1),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        income: input.thisMonthIncome,
        expenses: input.thisMonthExpenses,
        expenseIncomeRatio,
      },
    },
    {
      kind: "daily_budget_review",
      title: "Revisión diaria",
      body: activeBudgetCount > 0
        ? `Tienes ${countLabel(activeBudgetCount, "presupuesto", "presupuestos")}, ${countLabel(activeSubscriptionCount, "suscripción", "suscripciones")} y ${countLabel(activeObligationCount, "obligación activa", "obligaciones activas")} para revisar.`
        : "Aún no tienes presupuestos activos. Crea uno para recibir alertas más precisas sobre tus gastos.",
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(input.todayKey, 2),
      payload: {
        workspaceId: input.workspaceId,
        todayKey: input.todayKey,
        budgetCount: activeBudgetCount,
        subscriptionCount: activeSubscriptionCount,
        obligationCount: activeObligationCount,
      },
    },
  ];

  return baselineRows.slice(0, missingCount);
}
```

- [x] **Step 4: Wiring y limpieza en el hook** —

1. Agregar `buildDailyBaselineAlerts` al import de alertBuilders.
2. Reemplazar la llamada `appendDailyBaselineNotifications({ ... })` por:

```ts
  pushAlerts(
    buildDailyBaselineAlerts({
      existingKinds: rows.map((row) => row.kind),
      budgets: snapshot.budgets,
      subscriptions: snapshot.subscriptions,
      obligations: snapshot.obligations,
      accounts: snapshot.accounts,
      movementCount: snapshot.categoryPostedMovements.length,
      todayKey,
      workspaceId,
      thisMonthIncome,
      thisMonthExpenses,
    }),
  );
```

3. Eliminar del hook: la función `appendDailyBaselineNotifications` completa, `dailyBaselineEntityId`, `countLabel`, la constante `DAILY_INFORMATIONAL_MINIMUM`, y el import de `getNotificationPriority` (ya sin usos en el hook).
4. Reemplazar el doc comment del encabezado del hook (el bloque `/** ... */` con la lista kind-por-kind, líneas 1–51 del archivo original) por:

```ts
/**
 * useNotificationGenerator
 *
 * Genera notificaciones in-app en la tabla `notifications` basándose en el
 * estado actual del workspace. Se ejecuta cuando el snapshot o el día cambian
 * y el usuario tiene sesión activa. Es idempotente: consulta existentes y usa
 * el índice único de notifications para evitar duplicados.
 *
 * Las reglas de detección viven como builders puros (testeados) en
 * `features/notifications/lib/alertBuilders.ts`; este hook solo orquesta:
 * fingerprint del snapshot, ejecución diferida, idempotencia (existingSet +
 * upsert ignoreDuplicates) y cleanup por vigencia (ALL_KINDS).
 */
```

5. Verificar que NO queden helpers muertos: `usageDateInLima`, `ALL_KINDS`, `cleanupStaleNotifications`, `toNotificationRow`, `pushAlerts` y el hook en sí SE QUEDAN.

- [x] **Step 5: Validar (suite completa)** — `npx jest` → TODOS los tests PASS. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [x] **Step 6: Commit**

```bash
git add features/notifications/lib/alertBuilders.ts hooks/useNotificationGenerator.ts __tests__/alert-builders.test.ts
git commit -m "refactor(notifications): lote 7 - baseline diario puro y limpieza del hook generador"
```

---

## Verificación final (después del Task 7)

- [x] `npx jest` → suite completa verde.
- [x] `npm run typecheck` → sin errores.
- [x] `git diff --check` → limpio.
- [x] Confirmar cobertura: los 20 kinds legacy + 3 diarios tienen builder y tests: `budget_alert`, `budget_period_ending`, `subscription_reminder`, `subscription_overdue`, `multiple_subscriptions_due`, `obligation_due`, `obligation_overdue`, `obligation_no_payment`, `multiple_obligations_overdue`, `high_interest_obligation`, `low_balance`, `negative_balance`, `account_dormant`, `no_income_month`, `high_expense_month`, `category_spending_spike`, `expense_income_imbalance`, `net_worth_negative`, `savings_rate_low`, `subscription_cost_heavy`, `upcoming_annual_subscription`, `no_movements_week`, `daily_workspace_summary`/`daily_cashflow_check`/`daily_budget_review` (baseline).
- [x] Confirmar que el hook NO perdió: fingerprint, `InteractionManager`, `existingSet`, upsert `ignoreDuplicates`, `cleanupStaleNotifications`, `ALL_KINDS`, query de suggestions pendientes, sección "Kinds nuevos".
- [x] **NO publicar OTA** — preguntar al usuario primero.
