/**
 * Deploy:
 *   npx supabase functions deploy decline-obligation-share --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  normalizeEmail,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return jsonResponse({ ok: false, error: "Invitacion invalida." }, 400);

    const { data: share, error: shareError } = await client
      .from("obligation_shares")
      .select("id, invited_email, invited_user_id, status")
      .eq("token", token)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) return jsonResponse({ ok: false, error: "Invitacion no encontrada." }, 404);

    const invitedEmail = normalizeEmail(share.invited_email);
    const userEmail = normalizeEmail(user.email);
    if (invitedEmail && userEmail && invitedEmail !== userEmail) {
      return jsonResponse({ ok: false, error: "Esta invitacion corresponde a otro correo." }, 403);
    }
    if (share.invited_user_id && share.invited_user_id !== user.id) {
      return jsonResponse({ ok: false, error: "Esta invitacion ya fue respondida por otra cuenta." }, 409);
    }
    if (share.status === "accepted") {
      return jsonResponse({ ok: false, alreadyAccepted: true, status: "accepted" }, 409);
    }
    if (share.status === "declined") {
      return jsonResponse({ ok: true, alreadyDeclined: true, status: "declined" });
    }
    if (share.status === "revoked") {
      return jsonResponse({ ok: false, error: "Esta invitacion ya no esta disponible." }, 410);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from("obligation_shares")
      .update({
        invited_user_id: user.id,
        status: "declined",
        responded_at: now,
        updated_at: now,
      })
      .eq("id", share.id);
    if (updateError) throw updateError;

    await client
      .from("notifications")
      .update({ status: "read", read_at: now })
      .eq("user_id", user.id)
      .eq("kind", "obligation_share_invite")
      .eq("related_entity_type", "obligation_share")
      .eq("related_entity_id", share.id);

    return jsonResponse({ ok: true, status: "declined" });
  } catch (error) {
    console.error("[decline-obligation-share]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo rechazar la invitacion.",
    }, 500);
  }
});
