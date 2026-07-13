# Notificaciones útiles al tocarlas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que tocar cualquier notificación muestre por qué te llevó ahí y qué hacer — spec en `docs/superpowers/specs/2026-07-13-notificaciones-utiles-design.md`.

**Architecture:** Todo el ruteo pasa por `resolveNotificationNavigationTarget` (lib/notification-navigation.ts), consumido por la bandeja (`app/notifications.tsx:472`) y por los callbacks de push en `app/_layout.tsx` (algunos hoy lo bypasean — se unifican). Tres mecanismos: M1 sheet del día en dashboard (params `daySheet`/`daySheetToken`), M2 nota del porqué (builder puro `reason-labels` + hook `useNotificationReason` + `ResourceContextNote` en listas / `NotificationReasonBanner` en detalles), M3 destinos específicos (presupuesto puntual).

**Tech Stack:** React Native/Expo, expo-router (`useLocalSearchParams`), React Query, jest (tests puros en `__tests__/`).

**Reglas de la casa:** tokens de `constants/theme.ts`, sin hex inline; validar cada task con `npx jest` + `npm run typecheck` + `git diff --check`; NO stagear `.claude/settings.local.json` ni `.env.example`; commits con scope.

---

## FASE 1 — Familia diaria (bug reportado)

### Task 1: Builder puro `reason-labels` (tabla completa) + tests

**Files:**
- Create: `features/notifications/lib/reason-labels.ts`
- Test: `__tests__/reason-labels.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// __tests__/reason-labels.test.ts
import { buildNotificationReason } from "../features/notifications/lib/reason-labels";

describe("buildNotificationReason", () => {
  test("budget_alert interpola usedPercent", () => {
    expect(buildNotificationReason("budget_alert", { usedPercent: 92.4 }))
      .toBe("Este presupuesto va en 92% de su límite — revisa qué lo está empujando.");
  });
  test("budget_alert sin payload usa fallback", () => {
    expect(buildNotificationReason("budget_alert", null))
      .toBe("Este presupuesto está cerca de su límite — revisa qué lo está empujando.");
  });
  test("kinds estáticos devuelven texto accionable", () => {
    expect(buildNotificationReason("obligation_overdue", null))
      .toBe("Esta deuda está vencida — registra el pago o renegocia la fecha.");
    expect(buildNotificationReason("daily_budget_review", null))
      .toBe("Revisión diaria: mira el avance de tus presupuestos y ajusta lo que se esté pasando.");
    expect(buildNotificationReason("low_balance", null))
      .toBe("Esta cuenta quedó con saldo bajo — considera moverle fondos.");
  });
  test("kind sin texto devuelve null", () => {
    expect(buildNotificationReason("monthly_recap", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest __tests__/reason-labels.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implementación**

```ts
// features/notifications/lib/reason-labels.ts

/**
 * Texto accionable que el destino muestra como "por qué llegaste aquí".
 * Un kind sin entrada devuelve null: el tap navega sin nota (p. ej. los
 * quick-links de Movimientos ya explican con su ActiveFilterBar).
 */
