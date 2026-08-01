# Quick Wins Fase 2.-1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los 4 quick wins pendientes de Fase 2.-1 según `docs/superpowers/specs/2026-07-12-quick-wins-fase2-design.md`: deep link de alertas al presupuesto puntual, rename de plantillas, acciones rápidas (pagar/llegó) en el dashboard, y split en edición + registro rápido.

**Architecture:** app/* orquesta (mutations, estado, sheets); componentes visuales reciben callbacks/datos listos. Se reutilizan `MarkSubscriptionPaidSheet`, `RecurringIncomeArrivalSheet`, `SplitAmountEditor` y los contratos `buildMovementCreateInput`/`buildMovementUpdateInput`. Toda lógica pura nueva vive en `features/*/lib` con tests en `__tests__/`.

**Tech Stack:** React Native/Expo + TypeScript, React Query, jest.

**Convenciones transversales:**
- Un task = un commit. Validación estándar por task: `npm run typecheck`, `git diff --check`, y `npx jest <test files del task>` cuando el task agrega tests. Al final del último task: `npx jest` completo.
- Tokens de `constants/theme.ts` (COLORS/SPACING/RADIUS/FONT_*); nada de hex inline.
- NO stagear archivos ajenos al task (el repo puede tener dirty files: `.claude/settings.local.json`, `.env.example`, `deno.lock`).
- NO publicar OTA al terminar — preguntar al usuario.
- Archivos sensibles (`MovementForm.tsx`, `QuickDetectedMovementEntry.tsx`, `workspace-data.ts`): cambios mínimos, no reordenar código existente.

**Datos verificados del código (no re-derivar):**
- `app/budget/[id].tsx:49-50` ya usa `useOriginBackNavigation` con `originRoutes: { dashboard: "/(app)/dashboard", budgets: "/(app)/budgets" }` — el deep link con `?from=dashboard` funciona sin tocar el detalle.
- `MovementRecord` (types/domain.ts) tiene `metadata?: JsonValue | null`.
- `MovementUpdateInput` (features/movements/lib/movement-input-types.ts:39-51) NO tiene `metadata` — el Task 4 lo agrega junto con su mapeo en `useUpdateMovementMutation` (services/queries/workspace-data.ts:2446+, payload con `if (input.X !== undefined) payload.x = ...`).
- El editor de split es `SplitAmountEditor` (usado por `features/movements/components/form/steps/StepDetails.tsx:213-220`): recibe `lines: SplitLine[] | null`, `onChangeLines`, `categories`, `totalAmount`, `currencyCode` y maneja él mismo la activación cuando `lines == null`.
- La vía de creación con split en MovementForm (líneas ~925-975) usa `validateSplit`, `splitLineDescription`, dedupe `${splitGroup}:split-${index+1}` y `metadata: { split_group, split_index, split_total }`.
- QDME (QuickDetectedMovementEntry.tsx) crea el gasto/ingreso en ~línea 820 con `dedupeKey: `suggestion:${suggestion.id}`` y metadata de detección; luego `markSuggestion.mutateAsync({ suggestionId, status: "registered", movementId: created.id })`.
- `parseMoneyInput` es una función LOCAL de `app/recurring-income.tsx` (línea 68).

---

### Task 1: Alertas del dashboard → presupuesto puntual

**Files:**
- Modify: `features/dashboard/components/simple/UrgentAlertsCard.tsx:73`

Sin lógica pura nueva (los items se construyen inline con JSX icons); validación por typecheck + smoke.

- [ ] **Step 1: Cambiar la ruta del item de presupuesto**

En `UrgentAlertsCard.tsx`, dentro del `for (const b of budgets)`, reemplazar:

```ts
      route: "/(app)/budgets",
```

por:

```ts
      route: `/budget/${b.id}?from=dashboard`,
```

- [ ] **Step 2: Validar** — `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 3: Smoke manual (documentar en el reporte)** — con un presupuesto excedido/cerca del límite: tap en la alerta abre `app/budget/[id]` y el back vuelve al dashboard (ya soportado por `useOriginBackNavigation`).

- [ ] **Step 4: Commit**

```bash
git add features/dashboard/components/simple/UrgentAlertsCard.tsx
git commit -m "fix(dashboard): alertas de presupuesto abren el presupuesto puntual"
```

---

### Task 2: Renombrar plantillas de movimiento

