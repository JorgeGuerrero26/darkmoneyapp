# Modo privacidad (ocultar montos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toggle de ojo persistente que enmascara todos los montos y gráficos de la app (spec `docs/superpowers/specs/2026-07-13-modo-privacidad-design.md`).

**Architecture:** `privacyMode` persistido en el zustand ui-store; la máscara se aplica en el re-export de `formatCurrency` de `components/ui/AmountDisplay.tsx` (81 consumidores UI, lectura imperativa del store). `lib/format-currency.ts` sigue puro/RN-free (gana `maskedCurrencyLabel`, pura). Reactividad: suscripción al flag en pantallas de dinero + en los 3 componentes `React.memo` con montos (la suscripción interna invalida el memo). Gráficos: prop `masked` en los genéricos de `components/ui`, auto-suscripción en los de `features/dashboard`.

**Tech Stack:** React Native/Expo, zustand persist, jest.

**Reglas:** tokens del theme, sin hex nuevos salvo rgba derivados documentados; validar con `npx jest` + `npm run typecheck` + `git diff --check`; NUNCA stagear `.claude/settings.local.json` ni `.env.example`; un commit por task.

---

### Task 1: `maskedCurrencyLabel` pura + test

**Files:**
- Modify: `lib/format-currency.ts`
- Test: `__tests__/masked-currency.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// __tests__/masked-currency.test.ts
import { maskedCurrencyLabel } from "../lib/format-currency";

describe("maskedCurrencyLabel", () => {
  it("conserva el símbolo y oculta la cifra", () => {
    expect(maskedCurrencyLabel("PEN")).toBe("S/ ••••");
    expect(maskedCurrencyLabel("USD")).toBe("$ ••••");
  });
  it("código inválido cae al código como prefijo", () => {
    expect(maskedCurrencyLabel("XXX_BAD")).toBe("XXX_BAD ••••");
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx jest __tests__/masked-currency.test.ts` → FAIL (export missing).

- [ ] **Step 3: Implementar** — agregar al final de `lib/format-currency.ts`:

```ts
/**
 * Etiqueta enmascarada para modo privacidad: conserva el símbolo de la moneda
 * y reemplaza la cifra por puntos. Pura: la decisión de CUÁNDO enmascarar vive
 * en components/ui/AmountDisplay.tsx (frontera RN), no aquí.
 */
export function maskedCurrencyLabel(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currencyCode,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === "currency")?.value;
    if (symbol) return `${symbol} ••••`;
  } catch {
    // moneda desconocida: cae al código
  }
  return `${currencyCode} ••••`;
}
```

NOTA: si el assert de USD falla porque el locale es-PE emite `"US$"` u otro símbolo, ajustar el ASSERT al valor real del runtime (el símbolo correcto es el que emite Intl, no el del test).

- [ ] **Step 4: PASS** — `npx jest __tests__/masked-currency.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format-currency.ts __tests__/masked-currency.test.ts
git commit -m "feat(privacy): maskedCurrencyLabel pura con simbolo de moneda"
```

### Task 2: `privacyMode` en el ui-store

**Files:**
- Modify: `store/ui-store.ts` (tipo `UiState`, implementación, `partialize` línea ~98)

- [ ] **Step 1: Tipo** — en `UiState`, junto a `dashboardMode`:

```ts
  /** Modo privacidad: enmascara montos y gráficos en toda la app (persistido). */
  privacyMode: boolean;
  togglePrivacyMode: () => void;
```

- [ ] **Step 2: Implementación** — en el objeto del store (junto a `setDashboardMode`):

```ts
      privacyMode: false,
      togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode })),
```

- [ ] **Step 3: Persistencia** — en `partialize` agregar:

```ts
        privacyMode: state.privacyMode,
```

- [ ] **Step 4: Validar** — `npm run typecheck` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add store/ui-store.ts
git commit -m "feat(privacy): flag privacyMode persistido en ui-store"
```

### Task 3: Interceptor en AmountDisplay

**Files:**
- Modify: `components/ui/AmountDisplay.tsx` (líneas 20-21)

- [ ] **Step 1: Reemplazar el re-export** — hoy es:

```ts
import { formatCurrency } from "../../lib/format-currency";
export { formatCurrency };
```

Pasa a:

```ts
import { formatCurrency as formatCurrencyPure, maskedCurrencyLabel } from "../../lib/format-currency";
import { useUiStore } from "../../store/ui-store";