const STATIC_REASONS: Record<string, string> = {
  daily_budget_review: "Revisión diaria: mira el avance de tus presupuestos y ajusta lo que se esté pasando.",
  multiple_subscriptions_due: "Tienes varias suscripciones por cobrar pronto — revisa cuáles y su fecha.",
  subscription_cost_heavy: "Tus suscripciones pesan mucho en el gasto del mes — evalúa cancelar o renegociar alguna.",
  multiple_obligations_overdue: "Tienes varias deudas vencidas — prioriza cuál pagar primero.",
  commitments_vs_balance: "Tus compromisos superan tu saldo disponible — revisa qué mover o renegociar.",
  net_worth_negative: "Tu patrimonio neto está en negativo — revisa saldos y deudas por cuenta.",
  cash_runway_alert: "Tu efectivo cubre pocos días de gasto — revisa tus saldos disponibles.",
  recurring_income_reminder: "Un ingreso fijo está por llegar — confírmalo cuando aterrice.",
  expected_income_missed: "Un ingreso esperado no llegó en su fecha — confírmalo o ajusta su calendario.",
  obligation_due: "Esta deuda vence pronto — registra el pago o ajusta la fecha si cambió.",
  obligation_overdue: "Esta deuda está vencida — registra el pago o renegocia la fecha.",
  obligation_no_payment: "Esta deuda lleva tiempo sin pagos — registra un abono o revisa su plan.",
  high_interest_obligation: "Esta deuda tiene interés alto — considera amortizarla antes.",
  obligation_milestone: "Alcanzaste un hito de esta deuda — revisa su avance.",
  low_balance: "Esta cuenta quedó con saldo bajo — considera moverle fondos.",
  negative_balance: "Esta cuenta está en negativo — regulariza el saldo o corrige movimientos.",
  account_dormant: "Esta cuenta lleva semanas sin movimientos — confirma su saldo o archívala.",
  subscription_reminder: "Esta suscripción se cobra pronto — verifica el saldo de la cuenta.",
  subscription_overdue: "El cobro de esta suscripción ya pasó — márcala pagada o ajusta la fecha.",
  upcoming_annual_subscription: "Se acerca el cobro anual de esta suscripción — es un monto grande, prepáralo.",
  subscription_price_increase: "Esta suscripción subió de precio — decide si la mantienes.",
};

export function buildNotificationReason(
  kind: string,
  payload?: Record<string, unknown> | null,
): string | null {
  if (kind === "budget_alert" || kind === "budget_period_ending") {
    const used = Number(payload?.usedPercent);
    const usedLabel = Number.isFinite(used) && used > 0 ? `${Math.round(used)}%` : null;
    if (kind === "budget_alert") {
      return usedLabel
        ? `Este presupuesto va en ${usedLabel} de su límite — revisa qué lo está empujando.`
        : "Este presupuesto está cerca de su límite — revisa qué lo está empujando.";
    }
    return usedLabel
      ? `El período de este presupuesto cierra pronto con ${usedLabel} usado — revisa cómo termina.`
      : "El período de este presupuesto está por cerrar — revisa cómo termina.";
  }
  return STATIC_REASONS[kind] ?? null;
}
```

- [ ] **Step 4: Verificar PASS** — `npx jest __tests__/reason-labels.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add features/notifications/lib/reason-labels.ts __tests__/reason-labels.test.ts
git commit -m "feat(notifications): builder puro de textos del porque por kind"
```

### Task 2: Hook `useNotificationReason`

**Files:**
- Create: `hooks/useNotificationReason.ts`

Sin test jest (usa hooks de RN/expo-router; la lógica de textos ya está testeada en Task 1 y el consumo se valida en smoke).

- [ ] **Step 1: Implementación**

```ts
// hooks/useNotificationReason.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lee `reason`/`reasonToken` que adjunta resolveNotificationNavigationTarget.
 * El token se consume una sola vez (los params persisten en la pantalla:
 * mismo truco que quickToken en Movimientos) y la nota se limpia al salir de
 * la pantalla, para que una visita normal posterior no muestre nota stale.
 */
export function useNotificationReason() {
  const params = useLocalSearchParams<{ reason?: string | string[]; reasonToken?: string | string[] }>();
  const reasonParam = first(params.reason);
  const token = first(params.reasonToken);
  const consumedRef = useRef<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !reasonParam || consumedRef.current === token) return;
    consumedRef.current = token;
    setReason(reasonParam);
  }, [reasonParam, token]);

  useFocusEffect(
    useCallback(() => {
      return () => setReason(null);
    }, []),
  );

  const dismiss = useCallback(() => setReason(null), []);
  return { reason, dismiss };
}
```

- [ ] **Step 2: Validar** — `npm run typecheck` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add hooks/useNotificationReason.ts
git commit -m "feat(notifications): hook useNotificationReason (consumo por token + limpieza al salir)"
```