**Files:**
- Create: `features/movements/lib/template-name.ts`
- Create: `features/movements/components/RenameTemplateSheet.tsx`
- Modify: `services/queries/movement-templates.ts` (nueva mutation)
- Modify: `features/movements/components/QuickAddSheet.tsx` (long-press → menú con Renombrar)
- Modify: `app/(app)/movements.tsx` (estado + wiring del sheet)
- Test: `__tests__/template-name.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// __tests__/template-name.test.ts
import { normalizeTemplateName } from "../features/movements/lib/template-name";

describe("normalizeTemplateName", () => {
  it("recorta espacios y devuelve el nombre limpio", () => {
    expect(normalizeTemplateName("  Taxi al trabajo  ")).toBe("Taxi al trabajo");
  });
  it("null para vacio o solo espacios", () => {
    expect(normalizeTemplateName("")).toBeNull();
    expect(normalizeTemplateName("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest __tests__/template-name.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar helper puro**

```ts
// features/movements/lib/template-name.ts
/** Normaliza el nombre de una plantilla: trim; null si queda vacío (inválido). */
export function normalizeTemplateName(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 ? name : null;
}
```

`npx jest __tests__/template-name.test.ts` → PASS.

- [ ] **Step 4: Mutation de rename** — en `services/queries/movement-templates.ts`, después de `useCreateMovementTemplateMutation`, agregar (mismo patrón que delete):

```ts
export function useRenameMovementTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, name }: { templateId: number; name: string }) => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { error } = await supabase.from("movement_templates").update({ name }).eq("id", templateId);
      if (error) throw new Error(error.message ?? "No se pudo renombrar la plantilla");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["movement-templates"] });
    },
  });
}
```

- [ ] **Step 5: Sheet de rename**

```tsx
// features/movements/components/RenameTemplateSheet.tsx
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { normalizeTemplateName } from "../lib/template-name";
import type { MovementTemplate } from "../../../services/queries/movement-templates";

type Props = {
  template: MovementTemplate | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

/** Renombrar plantilla desde el quick-add (long-press → Renombrar). */
export function RenameTemplateSheet({ template, isPending, onClose, onConfirm }: Props) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (template) setName(template.name);
  }, [template]);

  const normalized = normalizeTemplateName(name);
  return (
    <BottomSheet visible={Boolean(template)} onClose={onClose} title="Renombrar plantilla" snapHeight={0.32}>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nombre de la plantilla"
        placeholderTextColor={COLORS.textMuted}
        autoFocus
        maxLength={80}
      />
      <TouchableOpacity
        style={[styles.saveButton, (!normalized || isPending) && styles.saveButtonDisabled]}
        disabled={!normalized || isPending}
        onPress={() => normalized && onConfirm(normalized)}
        accessibilityRole="button"
        accessibilityLabel="Guardar nombre de plantilla"
      >
        <Text style={styles.saveLabel}>{isPending ? "Guardando…" : "Guardar"}</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: SURFACE.subtleBorder,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    marginTop: SPACING.xs,
  },
  saveButton: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gold,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveLabel: {
    color: COLORS.background,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
  },
});
```

Nota: si `COLORS.background` no existe en el theme, usar el token de texto-sobre-acento que use el botón primario de otros sheets del repo (buscar un botón dorado existente y copiar su par de tokens).

- [ ] **Step 6: Menú en el long-press de QuickAddSheet** — en `features/movements/components/QuickAddSheet.tsx`:

1. Props: agregar `onRenameTemplate?: (template: MovementTemplate) => void;` después de `onDeleteTemplate` y recibirlo en la firma del componente.
2. Reemplazar el `onLongPress` actual (Alert de eliminar) por un menú:

```tsx
                onLongPress={
                  onDeleteTemplate || onRenameTemplate
                    ? () => {
                        Alert.alert(
                          template.name,
                          "¿Qué quieres hacer con esta plantilla?",
                          [
                            { text: "Cancelar", style: "cancel" },
                            ...(onRenameTemplate
                              ? [{ text: "Renombrar", onPress: () => { onClose(); onRenameTemplate(template); } }]
                              : []),
                            ...(onDeleteTemplate
                              ? [{
                                  text: "Eliminar",
                                  style: "destructive" as const,
                                  onPress: () => {
                                    Alert.alert(
                                      "Eliminar plantilla",
                                      `¿Eliminar la plantilla "${template.name}"?`,
                                      [
                                        { text: "Cancelar", style: "cancel" },
                                        { text: "Eliminar", style: "destructive", onPress: () => onDeleteTemplate(template) },
                                      ],
                                    );
                                  },
                                }]
                              : []),
                          ],
                        );
                      }
                    : undefined
                }
```

3. Actualizar el hint: `"Mantén presionada una plantilla para renombrarla o eliminarla."`

- [ ] **Step 7: Wiring en movements** — en `app/(app)/movements.tsx`:

1. Imports: `useRenameMovementTemplateMutation` (junto a los otros de movement-templates) y `RenameTemplateSheet` (junto a QuickAddSheet).
2. Estado + mutation dentro del componente (cerca de `movementTemplates`):

```ts
  const renameTemplate = useRenameMovementTemplateMutation();
  const [renameTemplateTarget, setRenameTemplateTarget] = useState<MovementTemplate | null>(null);
```

(importar el tipo `MovementTemplate` de `services/queries/movement-templates` si no está).
3. En `<QuickAddSheet ...>` agregar prop:

```tsx
              onRenameTemplate={(template) => setRenameTemplateTarget(template)}
```

4. Junto a los demás overlays del screen, render:

```tsx
            <RenameTemplateSheet
              template={renameTemplateTarget}
              isPending={renameTemplate.isPending}
              onClose={() => setRenameTemplateTarget(null)}
              onConfirm={(name) => {
                if (!renameTemplateTarget) return;
                renameTemplate.mutate(
                  { templateId: renameTemplateTarget.id, name },
                  {
                    onSuccess: () => { setRenameTemplateTarget(null); showToast("Plantilla renombrada", "success"); },
                    onError: (err) => showToast(err instanceof Error ? err.message : "No se pudo renombrar", "error"),
                  },
                );
              }}
            />
