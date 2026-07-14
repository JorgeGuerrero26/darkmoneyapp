# Confirmación IA de duplicados (Pro) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capa IA (DeepSeek, Pro server-side) que confirma si un posible duplicado de la detección es realmente duplicado antes de tragárselo — spec `docs/superpowers/specs/2026-07-14-duplicados-ia-design.md`.

**Architecture:** El check determinista `findPossibleDuplicateMovement` sigue siendo el primer filtro; cuando encuentra candidato, un helper `confirmDuplicateWithAi` invoca la edge function `movement-duplicate-ai-check` (patrón calcado de `movement-category-ai-suggestion`: auth + workspace member + `hasProAccess` + límite diario + DeepSeek). El veredicto se traduce a acción con una tabla pura testeada. `unknown` requiere el status nuevo `needs_review` (migración). F2: fix nativo del tile id (Kotlin, APK).

**Tech Stack:** Supabase Edge Functions (Deno), DeepSeek chat completions, React Native/Expo, jest, Kotlin (F2).

**Reglas:** un commit por task; validar `npx jest` + `npm run typecheck` + `git diff --check`; NUNCA stagear `.claude/settings.local.json` / `.env.example`; no exponer secrets; el deploy de la edge function y el `supabase db push` son operaciones cloud → SOLO documentarlas en el commit, ejecutarlas queda para el gate final con aprobación del usuario.

---

## FASE 1 — Capa IA (OTA)

### Task 1: Migración `needs_review` + diccionario

**Files:**
- Create: `supabase/migrations/202607140001_suggestion_status_needs_review.sql`
- Modify/Create: `DATABASE_DICTIONARY.md` (gitignored — actualizar local; si no existe en esta máquina, crearlo con la sección)

- [ ] **Step 1: Migración** (plantilla: `202606100003_suggestion_status_duplicate.sql`):

```sql
-- Capa IA de duplicados (2026-07-14): cuando la IA no puede confirmar si un posible
-- duplicado es real (timeout/error), la sugerencia NO se cierra sola: pasa a
-- 'needs_review' y el usuario decide desde la bandeja (quick entry). Evita tanto
-- tragarse movimientos reales como duplicar automaticamente.

alter table public.notification_detected_movement_suggestions
  drop constraint if exists notification_detected_movement_suggestions_status_check;

alter table public.notification_detected_movement_suggestions
  add constraint notification_detected_movement_suggestions_status_check
  check (status in ('pending', 'registered', 'discarded', 'duplicate', 'needs_review'));
```

- [ ] **Step 2: Diccionario** — en `DATABASE_DICTIONARY.md`, tabla `notification_detected_movement_suggestions`, actualizar la fila `status` con el nuevo valor y una línea de por qué. Si el archivo no existe localmente, crearlo solo con esta sección (regla del CLAUDE.md).

- [ ] **Step 3: Commit** (la migración NO se aplica al remoto aquí — gate final):

```bash
git add supabase/migrations/202607140001_suggestion_status_needs_review.sql
git commit -m "feat(detection): status needs_review para duplicados sin veredicto IA"
```

### Task 2: Tabla pura veredicto→acción + parser + tests

**Files:**
- Create: `features/notifications/lib/duplicate-verdict.ts`
- Test: `__tests__/duplicate-verdict.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// __tests__/duplicate-verdict.test.ts
import { parseDuplicateVerdict, resolveDuplicateAction } from "../features/notifications/lib/duplicate-verdict";

describe("resolveDuplicateAction", () => {
  it("mapea cada veredicto a su accion", () => {
    expect(resolveDuplicateAction("distinct")).toBe("register");
    expect(resolveDuplicateAction("duplicate")).toBe("close-duplicate");
    expect(resolveDuplicateAction("skipped")).toBe("close-duplicate");
    expect(resolveDuplicateAction("unknown")).toBe("needs-review");
  });
});

describe("parseDuplicateVerdict", () => {
  it("acepta respuestas validas", () => {
    expect(parseDuplicateVerdict({ verdict: "distinct", reason: "montos de remitentes distintos" }))
      .toEqual({ verdict: "distinct", reason: "montos de remitentes distintos" });
    expect(parseDuplicateVerdict({ verdict: "skipped" })).toEqual({ verdict: "skipped", reason: null });
  });
  it("cualquier forma invalida cae a unknown", () => {
    expect(parseDuplicateVerdict(null).verdict).toBe("unknown");
    expect(parseDuplicateVerdict({ verdict: "yes" }).verdict).toBe("unknown");
    expect(parseDuplicateVerdict("distinct").verdict).toBe("unknown");
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx jest __tests__/duplicate-verdict.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implementar**

```ts
// features/notifications/lib/duplicate-verdict.ts

