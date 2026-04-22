/**
 * Deploy:
 *   npx supabase functions deploy accept-obligation-share --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  normalizeEmail,
  profileDisplayName,
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
      .select("*")
      .eq("token", token)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) return jsonResponse({ ok: false, error: "Invitacion no encontrada o expirada." }, 404);

    const invitedEmail = normalizeEmail(share.invited_email);
    const userEmail = normalizeEmail(user.email);
    if (invitedEmail && userEmail && invitedEmail !== userEmail) {
      return jsonResponse({ ok: false, error: "Esta invitacion corresponde a otro correo." }, 403);
    }

    if (share.status === "accepted" && share.invited_user_id === user.id) {
      return jsonResponse({ ok: true, alreadyAccepted: true });
    }

    if (share.invited_user_id && share.invited_user_id !== user.id) {
      return jsonResponse({ ok: false, error: "Esta invitacion ya fue aceptada por otra cuenta." }, 409);
    }

    const now = new Date().toISOString();
    const invitedDisplayName = await profileDisplayName(client, user.id, user.email ?? null);

    const { error: updateError } = await client
      .from("obligation_shares")
      .update({
        invited_user_id: user.id,
        invited_display_name: invitedDisplayName,
        status: "accepted",
        accepted_at: now,
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

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[accept-obligation-share]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo aceptar la invitacion.",
    }, 500);
  }
});