```

(el screen ya tiene `showToast` — lo usa `onDeleteTemplate`).

- [ ] **Step 8: Validar** — `npx jest __tests__/template-name.test.ts` → PASS. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 9: Commit**

```bash
git add features/movements/lib/template-name.ts features/movements/components/RenameTemplateSheet.tsx services/queries/movement-templates.ts features/movements/components/QuickAddSheet.tsx "app/(app)/movements.tsx" __tests__/template-name.test.ts
git commit -m "feat(movements): renombrar plantillas desde el quick-add"
```

---

### Task 3: Acciones rápidas en dashboard "Próximos" (pagar / llegó)

**Files:**
- Create: `features/recurring-income/lib/arrival-validation.ts` (validación pura extraída)
- Create: `features/recurring-income/lib/useArrivalSheetController.ts` (hook compartido)
- Modify: `app/recurring-income.tsx` (usar el hook, sin cambio de comportamiento)
- Modify: `features/dashboard/components/simple/UpcomingSection.tsx` (botón ✓ por fila)
- Modify: `features/dashboard/components/simple/styles.ts` (estilo del botón)
- Modify: `app/(app)/dashboard.tsx` (mutations + sheets + callbacks)
- Test: `__tests__/arrival-validation.test.ts`

- [ ] **Step 1: Test de validación que falla**

```ts
// __tests__/arrival-validation.test.ts
import { parseMoneyInput, validateArrivalDraft } from "../features/recurring-income/lib/arrival-validation";

const base = {
  date: "2026-07-12",
  actualAmount: 3500,
  accountId: 4,
  baseChangeMode: "none" as const,
  parsedNewBaseAmount: null,
  currentBaseAmount: 3500,
};

describe("validateArrivalDraft", () => {
  it("ok sin cambio de base", () => {
    expect(validateArrivalDraft(base)).toEqual({ ok: true, nextBaseAmount: null });
  });
  it("ok con bonificacion valida (nuevo base mayor)", () => {
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: 3800 }))
      .toEqual({ ok: true, nextBaseAmount: 3800 });
  });
  it("errores: fecha vacia, monto invalido, sin cuenta", () => {
    expect(validateArrivalDraft({ ...base, date: "  " })).toEqual({ ok: false, error: "La fecha real de llegada es obligatoria." });
    expect(validateArrivalDraft({ ...base, actualAmount: null })).toEqual({ ok: false, error: "Ingresa un monto real mayor a 0." });
    expect(validateArrivalDraft({ ...base, accountId: null })).toEqual({ ok: false, error: "Elige la cuenta destino para registrar el movimiento." });
  });
  it("errores de cambio de base: sin nuevo monto, bonus no mayor, descuento no menor", () => {
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: null }))
      .toEqual({ ok: false, error: "Ingresa el nuevo monto base para las próximas llegadas." });
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: 3500 }))
      .toEqual({ ok: false, error: "Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual." });
    expect(validateArrivalDraft({ ...base, baseChangeMode: "discount", parsedNewBaseAmount: 3500 }))
      .toEqual({ ok: false, error: "Si hubo descuento permanente, el nuevo monto base debe ser menor al actual." });
  });
});