export type DuplicateVerdict = "duplicate" | "distinct" | "unknown" | "skipped";
export type DuplicateAction = "register" | "close-duplicate" | "needs-review";

export type DuplicateAiResult = {
  verdict: DuplicateVerdict;
  reason: string | null;
};

const VERDICTS: readonly DuplicateVerdict[] = ["duplicate", "distinct", "unknown", "skipped"];

/** Contrato con la edge function: cualquier forma inesperada degrada a unknown. */
export function parseDuplicateVerdict(raw: unknown): DuplicateAiResult {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const verdict = (raw as Record<string, unknown>).verdict;
    if (typeof verdict === "string" && (VERDICTS as readonly string[]).includes(verdict)) {
      const reason = (raw as Record<string, unknown>).reason;
      return { verdict: verdict as DuplicateVerdict, reason: typeof reason === "string" && reason.trim() ? reason : null };
    }
  }
  return { verdict: "unknown", reason: null };
}

/**
 * distinct → registrar (el usuario ya pidió el registro); duplicate → cerrar como hoy;
 * skipped (no Pro) → comportamiento actual (cerrar); unknown (fallo IA) → revisión manual.
 */
export function resolveDuplicateAction(verdict: DuplicateVerdict): DuplicateAction {
  if (verdict === "distinct") return "register";
  if (verdict === "unknown") return "needs-review";
  return "close-duplicate";
}
```

- [ ] **Step 4: PASS** — `npx jest __tests__/duplicate-verdict.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add features/notifications/lib/duplicate-verdict.ts __tests__/duplicate-verdict.test.ts
git commit -m "feat(detection): contrato puro veredicto IA de duplicados y su accion"
```

### Task 3: Edge function `movement-duplicate-ai-check`

**Files:**
- Create: `supabase/functions/movement-duplicate-ai-check/index.ts`
- Modify: `services/queries/notification-detection.ts` (mapa `AI_NOTIFICATION_FEATURE_LIMITS`, ~línea 530)

- [ ] **Step 1: Leer el patrón** — abrir `supabase/functions/movement-category-ai-suggestion/index.ts` COMPLETO (416 líneas). La nueva función copia su esqueleto: imports de `../_shared/obligation-share-utils.ts` (`authenticatedUser`, `corsHeaders`, `jsonResponse`, `readJsonBody`, `serviceClient`) + `isFallbackProEmail`, `hasProAccess`, `assertWorkspaceMember`, `usageCount`/`recordUsage` (tabla `ai_feature_usage_events`), manejo CORS/OPTIONS, y LA MISMA forma de llamar a DeepSeek (URL, headers, modelo por env `DEEPSEEK_MODEL`, parse del contenido). Copiar esas secciones adaptándolas; no inventar otra forma de llamar la API.

- [ ] **Step 2: Implementar** — esqueleto de la lógica propia (el resto se calca del patrón):

```ts
const FEATURE_KEY = "movement-duplicate-ai-check";
const DAILY_LIMIT = 50;

type DuplicateCheckBody = {
  workspaceId: number;
  suggestion: { description: string; amountLabel: string; occurredAt: string; sourceApp: string; rawText: string | null };
  candidateMovement: { id: number; description: string | null; occurredAt: string; amount: number };
  counts: { sameDaySuggestions: number; sameDayRegisteredFromSuggestions: number; sameDayMatchingMovements: number };
};

