# Asistente v2: registro por chat + voz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asistente registre movimientos (gasto, ingreso, transferencia, pago de suscripción, abono a deuda) desde texto o voz, siempre con confirmación en una tarjeta antes de guardar.

**Architecture:** La edge function `assistant-chat` gana una tool `draft_movement` que PROPONE un borrador tipado (no inserta). El cliente pinta una tarjeta de confirmación; al Guardar usa los mutations existentes (`createMovement`, `markSubscriptionPaid`, `createObligationPayment`) con `client_dedupe_key`. La voz (`expo-speech-recognition`, on-device) alimenta el mismo flujo de texto y requiere APK 1.0.6.

**Tech Stack:** Deno edge function + DeepSeek function calling; React Native/Expo; React Query; expo-speech-recognition; jest.

**Spec:** `docs/superpowers/specs/2026-07-21-assistant-registro-por-chat-voz-design.md`

---

## File Structure

- `supabase/functions/assistant-chat/logic.ts` — MODIFICAR: tool `draft_movement`, reglas de prompt, helper puro `normalizeDraft`.
- `supabase/functions/assistant-chat/index.ts` — MODIFICAR: manejar la tool (devuelve draft, NO escribe) y adjuntar `draft` a la respuesta.
- `supabase/functions/assistant-chat/__tests__/logic.test.ts` — MODIFICAR: tests de `normalizeDraft`.
- `services/queries/assistant.ts` — MODIFICAR: tipo `AssistantDraft` + parseo en `AssistantReply`.
- `features/assistant/lib/draft-to-input.ts` — CREAR: builders puros draft→MovementFormInput / MarkPaidArgs / ObligationPaymentInput.
- `features/assistant/lib/__tests__/draft-to-input.test.ts` — CREAR: tests de los builders.
- `features/assistant/components/AssistantDraftCard.tsx` — CREAR: tarjeta de confirmación.
- `app/assistant.tsx` — MODIFICAR: item `draft`, handlers de guardar por tipo, editar abre form, chips de datos faltantes, botón de voz.
- `app.json` — MODIFICAR: plugin expo-speech-recognition + bump a 1.0.6/vc7.
- `.github/workflows/ci.yml` — MODIFICAR: deno check de assistant-chat y proactive-insights.

---

## Task 1: Helper puro `normalizeDraft` (server)

**Files:**
- Modify: `supabase/functions/assistant-chat/logic.ts`
- Test: `supabase/functions/assistant-chat/__tests__/logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `logic.test.ts` agregar:

```ts
import { normalizeDraft } from "../logic";

