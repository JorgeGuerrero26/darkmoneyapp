/**
 * Deploy:
 *   npx supabase functions deploy create-workspace-invitation --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  buildAndroidIntentWorkspaceInviteUrl,
  buildMobileWorkspaceInviteUrl,
  buildWorkspaceInviteUrl,
  corsHeaders,
  findAuthUserByEmail,
  jsonResponse,
  maybeSendWorkspaceInviteEmail,
  normalizeEmail,
  profileDisplayName,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  member: "Miembro",
  viewer: "Lector",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);

    const workspaceId = Number(body.workspaceId ?? 0);
    const invitedEmail = normalizeEmail(body.invitedEmail);
    const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      return jsonResponse({ ok: false, error: "Workspace invalido." }, 400);
    }
    if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      return jsonResponse({ ok: false, error: "Ingresa un correo valido." }, 400);
    }
    if (!["admin", "member", "viewer"].includes(role)) {
      return jsonResponse({ ok: false, error: "Rol de invitacion invalido." }, 400);
    }
    if (normalizeEmail(user.email) === invitedEmail) {
      return jsonResponse({ ok: false, error: "No puedes invitarte a ti mismo." }, 400);
    }

    const { data: membership, error: membershipError } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) {
      return jsonResponse({ ok: false, error: "No tienes permisos para invitar miembros a este workspace." }, 403);
    }

    const { data: workspace, error: workspaceError } = await client
      .from("workspaces")
      .select("id, owner_user_id, name, kind, base_currency_code, description, is_archived")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) {
      return jsonResponse({ ok: false, error: "Workspace no encontrado." }, 404);
    }
    if (workspace.kind !== "shared") {
      return jsonResponse({ ok: false, error: "Solo puedes invitar miembros a workspaces compartidos." }, 400);
    }
    if (workspace.is_archived) {
      return jsonResponse({ ok: false, error: "No puedes invitar miembros a un workspace archivado." }, 400);
    }

    const invitedUser = await findAuthUserByEmail(client, invitedEmail);
    if (invitedUser?.id) {
      const { data: existingMember, error: existingMemberError } = await client
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", invitedUser.id)
        .maybeSingle();
      if (existingMemberError) throw existingMemberError;
      if (existingMember) {
        return jsonResponse({
          ok: true,
          alreadyMember: true,
          invitedEmail,
          invitedDisplayName: await profileDisplayName(client, invitedUser.id, invitedEmail),
          role,
          emailSent: false,
        });
      }
    }

    const now = new Date().toISOString();
    const invitedByDisplayName = await profileDisplayName(client, user.id, user.email ?? null);
    const invitedDisplayName = await profileDisplayName(client, invitedUser?.id, invitedEmail);

    const { data: pendingInvite, error: pendingInviteError } = await client
      .from("workspace_invitations")
      .select("id, token, status")
      .eq("workspace_id", workspaceId)
      .eq("invited_email", invitedEmail)
      .eq("status", "pending")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingInviteError) throw pendingInviteError;

    let invitationId = Number(pendingInvite?.id ?? 0);
    let token = typeof pendingInvite?.token === "string" ? pendingInvite.token : crypto.randomUUID();

    if (pendingInvite) {
      const { error: updateError } = await client
        .from("workspace_invitations")
        .update({
          invited_by_user_id: user.id,
          invited_user_id: invitedUser?.id ?? null,
          invited_display_name: invitedDisplayName,
          invited_by_display_name: invitedByDisplayName,
          role,
          note,
          last_sent_at: now,
          updated_at: now,
        })
        .eq("id", pendingInvite.id);
      if (updateError) throw updateError;
    } else {
      const { data: insertedInvite, error: insertError } = await client
        .from("workspace_invitations")
        .insert({
          workspace_id: workspaceId,
          invited_by_user_id: user.id,
          invited_user_id: invitedUser?.id ?? null,
          invited_email: invitedEmail,
          invited_display_name: invitedDisplayName,
          invited_by_display_name: invitedByDisplayName,
          role,
          status: "pending",
          token,
          note,
          last_sent_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("id, token")
        .single();
      if (insertError) throw insertError;
      invitationId = Number(insertedInvite.id ?? 0);
      token = String(insertedInvite.token ?? token);
    }

    const inviteUrl = buildWorkspaceInviteUrl(body.appUrl, token);
    const mobileInviteUrl = buildMobileWorkspaceInviteUrl(token);
    const androidIntentInviteUrl = buildAndroidIntentWorkspaceInviteUrl(token, inviteUrl);

    if (invitedUser?.id) {
      await client.from("notifications").insert({
        user_id: invitedUser.id,
        channel: "in_app",
        status: "pending",
        kind: "workspace_invite",
        title: "Te invitaron a un workspace compartido",
        body: `Abre la invitacion para unirte a ${String(workspace.name ?? "este workspace")}.`,
        scheduled_for: now,
        related_entity_type: "workspace_invitation",
        related_entity_id: invitationId,
        payload: {
          type: "workspace_invite",
          token,
          invitationId,
          workspaceId,
          workspaceName: String(workspace.name ?? ""),
          role,
          invitedByDisplayName,
          inviteUrl,
          mobileInviteUrl,
          androidIntentInviteUrl,
        },
      });
    }

    const emailSent = await maybeSendWorkspaceInviteEmail({
      to: invitedEmail,
      inviteUrl,
      mobileInviteUrl,
      androidIntentInviteUrl,
      workspaceName: String(workspace.name ?? "Workspace"),
      invitedByDisplayName,
      note,
      roleLabel: ROLE_LABELS[role] ?? "Miembro",
    });

    return jsonResponse({
      ok: true,
      invitationId,
      status: "pending",
      role,
      inviteUrl,
      emailSent,
      invitedEmail,
      invitedDisplayName,
      alreadyMember: false,
    });
  } catch (error) {
    console.error("[create-workspace-invitation]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo enviar la invitacion.",
    }, 500);
  }
});