function buildPrompt(body: DuplicateCheckBody): string {
  return [
    "Eres un verificador de duplicados de una app de finanzas personales en Perú.",
    "Se detectó una notificación bancaria cuyo monto y día coinciden con un movimiento ya registrado.",
    "Decide si la notificación corresponde AL MISMO movimiento (duplicate) o a OTRO movimiento real (distinct).",
    "Regla fuerte: si las señales detectadas del día (sameDaySuggestions) superan los movimientos coincidentes registrados (sameDayMatchingMovements), probablemente es distinct.",
    "Señales como remitentes distintos en el texto también indican distinct.",
    "Si no puedes decidir con confianza, responde unknown.",
    'Responde SOLO JSON: {"verdict":"duplicate"|"distinct"|"unknown","reason":"<una frase en español>"}',
    "",
    "Notificación detectada:",
    JSON.stringify(body.suggestion),
    "Movimiento ya registrado (candidato a duplicado):",
    JSON.stringify(body.candidateMovement),
    "Conteos del día:",
    JSON.stringify(body.counts),
  ].join("\n");
}
```

Flujo del handler (igual al patrón): OPTIONS→CORS; `authenticatedUser`; `readJsonBody` + validar campos (400 si faltan); `assertWorkspaceMember` (403); `hasProAccess` → si NO: `jsonResponse({ verdict: "skipped", reason: null, source: "entitlement" })` **sin llamar a DeepSeek ni registrar uso**; límite diario excedido → `jsonResponse({ verdict: "unknown", reason: "limite diario", source: "limit" })`; llamar DeepSeek con `buildPrompt`; parsear el JSON del contenido (si falla → `unknown`); validar `verdict` ∈ {duplicate,distinct,unknown}; `recordUsage`; responder `{ verdict, reason, source: "deepseek" }`. Header de deploy en comentario:

```ts
/**
 * Deploy:
 *   npx supabase functions deploy movement-duplicate-ai-check --project-ref <project-ref>
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY
 * Optional: DEEPSEEK_MODEL
 */
```

- [ ] **Step 3: Registrar el límite en el cliente** — en `AI_NOTIFICATION_FEATURE_LIMITS` (notification-detection.ts ~530) agregar `"movement-duplicate-ai-check": 50,`.

- [ ] **Step 4: Validar** — `npm run typecheck` (la edge function es Deno y NO entra al tsconfig de la app — verificar que las demás funciones tampoco; si el typecheck la toca y falla por tipos Deno, replicar la exclusión que usen las funciones existentes). `git diff --check`.

- [ ] **Step 5: Commit** (NO deployar — gate final):

```bash
git add supabase/functions/movement-duplicate-ai-check/index.ts services/queries/notification-detection.ts
git commit -m "feat(detection): edge function movement-duplicate-ai-check con gating pro y limite diario"
```

### Task 4: Conteos + helper cliente

**Files:**
- Modify: `services/queries/notification-detection.ts` (junto a `findPossibleDuplicateMovement`, ~línea 593)

- [ ] **Step 1: Implementar `countSameDayDetectionSignals`**

```ts
export type SameDayDetectionSignals = {
  sameDaySuggestions: number;
  sameDayRegisteredFromSuggestions: number;
  sameDayMatchingMovements: number;
};

/** Conteos que alimentan la verificación IA: si hay más señales detectadas que
 *  movimientos coincidentes, el "duplicado" probablemente es otro movimiento real. */