describe("parseMoneyInput", () => {
  it("parsea montos positivos y rechaza invalidos", () => {
    expect(parseMoneyInput("3500")).toBe(3500);
    expect(parseMoneyInput("0")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest __tests__/arrival-validation.test.ts` → FAIL.

- [ ] **Step 3: Implementar validación pura** — los mensajes y condiciones se COPIAN VERBATIM de `app/recurring-income.tsx` (bloque `handleConfirmArrival`, líneas ~330-361) y `parseMoneyInput` se MUEVE desde ese archivo (línea 68):

```ts
// features/recurring-income/lib/arrival-validation.ts
import type { RecurringIncomeBaseChangeMode } from "../../../types/domain";
// ^ ajustar el import del tipo al origen real usado por app/recurring-income.tsx (línea ~25).

/** Movida desde app/recurring-income.tsx para compartirla con el dashboard. Copiar el cuerpo VERBATIM. */
export function parseMoneyInput(value: string): number | null {
  // (cuerpo exacto de la función local de app/recurring-income.tsx:68)
  const parsed = Number(String(value).replace(/,/g, "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type ArrivalDraftInput = {
  date: string;
  actualAmount: number | null;
  accountId: number | null;
  baseChangeMode: RecurringIncomeBaseChangeMode;
  parsedNewBaseAmount: number | null;
  currentBaseAmount: number;
};

export type ArrivalDraftResult =
  | { ok: true; nextBaseAmount: number | null }
  | { ok: false; error: string };

export function validateArrivalDraft(input: ArrivalDraftInput): ArrivalDraftResult {
  if (!input.date.trim()) return { ok: false, error: "La fecha real de llegada es obligatoria." };
  if (input.actualAmount == null) return { ok: false, error: "Ingresa un monto real mayor a 0." };
  if (input.accountId == null) return { ok: false, error: "Elige la cuenta destino para registrar el movimiento." };

  let nextBaseAmount: number | null = null;
  if (input.baseChangeMode !== "none") {
    nextBaseAmount = input.parsedNewBaseAmount;
    if (nextBaseAmount == null) {
      return { ok: false, error: "Ingresa el nuevo monto base para las próximas llegadas." };
    }
    if (input.baseChangeMode === "bonus" && nextBaseAmount <= input.currentBaseAmount) {
      return { ok: false, error: "Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual." };
    }
    if (input.baseChangeMode === "discount" && nextBaseAmount >= input.currentBaseAmount) {
      return { ok: false, error: "Si hubo descuento permanente, el nuevo monto base debe ser menor al actual." };
    }
  }
  return { ok: true, nextBaseAmount };
}
```

IMPORTANTE: si el cuerpo real de `parseMoneyInput` en app/recurring-income.tsx difiere del mostrado, usar el REAL (leerlo antes de escribir). `npx jest __tests__/arrival-validation.test.ts` → PASS (ajustar el test de parseMoneyInput si el cuerpo real difiere en semántica de comas).

- [ ] **Step 4: Hook controlador compartido**

```ts
// features/recurring-income/lib/useArrivalSheetController.ts
import { useCallback, useState } from "react";
import { format } from "date-fns";

import { useConfirmRecurringIncomeArrivalMutation } from "../../../services/queries/workspace-data";
import { useToast } from "../../../hooks/useToast";
import type { RecurringIncomeSummary, RecurringIncomeBaseChangeMode } from "../../../types/domain";
import { parseMoneyInput, validateArrivalDraft } from "./arrival-validation";

/**
 * Estado + validación + submit del sheet "¿Llegó tu ingreso?" — compartido por
 * la lista de ingresos fijos y el dashboard. Comportamiento idéntico al que
 * vivía inline en app/recurring-income.tsx.
 */
export function useArrivalSheetController(workspaceId: number | null) {
  const confirmArrivalMutation = useConfirmRecurringIncomeArrivalMutation(workspaceId);
  const { showToast } = useToast();

  const [target, setTarget] = useState<RecurringIncomeSummary | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [baseChangeMode, setBaseChangeMode] = useState<RecurringIncomeBaseChangeMode>("none");
  const [newBaseAmount, setNewBaseAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const open = useCallback((item: RecurringIncomeSummary) => {
    setTarget(item);
    setDate(format(new Date(), "yyyy-MM-dd"));
    setAmount(String(item.amount));
    setAccountId(item.accountId ?? null);
    setBaseChangeMode("none");
    setNewBaseAmount(String(item.amount));
    setNotes("");
    setError("");
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setError("");
  }, []);

  const parsedNewBaseAmount = parseMoneyInput(newBaseAmount);
  const baseDelta = target && parsedNewBaseAmount != null ? parsedNewBaseAmount - target.amount : null;

  const submit = useCallback(async () => {
    if (!target) return;
    const validation = validateArrivalDraft({
      date,
      actualAmount: parseMoneyInput(amount),
      accountId,
      baseChangeMode,
      parsedNewBaseAmount: parseMoneyInput(newBaseAmount),
      currentBaseAmount: target.amount,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      setError("");
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: target.id,
        recurringIncomeName: target.name,
        expectedDate: target.nextExpectedDate,
        actualDate: date,
        amount: parseMoneyInput(amount)!,
        accountId: accountId!,
        currentAccountId: target.accountId ?? null,
        categoryId: target.categoryId ?? null,
        payerPartyId: target.payerPartyId ?? null,
        description: target.description ?? null,
        frequency: target.frequency,
        intervalCount: target.intervalCount,
        currentBaseAmount: target.amount,
        newBaseAmount: validation.nextBaseAmount,
        baseChangeKind: baseChangeMode === "none" ? null : baseChangeMode,
        notes: notes.trim() || null,
      });
      setTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos confirmar la llegada";
      setError(message);
      showToast(message, "error");
    }
  }, [accountId, amount, baseChangeMode, confirmArrivalMutation, date, newBaseAmount, notes, showToast, target]);

  return {
    target,
    open,
    close,
    isPending: confirmArrivalMutation.isPending,
    /** Spread directo en <RecurringIncomeArrivalSheet {...sheetProps} accounts={...} /> */
    sheetProps: {
      visible: Boolean(target),
      item: target,
      date,
      onDateChange: setDate,
      amount,
      onAmountChange: setAmount,
      accountId,
      onAccountIdChange: setAccountId,
      baseChangeMode,
      onBaseChangeModeChange: setBaseChangeMode,
      newBaseAmount,
      onNewBaseAmountChange: setNewBaseAmount,
      notes,
      onNotesChange: setNotes,
      error,
      parsedNewBaseAmount,
      baseDelta,
      loading: confirmArrivalMutation.isPending,
      onClose: close,
      onSubmit: submit,
    },
  };
}
```

IMPORTANTE (verificar contra el código real antes de dar por bueno):
- El payload de `mutateAsync` DEBE quedar idéntico campo a campo al de `app/recurring-income.tsx:365-383` (leerlo completo; si hay campos extra no listados aquí, incluirlos).
- El import de `RecurringIncomeBaseChangeMode` debe apuntar a su origen real (ver import en app/recurring-income.tsx línea ~25).
- Si `useToast` expone otra forma (`showToast` directo), ajustar.

- [ ] **Step 5: Refactor de app/recurring-income.tsx (cero cambio de comportamiento)**

1. Eliminar: los 8 `useState` de arrival (líneas ~126-133), `parsedArrivalNewBaseAmount`/`arrivalBaseDelta` (~239-242), `openConfirmArrival`, `closeConfirmArrival`, `handleConfirmArrival` (~314-395), la función local `parseMoneyInput` SI ya no tiene otros usos en el archivo (verificar con grep; si tiene, importarla desde `../features/recurring-income/lib/arrival-validation` y borrar la local), y el uso directo de `confirmArrivalMutation` si queda huérfano.
2. Agregar: `const arrival = useArrivalSheetController(activeWorkspaceId);`
3. Reemplazar el callsite `onConfirmArrival={() => openConfirmArrival(item)}` por `onConfirmArrival={() => arrival.open(item)}`.
4. Reemplazar el render del sheet por:

```tsx
          <RecurringIncomeArrivalSheet
            {...arrival.sheetProps}
            accounts={activeAccounts}
          />
```

5. `npm run typecheck` → sin errores. Smoke: confirmar una llegada desde la lista sigue funcionando igual (mismo sheet, mismos errores, mismo toast).

- [ ] **Step 6: Botón ✓ en UpcomingSection** — en `features/dashboard/components/simple/UpcomingSection.tsx`:

1. Import: `import { CheckCircle2 } from "lucide-react-native";`
2. Props: agregar a `UpcomingSectionProps`:

```ts
  onPaySubscription?: (id: number) => void;
  onConfirmIncome?: (id: number) => void;
```

y recibirlas en la firma.
3. En el tipo `UpcomingItem` agregar `quickAction?: () => void;` y `quickActionLabel?: string;`
4. En el loop de subscriptions agregar al objeto:

```ts
        quickAction: onPaySubscription ? () => onPaySubscription(sub.id) : undefined,
        quickActionLabel: `Pagar ${sub.name}`,
```

5. En el loop de recurringIncome agregar:

```ts
        quickAction: onConfirmIncome ? () => onConfirmIncome(income.id) : undefined,
        quickActionLabel: `Confirmar llegada de ${income.name}`,
```

6. En el render, dentro de `upcomingRowTop`, inmediatamente DESPUÉS del `<View style={[subStyles.upcomingAmountPill, ...]}>...</View>`:

```tsx
              {item.quickAction ? (
                <TouchableOpacity
                  style={subStyles.upcomingQuickAction}
                  onPress={item.quickAction}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={item.quickActionLabel}
                >
                  <CheckCircle2 size={20} color={item.flow === "in" ? COLORS.income : COLORS.gold} />
                </TouchableOpacity>
              ) : null}
```

7. En `features/dashboard/components/simple/styles.ts` agregar al StyleSheet compartido (usando los tokens ya importados ahí):

```ts
  upcomingQuickAction: {
    marginLeft: SPACING.xs,
    padding: SPACING.xs,
    borderRadius: 99,
  },
```

- [ ] **Step 7: Orquestación en dashboard** — en `app/(app)/dashboard.tsx`:

1. Imports nuevos:

```ts
import { MarkSubscriptionPaidSheet } from "../../features/subscriptions/components/MarkSubscriptionPaidSheet";
import { RecurringIncomeArrivalSheet } from "../../features/recurring-income/components/RecurringIncomeArrivalSheet";
import { useArrivalSheetController } from "../../features/recurring-income/lib/useArrivalSheetController";
import { useMarkSubscriptionPaidMutation } from "../../services/queries/subscriptions-recurring-income";
import type { SubscriptionSummary } from "../../types/domain";
```

(ajustar el path del import de `useMarkSubscriptionPaidMutation` al que usa `app/subscriptions.tsx:52`).
2. Dentro del componente (después de `const { activeWorkspaceId, ... } = useWorkspace();`):

```ts
  const markPaidMutation = useMarkSubscriptionPaidMutation(activeWorkspaceId);
  const [dashboardPayTarget, setDashboardPayTarget] = useState<SubscriptionSummary | null>(null);
  const arrival = useArrivalSheetController(activeWorkspaceId);

  const handleDashboardMarkPaid = useCallback(
    async (args: { paidDate: string; amount: number; accountId: number }) => {
      if (!dashboardPayTarget) return;
      try {
        const { nextDueDate } = await markPaidMutation.mutateAsync({
          subscription: dashboardPayTarget,
          paidDate: args.paidDate,
          amount: args.amount,
          accountId: args.accountId,
        });
        setDashboardPayTarget(null);
        showToast(`Pago registrado · Próximo cobro: ${nextDueDate}`, "success");
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : "No se pudo registrar el pago", "error");
      }
    },
    [dashboardPayTarget, markPaidMutation, showToast],
  );
```

(el dashboard ya importa `useToast` — reutilizar la instancia `showToast` existente del componente; si no hay una, crearla).
3. En `<UpcomingSection ...>` (línea ~760) agregar:

```tsx
                onPaySubscription={(id) => {
                  const sub = (snapshot?.subscriptions ?? []).find((s) => s.id === id);
                  if (sub) setDashboardPayTarget(sub);
                }}
                onConfirmIncome={(id) => {
                  const item = (snapshot?.recurringIncome ?? []).find((r) => r.id === id);
                  if (item) arrival.open(item);
                }}
```

4. Junto a los demás overlays/sheets del dashboard (al final del render), agregar:

```tsx
        <MarkSubscriptionPaidSheet
          visible={Boolean(dashboardPayTarget)}
          subscription={dashboardPayTarget}
          accounts={snapshot?.accounts ?? []}
          isPending={markPaidMutation.isPending}
          onClose={() => setDashboardPayTarget(null)}
          onConfirm={(args) => void handleDashboardMarkPaid(args)}
        />
        <RecurringIncomeArrivalSheet
          {...arrival.sheetProps}
          accounts={(snapshot?.accounts ?? []).filter((a) => !a.isArchived)}
        />
```

(verificar cómo filtra cuentas `app/recurring-income.tsx` para `activeAccounts` y replicar el mismo filtro).

- [ ] **Step 8: Validar** — `npx jest __tests__/arrival-validation.test.ts` → PASS. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 9: Smoke manual (documentar)** — dashboard: (1) fila de suscripción próxima muestra ✓ → sheet → confirmar → toast y la fila se actualiza; (2) fila de ingreso muestra ✓ → sheet de llegada → confirmar; (3) lista de ingresos fijos sigue confirmando llegadas igual que antes.

- [ ] **Step 10: Commit**

```bash
git add features/recurring-income/lib/arrival-validation.ts features/recurring-income/lib/useArrivalSheetController.ts app/recurring-income.tsx features/dashboard/components/simple/UpcomingSection.tsx features/dashboard/components/simple/styles.ts "app/(app)/dashboard.tsx" __tests__/arrival-validation.test.ts
git commit -m "feat(dashboard): pagar suscripcion y confirmar ingreso desde Proximos"
```

---

### Task 4: Split al editar (convertir gasto simple → dividido)

**Files:**
- Modify: `features/movements/lib/split-movement.ts` (helpers puros nuevos)
- Modify: `features/movements/lib/movement-input-types.ts:39-51` (`metadata` en `MovementUpdateInput`)
- Modify: `services/queries/workspace-data.ts:2446+` (mapear `metadata` en `useUpdateMovementMutation` — cambio de 1 línea, zona sensible)
- Modify: `components/forms/MovementForm.tsx` (gate de UI + rama de conversión al guardar)
- Test: `__tests__/split-movement.test.ts` (extender)

- [ ] **Step 1: Tests que fallan** — agregar al final de `__tests__/split-movement.test.ts`:

```ts
import { hasSplitGroup, splitLineMetadata } from "../features/movements/lib/split-movement";
// ^ integrar al import existente del archivo.

describe("hasSplitGroup", () => {
  it("true solo cuando metadata trae split_group", () => {
    expect(hasSplitGroup({ split_group: "abc" })).toBe(true);
    expect(hasSplitGroup({ source: "notification_detection" })).toBe(false);
    expect(hasSplitGroup(null)).toBe(false);
    expect(hasSplitGroup(undefined)).toBe(false);
    expect(hasSplitGroup("x")).toBe(false);
    expect(hasSplitGroup([1, 2])).toBe(false);
  });
});

describe("splitLineMetadata", () => {
  it("mergea metadata existente con los campos de split (1-indexed)", () => {
    expect(splitLineMetadata({ source: "detection" }, "g1", 0, 3)).toEqual({
      source: "detection",
      split_group: "g1",
      split_index: 1,
      split_total: 3,
    });
  });
  it("metadata no-objeto se ignora", () => {
    expect(splitLineMetadata(null, "g1", 2, 3)).toEqual({ split_group: "g1", split_index: 3, split_total: 3 });
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx jest __tests__/split-movement.test.ts` → FAIL.

- [ ] **Step 3: Helpers puros** — agregar al final de `features/movements/lib/split-movement.ts`:

```ts
/** True si el metadata de un movimiento indica que ya pertenece a un grupo split. */
export function hasSplitGroup(metadata: unknown): boolean {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).split_group,
  );
}

/** Metadata de una línea split: preserva el metadata previo y agrega los campos del grupo. */
export function splitLineMetadata(
  existing: unknown,
  group: string,
  index: number,
  total: number,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, split_group: group, split_index: index + 1, split_total: total };
}
```

`npx jest __tests__/split-movement.test.ts` → PASS.

- [ ] **Step 4: `metadata` en el contrato de update**

1. En `features/movements/lib/movement-input-types.ts`, dentro de `MovementUpdateInput`, agregar al final:

```ts
  metadata?: JsonValue | null;
```

(agregar `JsonValue` al import de types/domain del archivo si no está).
2. En `services/queries/workspace-data.ts`, dentro de `useUpdateMovementMutation` (~línea 2452, en la serie de `if (input.X !== undefined) payload.x = ...`), agregar UNA línea siguiendo el patrón exacto de las vecinas:

```ts
      if (input.metadata !== undefined) payload.metadata = input.metadata;
```

NO tocar nada más de workspace-data.ts.

- [ ] **Step 5: Gate de UI en MovementForm** — en `components/forms/MovementForm.tsx`:

1. Import: agregar `hasSplitGroup, splitLineMetadata` al import existente de `split-movement`.
2. Cerca del render de StepDetails (antes del `return` del step), definir:

```ts
        const splitUiEnabled = isEditing
          ? form.movementType === "expense" && linkedEventId == null && !hasSplitGroup(editMovement?.metadata)
          : true; // creación: comportamiento actual sin cambios
```

(si `linkedEventId` no está en scope en ese punto, usar la misma fuente que usa la rama de guardado; verificar con grep).
3. Reemplazar (línea ~1169):

```tsx
            splitLines={isEditing ? null : splitLines}
            onChangeSplitLines={!isEditing && form.movementType === "expense" ? setSplitLines : undefined}
```

por:

```tsx
            splitLines={splitUiEnabled ? splitLines : null}
            onChangeSplitLines={splitUiEnabled && form.movementType === "expense" ? setSplitLines : undefined}
```

- [ ] **Step 6: Rama de conversión al guardar** — en la rama `if (isEditing && editMovement) {` del submit (~línea 907), ANTES del `await updateMovement.mutateAsync(...)` actual, insertar:

```ts
        if (splitLines && form.movementType === "expense" && linkedEventId == null && !hasSplitGroup(editMovement.metadata)) {
          // Conversión simple→split: el movimiento original se vuelve la línea 1
          // (conserva id, adjuntos y dedupe); las demás líneas se crean como hermanas.
          const splitValidation = validateSplit(splitLines, sourceAmountNum);
          if (!splitValidation.valid) {
            setIsClosingAfterSubmit(false);
            haptics.error();
            setSubmitError(splitValidation.error ?? "Revisa la división de montos");
            return;
          }
          const splitGroup = newClientDedupeKey("split-edit");
          const firstLine = splitLines[0];
          await updateMovement.mutateAsync({
            id: editMovement.id,
            input: {
              ...buildMovementUpdateInput({
                ...movementContract,
                sourceAmount: parsePositiveAmountInput(firstLine.amount)!,
                description: splitLineDescription(autoDesc, 0, splitLines.length),
                categoryId: firstLine.categoryId,
              }),
              metadata: splitLineMetadata(editMovement.metadata, splitGroup, 0, splitLines.length),
            },
          });
          for (let index = 1; index < splitLines.length; index++) {
            const line = splitLines[index];
            await createMovement.mutateAsync(buildMovementCreateInput({
              ...movementContract,
              sourceAmount: parsePositiveAmountInput(line.amount)!,
              description: splitLineDescription(autoDesc, index, splitLines.length),
              categoryId: line.categoryId,
              metadata: splitLineMetadata(null, splitGroup, index, splitLines.length),
              dedupeKey: `${splitGroup}:split-${index + 1}`,
            }));
          }
          showRichToast({
            type: "success",
            title: `Gasto dividido en ${splitLines.length} movimientos`,
            subtitle: autoDesc,
          });
          haptics.success();
          onSuccess?.();
          onClose();
          return;
        }
```

Notas de fidelidad: usar EXACTAMENTE los identificadores ya presentes en el archivo (`sourceAmountNum`, `autoDesc`, `movementContract`, `newClientDedupeKey`, `parsePositiveAmountInput`, `setIsClosingAfterSubmit`, `haptics`, `setSubmitError`, `showRichToast`) — todos existen en la vía de creación con split (~925-975); si algún nombre difiere, copiar el de esa vía. NO llamar `persistCategoryLearning` en la conversión (hay múltiples categorías). No tocar la rama de update normal.

- [ ] **Step 7: Validar** — `npx jest __tests__/split-movement.test.ts` → PASS. `npm run typecheck` → sin errores. `git diff --check` → limpio.

- [ ] **Step 8: Smoke manual (documentar)** — (1) editar un gasto simple, activar división en 2 categorías, guardar: quedan 2 movimientos `(1/2)`/`(2/2)` con el mismo split_group, el original conserva sus adjuntos; (2) editar un movimiento que YA es parte de un split: el editor de división NO aparece y la edición normal funciona; (3) editar sin tocar el split: comportamiento idéntico al actual; (4) crear con split sigue igual.

- [ ] **Step 9: Commit**

```bash
git add features/movements/lib/split-movement.ts features/movements/lib/movement-input-types.ts services/queries/workspace-data.ts components/forms/MovementForm.tsx __tests__/split-movement.test.ts
git commit -m "feat(movements): convertir gasto simple en dividido al editar"
```

---

### Task 5: Split en el registro rápido de detección

**Files:**
- Modify: `components/domain/QuickDetectedMovementEntry.tsx` (editor + rama de guardado; zona sensible)

Reutiliza `SplitAmountEditor`, `validateSplit`, `splitLineDescription`, `splitLineMetadata` (Task 4) — sin lógica pura nueva, la existente ya está testeada.

- [ ] **Step 1: Estado y editor** — en `components/domain/QuickDetectedMovementEntry.tsx`:

1. Imports:

```ts
import { SplitAmountEditor } from "../../features/movements/components/... (mismo path que usa StepDetails.tsx — verificar)";
import { splitLineMetadata, splitLineDescription, validateSplit, type SplitLine } from "../../features/movements/lib/split-movement";
```

2. Estado junto a `categoryId` (~línea 147):

```ts
  const [splitLines, setSplitLines] = useState<SplitLine[] | null>(null);
```

3. Reset cuando el tipo deja de ser gasto (mismo patrón que MovementForm líneas 732-733):

```ts
  useEffect(() => {
    if (movementType !== "expense" && splitLines) setSplitLines(null);
  }, [movementType, splitLines]);
```

4. En el bloque de UI del gasto donde se elige categoría (buscar el `CategoryPicker`/selector de categoría del modo expense), ocultar el picker cuando `splitLines != null` y renderizar debajo:

```tsx
      {movementType === "expense" ? (
        <SplitAmountEditor
          lines={splitLines}
          onChangeLines={setSplitLines}
          categories={categories}
          totalAmount={parsePositiveAmountInput(amount) ?? 0}
          currencyCode={selectedAccount?.currencyCode ?? ""}
        />
      ) : null}
```

Ajustar `categories`, `amount`, `selectedAccount` a los nombres reales del archivo (leer el bloque de UI del gasto antes de editar; los props del editor son los mismos cinco que le pasa StepDetails.tsx:213-220).

- [ ] **Step 2: Rama de guardado con split** — en el submit del gasto (~línea 820, la llamada `createMovement.mutateAsync(buildMovementCreateInput({ movementType, ... }))`), envolver: si `movementType === "expense" && splitLines`, en vez del create único:

```ts
      if (movementType === "expense" && splitLines) {
        const splitValidation = validateSplit(splitLines, parsedAmount);
        if (!splitValidation.valid) {
          showToast(splitValidation.error ?? "Revisa la división de montos", "error");
          return;
        }
        const splitGroup = `suggestion:${suggestion.id}`;
        const detectionMetadata = { /* el MISMO objeto metadata del create único actual (source, suggestionId, financialAppKey, confidence, counterpartyAi, recurring_income_id, recurringAi, riskAi, budgetAi) — extraerlo a una const para no duplicarlo */ };
        let firstCreatedId: number | null = null;
        for (let index = 0; index < splitLines.length; index++) {
          const line = splitLines[index];
          const created = await createMovement.mutateAsync(buildMovementCreateInput({
            movementType: "expense",
            status: "posted",
            occurredAt,
            description: splitLineDescription(description.trim() || suggestion.description, index, splitLines.length),
            notes: notes.trim() || null,
            sourceAccountId: accountId,
            sourceAmount: parsePositiveAmountInput(line.amount)!,
            destinationAccountId: accountId,
            destinationAmount: parsePositiveAmountInput(line.amount)!,
            transferCurrenciesDiffer: false,
            fxRate: null,
            categoryId: line.categoryId,
            counterpartyId,
            subscriptionId: linkedSubscriptionId,
            metadata: splitLineMetadata(detectionMetadata, splitGroup, index, splitLines.length),
            // Línea 1 conserva la clave del headless (`suggestion:<id>`): si ambas vías
            // corren, la línea 1 colisiona con el movimiento único del headless y no se duplica.
            dedupeKey: index === 0 ? splitGroup : `${splitGroup}:split-${index + 1}`,
          }));
          if (firstCreatedId == null) firstCreatedId = created.id;
        }
        await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "registered", movementId: firstCreatedId! });
        // Continuar con el MISMO post-procesamiento del create único (feedback de
        // categoría/telemetría/cierre) usando firstCreatedId como movementId.
        ...
        return;
      }
```

REGLAS para este step (el archivo es zona sensible):
- La const `detectionMetadata` se extrae del objeto `metadata` del create único EXISTENTE y se reutiliza en AMBAS ramas (única y split) para que no diverjan.
- El post-procesamiento (markSuggestion, `recordSuggestionAction`, cierre del sheet, toasts) debe ser el MISMO que la vía única — leer el bloque completo ~línea 820-900 antes de editar y replicar el orden exacto con `firstCreatedId`. Si el bloque de post-procesamiento es largo, extraerlo a una función local `finishRegistration(created: { id: number })` usada por ambas ramas en vez de duplicarlo.
- NO tocar la vía de transfer (~línea 717) ni el flujo de duplicados.
- El feedback de categoría (`categoryFeedbackIntent`) en la rama split: omitirlo (hay varias categorías) — dejar comentario de una línea explicándolo.

- [ ] **Step 3: Validar** — `npm run typecheck` → sin errores. `npx jest` (suite completa) → PASS. `git diff --check` → limpio.

- [ ] **Step 4: Smoke manual (documentar)** — con una sugerencia detectada de gasto: (1) registrarla SIN split → igual que siempre; (2) registrarla dividiendo en 2 categorías → 2 movimientos `(1/2)`/`(2/2)` con metadata de detección + split, sugerencia marcada como registrada; (3) transferencias e ingresos detectados sin cambios.

- [ ] **Step 5: Commit**

```bash
git add components/domain/QuickDetectedMovementEntry.tsx
git commit -m "feat(detection): dividir en categorias desde el registro rapido"
```

---

## Verificación final (después del Task 5)

- [ ] `npx jest` → suite completa verde.
- [ ] `npm run typecheck` → sin errores.
- [ ] `git diff --check` → limpio.
- [ ] Smoke integral: los 4 criterios de aceptación del spec (sección "Criterios de aceptación" de `2026-07-12-quick-wins-fase2-design.md`).
- [ ] **NO publicar OTA** — preguntar al usuario primero (todo el cambio es JS, elegible para `npx eas-cli update --channel preview`).
