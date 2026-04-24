/**
 * Deploy:
 *   npx supabase functions deploy accept-workspace-invitation --project-ref cawrdzrcipgibcoefltr
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

    const { data: invitation, error: invitationError } = await client
      .from("workspace_invitations")
      .select("*")
      .eq("token", token)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation) {
      return jsonResponse({ ok: false, error: "Invitacion no encontrada o expirada." }, 404);
    }

    const { data: workspace, error: workspaceError } = await client
      .from("workspaces")
      .select("id, is_archived")
      .eq("id", invitation.workspace_id)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace || workspace.is_archived) {
      return jsonResponse({ ok: false, error: "El workspace ya no esta disponible." }, 404);
    }

    const invitedEmail = normalizeEmail(invitation.invited_email);
    const userEmail = normalizeEmail(user.email);
    if (invitedEmail && userEmail && invitedEmail !== userEmail) {
      return jsonResponse({ ok: false, error: "Esta invitacion corresponde a otro correo." }, 403);
    }

    if (invitation.invited_user_id && invitation.invited_user_id !== user.id) {
      return jsonResponse({ ok: false, error: "Esta invitacion ya fue aceptada por otra cuenta." }, 409);
    }

    const { data: existingMembership, error: existingMembershipError } = await client
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", invitation.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingMembershipError) throw existingMembershipError;

    const now = new Date().toISOString();
    const invitedDisplayName = await profileDisplayName(client, user.id, user.email ?? null);

    if (!existingMembership) {
      const { error: memberInsertError } = await client
        .from("workspace_members")
        .upsert({
          workspace_id: Number(invitation.workspace_id),
          user_id: user.id,
          role: String(invitation.role ?? "member"),
          is_default_workspace: false,
          joined_at: now,
        }, { onConflict: "workspace_id,user_id" });
      if (memberInsertError) throw memberInsertError;
    }

    if (invitation.status !== "accepted" || invitation.invited_user_id !== user.id) {
      const { error: updateError } = await client
        .from("workspace_invitations")
        .update({
          invited_user_id: user.id,
          invited_display_name: invitedDisplayName,
          status: "accepted",
          accepted_at: now,
          responded_at: now,
          updated_at: now,
        })
        .eq("id", invitation.id);
      if (updateError) throw updateError;
    }

    await client
      .from("notifications")
      .update({ status: "read", read_at: now })
      .eq("user_id", user.id)
      .eq("kind", "workspace_invite")
      .eq("related_entity_type", "workspace_invitation")
      .eq("related_entity_id", invitation.id);

    return jsonResponse({
      ok: true,
      alreadyAccepted: Boolean(existingMembership || (invitation.status === "accepted" && invitation.invited_user_id === user.id)),
      workspaceId: Number(invitation.workspace_id),
    });
  } catch (error) {
    console.error("[accept-workspace-invitation]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo aceptar la invitacion.",
    }, 500);
  }
});