describe("normalizeDraft", () => {
  it("acepta un gasto completo y lista faltantes vacíos", () => {
    const d = normalizeDraft({
      operation: "expense", amount: 5, currency: "PEN",
      accountName: "Cuenta Principal", categoryName: "Transporte",
      description: "Taxi",
    });
    expect(d).not.toBeNull();
    expect(d!.operation).toBe("expense");
    expect(d!.amount).toBe(5);
    expect(d!.missing).toEqual([]);
  });

  it("marca 'account' faltante en gasto sin cuenta", () => {
    const d = normalizeDraft({ operation: "expense", amount: 5, currency: "PEN" });
    expect(d!.missing).toContain("account");
  });

  it("transfer exige ambas cuentas", () => {
    const d = normalizeDraft({ operation: "transfer", amount: 200, currency: "PEN", accountName: "BCP" });
    expect(d!.missing).toContain("destinationAccount");
  });

  it("rechaza operación desconocida o monto no positivo", () => {
    expect(normalizeDraft({ operation: "hack", amount: 5 })).toBeNull();
    expect(normalizeDraft({ operation: "expense", amount: 0, currency: "PEN" })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx jest supabase/functions/assistant-chat -t normalizeDraft`
Expected: FAIL ("normalizeDraft is not a function").

- [ ] **Step 3: Implementar `normalizeDraft` en logic.ts**

Agregar al final de `logic.ts`:

```ts
export type DraftOperation = "expense" | "income" | "transfer" | "pay_subscription" | "pay_debt";

export type MovementDraft = {
  operation: DraftOperation;
  amount: number;
  currency: string;
  accountName: string | null;
  destinationAccountName: string | null;
  categoryName: string | null;
  counterpartyName: string | null;
  subscriptionId: number | null;
  subscriptionName: string | null;
  obligationId: number | null;
  obligationCounterparty: string | null;
  occurredAt: string | null; // YYYY-MM-DD; null = hoy (lo resuelve el cliente)
  description: string | null;
  missing: string[];
};

const DRAFT_OPS = new Set<DraftOperation>(["expense", "income", "transfer", "pay_subscription", "pay_debt"]);

export function normalizeDraft(raw: Record<string, unknown>): MovementDraft | null {
  const operation = raw.operation as DraftOperation;
  if (!DRAFT_OPS.has(operation)) return null;
  const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

  const draft: MovementDraft = {
    operation,
    amount,
    currency: str(raw.currency) ?? "PEN",
    accountName: str(raw.accountName),
    destinationAccountName: str(raw.destinationAccountName),
    categoryName: str(raw.categoryName),
    counterpartyName: str(raw.counterpartyName),
    subscriptionId: num(raw.subscriptionId),
    subscriptionName: str(raw.subscriptionName),
    obligationId: num(raw.obligationId),
    obligationCounterparty: str(raw.obligationCounterparty),
    occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.occurredAt ?? "")) ? String(raw.occurredAt) : null,
    description: str(raw.description),
    missing: [],
  };

  const missing: string[] = [];
  if (operation === "pay_subscription") {
    if (!draft.subscriptionId) missing.push("subscription");
  } else if (operation === "pay_debt") {
    if (!draft.obligationId) missing.push("obligation");
    if (!draft.accountName) missing.push("account");
  } else {
    if (!draft.accountName) missing.push("account");
    if (operation === "transfer" && !draft.destinationAccountName) missing.push("destinationAccount");
  }
  draft.missing = missing;
  return draft;
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx jest supabase/functions/assistant-chat -t normalizeDraft`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/assistant-chat/logic.ts supabase/functions/assistant-chat/__tests__/logic.test.ts
git commit -m "feat(assistant): normalizeDraft — borrador de movimiento validado (server)"
```

---

## Task 2: Tool `draft_movement` + wiring en la edge function

**Files:**
- Modify: `supabase/functions/assistant-chat/logic.ts` (ASSISTANT_TOOLS, buildSystemPrompt)
- Modify: `supabase/functions/assistant-chat/index.ts`

- [ ] **Step 1: Agregar la tool a `ASSISTANT_TOOLS` en logic.ts**

Dentro del array `ASSISTANT_TOOLS` agregar:

```ts
  {
    type: "function",
    function: {
      name: "draft_movement",
      description:
        "PROPONE (no registra) un movimiento a partir de lo que el usuario dijo. Úsala cuando el usuario quiere anotar un gasto/ingreso/transferencia o pagar una suscripción o deuda. Resuelve nombres de cuenta/categoría/suscripción/deuda contra el CONTEXTO DEL WORKSPACE. Si falta un dato obligatorio o hay ambigüedad (varias suscripciones/deudas coinciden), NO llames esta tool: pregunta al usuario en texto con las opciones.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["expense", "income", "transfer", "pay_subscription", "pay_debt"] },
          amount: { type: "number" },
          currency: { type: "string", description: "PEN por defecto" },
          accountName: { type: "string", description: "Cuenta origen exacta del contexto" },
          destinationAccountName: { type: "string", description: "Solo transfer: cuenta destino" },
          categoryName: { type: "string" },
          counterpartyName: { type: "string" },
          subscriptionId: { type: "number", description: "Id de la suscripción del contexto (pay_subscription)" },
          subscriptionName: { type: "string" },
          obligationId: { type: "number", description: "Id de la deuda del contexto (pay_debt)" },
          obligationCounterparty: { type: "string" },
          occurredAt: { type: "string", description: "YYYY-MM-DD; omitir si es hoy" },
          description: { type: "string" },
        },
        required: ["operation", "amount"],
      },
    },
  },
```

- [ ] **Step 2: Añadir reglas de registro al system prompt**

En `buildSystemPrompt`, agregar estas líneas al array (antes de la de formato):

```ts
    "REGISTRO: cuando el usuario quiera anotar/registrar/pagar algo, llama draft_movement con lo que entiendas. NUNCA registras tú: la app muestra una tarjeta y el usuario confirma. Resuelve cuenta/categoría/suscripción/deuda contra el CONTEXTO DEL WORKSPACE por nombre.",
    "Si para registrar falta la cuenta, o hay varias suscripciones/deudas/contrapartes que coinciden, NO llames draft_movement: pregunta en texto ofreciendo las opciones concretas del contexto.",
    "'pagué Netflix' → pay_subscription con su id; 'pagué 80 a Juan' → pay_debt con el id de la deuda de Juan; nunca lo conviertas en gasto suelto si existe la entidad.",
```

- [ ] **Step 3: Manejar la tool en index.ts (devuelve draft, NO escribe)**

En el loop de tools de `index.ts`, junto a los otros `else if (name === ...)`, agregar (antes del `else` final):

```ts
          } else if (name === "draft_movement") {
            const draft = normalizeDraft(args);
            pendingDraft = draft; // se adjunta a la respuesta final
            output = {
              result: draft
                ? { ok: true, draft, note: "Borrador propuesto. La app pedirá confirmación; NO está registrado." }
                : { ok: false, error: "No pude armar el movimiento; pide al usuario el dato faltante." },
              movementIds: [],
            };
```

Declarar `let pendingDraft: ReturnType<typeof normalizeDraft> = null;` junto a `const evidence` al inicio del handler, importar `normalizeDraft` del `./logic.ts`, y en el `return jsonResponse({ ok: true, reply, evidence, ... })` agregar `draft: pendingDraft`.

- [ ] **Step 4: Deno check local**

Run: `deno check supabase/functions/assistant-chat/index.ts`
Expected: sin errores.

- [ ] **Step 5: Commit + deploy**

```bash
git add supabase/functions/assistant-chat/
git commit -m "feat(assistant): tool draft_movement (propone, no registra) + reglas de prompt"
npx supabase functions deploy assistant-chat --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
```

---

## Task 3: Tipo `AssistantDraft` + parseo en el cliente

**Files:**
- Modify: `services/queries/assistant.ts`

- [ ] **Step 1: Agregar el tipo y parsearlo**

En `assistant.ts`, agregar el tipo y extender `AssistantReply`:

```ts
export type AssistantDraft = {
  operation: "expense" | "income" | "transfer" | "pay_subscription" | "pay_debt";
  amount: number;
  currency: string;
  accountName: string | null;
  destinationAccountName: string | null;
  categoryName: string | null;
  counterpartyName: string | null;
  subscriptionId: number | null;
  subscriptionName: string | null;
  obligationId: number | null;
  obligationCounterparty: string | null;
  occurredAt: string | null;
  description: string | null;
  missing: string[];
};
```

Añadir `draft: AssistantDraft | null;` a `AssistantReply`, y en `askAssistant` devolver `draft: (response.draft as AssistantDraft) ?? null`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add services/queries/assistant.ts
git commit -m "feat(assistant): AssistantDraft en la respuesta del cliente"
```

---

## Task 4: Builders puros draft→input + tests

**Files:**
- Create: `features/assistant/lib/draft-to-input.ts`
- Test: `features/assistant/lib/__tests__/draft-to-input.test.ts`

Contexto: el cliente resuelve nombres del draft a ids usando el snapshot (cuentas/categorías/contrapartes). Estos builders son puros y reciben ya los ids resueltos.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { draftToMovementInput } from "../draft-to-input";
import type { AssistantDraft } from "../../../../services/queries/assistant";

const base: AssistantDraft = {
  operation: "expense", amount: 5, currency: "PEN",
  accountName: "Cuenta Principal", destinationAccountName: null,
  categoryName: "Transporte", counterpartyName: null,
  subscriptionId: null, subscriptionName: null, obligationId: null,
  obligationCounterparty: null, occurredAt: null, description: "Taxi", missing: [],
};

describe("draftToMovementInput", () => {
  it("gasto → MovementFormInput con source y dedupe", () => {
    const input = draftToMovementInput(base, { sourceAccountId: 1, categoryId: 9, counterpartyId: null, todayIso: "2026-07-21T12:00:00.000Z" });
    expect(input.movementType).toBe("expense");
    expect(input.sourceAccountId).toBe(1);
    expect(input.sourceAmount).toBe(5);
    expect(input.categoryId).toBe(9);
    expect(input.destinationAccountId).toBeNull();
    expect(input.dedupeKey).toMatch(/^assistant:/);
    expect(input.occurredAt).toBe("2026-07-21T12:00:00.000Z");
  });

  it("ingreso → destino recibe el monto", () => {
    const input = draftToMovementInput({ ...base, operation: "income" }, { sourceAccountId: 1, categoryId: null, counterpartyId: null, todayIso: "2026-07-21T12:00:00.000Z" });
    expect(input.movementType).toBe("income");
    expect(input.destinationAccountId).toBe(1);
    expect(input.destinationAmount).toBe(5);
    expect(input.sourceAccountId).toBeNull();
  });

  it("transfer → source y destination", () => {
    const input = draftToMovementInput(
      { ...base, operation: "transfer", destinationAccountName: "Interbank" },
      { sourceAccountId: 1, destinationAccountId: 2, categoryId: null, counterpartyId: null, todayIso: "2026-07-21T12:00:00.000Z" },
    );
    expect(input.sourceAccountId).toBe(1);
    expect(input.destinationAccountId).toBe(2);
    expect(input.sourceAmount).toBe(5);
    expect(input.destinationAmount).toBe(5);
  });
});
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx jest features/assistant/lib`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el builder**

`features/assistant/lib/draft-to-input.ts`:

```ts
import type { MovementFormInput } from "../../movements/lib/movement-input-types";
import type { AssistantDraft } from "../../../services/queries/assistant";

export type ResolvedIds = {
  sourceAccountId: number | null;
  destinationAccountId?: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  todayIso: string;
};

/** Clave de idempotencia estable por draft: mismo draft guardado 2 veces no duplica. */
export function draftDedupeKey(draft: AssistantDraft): string {
  const parts = [draft.operation, draft.amount, draft.currency, draft.accountName, draft.occurredAt, draft.description];
  return `assistant:${parts.join("|")}`;
}

export function draftToMovementInput(draft: AssistantDraft, ids: ResolvedIds): MovementFormInput {
  const occurredAt = draft.occurredAt ? `${draft.occurredAt}T12:00:00.000Z` : ids.todayIso;
  const common = {
    status: "posted" as const,
    occurredAt,
    description: draft.description ?? "",
    categoryId: ids.categoryId,
    counterpartyId: ids.counterpartyId,
    metadata: { source: "assistant_chat" },
    dedupeKey: draftDedupeKey(draft),
  };
  if (draft.operation === "income") {
    return {
      ...common, movementType: "income",
      sourceAccountId: null, sourceAmount: null,
      destinationAccountId: ids.sourceAccountId, destinationAmount: draft.amount,
    };
  }
  if (draft.operation === "transfer") {
    return {
      ...common, movementType: "transfer", categoryId: null,
      sourceAccountId: ids.sourceAccountId, sourceAmount: draft.amount,
      destinationAccountId: ids.destinationAccountId ?? null, destinationAmount: draft.amount,
    };
  }
  // expense (default)
  return {
    ...common, movementType: "expense",
    sourceAccountId: ids.sourceAccountId, sourceAmount: draft.amount,
    destinationAccountId: null, destinationAmount: null,
  };
}
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx jest features/assistant/lib`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add features/assistant/lib/draft-to-input.ts features/assistant/lib/__tests__/draft-to-input.test.ts
git commit -m "feat(assistant): builder puro draft→MovementFormInput + tests"
```

---

## Task 5: Componente `AssistantDraftCard`

**Files:**
- Create: `features/assistant/components/AssistantDraftCard.tsx`

- [ ] **Step 1: Crear la tarjeta**

Componente presentacional puro (recibe datos listos + callbacks). Props:

```tsx
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { AssistantDraft } from "../../../services/queries/assistant";

type Status = "pending" | "saved" | "discarded";

type Props = {
  draft: AssistantDraft;
  status: Status;
  lines: { label: string; value: string }[]; // ya resueltas (cuenta, categoría, etc.)
  amountLabel: string; // ej. "- S/ 5.00"
  isSaving: boolean;
  onSave: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onViewMovement?: () => void;
};

export function AssistantDraftCard({ draft, status, lines, amountLabel, isSaving, onSave, onEdit, onCancel, onViewMovement }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.amount}>{amountLabel}</Text>
      {lines.map((l) => (
        <View key={l.label} style={styles.line}>
          <Text style={styles.lineLabel}>{l.label}</Text>
          <Text style={styles.lineValue}>{l.value}</Text>
        </View>
      ))}
      {status === "pending" ? (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onSave} disabled={isSaving}>
            <Text style={styles.btnPrimaryText}>{isSaving ? "Guardando…" : "Guardar"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onEdit} disabled={isSaving}>
            <Text style={styles.btnText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onCancel} disabled={isSaving}>
            <Text style={styles.btnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : status === "saved" ? (
        <TouchableOpacity style={styles.savedRow} onPress={onViewMovement}>
          <Text style={styles.savedText}>Guardado ✓  ·  Ver movimiento</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.discardedText}>Descartado</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: SURFACE.cardActiveBorder, backgroundColor: SURFACE.card, padding: SPACING.md, gap: SPACING.xs, maxWidth: "94%", alignSelf: "flex-start" },
  amount: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg },
  line: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  lineLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  lineValue: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  actions: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.sm },
  btn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, borderWidth: 1, borderColor: SURFACE.cardBorder },
  btnText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  btnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  btnPrimaryText: { color: COLORS.void, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  savedRow: { marginTop: SPACING.xs },
  savedText: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  discardedText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add features/assistant/components/AssistantDraftCard.tsx
git commit -m "feat(assistant): AssistantDraftCard (tarjeta de confirmación)"
```

---

## Task 6: Cablear el draft en `app/assistant.tsx`

**Files:**
- Modify: `app/assistant.tsx`

- [ ] **Step 1: Extender el item de chat y renderizar la tarjeta**

Agregar a `ChatItem` el campo opcional `draft?: AssistantDraft` y `draftStatus?: "pending"|"saved"|"discarded"` y `savedMovementId?: number`. En `send`, tras recibir `response`, si `response.draft` existe, agregar un item con ese draft (además del texto del reply). En `renderItem`, si `item.draft`, renderizar `<AssistantDraftCard>` resolviendo las líneas y el `amountLabel` desde el snapshot (cuentas/categorías por nombre).

- [ ] **Step 2: Resolver nombres → ids con el snapshot**

Usar `useWorkspaceSnapshotQuery` (ya disponible vía workspace context/profile) para mapear `draft.accountName`→id, `categoryName`→id, `destinationAccountName`→id. Helper local `resolveDraftIds(draft, snapshot): ResolvedIds`. Si un nombre no resuelve a id, tratarlo como dato faltante y mostrar chips (reusa el patrón de sugerencias existente) en vez de la tarjeta.

- [ ] **Step 3: Handlers de guardar por tipo**

```tsx
const createMovement = useCreateMovementMutation(activeWorkspaceId);
const markSubPaid = useMarkSubscriptionPaidMutation(activeWorkspaceId);
const payObligation = useCreateObligationPaymentMutation(activeWorkspaceId);

async function saveDraft(item: ChatItem) {
  const draft = item.draft!;
  const ids = resolveDraftIds(draft, snapshot);
  try {
    if (draft.operation === "pay_subscription") {
      const sub = snapshot.subscriptions.find((s) => s.id === draft.subscriptionId);
      const res = await markSubPaid.mutateAsync({ subscription: sub!, paidDate: todayYmd(), amount: draft.amount, accountId: ids.sourceAccountId! });
      markSaved(item, res.movementId ?? undefined);
    } else if (draft.operation === "pay_debt") {
      await payObligation.mutateAsync({ obligationId: draft.obligationId!, amount: draft.amount, paymentDate: todayYmd(), accountId: ids.sourceAccountId, createMovement: true });
      markSaved(item);
    } else {
      const created = await createMovement.mutateAsync(draftToMovementInput(draft, ids));
      markSaved(item, created.id);
    }
  } catch (e) { showToast(humanizeError(e), "error"); }
}
```

(`todayYmd()` = fecha Lima YYYY-MM-DD; `markSaved` cambia `draftStatus` a "saved" y guarda `savedMovementId`.)

- [ ] **Step 4: Editar y cancelar**

Editar: abrir `MovementForm` prellenado con `draftToMovementInput(draft, ids)` (el form ya acepta valores iniciales; pasar como `editValues`/props existentes o navegar a la ruta del form con params). Cancelar: `draftStatus = "discarded"`. "Ver movimiento": `router.push('/movement/'+savedMovementId+'?from=assistant')`.

- [ ] **Step 5: Typecheck + jest**

Run: `npm run typecheck && npx jest`
Expected: OK, 205+ verdes.

- [ ] **Step 6: Commit + OTA (partes JS)**

```bash
git add app/assistant.tsx
git commit -m "feat(assistant): registro por chat — tarjeta de confirmación y guardado por tipo"
git push origin main
npx eas-cli update --channel preview --message "asistente: registrar movimientos por chat con confirmacion"
```

---

## Task 7: Instalar expo-speech-recognition (nativo)

**Files:**
- Modify: `package.json`, `app.json`

- [ ] **Step 1: Instalar**

Run: `npx expo install expo-speech-recognition`
Expected: agrega la dep.

- [ ] **Step 2: Config plugin + permisos en app.json**

En `plugins` de `app.json` agregar:

```json
[
  "expo-speech-recognition",
  {
    "microphonePermission": "DarkMoney usa el micrófono para registrar movimientos por voz.",
    "speechRecognitionPermission": "DarkMoney usa reconocimiento de voz para entender lo que dictas.",
    "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore(assistant): dep nativa expo-speech-recognition + permisos"
```

---

## Task 8: Botón de micrófono en el asistente

**Files:**
- Modify: `app/assistant.tsx`

- [ ] **Step 1: Hook de dictado**

Usar `ExpoSpeechRecognitionModule` + eventos `result`. Botón mic junto al input: al presionar pide permiso (`requestPermissionsAsync`), inicia `start({ lang: "es-PE", interimResults: true })`; los resultados van a `setInput`; al soltar, `stop()`. Si el permiso se deniega, toast que sugiere el mic del teclado.

```tsx
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

useSpeechRecognitionEvent("result", (e) => {
  const text = e.results?.[0]?.transcript ?? "";
  if (text) setInput(text);
});

async function startDictation() {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) { showToast("Sin permiso de micrófono. Usa el micrófono del teclado.", "warning"); return; }
  ExpoSpeechRecognitionModule.start({ lang: "es-PE", interimResults: true });
}
```

Botón Mic (lucide `Mic`) a la izquierda del botón enviar; `onPressIn={startDictation}` `onPressOut={() => ExpoSpeechRecognitionModule.stop()}`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add app/assistant.tsx
git commit -m "feat(assistant): botón de voz (expo-speech-recognition) alimenta el chat"
```

---

## Task 9: Bump de versión y build del APK

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Bump a 1.0.6 / versionCode 7**

En `app.json`: `"version": "1.0.6"` y `"versionCode": 7`.

- [ ] **Step 2: Commit + build**

```bash
git add app.json
git commit -m "chore(release): version 1.0.6 (vc7) por dep nativa de voz"
git push origin main
npm run build:android
```

Expected: preflight OK, build EAS lanzado.

- [ ] **Step 3: Instalar y verificar (ver Task 11).**

---

## Task 10: Cerrar el hueco de CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Agregar las funciones nuevas al deno check**

En el job `edge-functions`, en el `run:` multilinea, agregar:

```yaml
          deno check supabase/functions/assistant-chat/index.ts
          deno check supabase/functions/proactive-insights/index.ts
```

- [ ] **Step 2: Commit + push (dispara CI)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: deno check de assistant-chat y proactive-insights"
git push origin main
```

---

## Task 11: Verificación E2E en dispositivo

- [ ] Instalar el APK 1.0.6 por adb; confirmar `versionName=1.0.6`.
- [ ] "gasté 5 soles en taxi" → tarjeta gasto S/5, cuenta correcta → Guardar → aparece en Movimientos.
- [ ] "me pagaron 3500 de sueldo" → ingreso al destino.
- [ ] "transferí 200 de BCP a Interbank" → transferencia con 2 cuentas.
- [ ] "pagué Netflix" → pay_subscription ligado a la suscripción correcta.
- [ ] "pagué 80 a Juan" → pay_debt a la deuda correcta (si hay 2 Juan, debe preguntar).
- [ ] "gasté 20" (sin cuenta) → el asistente pregunta la cuenta con chips.
- [ ] Voz: mantener mic, decir "gasté diez en almuerzo", soltar → texto correcto → tarjeta.
- [ ] Editar en una tarjeta abre el form prellenado; Cancelar la marca descartada.
- [ ] Guardar dos veces rápido no duplica (dedupe).

---

## Notas de implementación

- El asistente ya inyecta cuentas/categorías/deudas/suscripciones al contexto (buildWorkspaceContext) — el modelo resuelve nombres desde ahí; el cliente re-resuelve a ids con el snapshot para no confiar ids del LLM ciegamente.
- Reusar `humanizeError`, `showToast`, `useWorkspaceSnapshotQuery` ya presentes en el proyecto.
- `todayYmd()` / `todayIso`: usar el helper de fecha Lima existente en `lib/date.ts` si existe; si no, `new Date().toISOString()`.
- El modelo definitivo es `deepseek-reasoner` (ya configurado) — soporta function calling; el draft sale de una tool call normal.
