/**
 * Resend email.received -> sugerencia pendiente -> aviso interno en iOS y Android.
 * Secretos: RESEND_INBOUND_API_KEY (Full access), RESEND_INBOUND_WEBHOOK_SECRET (whsec_...).
 * Deploy: npx supabase functions deploy inbound-email-detection --no-verify-jwt --use-api
 * La firma de Resend autentica el webhook; el usuario siempre confirma el movimiento.
 */
import { jsonResponse, serviceClient } from "../_shared/obligation-share-utils.ts";
import { processReceivedEvent, type InboundRepository } from "./handler.ts";
import { retrieveReceivedEmail, verifyResendWebhook } from "./resend.ts";

function createRepository(): InboundRepository {
  const admin = serviceClient();
  return {
    async hasProAccess(userId) {
      const { data, error } = await admin.rpc("has_email_detection_pro_access", { p_user_id: userId });
      if (error) throw new Error(`entitlement-query-${error.code}`);
      return data === true;
    },
    async resolveAlias(token) {
      const { data, error } = await admin.from("inbound_email_aliases")
        .select("user_id, workspace_id").eq("token", token).is("revoked_at", null).maybeSingle();
      if (error) throw new Error(`alias-query-${error.code}`);
      if (!data) return null;
      // Un alias no conserva acceso cuando el usuario deja el workspace.
      const { data: member, error: membershipError } = await admin.from("workspace_members")
        .select("workspace_id").eq("user_id", data.user_id).eq("workspace_id", data.workspace_id).maybeSingle();
      if (membershipError) throw new Error(`membership-query-${membershipError.code}`);
      return member ? { user_id: data.user_id, workspace_id: Number(data.workspace_id) } : null;
    },
    async saveSuggestion(input) {
      const fields = "id, status, amount, currency_code, description, app_label, created_at";
      const { data, error } = await admin.from("notification_detected_movement_suggestions")
        .insert(input).select(fields).single();
      if (!error) return data;
      if (error.code !== "23505") throw new Error(`suggestion-insert-${error.code}`);
      const { data: existing, error: readError } = await admin.from("notification_detected_movement_suggestions")
        .select(fields).eq("user_id", input.user_id).eq("workspace_id", input.workspace_id)
        .eq("dedupe_key", input.dedupe_key).single();
      if (readError) throw new Error(`suggestion-retry-${readError.code}`);
      return existing;
    },
    async ensureNotification(userId, suggestion) {
      const { data: existing, error: readError } = await admin.from("notifications")
        .select("id").eq("user_id", userId).eq("kind", "detected_movement_suggestion")
        .eq("related_entity_type", "detected_movement_suggestion").eq("related_entity_id", suggestion.id).maybeSingle();
      if (readError) throw new Error(`notification-query-${readError.code}`);
      if (existing) return; // Conserva read_at/status cuando el usuario ya leyó el aviso.
      const { error } = await admin.from("notifications").insert({
        user_id: userId,
        title: `Movimiento detectado en ${suggestion.app_label} · por correo`,
        body: `${suggestion.currency_code === "PEN" ? "S/" : "$"} ${Number(suggestion.amount).toFixed(2)} · ${suggestion.description}`,
        status: "sent", scheduled_for: suggestion.created_at, kind: "detected_movement_suggestion", channel: "in_app",
        related_entity_type: "detected_movement_suggestion", related_entity_id: suggestion.id,
        payload: { suggestionId: suggestion.id, amount: Number(suggestion.amount), currencyCode: suggestion.currency_code,
          appLabel: suggestion.app_label, status: suggestion.status, source: "email" },
      });
      if (error && error.code !== "23505") throw new Error(`notification-insert-${error.code}`);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
  const secret = Deno.env.get("RESEND_INBOUND_WEBHOOK_SECRET")?.trim();
  const apiKey = Deno.env.get("RESEND_INBOUND_API_KEY")?.trim();
  if (!secret || !apiKey) return jsonResponse({ ok: false, error: "Recepción pendiente de configurar." }, 503);
  const body = await req.text();
  if (body.length > 256_000) return jsonResponse({ ok: false, error: "Evento demasiado grande." }, 413);
  let event;
  try {
    event = await verifyResendWebhook(body, {
      id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
    }, secret);
  } catch {
    return jsonResponse({ ok: false, error: "Firma inválida." }, 401);
  }
  try {
    return jsonResponse(await processReceivedEvent(event, createRepository(), (id) => retrieveReceivedEmail(id, apiKey)));
  } catch (error) {
    // Códigos propios: no registra cuerpo, token, dirección privada ni credenciales.
    console.error("[inbound-email]", error instanceof Error ? error.message.replace(/[^a-zA-Z0-9áéíóúñ -]/g, "").slice(0, 100) : "processing-failed");
    return jsonResponse({ ok: false, error: "No se pudo procesar el correo. Se reintentará." }, 500);
  }
});