### Task 3: Resolver — familia diaria + tests

**Files:**
- Modify: `lib/notification-navigation.ts` (bloque `case "daily_digest"...` líneas ~87-92 y helper nuevo)
- Test: `__tests__/notification-navigation.test.ts` (extender)

- [ ] **Step 1: Tests que fallan** — agregar al final del archivo de test:

```ts
describe("familia diaria", () => {
  test("resumen del dia abre dashboard con sheet del dia", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_workspace_summary" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/dashboard");
    expect(t.params.daySheet).toBe("today");
    expect(t.params.daySheetToken).toBeTruthy();
  });
  test("daily_digest y daily_ai_digest igual que el resumen", () => {
    for (const kind of ["daily_digest", "daily_ai_digest"]) {
      const t = resolveNotificationNavigationTarget({ kind }) as { pathname: string };
      expect(t.pathname).toBe("/(app)/dashboard");
    }
  });
  test("chequeo de flujo abre movimientos del mes con etiqueta", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_cashflow_check" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/movements");
    expect(t.params.quickLabel).toBe("Chequeo de flujo del mes");
    expect(t.params.quickDateFrom).toBeTruthy();
  });
  test("revision diaria abre presupuestos con nota", () => {
    const t = resolveNotificationNavigationTarget({ kind: "daily_budget_review" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/budgets");
    expect(t.params.reason).toContain("Revisión diaria");
    expect(t.params.reasonToken).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest __tests__/notification-navigation.test.ts` → FAIL (hoy devuelven `"/(app)/dashboard"` string).

- [ ] **Step 3: Implementar** — en `lib/notification-navigation.ts`:

1. Import arriba: `import { buildNotificationReason } from "../features/notifications/lib/reason-labels";`
2. Helper junto a `movementsQuickLink`:

```ts
/** Adjunta la nota del porqué (M2) a una ruta destino. Token único por tap. */
function withReason(kind: string, payload: NotificationPayload, pathname: string, params: Record<string, string> = {}) {
  const reason = buildNotificationReason(kind, payload ?? null);
  if (!reason) return Object.keys(params).length > 0 ? { pathname, params } : pathname;
  return { pathname, params: { ...params, reason, reasonToken: String(Date.now()) } };
}
```

3. Reemplazar el bloque diario:

```ts
    case "daily_digest":
    case "daily_ai_digest":
    case "daily_workspace_summary":
      // M1: dashboard con el sheet del día abierto (token retrigger, como quickToken).
      return { pathname: "/(app)/dashboard", params: { daySheet: "today", daySheetToken: String(Date.now()) } };
    case "daily_cashflow_check": {
      const { from, to } = currentMonthRange();
      return movementsQuickLink({ label: "Chequeo de flujo del mes", dateFrom: from, dateTo: to });
    }
    case "daily_budget_review":
      return withReason(kind, payload, "/(app)/budgets", { from: "notifications" });
```

- [ ] **Step 4: PASS + suite** — `npx jest` → verde completo (los tests viejos no tocaban la familia diaria).

- [ ] **Step 5: Commit**

```bash
git add lib/notification-navigation.ts __tests__/notification-navigation.test.ts
git commit -m "feat(notifications): familia diaria con destino util (sheet del dia, flujo del mes, presupuestos)"
```

### Task 4: Dashboard abre el sheet del día por params

**Files:**
- Modify: `app/(app)/dashboard.tsx` (estado `daySheet` línea ~429; agregar consumo de params)

- [ ] **Step 1: Imports** — agregar `useLocalSearchParams` al import de expo-router existente, y `endOfDay, startOfDay` al import de date-fns existente (dashboard ya importa `format` de date-fns).

- [ ] **Step 2: Efecto de consumo** — debajo del estado `daySheet` (línea ~433):

