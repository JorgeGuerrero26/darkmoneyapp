# Detección de pagos por correo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar movimientos desde los correos de constancia del banco/Yape y dejarlos como sugerencias pendientes de confirmación, para recuperar en iOS la detección automática que hoy solo existe en Android.

**Architecture:** El usuario crea un filtro en Gmail que reenvía los correos del banco a un alias con token (`recibos+<token>@darkmoney.company`). Un proveedor de correo entrante recibe el correo y lo POSTea a la edge function `inbound-email-detection`, que valida la firma, parsea con lógica pura y crea una fila en `notification_detected_movement_suggestions` con `status='pending'`. La app la muestra en la bandeja de detectados que ya existe.

**Tech Stack:** Supabase Edge Functions (Deno) · TypeScript puro testeado con jest · Postgres + RLS · Resend Inbound (webhook firmado) · React Native / Expo.

**Spec:** `docs/superpowers/specs/2026-07-28-deteccion-pagos-por-correo-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/202607280001_inbound_email_aliases.sql` | Tabla del alias + RLS. |
| `supabase/functions/inbound-email-detection/logic.ts` | **Puro**: parseo de montos, clasificación, parsers por banco, construcción del payload. Sin imports de Deno. |
| `supabase/functions/inbound-email-detection/__tests__/logic.test.ts` | Tests jest de lo anterior, con correos reales anonimizados. |
| `supabase/functions/inbound-email-detection/index.ts` | I/O: firma, alias, dedupe contra BD, insert. |
| `services/queries/inbound-email-alias.ts` | Cliente: leer y rotar el alias. |
| `app/settings.tsx` | Tarjeta con la dirección + copiar + rotar. |
| `DATABASE_DICTIONARY.md` | Documentar la tabla nueva (obligatorio por CLAUDE.md). |
| `.github/workflows/ci.yml` | `deno check` de la función nueva. |

**Convención del repo:** `logic.ts` puro + `index.ts` con Deno es exactamente el patrón de
`supabase/functions/assistant-chat/`. Los tests jest solo pueden importar `logic.ts`.

---

### Task 1: Capturar correos reales y verificar el proveedor

Sin muestras reales el parser es adivinanza. Y los límites del plan gratis deben confirmarse
**antes** de tocar DNS.

**Files:**
- Create: `supabase/functions/inbound-email-detection/__tests__/fixtures/README.md`

- [ ] **Step 1: Pedir al usuario 3 correos reales**

Pedirle que reenvíe a sí mismo y copie el **texto plano** de:
1. Un pago con Yape.
2. Un consumo/compra con tarjeta BCP.
3. Un ingreso (alguien le envió dinero).

- [ ] **Step 2: Anonimizar y guardar como fixtures**

Reemplazar nombres propios, números de tarjeta y correos por valores ficticios. **Conservar
intactos** el formato del monto, los verbos y la estructura, que es lo que el parser lee.

Crear `supabase/functions/inbound-email-detection/__tests__/fixtures/README.md`:

```markdown
# Fixtures de correos

Correos reales ANONIMIZADOS. Se conserva el formato del monto, los verbos y la estructura;
se reemplazan nombres, números de tarjeta y correos.

NUNCA subir un correo sin anonimizar: traen datos financieros reales.
```

- [ ] **Step 3: Verificar Resend Inbound**

Confirmar en la documentación vigente: que Inbound existe en el plan gratis, el límite mensual,
el formato del payload y **cómo se firma** el webhook. Si no está disponible, usar SendGrid
Inbound Parse y ajustar solo el verificador de firma y la extracción de campos del Task 7.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/inbound-email-detection/__tests__/fixtures/README.md
git commit -m "docs(inbound-email): fixtures de correos anonimizados"
```

---

### Task 2: Tabla del alias

**Files:**
- Create: `supabase/migrations/202607280001_inbound_email_aliases.sql`
- Modify: `DATABASE_DICTIONARY.md`

- [ ] **Step 1: Escribir la migración**

```sql
-- Detección de pagos por correo: el usuario reenvía desde Gmail a
-- recibos+<token>@darkmoney.company y la edge function inbound-email-detection resuelve
-- por ese token a quién pertenece el correo.
--
-- El token es un SECRETO: quien lo conozca puede inyectar sugerencias (no movimientos: todo
-- exige confirmación). Por eso es rotable — se revoca y se genera otro sin tocar la cuenta
-- de correo del usuario.