export async function countSameDayDetectionSignals(input: {
  workspaceId: number;
  amount: number;
  movementType: string;
  occurredAt: string;
  accountId?: number | null;
}): Promise<SameDayDetectionSignals> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const date = new Date(input.occurredAt);
  const day = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;

  const suggestionsQuery = supabase
    .from("notification_detected_movement_suggestions")
    .select("id, status", { count: "exact" })
    .eq("workspace_id", input.workspaceId)
    .eq("amount", input.amount)
    .gte("occurred_at", from)
    .lte("occurred_at", to);

  const amountColumn = input.movementType === "income" ? "destination_amount" : "source_amount";
  let movementsQuery = supabase
    .from("movements")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", input.workspaceId)
    .eq("movement_type", input.movementType)
    .eq("status", "posted")
    .gte("occurred_at", from)
    .lte("occurred_at", to)
    .eq(amountColumn, input.amount);
  if (input.accountId) {
    const accountColumn = input.movementType === "income" ? "destination_account_id" : "source_account_id";
    movementsQuery = movementsQuery.eq(accountColumn, input.accountId);
  }

  const [suggestionsRes, movementsRes] = await Promise.all([suggestionsQuery, movementsQuery]);
  const rows = (suggestionsRes.data ?? []) as Array<{ status: string }>;
  return {
    sameDaySuggestions: suggestionsRes.count ?? rows.length,
    sameDayRegisteredFromSuggestions: rows.filter((row) => row.status === "registered").length,
    sameDayMatchingMovements: movementsRes.count ?? 0,
  };
}
```

- [ ] **Step 2: Implementar `confirmDuplicateWithAi`** (usa el parser de Task 2; timeout 8s; sin React — sirve para headless y quick entry):

```ts
import { parseDuplicateVerdict, type DuplicateAiResult } from "../../features/notifications/lib/duplicate-verdict";

const DUPLICATE_AI_TIMEOUT_MS = 8_000;