```ts
  // Tap del "Resumen financiero del día": el resolver llega con daySheet=today +
  // token único. Se consume una vez por token (los params persisten en la pantalla).
  const digestParams = useLocalSearchParams<{ daySheet?: string | string[]; daySheetToken?: string | string[] }>();
  const daySheetTokenConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    const token = Array.isArray(digestParams.daySheetToken) ? digestParams.daySheetToken[0] : digestParams.daySheetToken;
    const mode = Array.isArray(digestParams.daySheet) ? digestParams.daySheet[0] : digestParams.daySheet;
    if (!token || mode !== "today" || daySheetTokenConsumedRef.current === token) return;
    daySheetTokenConsumedRef.current = token;
    const now = new Date();
    setDaySheet({ dayStart: startOfDay(now), dayEnd: endOfDay(now), mode: "all" });
  }, [digestParams.daySheet, digestParams.daySheetToken]);
```

- [ ] **Step 3: Validar** — `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard.tsx"
git commit -m "feat(dashboard): abrir sheet del dia al llegar del resumen diario"
```

### Task 5: Push del digest usa el resolver + nota en Presupuestos

**Files:**
- Modify: `app/_layout.tsx` (callback `onDailyDigestTap`, línea ~790)
- Modify: `app/(app)/budgets.tsx` (context slot, línea ~400)

- [ ] **Step 1: Unificar push con bandeja** — reemplazar el cuerpo de `onDailyDigestTap`:

```ts
  const onDailyDigestTap = useCallback(() => {
    // Mismo destino que el tap del card en la bandeja: dashboard con el
    // resumen del día abierto (resolver compartido).
    router.push(resolveNotificationNavigationTarget({ kind: "daily_workspace_summary" }) as never);
  }, [router]);
```

(`resolveNotificationNavigationTarget` ya está importado en `_layout.tsx:62`. Eliminar el comentario viejo que decía "abrir la bandeja".)

- [ ] **Step 2: Nota en Presupuestos** — en `app/(app)/budgets.tsx`:

1. Import: `import { useNotificationReason } from "../../hooks/useNotificationReason";`
2. En el componente: `const { reason: notificationReason } = useNotificationReason();`
3. En la línea ~400, el slot context actual es `context={!selectMode ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}` (leer la expresión exacta). Cambiar el hijo a `{notificationReason ?? contextNote}` preservando la condición existente.

- [ ] **Step 3: Validar** — `npx jest` → verde. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx "app/(app)/budgets.tsx"
git commit -m "feat(notifications): push del digest unificado con bandeja y nota en presupuestos"
```

**Smoke F1 (documentar, manual):** tocar "Resumen financiero del día" en la bandeja → dashboard con sheet del día abierto; cerrarlo y volver a tocar la notificación → se reabre. "Chequeo de flujo" → Movimientos filtrado al mes con chip. "Revisión diaria" → Presupuestos con nota.

---

## FASE 2 — Mecanismo reason en detalles + presupuesto puntual

### Task 6: Componente `NotificationReasonBanner`

**Files:**
- Create: `components/ui/NotificationReasonBanner.tsx`

- [ ] **Step 1: Implementación**

```tsx
// components/ui/NotificationReasonBanner.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  reason: string | null;
  onDismiss: () => void;
};

/** Nota descartable "por qué llegaste aquí" bajo el header de un detalle. */
export function NotificationReasonBanner({ reason, onDismiss }: Props) {
  if (!reason) return null;
  return (
    <View style={styles.banner}>
      <Info size={16} color={COLORS.gold} />
      <Text style={styles.text}>{reason}</Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
        <X size={16} color={COLORS.storm} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(215, 190, 123, 0.28)",
    backgroundColor: "rgba(215, 190, 123, 0.08)",
  },
  text: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 18,
  },
});
```

(Los rgba derivan de `COLORS.gold` #D7BE7B — mismo estilo que los pills de UpcomingSection que derivan de sus tokens. Verificar que `COLORS.ink` y `COLORS.storm` existen en theme.ts; si el texto usa otro token estándar en banners existentes, copiar ese.)

- [ ] **Step 2: Validar** — `npm run typecheck` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ui/NotificationReasonBanner.tsx
git commit -m "feat(ui): NotificationReasonBanner descartable para detalles"
```