create table if not exists public.inbound_email_aliases (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Búsqueda del alias activo del usuario (la pantalla de Configuración).
create index if not exists inbound_email_aliases_user_idx
  on public.inbound_email_aliases(user_id) where revoked_at is null;

alter table public.inbound_email_aliases enable row level security;

-- El usuario solo ve y crea los suyos. La edge function usa service role y salta RLS.
create policy inbound_email_aliases_own_select on public.inbound_email_aliases
  for select using (auth.uid() = user_id);
create policy inbound_email_aliases_own_insert on public.inbound_email_aliases
  for insert with check (auth.uid() = user_id and is_workspace_member(workspace_id));
create policy inbound_email_aliases_own_update on public.inbound_email_aliases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Aplicar al remoto y verificar**

En esta máquina **no hay `psql`**: las migraciones se aplican con node+pg por el pooler
(`DB_POOLER_HOST` / `DB_POOLER_USER` del `.env`, con la contraseña del `DATABASE_URL`). Guardar
como script temporal fuera del repo y ejecutarlo:

```js
import { readFileSync } from "node:fs"; import pg from "pg";
const env = readFileSync("/Users/clinaresb/Desktop/Proyectos/darkmoneyapp/.env","utf8");
const get=(k)=>(env.match(new RegExp(`^${k}=(.+)$`,"m"))?.[1]??"").trim().replace(/^["']|["']$/g,"");
const pw=decodeURIComponent(get("DATABASE_URL").match(/^postgres(?:ql)?:\/\/[^:]+:([^@]+)@/)?.[1]??"");
// 5432 = sesión (acepta DDL); 6543 es el pooler de transacciones.
const cl=new pg.Client({host:get("DB_POOLER_HOST"),user:get("DB_POOLER_USER"),password:pw,port:5432,database:"postgres",ssl:{rejectUnauthorized:false}});
await cl.connect();
await cl.query(readFileSync("supabase/migrations/202607280001_inbound_email_aliases.sql","utf8"));
const p = await cl.query(`select policyname from pg_policies where tablename='inbound_email_aliases'`);
console.log("políticas:", p.rows.map(r=>r.policyname).join(", "));
await cl.end();
```

Expected: imprime las 3 políticas (`_own_select`, `_own_insert`, `_own_update`).

> **Nunca imprimir la contraseña ni la URL de conexión** (regla de CLAUDE.md).

- [ ] **Step 3: Documentar en DATABASE_DICTIONARY.md**

Agregar sección `### inbound_email_aliases` con la tabla de campos de arriba y la nota del
índice parcial. **Obligatorio**: CLAUDE.md prohíbe cerrar una tarea que cambió el esquema sin
actualizar el diccionario.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607280001_inbound_email_aliases.sql DATABASE_DICTIONARY.md
git commit -m "feat(inbound-email): tabla de alias con token rotable"
```

---

### Task 3: Extracción de monto (TDD)

Se **porta** el regex ya probado en producción de `AmountParsing.kt` — no se inventa uno nuevo.

**Files:**
- Create: `supabase/functions/inbound-email-detection/logic.ts`
- Create: `supabase/functions/inbound-email-detection/__tests__/logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { extractAmount } from "../logic";

describe("extractAmount", () => {
  it("lee soles con y sin separador de miles", () => {
    expect(extractAmount("Pagaste S/ 30.00 en RENIEC")).toEqual({ amount: 30, currencyCode: "PEN" });
    expect(extractAmount("Consumo por S/ 1,234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
    expect(extractAmount("Monto S/ 1 234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
  });

  it("lee dólares", () => {
    expect(extractAmount("Compra por US$ 12.50")).toEqual({ amount: 12.5, currencyCode: "USD" });
    expect(extractAmount("Cargo de USD 8")).toEqual({ amount: 8, currencyCode: "USD" });
  });

  it("devuelve null si no hay monto", () => {
    expect(extractAmount("Tu estado de cuenta ya está disponible")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: FAIL — `Cannot find module '../logic'`.

- [ ] **Step 3: Implementar en `logic.ts`**

```ts
/**
 * Parseo de correos de constancia bancarios. Puro y sin imports de Deno para poder
 * testearlo con jest desde el repo RN (mismo patrón que assistant-chat/logic.ts).
 *
 * Los patrones se PORTAN de AmountParsing.kt y del clasificador de
 * DarkMoneyNotificationListenerService.kt, ya probados en producción en Android.
 */

export type ParsedAmount = { amount: number; currencyCode: string };

// Acepta separador de miles con punto, coma o espacio (incl. NBSP): sin eso el match se
// truncaba en el primer grupo ("S/ 1").
const AMOUNT_RE =
  /(S\/|S\.|PEN|US\$|USD|\$)[\s ]*([0-9]{1,3}(?:[.,\s ][0-9]{3})*|[0-9]+)(?:([.,])([0-9]{1,2}))?/i;

export function extractAmount(text: string): ParsedAmount | null {
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;
  const [, rawSymbol, rawInt, , rawDecimals] = match;
  const intDigits = rawInt.replace(/[.,\s ]/g, "");
  const amount = Number(`${intDigits}.${rawDecimals ?? "0"}`);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = rawSymbol.toUpperCase();
  const currencyCode = symbol === "USD" || symbol === "US$" || symbol === "$" ? "USD" : "PEN";
  return { amount, currencyCode };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inbound-email-detection/
git commit -m "feat(inbound-email): extraccion de montos portada del parser Android"
```

---

### Task 4: Clasificación ingreso/gasto (TDD)

**Files:**
- Modify: `supabase/functions/inbound-email-detection/logic.ts`
- Modify: `supabase/functions/inbound-email-detection/__tests__/logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { classifyMovement } from "../logic";

describe("classifyMovement", () => {
  it("detecta gastos por los verbos de la app", () => {
    expect(classifyMovement("Pagaste S/ 30 en RENIEC")).toEqual({ movementType: "expense", confidence: "high" });
    expect(classifyMovement("Yapeo exitoso")).toEqual({ movementType: "expense", confidence: "high" });
    expect(classifyMovement("Realizaste un consumo con tu tarjeta")).toEqual({ movementType: "expense", confidence: "high" });
  });

  it("detecta ingresos", () => {
    expect(classifyMovement("Recibiste S/ 50")).toEqual({ movementType: "income", confidence: "high" });
    expect(classifyMovement("Abono recibido en tu cuenta")).toEqual({ movementType: "income", confidence: "high" });
  });

  it("ignora tildes y mayúsculas", () => {
    expect(classifyMovement("PAGASTE S/ 10")).toEqual({ movementType: "expense", confidence: "high" });
  });

  it("devuelve null cuando no hay verbo reconocible", () => {
    expect(classifyMovement("Tu estado de cuenta está listo")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: FAIL — `classifyMovement is not a function`.

- [ ] **Step 3: Implementar**

```ts
export type MovementType = "income" | "expense" | "transfer";
export type Classification = { movementType: MovementType; confidence: "high" | "medium" };

/** Normaliza para comparar: sin tildes, minúsculas. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Listas portadas de DarkMoneyNotificationListenerService.kt (producción).
const HIGH_EXPENSE = [
  "pagaste", "enviaste", "yapaste", "yapear exitosamente", "yapeo exitoso", "yapeo aprobado",
  "monto de yapeo", "pago exitoso", "realizaste un consumo", "realizaste una compra",
  "compra realizada", "operacion realizada consumo", "consumo con tu tarjeta",
];
const HIGH_INCOME = [
  "recibiste", "te enviaron", "te envio", "transferencia recibida", "abono recibido",
];
const MEDIUM_INCOME = ["abono", "deposito", "envio un pago", "pago por", "te depositaron"];

export function classifyMovement(text: string): Classification | null {
  const normalized = normalizeText(text);
  if (HIGH_EXPENSE.some((verb) => normalized.includes(verb))) {
    return { movementType: "expense", confidence: "high" };
  }
  if (HIGH_INCOME.some((verb) => normalized.includes(verb))) {
    return { movementType: "income", confidence: "high" };
  }
  if (MEDIUM_INCOME.some((verb) => normalized.includes(verb))) {
    return { movementType: "income", confidence: "medium" };
  }
  return null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inbound-email-detection/
git commit -m "feat(inbound-email): clasificacion ingreso/gasto portada de Android"
```

---

### Task 5: Parser de correo completo (TDD, con fixtures reales)

**Files:**
- Modify: `supabase/functions/inbound-email-detection/logic.ts`
- Modify: `supabase/functions/inbound-email-detection/__tests__/logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Sustituir los cuerpos por los **fixtures reales anonimizados** del Task 1.

```ts
import { parseReceiptEmail } from "../logic";

describe("parseReceiptEmail", () => {
  it("parsea un yapeo de salida", () => {
    const result = parseReceiptEmail({
      from: "no-reply@yape.com.pe",
      subject: "Constancia de Yapeo",
      text: "Yapeo exitoso\nMonto: S/ 25.00\nPara: Juan P.",
    });
    expect(result).toMatchObject({
      movementType: "expense",
      amount: 25,
      currencyCode: "PEN",
      financialAppKey: "yape_email",
    });
  });

  it("parsea un consumo con tarjeta BCP", () => {
    const result = parseReceiptEmail({
      from: "notificaciones@bcp.com.pe",
      subject: "Constancia de consumo",
      text: "Realizaste un consumo con tu tarjeta por S/ 65.65 en ALIEXPRESS.",
    });
    expect(result).toMatchObject({
      movementType: "expense",
      amount: 65.65,
      financialAppKey: "bcp_email",
    });
  });

  it("ignora remitentes desconocidos aunque traigan monto", () => {
    expect(parseReceiptEmail({
      from: "promos@tienda.com",
      subject: "Oferta",
      text: "Llévatelo por S/ 99.00",
    })).toBeNull();
  });

  it("ignora correos del banco sin verbo de operación", () => {
    expect(parseReceiptEmail({
      from: "notificaciones@bcp.com.pe",
      subject: "Estado de cuenta",
      text: "Tu estado de cuenta de S/ 1,000.00 ya está disponible.",
    })).toBeNull();
  });

  it("no toma el disclaimer de BCP como comercio", () => {
    const result = parseReceiptEmail({
      from: "notificaciones@bcp.com.pe",
      subject: "Constancia",
      text: "Pagaste S/ 30.00 en RENIEC. Participa en sorteos o promociones exclusivas.",
    });
    expect(result?.description).toContain("RENIEC");
    expect(result?.description).not.toContain("sorteos");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: FAIL — `parseReceiptEmail is not a function`.

- [ ] **Step 3: Implementar**

```ts
export type ReceiptEmail = { from: string; subject: string; text: string };

export type ParsedReceipt = {
  movementType: MovementType;
  amount: number;
  currencyCode: string;
  description: string;
  financialAppKey: string;
  appLabel: string;
  confidence: "high" | "medium";
};

/** Remitentes aceptados. Cualquier otro se ignora aunque traiga un monto. */
const KNOWN_SENDERS: { match: RegExp; financialAppKey: string; appLabel: string }[] = [
  { match: /@yape\.com\.pe$/i, financialAppKey: "yape_email", appLabel: "Yape" },
  { match: /@bcp\.com\.pe$/i, financialAppKey: "bcp_email", appLabel: "BCP" },
];

/**
 * El disclaimer de BCP ("participa en sorteos o promociones") contamina la descripción si se
 * lee el correo completo. Se corta la ventana igual que en Android.
 */
const DESCRIPTION_WINDOW = 400;

function buildDescription(text: string, subject: string): string {
  const window = text.slice(0, DESCRIPTION_WINDOW);
  const merchant = /\ben\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .*&-]{3,40})/.exec(window);
  const raw = merchant?.[1]?.trim() ?? subject.trim();
  return raw.replace(/\s{2,}/g, " ").slice(0, 80);
}

export function parseReceiptEmail(email: ReceiptEmail): ParsedReceipt | null {
  const sender = KNOWN_SENDERS.find((entry) => entry.match.test(email.from.trim()));
  if (!sender) return null;

  const haystack = `${email.subject}\n${email.text}`;
  const classification = classifyMovement(haystack);
  if (!classification) return null;

  const parsedAmount = extractAmount(haystack);
  if (!parsedAmount) return null;

  return {
    movementType: classification.movementType,
    amount: parsedAmount.amount,
    currencyCode: parsedAmount.currencyCode,
    description: buildDescription(email.text, email.subject),
    financialAppKey: sender.financialAppKey,
    appLabel: sender.appLabel,
    confidence: classification.confidence,
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: PASS. Si un fixture real falla, **ajustar el parser, no el fixture**.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inbound-email-detection/
git commit -m "feat(inbound-email): parser de correos BCP y Yape"
```

---

### Task 6: Clave de dedupe (TDD)

**Files:**
- Modify: `supabase/functions/inbound-email-detection/logic.ts`
- Modify: `supabase/functions/inbound-email-detection/__tests__/logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { buildDedupeKey } from "../logic";

describe("buildDedupeKey", () => {
  it("usa el Message-ID, que es único por correo", () => {
    expect(buildDedupeKey("<abc123@mail.gmail.com>")).toBe("email:<abc123@mail.gmail.com>");
  });

  it("cae a un hash del contenido si el correo no trae Message-ID", () => {
    const a = buildDedupeKey(null, "Pagaste S/ 30");
    const b = buildDedupeKey(null, "Pagaste S/ 30");
    const c = buildDedupeKey(null, "Pagaste S/ 31");
    expect(a).toBe(b);      // mismo contenido -> misma clave (el reintento no duplica)
    expect(a).not.toBe(c);
    expect(a.startsWith("email:sha:")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: FAIL — `buildDedupeKey is not a function`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Clave de idempotencia. La tabla de sugerencias YA tiene el índice único
 * (user_id, workspace_id, dedupe_key), así que un webhook reintentado —los proveedores
 * reintentan siempre— choca contra el índice en vez de duplicar el movimiento.
 */
export function buildDedupeKey(messageId: string | null, fallbackContent = ""): string {
  if (messageId && messageId.trim()) return `email:${messageId.trim()}`;
  // Sin Message-ID: hash estable del contenido. djb2, suficiente para deduplicar
  // (no es seguridad) y evita depender de crypto para poder testearlo con jest.
  let hash = 5381;
  for (let i = 0; i < fallbackContent.length; i++) {
    hash = ((hash << 5) + hash + fallbackContent.charCodeAt(i)) >>> 0;
  }
  return `email:sha:${hash.toString(36)}`;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest supabase/functions/inbound-email-detection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inbound-email-detection/
git commit -m "feat(inbound-email): clave de dedupe por Message-ID"
```

---

### Task 7: Edge function

**Files:**
- Create: `supabase/functions/inbound-email-detection/index.ts`

- [ ] **Step 1: Implementar el handler**

```ts
/**
 * Recibe los correos de constancia que el usuario reenvía desde Gmail y los convierte en
 * sugerencias pendientes de confirmación.
 *
 * Deploy:
 *   npx supabase functions deploy inbound-email-detection --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 *
 * --no-verify-jwt es obligatorio: quien llama es el proveedor de correo, no un usuario.
 * La autenticación real son la firma del webhook y el token del alias.
 */
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/obligation-share-utils.ts";
import { buildDedupeKey, parseReceiptEmail } from "./logic.ts";

/** Ventanas de dedupe contra la detección de Android (mismas que usa el Kotlin). */
const PENDING_WINDOW_MS = 10 * 60_000;
const REGISTERED_WINDOW_MS = 2 * 60 * 60_000;

function extractAliasToken(to: string): string | null {
  // recibos+<token>@darkmoney.company
  const match = /recibos\+([A-Za-z0-9_-]{16,})@/i.exec(to);
  return match?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método no permitido." }, 405);

  const secret = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET")?.trim();
  if (!secret) return jsonResponse({ ok: false, error: "Sin secreto configurado." }, 500);

  const raw = await req.text();
  // Verificación de firma según el proveedor confirmado en el Task 1. Si no valida → 401.
  const signature = req.headers.get("webhook-signature") ?? "";
  if (!(await isValidSignature(raw, signature, secret))) {
    return jsonResponse({ ok: false, error: "Firma inválida." }, 401);
  }

  const payload = JSON.parse(raw) as {
    to?: string; from?: string; subject?: string; text?: string; messageId?: string;
  };

  const token = extractAliasToken(payload.to ?? "");
  if (!token) return jsonResponse({ ok: true, ignored: "sin token" });

  const admin = serviceClient();
  const { data: alias } = await admin
    .from("inbound_email_aliases")
    .select("user_id, workspace_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (!alias) return jsonResponse({ ok: true, ignored: "alias desconocido" }, 404);

  const parsed = parseReceiptEmail({
    from: payload.from ?? "",
    subject: payload.subject ?? "",
    text: payload.text ?? "",
  });
  // No reconocido NO es error: el usuario puede reenviar cualquier cosa por accidente.
  if (!parsed) return jsonResponse({ ok: true, ignored: "correo no reconocido" });

  const now = Date.now();

  // Dedupe contra Android: el usuario usa ambos teléfonos con la misma cuenta y un yape
  // genera push (Android) Y correo.
  const { data: recentSuggestion } = await admin
    .from("notification_detected_movement_suggestions")
    .select("id")
    .eq("workspace_id", alias.workspace_id)
    .eq("amount", parsed.amount)
    .gte("created_at", new Date(now - PENDING_WINDOW_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recentSuggestion) return jsonResponse({ ok: true, ignored: "ya detectado" });

  const { data: recentMovement } = await admin
    .from("movements")
    .select("id")
    .eq("workspace_id", alias.workspace_id)
    .gte("created_at", new Date(now - REGISTERED_WINDOW_MS).toISOString())
    .or(`source_amount.eq.${parsed.amount},destination_amount.eq.${parsed.amount}`)
    .limit(1)
    .maybeSingle();
  if (recentMovement) return jsonResponse({ ok: true, ignored: "ya registrado" });

  const { error } = await admin.from("notification_detected_movement_suggestions").insert({
    user_id: alias.user_id,
    workspace_id: alias.workspace_id,
    financial_app_key: parsed.financialAppKey,
    package_name: "email:inbound",
    app_label: parsed.appLabel,
    movement_type: parsed.movementType,
    amount: parsed.amount,
    currency_code: parsed.currencyCode,
    description: parsed.description,
    occurred_at: new Date().toISOString(),
    confidence: parsed.confidence,
    dedupe_key: buildDedupeKey(payload.messageId ?? null, payload.text ?? ""),
    status: "pending",
    metadata: { source: "inbound_email" },
  });

  // 23505 = el índice único absorbió un reintento del webhook. Es éxito, no error.
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[inbound-email] insert", error.message);
    return jsonResponse({ ok: false, error: "No se pudo guardar." }, 500);
  }

  return jsonResponse({ ok: true });
});
```

- [ ] **Step 2: Implementar `isValidSignature`**

HMAC-SHA256 sobre el cuerpo crudo, que es lo que usan Resend y SendGrid. Si el proveedor
confirmado en el Task 1 firma distinto, se cambia **solo esta función**.

```ts
/** Compara en tiempo constante: un `===` filtra información por el tiempo de respuesta. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValidSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  // Algunos proveedores mandan "sha256=<hex>"; se acepta con y sin prefijo.
  const received = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  return timingSafeEqual(expected, received);
}

/** Deja rastro consultable sin volcar NUNCA el cuerpo del correo (trae datos financieros). */
async function logInbound(
  admin: ReturnType<typeof serviceClient>,
  level: "warn" | "error",
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  await admin.from("app_error_logs").insert({
    level,
    source: "inbound-email",
    message,
    context,
    platform: "server",
  });
}
```

Usar `logInbound(admin, "warn", "firma inválida", { hasSignature: Boolean(signature) })` en el
401 y `logInbound(admin, "error", "insert fallido", { code })` antes del 500. El `admin` del
401 se crea antes de validar la firma.

- [ ] **Step 3: Verificar tipos**

Run: `deno check supabase/functions/inbound-email-detection/index.ts`
Expected: sin errores.

- [ ] **Step 4: Configurar el secreto y desplegar**

```bash
npx supabase secrets set INBOUND_EMAIL_WEBHOOK_SECRET=<valor> --project-ref cawrdzrcipgibcoefltr
npx supabase functions deploy inbound-email-detection --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inbound-email-detection/index.ts
git commit -m "feat(inbound-email): edge function que crea la sugerencia"
```

---

### Task 8: Cliente — alias en Configuración

**Files:**
- Create: `services/queries/inbound-email-alias.ts`
- Modify: `app/settings.tsx`

- [ ] **Step 1: Implementar las queries**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

/** Dominio del alias de correo entrante. */
export const INBOUND_EMAIL_DOMAIN = "darkmoney.company";

export function inboundEmailAddress(token: string): string {
  return `recibos+${token}@${INBOUND_EMAIL_DOMAIN}`;
}

/** Token aleatorio de 24 chars. No usa crypto.randomUUID: Hermes no lo trae. */
function newToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function useInboundEmailAliasQuery(userId: string | null, workspaceId: number | null) {
  return useQuery({
    queryKey: ["inbound-email-alias", userId, workspaceId],
    enabled: Boolean(supabase && userId && workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("inbound_email_aliases")
        .select("token")
        .eq("user_id", userId!)
        .eq("workspace_id", workspaceId!)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.token as string | undefined) ?? null;
    },
  });
}

/** Crea uno nuevo y revoca el anterior: se usa tanto para activar como para rotar. */
export function useRotateInboundEmailAliasMutation(userId: string | null, workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId || !workspaceId) throw new Error("Sesión no disponible.");
      await supabase
        .from("inbound_email_aliases")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .is("revoked_at", null);
      const token = newToken();
      const { error } = await supabase
        .from("inbound_email_aliases")
        .insert({ token, user_id: userId, workspace_id: workspaceId });
      if (error) throw new Error(error.message);
      return token;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbound-email-alias"] });
    },
  });
}
```

- [ ] **Step 2: Agregar la tarjeta en Configuración**

En `app/settings.tsx`, dentro del `ScrollView` y junto a las demás `<Card>`:

```tsx
{/* Detección por correo: el usuario necesita ver la dirección para crear el filtro. */}
<Card style={styles.card}>
  <Text style={styles.sectionTitle}>Detectar pagos por correo</Text>
  {inboundAlias ? (
    <>
      <Text selectable style={styles.inboundAddress}>{inboundEmailAddress(inboundAlias)}</Text>
      <Button
        label="Copiar dirección"
        variant="secondary"
        size="md"
        onPress={async () => {
          await Clipboard.setStringAsync(inboundEmailAddress(inboundAlias));
          showToast("Dirección copiada", "success");
        }}
      />
      <Text style={styles.inboundHelp}>
        En Gmail: Configuración › Filtros › Crear filtro con{"\n"}
        De: bcp.com.pe OR yape.com.pe{"\n"}
        Acción: Reenviar a esta dirección{"\n"}
        Gmail te pedirá confirmar el reenvío una vez.
      </Text>
      <Button
        label="Generar una nueva"
        variant="ghost"
        size="md"
        loading={rotateAlias.isPending}
        loadingLabel="Generando…"
        onPress={() => rotateAlias.mutate()}
      />
    </>
  ) : (
    <>
      <Text style={styles.inboundHelp}>
        Genera una dirección privada y reenvía ahí los correos de tu banco. DarkMoney no
        accede al resto de tu correo.
      </Text>
      <Button
        label="Generar dirección"
        variant="primary"
        size="md"
        loading={rotateAlias.isPending}
        loadingLabel="Generando…"
        onPress={() => rotateAlias.mutate()}
      />
    </>
  )}
</Card>
```

Con los hooks arriba del componente:

```tsx
const { data: inboundAlias } = useInboundEmailAliasQuery(profile?.id ?? null, activeWorkspaceId);
const rotateAlias = useRotateInboundEmailAliasMutation(profile?.id ?? null, activeWorkspaceId);
```

Imports nuevos: `import * as Clipboard from "expo-clipboard";` y
`import { inboundEmailAddress, useInboundEmailAliasQuery, useRotateInboundEmailAliasMutation } from "../services/queries/inbound-email-alias";`

Estilos nuevos:

```tsx
inboundAddress: {
  fontSize: FONT_SIZE.sm,
  fontFamily: FONT_FAMILY.bodySemibold,
  color: COLORS.pine,
  marginBottom: SPACING.sm,
},
inboundHelp: {
  fontSize: FONT_SIZE.xs,
  color: COLORS.storm,
  lineHeight: 18,
  marginBottom: SPACING.sm,
},
```

- [ ] **Step 3: Validar**

Run: `npm run typecheck && npm test -- --ci`
Expected: sin errores de tipos; 248+ tests pasan.

- [ ] **Step 4: Commit**

```bash
git add services/queries/inbound-email-alias.ts app/settings.tsx
git commit -m "feat(inbound-email): direccion de reenvio en Configuracion"
```

---

### Task 9: Etiqueta del origen en la bandeja

**Files:**
- Modify: `app/(app)/notification-detection.tsx`

- [ ] **Step 1: Mostrar el banco cuando el origen es correo**

Las sugerencias de correo llegan con `package_name = "email:inbound"` y `app_label` ya trae
"BCP" o "Yape". Añadir el helper y usarlo donde la fila muestre el origen:

```tsx
/**
 * Las sugerencias por correo no vienen de una notificación de app: decirlo evita que el
 * usuario piense que la detección de Android dejó de funcionar en su iPhone.
 */
function suggestionSourceLabel(suggestion: { packageName?: string | null; appLabel?: string | null }): string {
  const label = suggestion.appLabel?.trim() || "Banco";
  return suggestion.packageName === "email:inbound" ? `${label} · por correo` : label;
}
```

Reemplazar el render del origen por `{suggestionSourceLabel(suggestion)}`.

- [ ] **Step 2: Validar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/notification-detection.tsx"
git commit -m "feat(inbound-email): distinguir el origen correo en la bandeja"
```

---

### Task 10: CI, configuración manual y verificación E2E

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir la función al `deno check` de CI**

En el job `edge-functions`, agregar la línea:

```yaml
          deno check supabase/functions/inbound-email-detection/index.ts
```

- [ ] **Step 2: Configurar el proveedor (usuario)**

1. Crear la cuenta y añadir el dominio `darkmoney.company`.
2. Registrar el webhook apuntando a la URL de la función con el secreto del Task 7.

- [ ] **Step 3: Añadir los MX en Vercel DNS (usuario)**

Los que indique el proveedor. **No tocar** los registros A ni los TXT existentes: el sitio y los
universal links dependen de ellos.

- [ ] **Step 4: Crear el filtro en Gmail (usuario)**

Filtro: `de:(bcp.com.pe OR yape.com.pe)` → **Reenviar a** la dirección de la tarjeta de
Configuración. Gmail envía un correo de verificación a esa dirección: como aún no hay buzón,
usar la opción de reenvío que muestra el código en el propio Gmail, o autorizar desde el enlace
que registre el proveedor.

- [ ] **Step 5: Verificación E2E**

1. Hacer un pago real pequeño (o reenviar a mano un correo de constancia anterior).
2. Confirmar en BD:
   ```sql
   select created_at, financial_app_key, movement_type, amount, status
   from notification_detected_movement_suggestions
   where package_name = 'email:inbound' order by created_at desc limit 5;
   ```
3. Abrir la app y verificar que la sugerencia aparece en la bandeja y se puede confirmar.
4. **Probar la idempotencia**: reenviar el MISMO correo otra vez → debe seguir habiendo una
   sola sugerencia.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(inbound-email): deno check de la funcion nueva"
```

---

## Riesgos y decisiones abiertas

- **Sin fixtures reales el parser es adivinanza.** Por eso el Task 1 va primero y sus tests son
  la red de seguridad del resto.
- **Los verbos vienen de notificaciones, no de correos.** El texto de un correo es más largo y
  formal; es probable que el Task 5 necesite ampliar las listas. Ampliarlas es barato (una
  entrada y un test); lo importante es no romper los casos que ya pasan.
- **El dedupe por monto puede tener falsos positivos**: dos compras reales del mismo importe en
  10 minutos harían que la segunda se ignore. Es el mismo compromiso que ya acepta Android, y se
  prefiere perder una sugerencia antes que duplicar un movimiento.