export async function confirmDuplicateWithAi(input: {
  workspaceId: number;
  suggestion: { description: string; amountLabel: string; occurredAt: string; sourceApp: string; rawText: string | null };
  candidateMovement: { id: number; description: string | null; occurredAt: string; amount: number };
  counts: SameDayDetectionSignals;
}): Promise<DuplicateAiResult> {
  if (!supabase) return { verdict: "unknown", reason: null };
  try {
    const invoke = supabase.functions.invoke("movement-duplicate-ai-check", { body: input });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("duplicate-ai-timeout")), DUPLICATE_AI_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([invoke, timeout]);
    if (error) return { verdict: "unknown", reason: null };
    return parseDuplicateVerdict(data);
  } catch {
    return { verdict: "unknown", reason: null };
  }
}
```

- [ ] **Step 3: Validar** — `npx jest` verde + `npm run typecheck` + `git diff --check`.
- [ ] **Step 4: Commit**

```bash
git add services/queries/notification-detection.ts
git commit -m "feat(detection): conteos del dia y helper confirmDuplicateWithAi"
```

### Task 5: Integración en el flujo headless

**Files:**
- Modify: `lib/notification-detection-headless.ts` (bloque `if (duplicate) {` ~línea 688)

- [ ] **Step 1: Leer el bloque completo** (líneas ~660-740) para conocer los identificadores reales (`supabase`, `payload`, `suggestion`, `workspaceId`, `movementType`, `amount`, `description`, `nativeDetection`, `clearRegistrationRetry`).

- [ ] **Step 2: Reemplazar el interior del `if (duplicate)`** por:

```ts
  if (duplicate) {
    const counts = await countSameDayDetectionSignals({
      workspaceId,
      amount,
      movementType,
      occurredAt: suggestion.occurredAt,
      accountId: payload.accountId ?? null,
    }).catch(() => ({ sameDaySuggestions: 0, sameDayRegisteredFromSuggestions: 0, sameDayMatchingMovements: 1 }));
    const aiResult = await confirmDuplicateWithAi({
      workspaceId,
      suggestion: {
        description,
        amountLabel: String(amount),
        occurredAt: suggestion.occurredAt,
        sourceApp: suggestion.financialAppKey ?? suggestion.packageName ?? "unknown",
        rawText: suggestion.text ?? null,
      },
      candidateMovement: {
        id: duplicate.id,
        description: duplicate.description ?? null,
        occurredAt: duplicate.occurredAt,
        amount,
      },
      counts,
    });
    const action = resolveDuplicateAction(aiResult.verdict);

    if (action === "close-duplicate") {
      // Cerrar la sugerencia como 'duplicate' vinculada al movimiento existente (hallazgo N4:
      // dejarla pending reintentaba el registro en cada re-disparo).
      await supabase
        .from("notification_detected_movement_suggestions")
        .update({
          status: "duplicate",
          movement_id: duplicate.id,
          metadata: { duplicateAi: aiResult },
          updated_at: new Date().toISOString(),
        })
        .eq("id", suggestion.id);
      await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("related_entity_type", "detected_movement_suggestion")
        .eq("related_entity_id", suggestion.id)
        .eq("kind", "detected_movement_suggestion");
      nativeDetection?.markSuggestionRegistered?.(payload.suggestionId, payload.notificationId ?? 0);
      nativeDetection?.requestCancelBankNotification?.(payload.suggestionId);
      clearRegistrationRetry(payload);
      return;
    }

    if (action === "needs-review") {
      // Sin veredicto: no cerrar ni registrar — el usuario decide desde la bandeja.
      await supabase
        .from("notification_detected_movement_suggestions")
        .update({ status: "needs_review", metadata: { duplicateAi: aiResult }, updated_at: new Date().toISOString() })
        .eq("id", suggestion.id);
      await supabase
        .from("notifications")
        .update({
          title: "Posible duplicado — confírmalo",
          body: `Detectamos ${description} pero ya hay un movimiento igual hoy. Ábrelo para decidir.`,
        })
        .eq("related_entity_type", "detected_movement_suggestion")
        .eq("related_entity_id", suggestion.id)
        .eq("kind", "detected_movement_suggestion");
      nativeDetection?.requestCancelBankNotification?.(payload.suggestionId);
      clearRegistrationRetry(payload);
      return;
    }
    // action === "register": seguir con el flujo normal de registro (no return).
  }
```

FIDELIDAD: (a) ajustar los nombres al bloque real leído en Step 1 (p. ej. si `metadata` de la sugerencia ya trae contenido, hacer merge `{ ...existing, duplicateAi }` — leer cómo se maneja metadata en ese archivo; si no hay lectura previa disponible, usar el update tal cual: la tabla tiene default `{}` y este es el único writer de `duplicateAi`); (b) los imports nuevos (`countSameDayDetectionSignals`, `confirmDuplicateWithAi`, `resolveDuplicateAction`) van al bloque de imports existente del archivo; (c) NO tocar el resto del flujo.

- [ ] **Step 3: Validar** — `npx jest` + `npm run typecheck` + `git diff --check`.
- [ ] **Step 4: Commit**

```bash
git add lib/notification-detection-headless.ts
git commit -m "feat(detection): headless consulta IA antes de cerrar duplicados"
```

### Task 6: Integración en el quick entry de la app

**Files:**
- Modify: `components/domain/QuickDetectedMovementEntry.tsx` (bloque del Alert de duplicado, ~línea 782)

- [ ] **Step 1: Leer** el bloque ~770-820 (Alert "Puede que este movimiento ya exista") y cómo obtiene entitlement el componente (buscar `entitlement`/`proAccess` en el archivo; si no lo tiene, mirar cómo lo hace `hooks/useNotificationDetectionRuntimeSync.ts:103` con `useUserEntitlementQuery` y replicarlo).

- [ ] **Step 2: Integrar** — tras `findPossibleDuplicateMovement` devolver candidato y ANTES del `Alert.alert`:

```ts
        if (duplicate && proAccessEnabled) {
          const counts = await countSameDayDetectionSignals({
            workspaceId: activeWorkspaceId,
            amount: parsedAmount,
            movementType,
            occurredAt,
            accountId,
          }).catch(() => ({ sameDaySuggestions: 0, sameDayRegisteredFromSuggestions: 0, sameDayMatchingMovements: 1 }));
          const aiResult = await confirmDuplicateWithAi({
            workspaceId: activeWorkspaceId,
            suggestion: {
              description: description.trim() || suggestion.description,
              amountLabel: String(parsedAmount),
              occurredAt,
              sourceApp: suggestion.financialAppKey,
              rawText: suggestion.description ?? null,
            },
            candidateMovement: {
              id: duplicate.id,
              description: duplicate.description ?? null,
              occurredAt: duplicate.occurredAt,
              amount: parsedAmount,
            },
            counts,
          });
          if (aiResult.verdict === "distinct") {
            // La IA confirma que es otro movimiento: registrar sin fricción.
            await submitConfirmed();
            return;
          }
          if (aiResult.verdict === "duplicate" && aiResult.reason) {
            duplicateAiReason = aiResult.reason; // se añade al cuerpo del Alert
          }
          // unknown/skipped → Alert actual sin cambios.
        }
```

FIDELIDAD: adaptar identificadores al código real (Step 1): el "registrar de todas formas" existente es la referencia de cómo continuar el registro (`void submit(true)` según el bloque actual — usar ESE mecanismo en vez de `submitConfirmed()` si difiere). `duplicateAiReason` se interpola en el mensaje del Alert existente (una línea extra: `aiResult.reason`). El caso no-Pro no llama nada (guard `proAccessEnabled`).

- [ ] **Step 3: Validar** — `npx jest` + `npm run typecheck` + `git diff --check`.
- [ ] **Step 4: Commit**

```bash
git add components/domain/QuickDetectedMovementEntry.tsx
git commit -m "feat(detection): quick entry consulta IA antes del alert de duplicado"
```

### Task 7: Bandeja acepta `needs_review` + verificación F1

**Files:**
- Verify/Modify: `app/(app)/notifications.tsx` (tap → `setQuickEntry`, ~línea 467) y `components/domain/QuickDetectedMovementEntry.tsx` (fetch de la sugerencia)

- [ ] **Step 1: Verificar filtros por status** — grep `status` en el flujo que abre el quick entry desde la bandeja y en la query que carga la sugerencia por id (`useDetectedSuggestionQuery` o equivalente en `services/queries/notification-detection.ts`). Si algún `.eq("status", "pending")` o guard excluye `needs_review`, ampliarlo a `.in("status", ["pending", "needs_review"])` (o el equivalente del guard). Si no hay filtro, no tocar nada y documentarlo en el commit.

- [ ] **Step 2: Validación integral F1** — `npx jest` (nuevos + 162 previos) + `npm run typecheck` + `git diff --check`.

- [ ] **Step 3: Commit** (si hubo cambios; si no, solo reportar):

```bash
git add -u
git commit -m "fix(detection): bandeja abre quick entry para sugerencias needs_review"
```

**Smoke F1 (manual, documentar):** requiere migración aplicada + edge function deployada (gate final). (1) Pro + 2 yapes mismo monto → segundo se registra (distinct); (2) manual primero + notificación igual → cierra como duplicate con reason en metadata; (3) apagar DEEPSEEK_API_KEY → needs_review + card "Posible duplicado"; (4) usuario no Pro → comportamiento actual y cero usos en `ai_feature_usage_events`.

---

## FASE 2 — Fix nativo del tile (APK)

### Task 8: Token de contraparte en el tile id (Kotlin)

**Files:**
- Modify: `plugins/notification-detection/native-src/notificationdetection/DarkMoneyNotificationListenerService.kt` (~línea 189)
- Sync: `android/app/src/main/java/com/darkmoney/app/notificationdetection/DarkMoneyNotificationListenerService.kt`
- Modify: `CLAUDE.md` (sección "Notification ID estable") y `.claude/skills/darkmoney-notification-detection/SKILL.md` (sección "Notification ID stability")

- [ ] **Step 1: Extractor conservador** — agregar cerca de `buildSuggestionDescription`:

```kotlin
  /** Token del remitente para diferenciar tiles de transacciones distintas con el mismo
   *  monto en la misma ventana. Conservador: sin match → vacío (colapso actual intacto,
   *  necesario para re-fires de Gmail y push+email del mismo evento). */
  private fun extractCounterpartyToken(combined: String): String {
    val match = Regex(
      "([\\p{L}][\\p{L} .*]{1,30}?)\\s+te\\s+(envi\\u00f3|yape\\u00f3|pag\\u00f3|transfiri\\u00f3)",
      RegexOption.IGNORE_CASE,
    ).find(combined) ?: return ""
    return match.groupValues[1].trim().lowercase().replace(Regex("[^a-z\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00f1 ]"), "").take(24)
  }
```

- [ ] **Step 2: Tile id** — en la línea ~189:

```kotlin
    val counterpartyToken = extractCounterpartyToken(combined)
    val notificationId = existingSuggestion?.optInt("notificationId", 0)?.takeIf { it > 0 }
      ?: notificationIdFor("${appName}:${amount}:${System.currentTimeMillis() / 600_000}:${counterpartyToken}")
```

y actualizar el comentario del bloque (explicar el token y por qué vacío = comportamiento previo).

- [ ] **Step 3: Sync dual + verificación**

```bash
cp plugins/notification-detection/native-src/notificationdetection/DarkMoneyNotificationListenerService.kt \
   android/app/src/main/java/com/darkmoney/app/notificationdetection/DarkMoneyNotificationListenerService.kt
diff -q plugins/notification-detection/native-src/notificationdetection/DarkMoneyNotificationListenerService.kt \
        android/app/src/main/java/com/darkmoney/app/notificationdetection/DarkMoneyNotificationListenerService.kt
```

- [ ] **Step 4: Docs** — actualizar la sección "Notification ID estable" de `CLAUDE.md` y "Notification ID stability" de la skill con el formato nuevo (`appName:amount:bucket:counterpartyToken`).

- [ ] **Step 5: Commit**

```bash
git add plugins/notification-detection/native-src/notificationdetection/DarkMoneyNotificationListenerService.kt \
        android/app/src/main/java/com/darkmoney/app/notificationdetection/DarkMoneyNotificationListenerService.kt \
        CLAUDE.md .claude/skills/darkmoney-notification-detection/SKILL.md
git commit -m "feat(detection-native): tile id distingue remitentes (2 yapes simultaneos = 2 tiles)"
```

### Task 9: Bump de versión + build EAS (gate del usuario)

**Files:**
- Modify: `app.json` (`version` 1.0.2 → 1.0.3 y `versionCode` +1 si existe en `expo.android`)

- [ ] **Step 1: Bump** en app.json. IMPORTANTE: runtimeVersion policy = appVersion → los OTAs publicados para 1.0.2 NO aplican al APK 1.0.3; tras instalar el APK, el canal preview queda apuntando al runtime nuevo para futuros OTAs.
- [ ] **Step 2: Commit**

```bash
git add app.json
git commit -m "chore(release): version 1.0.3 para fix nativo del tile de deteccion"
```

- [ ] **Step 3: Build (SOLO con aprobación explícita del usuario — operación cloud ~20 min)** — `npm run build:android` (corre el preflight de versión nativa). Al terminar, instalar por adb si el teléfono está conectado e indicar verificación del DEX si hay dudas (`strings classes*.dex | grep "te envió"` no aplica — verificar con `grep counterpartyToken` no es posible en DEX ofuscado; validar por comportamiento: 2 notificaciones de prueba con remitentes distintos → 2 tiles).

---

## Verificación final

- [ ] `npx jest` → verde (incluye duplicate-verdict).
- [ ] `npm run typecheck` + `git diff --check` → limpios.
- [ ] Gates cloud CON APROBACIÓN DEL USUARIO, en orden: (1) `npx supabase db push` (migración needs_review), (2) `npx supabase functions deploy movement-duplicate-ai-check`, (3) OTA F1, (4) build APK F2.
- [ ] Smoke F1 (sección Task 7) + smoke F2 (2 tiles).
- [ ] Actualizar memoria del proyecto (fase2 roadmap) al cerrar.