### Task 7: Resolver — presupuesto puntual y reason en detalles + tests

**Files:**
- Modify: `lib/notification-navigation.ts`
- Test: `__tests__/notification-navigation.test.ts`

- [ ] **Step 1: Tests que fallan** — agregar:

```ts
describe("reason en destinos", () => {
  test("budget_alert va al presupuesto puntual con nota", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "budget_alert", relatedEntityType: "budget", relatedEntityId: 12, payload: { usedPercent: 92 },
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/budget/[id]");
    expect(t.params.id).toBe("12");
    expect(t.params.from).toBe("notifications");
    expect(t.params.reason).toContain("92%");
  });
  test("budget_alert sin id cae a la lista con nota", () => {
    const t = resolveNotificationNavigationTarget({ kind: "budget_alert" }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/(app)/budgets");
    expect(t.params.reason).toBeTruthy();
  });
  test("obligation_overdue lleva nota al detalle", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "obligation_overdue", relatedEntityType: "obligation", relatedEntityId: 5,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/obligation/[id]");
    expect(t.params.id).toBe("5");
    expect(t.params.reason).toContain("vencida");
  });
  test("low_balance lleva nota al detalle de cuenta", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "low_balance", relatedEntityType: "account", relatedEntityId: 3,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/account/[id]");
    expect(t.params.id).toBe("3");
    expect(t.params.reason).toBeTruthy();
  });
  test("subscription_reminder lleva nota al detalle", () => {
    const t = resolveNotificationNavigationTarget({
      kind: "subscription_reminder", relatedEntityType: "subscription", relatedEntityId: 7,
    }) as { pathname: string; params: Record<string, string> };
    expect(t.pathname).toBe("/subscription/[id]");
    expect(t.params.id).toBe("7");
    expect(t.params.reason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx jest __tests__/notification-navigation.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — reemplazar los cases correspondientes:

```ts
    case "budget_alert":
    case "budget_period_ending":
      return id != null && relatedEntityType === "budget"
        ? withReason(kind, payload, "/budget/[id]", { id: String(id), from: "notifications" })
        : withReason(kind, payload, "/(app)/budgets", { from: "notifications" });
    case "subscription_reminder":
    case "subscription_overdue":
      return id
        ? withReason(kind, payload, "/subscription/[id]", { id: String(id) })
        : "/subscriptions";
    case "obligation_due":
    case "obligation_overdue":
    case "obligation_no_payment":
    case "high_interest_obligation":
      return obligationRouteId
        ? withReason(kind, payload, "/obligation/[id]", { id: String(obligationRouteId) })
        : "/(app)/obligations";
    case "low_balance":
    case "negative_balance":
    case "account_dormant":
      return id
        ? withReason(kind, payload, "/account/[id]", { id: String(id) })
        : "/(app)/accounts";
    case "upcoming_annual_subscription":
    case "subscription_price_increase":
      return id
        ? withReason(kind, payload, "/subscription/[id]", { id: String(id) })
        : "/subscriptions";
    case "obligation_milestone":
      return obligationIdFromPayload
        ? withReason(kind, payload, "/obligation/[id]", { id: String(obligationIdFromPayload) })
        : "/(app)/obligations";