/**
 * Versión con modo privacidad del formateador puro: los 81 consumidores de UI
 * importan desde aquí. Lectura imperativa del store — el re-render lo fuerzan
 * las suscripciones de pantalla/fila (ver useUiStore((s) => s.privacyMode)).
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  if (useUiStore.getState().privacyMode) return maskedCurrencyLabel(currencyCode);
  return formatCurrencyPure(amount, currencyCode);
}
```

y TODO uso interno de `formatCurrency` dentro de `AmountDisplay.tsx` debe llamar a esta versión (verificar que el componente `AmountDisplay` la use; si llamaba al import puro, ahora usa la local).

- [ ] **Step 2: Validar** — `npx jest` (la suite no importa AmountDisplay — verificar que siga verde) + `npm run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/AmountDisplay.tsx
git commit -m "feat(privacy): formatCurrency de UI enmascara cuando privacyMode esta activo"
```

### Task 4: Toggle de ojo en el dashboard

**Files:**
- Modify: `app/(app)/dashboard.tsx` (destructure del store ~línea 394; `DashboardHeaderRight` línea ~947)

- [ ] **Step 1: Suscripción + acciones** — en el destructure existente de `useUiStore` (~394) agregar `privacyMode` y `togglePrivacyMode` (misma llamada, campos extra).

- [ ] **Step 2: Ojo en el header** — `DashboardHeaderRight` (~947) es componente local con `{ onSignOut }`. Agregar props `privacyMode: boolean; onTogglePrivacy: () => void` y renderizar ANTES de sus acciones actuales un botón con el mismo estilo de los demás iconos del header (copiar el patrón de touchable/estilo que ya usa ese componente):

```tsx
      <TouchableOpacity
        onPress={onTogglePrivacy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={privacyMode ? "Mostrar montos" : "Ocultar montos"}
      >
        {privacyMode ? <EyeOff size={20} color={COLORS.storm} /> : <Eye size={20} color={COLORS.storm} />}
      </TouchableOpacity>
```

(imports `Eye, EyeOff` al import existente de lucide-react-native; adaptar tamaño/color al de los iconos vecinos del header si difieren). En el callsite (~línea 710): `rightAction={<DashboardHeaderRight onSignOut={handleSignOut} privacyMode={privacyMode} onTogglePrivacy={togglePrivacyMode} />}`.

- [ ] **Step 3: Validar** — `npm run typecheck` + `git diff --check`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard.tsx"
git commit -m "feat(privacy): toggle de ojo en el header del dashboard"
```

### Task 5: Suscripción en pantallas de dinero

**Files (12):**
- Modify: `app/(app)/movements.tsx`, `app/(app)/accounts.tsx`, `app/(app)/obligations.tsx`, `app/subscriptions.tsx`, `app/recurring-income.tsx`, `app/(app)/budgets.tsx`
- Modify: `app/movement/[id].tsx`, `app/account/[id].tsx`, `app/obligation/[id].tsx`, `app/subscription/[id].tsx`, `app/budget/[id].tsx`, `app/recurring-income/[id].tsx`

En CADA archivo, en el componente principal de pantalla:

```ts
// Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
// vive en formatCurrency, que lee el store imperativamente).
useUiStore((state) => state.privacyMode);
```

con `import { useUiStore } from "<ruta relativa a>/store/ui-store";` (ajustar `../..` según profundidad; varios ya importan `useUiStore` — en esos solo agregar la línea de suscripción). El dashboard ya quedó suscrito en Task 4.

- [ ] **Step 1: Aplicar en los 12 archivos.**
- [ ] **Step 2: Validar** — `npx jest` verde + `npm run typecheck` + `git diff --check`.
- [ ] **Step 3: Commit**

```bash
git add "app/(app)/movements.tsx" "app/(app)/accounts.tsx" "app/(app)/obligations.tsx" app/subscriptions.tsx app/recurring-income.tsx "app/(app)/budgets.tsx" app/movement/\[id\].tsx app/account/\[id\].tsx app/obligation/\[id\].tsx app/subscription/\[id\].tsx app/budget/\[id\].tsx app/recurring-income/\[id\].tsx
git commit -m "feat(privacy): pantallas de dinero reaccionan al toggle de privacidad"
```

### Task 6: Componentes memoizados con montos

**Files:**
- Modify: `components/domain/AccountCard.tsx`, `components/domain/BudgetCard.tsx`, `components/domain/MovementRow.tsx`

(Son los 3 `React.memo` de `components/domain` que usan `formatCurrency`/`AmountDisplay` — verificado por grep. `SwipeableMovementRow` delega en `MovementRow`, no necesita cambio.)

En cada uno, DENTRO del componente memoizado (antes del return):

```ts
  // Suscripción propia: invalida el memo cuando cambia el modo privacidad
  // (los props no cambian al alternar, sin esto la fila mostraría el monto viejo).
  useUiStore((state) => state.privacyMode);
```

con el import correspondiente (`../../store/ui-store`).

- [ ] **Step 1: Aplicar en los 3 archivos.**
- [ ] **Step 2: Validar** — `npm run typecheck` + `git diff --check`.
- [ ] **Step 3: Commit**

```bash
git add components/domain/AccountCard.tsx components/domain/BudgetCard.tsx components/domain/MovementRow.tsx
git commit -m "feat(privacy): filas memoizadas se re-renderizan al alternar privacidad"
```

### Task 7: Gráficos

**Files:**
- Modify: `components/ui/RingChart.tsx` (props `{ segments, size = 120, thickness = 20 }`)
- Modify: `components/ui/SparkLine.tsx` (props con `width`/`height`)
- Modify: `features/dashboard/components/simple/MiniBarChart.tsx`
- Modify: consumidores de RingChart/SparkLine: `app/(app)/dashboard.tsx`, `features/dashboard/components/advanced/DashboardCharts.tsx`, `features/dashboard/components/simple/AccountsBreakdown.tsx`, `features/dashboard/components/simple/SavingsTrendCard.tsx`

- [ ] **Step 1: Prop `masked` en los genéricos** (components/ui no puede leer stores — regla de arquitectura). En RingChart y SparkLine agregar prop opcional `masked?: boolean`; cuando es true, en lugar del SVG renderizan un placeholder del MISMO tamaño:

```tsx
  if (masked) {
    return (
      <View style={{ width: size, height: size, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: SURFACE.separator, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm }}>Oculto</Text>
      </View>
    );
  }
```

(en SparkLine usar `width`/`height` en vez de `size`; importar los tokens que falten de `constants/theme`; texto corto "Oculto" porque los charts son chicos).

- [ ] **Step 2: MiniBarChart** (`features/dashboard/...` puede suscribirse): al inicio del componente `const privacyMode = useUiStore((state) => state.privacyMode);` y si es true, renderizar el mismo placeholder ocupando el alto del chart con el texto "Oculto por privacidad" (este es grande). Import de `useUiStore` con la profundidad correcta (`../../../../store/ui-store`).

- [ ] **Step 3: Consumidores pasan `masked`** — en los 4 archivos consumidores, cada `<RingChart ...>` / `<SparkLine ...>` recibe `masked={privacyMode}`; los componentes de features que no tengan el flag se suscriben (`const privacyMode = useUiStore((state) => state.privacyMode);`). dashboard.tsx ya tiene `privacyMode` del Task 4.

- [ ] **Step 4: Validar** — `npx jest` + `npm run typecheck` + `git diff --check`.
- [ ] **Step 5: Commit**

```bash
git add components/ui/RingChart.tsx components/ui/SparkLine.tsx features/dashboard/components/simple/MiniBarChart.tsx "app/(app)/dashboard.tsx" features/dashboard/components/advanced/DashboardCharts.tsx features/dashboard/components/simple/AccountsBreakdown.tsx features/dashboard/components/simple/SavingsTrendCard.tsx
git commit -m "feat(privacy): graficos muestran placeholder en modo privado"
```

### Task 8: Dashboard avanzado

**Files:**
- Modify: `features/dashboard/components/advanced/AdvancedDashboard.tsx`
- Modify: `docs/superpowers/specs/2026-07-13-modo-privacidad-design.md` (ajuste de una línea)

- [ ] **Step 1: Gate del contenido analítico** — al inicio del componente `AdvancedDashboard`:

```ts
  const privacyMode = useUiStore((state) => state.privacyMode);
```

y ANTES de su return principal:

```tsx
  if (privacyMode) {
    return (
      <Card>
        <Text style={advancedPrivacyStyles.title}>Oculto por privacidad</Text>
        <Text style={advancedPrivacyStyles.body}>
          El análisis avanzado muestra tus cifras completas. Desactiva el modo
          privado con el ojo del header para verlo.
        </Text>
      </Card>
    );
  }
```

con un `StyleSheet.create` local `advancedPrivacyStyles` usando `FONT_FAMILY`/`FONT_SIZE`/`COLORS` (title: bodySemibold/md/ink; body: body/sm/storm) e imports de `Card` y tokens si faltan.

- [ ] **Step 2: Ajustar el spec** — en la sección "Gráficos" del spec, reemplazar "El dashboard avanzado lo aplica por sección" por "El dashboard avanzado reemplaza todo su contenido analítico por una card de privacidad (es íntegramente cifras)".

- [ ] **Step 3: Validar** — `npx jest` + `npm run typecheck` + `git diff --check`.
- [ ] **Step 4: Commit**

```bash
git add features/dashboard/components/advanced/AdvancedDashboard.tsx docs/superpowers/specs/2026-07-13-modo-privacidad-design.md
git commit -m "feat(privacy): dashboard avanzado se cubre completo en modo privado"
```

---

## Verificación final

- [ ] `npx jest` → suite completa verde.
- [ ] `npm run typecheck` → sin errores.
- [ ] `git diff --check` → limpio.
- [ ] Smoke (documentar para el usuario): (1) ojo en dashboard → hero, secciones y gráficos enmascarados al instante; (2) navegar a Movimientos/Cuentas con el modo activo → todo `S/ ••••` incluidas filas ya montadas; (3) matar y reabrir la app → sigue oculto; (4) desactivar → todo vuelve al instante; (5) crear/editar movimiento → inputs normales; (6) modo avanzado → card de privacidad.
- [ ] **NO publicar OTA sin aprobación del usuario.**
