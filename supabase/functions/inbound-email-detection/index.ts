/**
 * Recibe los correos de constancia que el usuario reenvía desde Gmail y los convierte en
 * sugerencias pendientes de confirmación. Recupera en iOS la detección que en Android hace
 * NotificationListenerService.
 *
 * Deploy:
 *   npx supabase functions deploy inbound-email-detection --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INBOUND_EMAIL_WEBHOOK_SECRET   (va en la query string del webhook: ?s=<secreto>)
 *
 * --no-verify-jwt es obligatorio: quien llama es SendGrid, no un usuario con sesión.
 *
 * Proveedor: **SendGrid Inbound Parse**, que POSTea el correo como multipart/form-data con el
 * cuerpo incluido. Se eligió sobre Resend porque el webhook de Resend NO trae el cuerpo (solo
 * metadata) y habría hecho falta una segunda llamada autenticada.
 *
 * Autenticación, en tres capas independientes:
 *   1. `?s=<INBOUND_EMAIL_WEBHOOK_SECRET>` en la URL del webhook. Inbound Parse no firma sus
 *      POST, así que este secreto es lo que impide que cualquiera postee acá.
 *   2. El token del alias en la dirección destino, que dice de quién es el correo.
 *   3. El remitente original tiene que ser un banco conocido (lo valida el parser).
 * Y por diseño nada entra a los saldos sin que el usuario confirme.
 */
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/obligation-share-utils.ts";
import { buildDedupeKey, extractOperationNumber, parseReceiptEmail } from "./logic.ts";

/** Ventanas de dedupe contra la detección de Android (mismas que usa el Kotlin). */
const PENDING_WINDOW_MS = 10 * 60_000;
const REGISTERED_WINDOW_MS = 2 * 60 * 60_000;

/** recibos+<token>@darkmoney.company */
function extractAliasToken(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = /recibos\+([A-Za-z0-9_-]{16,})@/i.exec(candidate);
    if (match) return match[1];
  }
  return null;
}

/**
 * Comparación en tiempo constante. Con `===` el tiempo de respuesta filtra cuántos caracteres
 * del secreto acertó quien prueba, que es justo lo que se explota para adivinarlo byte a byte.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * El cuerpo del correo trae datos financieros, así que NUNCA se registra. Solo el remitente,
 * que es lo que hace falta para diagnosticar por qué un correo no se reconoció.
 */
async function logEvent(
  admin: ReturnType<typeof serviceClient>,
  level: "error" | "warn" | "info",
  message: string,
  context: Record<string, unknown>,
  userId: string | null = null,
) {
  try {
    await admin.from("app_error_logs").insert({
      user_id: userId,
      level,
      source: "inbound-email",
      message,
      context,
      platform: "edge",
    });
  } catch {
    // Un fallo de log jamás debe tumbar el procesamiento del correo.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método no permitido." }, 405);

  const expectedSecret = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET")?.trim();
  if (!expectedSecret) return jsonResponse({ ok: false, error: "Sin secreto configurado." }, 500);

  const providedSecret = new URL(req.url).searchParams.get("s") ?? "";
  if (!secretMatches(providedSecret, expectedSecret)) {
    return jsonResponse({ ok: false, error: "No autorizado." }, 401);
  }

  const admin = serviceClient();

  // Inbound Parse manda multipart/form-data; Deno lo lee nativamente.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ ok: false, error: "Cuerpo ilegible." }, 400);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  // `envelope` es el sobre SMTP real ({"to":[...],"from":"..."}); el header To: puede venir
  // reescrito por el reenvío, así que se prefiere el sobre y el header queda de respaldo.
  let envelopeTo: string[] = [];
  try {
    const parsed = JSON.parse(field("envelope") || "{}") as { to?: unknown };
    if (Array.isArray(parsed.to)) envelopeTo = parsed.to.filter((x): x is string => typeof x === "string");
  } catch {
    // Sobre ilegible: se sigue con el header To:.
  }

  const token = extractAliasToken([...envelopeTo, field("to")]);
  if (!token) return jsonResponse({ ok: true, ignored: "sin token" });

  const { data: alias } = await admin
    .from("inbound_email_aliases")
    .select("user_id, workspace_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (!alias) return jsonResponse({ ok: true, ignored: "alias desconocido" }, 404);

  const from = field("from");
  const parsed = parseReceiptEmail({
    from,
    subject: field("subject"),
    text: field("text"),
  });

  // No reconocido NO es error: el usuario puede reenviar cualquier cosa por accidente. Pero se
  // registra el remitente, porque el modo de fallo más probable de esta función es que Gmail
  // reescriba el From: al reenviar y el banco deje de matchear. Sin este log sería invisible.
  if (!parsed) {
    await logEvent(admin, "info", "correo no reconocido", { from }, alias.user_id);
    return jsonResponse({ ok: true, ignored: "correo no reconocido" });
  }

  const now = Date.now();

  // Dedupe contra Android: el usuario usa ambos teléfonos con la misma cuenta, y un yape
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
    // La columna es NOT NULL y viene del mundo Android (nombre del paquete de la app). Para
    // correo no existe tal cosa; el origen queda marcado con este centinela. Los dos puntos
    // no son válidos en un package name de Android, así que no puede colisionar con una app.
    package_name: "email:inbound",
    app_label: parsed.appLabel,
    movement_type: parsed.movementType,
    amount: parsed.amount,
    currency_code: parsed.currencyCode,
    description: parsed.description,
    // El correo trae su propia fecha, pero en formato local del banco ("27 julio 2026 - 08:29
    // p. m."). Parsearlo es otro pozo de bugs: llega minutos después del movimiento, así que
    // la hora de recepción es lo bastante buena y el usuario puede corregirla al confirmar.
    occurred_at: new Date(now).toISOString(),
    confidence: parsed.confidence,
    dedupe_key: buildDedupeKey({
      operationNumber: extractOperationNumber(field("text")),
      messageId: field("headers").match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ?? null,
      content: field("text"),
    }),
    metadata: { source: "email", app_label: parsed.appLabel },
  });

  // 23505 = choque con uq_detected_movement_suggestion_dedupe. Es el camino esperado cuando
  // SendGrid reintenta: se responde 200 para que deje de reintentar.
  if (error && error.code !== "23505") {
    await logEvent(admin, "error", "fallo al insertar sugerencia", { code: error.code }, alias.user_id);
    // 500 a propósito: que el proveedor reintente. La idempotencia lo hace seguro.
    return jsonResponse({ ok: false, error: "No se pudo guardar la sugerencia." }, 500);
  }

  return jsonResponse({ ok: true, duplicated: error?.code === "23505" });
});