```

IMPORTANTE: `subscription_price_increase` y `upcoming_annual_subscription` hoy están en cases separados (líneas ~168 y ~207) — consolidarlos SIN dejar cases duplicados. Los tests viejos que asertaban strings (`"/subscription/7"`) se ACTUALIZAN a la forma objeto (misma semántica de destino).

- [ ] **Step 4: Actualizar tests viejos rotos + suite completa** — `npx jest` → verde. Solo se actualizan asserts de FORMA (string→objeto); si un test viejo falla por DESTINO distinto, es un bug de la implementación, no del test.

- [ ] **Step 5: Commit**

```bash
git add lib/notification-navigation.ts __tests__/notification-navigation.test.ts
git commit -m "feat(notifications): presupuesto puntual y nota del porque en destinos de detalle"
```

### Task 8: Banner en los 4 detalles

**Files:**
- Modify: `app/obligation/[id].tsx` (hook línea ~144, header con `onBack={handleBack}` línea ~1013)
- Modify: `app/subscription/[id].tsx`
- Modify: `app/account/[id].tsx` (ScreenHeader línea ~208)
- Modify: `app/budget/[id].tsx` (ScreenHeader línea ~135)

En CADA archivo (mismo patrón, adaptar nombres locales):

- [ ] **Step 1: Imports + hook**

```ts
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { useNotificationReason } from "../../hooks/useNotificationReason";
```

y en el componente: `const { reason: notificationReason, dismiss: dismissNotificationReason } = useNotificationReason();`

- [ ] **Step 2: Render** — inmediatamente DESPUÉS del header del detalle (buscar `<ScreenHeader` o el componente header con `onBack={handleBack}`):

```tsx
      <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
```

- [ ] **Step 3: originRoutes** — en el `useOriginBackNavigation({ originRoutes: {...} })` de cada detalle, agregar la clave `notifications: "/notifications"` si no existe (fallback correcto cuando no hay stack). Si el detalle llama al hook sin argumentos (obligation), dejarlo así — el pop cubre el caso con stack.

- [ ] **Step 4: Validar** — `npx jest` → verde. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 5: Commit**

```bash
git add app/obligation/\[id\].tsx app/subscription/\[id\].tsx app/account/\[id\].tsx app/budget/\[id\].tsx
git commit -m "feat(notifications): banner del porque en detalles de obligacion, suscripcion, cuenta y presupuesto"
```

### Task 9: Push de recordatorios usa el resolver

**Files:**
- Modify: `app/_layout.tsx` (callbacks `onSubscriptionReminderTap` ~línea 797 y `onObligationReminderTap` ~línea 804)

- [ ] **Step 1: Reemplazar cuerpos** (el patrón ya existe en `onRecurringIncomeReminderTap`, línea ~810 — copiarlo):

```ts
  const onSubscriptionReminderTap = useCallback(
    (subscriptionId: number) => {
      const target = resolveNotificationNavigationTarget({
        kind: "subscription_reminder",
        relatedEntityType: "subscription",
        relatedEntityId: subscriptionId,
      });
      router.push(target as never);
    },
    [router],
  );

  const onObligationReminderTap = useCallback(
    (obligationId: number) => {
      const target = resolveNotificationNavigationTarget({
        kind: "obligation_due",
        relatedEntityType: "obligation",
        relatedEntityId: obligationId,
      });
      router.push(target as never);
    },
    [router],
  );
```

- [ ] **Step 2: Validar** — `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "refactor(notifications): push de recordatorios pasa por el resolver compartido"
```

**Smoke F2 (documentar):** alerta de presupuesto → abre ESE presupuesto con banner "va en X%"; X del banner lo cierra y no reaparece; back respeta origen. Notificación de deuda vencida → detalle con banner accionable.

---

## FASE 3 — Barrido de listas débiles

### Task 10: Resolver — reason en listas débiles + tests

**Files:**
- Modify: `lib/notification-navigation.ts`
- Test: `__tests__/notification-navigation.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
describe("listas debiles con nota", () => {
  const cases: Array<[string, string]> = [
    ["multiple_subscriptions_due", "/subscriptions"],
    ["subscription_cost_heavy", "/subscriptions"],
    ["multiple_obligations_overdue", "/(app)/obligations"],
    ["commitments_vs_balance", "/(app)/obligations"],
    ["net_worth_negative", "/(app)/accounts"],
    ["cash_runway_alert", "/(app)/accounts"],
    ["recurring_income_reminder", "/recurring-income"],
    ["expected_income_missed", "/recurring-income"],
  ];
  for (const [kind, pathname] of cases) {
    test(`${kind} mantiene destino y agrega nota`, () => {
      const t = resolveNotificationNavigationTarget({ kind }) as { pathname: string; params: Record<string, string> };
      expect(t.pathname).toBe(pathname);
      expect(t.params.reason).toBeTruthy();
      expect(t.params.reasonToken).toBeTruthy();
    });
  }
});
```

- [ ] **Step 2: Ver fallar** — `npx jest __tests__/notification-navigation.test.ts` → FAIL (hoy devuelven strings).

- [ ] **Step 3: Implementar** — envolver cada case con `withReason(kind, payload, <ruta actual>)`. Ejemplo del patrón (aplicarlo a los 8):

```ts
    case "multiple_subscriptions_due":
      return withReason(kind, payload, "/subscriptions");
    case "multiple_obligations_overdue":
      return withReason(kind, payload, "/(app)/obligations");
    case "recurring_income_reminder":
      return withReason(kind, payload, "/recurring-income");
```

OJO: `recurring_income_reminder` con `relatedEntityId` seguía a la lista (no hay detalle de tap directo hoy) — mantener lista + nota. `subscription_reminder`/`subscription_overdue` SIN id caen a `/subscriptions`: envolver también ese fallback con `withReason`. Actualizar los asserts viejos afectados (string→objeto).

- [ ] **Step 4: Suite completa** — `npx jest` → verde.

- [ ] **Step 5: Commit**

```bash
git add lib/notification-navigation.ts __tests__/notification-navigation.test.ts
git commit -m "feat(notifications): nota del porque en destinos de lista"
```

### Task 11: Nota en las 4 listas restantes

**Files:**
- Modify: `app/(app)/obligations.tsx` (context slot línea ~593)
- Modify: `app/subscriptions.tsx` (context slot línea ~384)
- Modify: `app/recurring-income.tsx` (context slot línea ~422)
- Modify: `app/(app)/accounts.tsx` (agregar context slot si el template lo permite; leer el render del template en ese archivo)

Mismo patrón que budgets (Task 5): import del hook + `const { reason: notificationReason } = useNotificationReason();` + en el slot context, el hijo pasa a `{notificationReason ?? contextNote}` PRESERVANDO la condición existente de cada módulo. En accounts, si no existe `contextNote`, renderizar `context={notificationReason ? <ResourceContextNote>{notificationReason}</ResourceContextNote> : null}` (o el equivalente dentro de su condición de selectMode).

REGLA: no cambiar ninguna otra prop del template; no introducir listas/notas duplicadas.

- [ ] **Step 1: Aplicar el patrón en los 4 archivos.**
- [ ] **Step 2: Validar** — `npx jest` → verde. `npm run typecheck` → sin errores. `git diff --check` → limpio.
- [ ] **Step 3: Commit**

```bash
git add "app/(app)/obligations.tsx" app/subscriptions.tsx app/recurring-income.tsx "app/(app)/accounts.tsx"
git commit -m "feat(notifications): nota del porque en listas de obligaciones, suscripciones, ingresos y cuentas"
```

---

## Verificación final

- [ ] `npx jest` → suite completa verde.
- [ ] `npm run typecheck` → sin errores.
- [ ] `git diff --check` → limpio.
- [ ] Smoke integral: los 5 criterios de aceptación del spec.
- [ ] **NO publicar OTA sin aprobación del usuario** (todo es JS, elegible para `npx eas-cli update --channel preview`).
