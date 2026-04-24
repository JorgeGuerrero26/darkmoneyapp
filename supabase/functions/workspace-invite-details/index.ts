/**
 * Deploy:
 *   npx supabase functions deploy workspace-invite-details --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  corsHeaders,
  jsonResponse,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const client = serviceClient();
    const body = await readJsonBody(req);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return jsonResponse({ ok: false, error: "Invitacion invalida." }, 400);

    const { data: invitation, error: invitationError } = await client
      .from("workspace_invitations")
      .select("*")
      .eq("token", token)
      .in("status", ["pending", "accepted", "declined"])
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation) {
      return jsonResponse({ ok: false, error: "Invitacion no encontrada o expirada." }, 404);
    }
    if (invitation.status === "declined") {
      return jsonResponse({ ok: false, error: "Esta invitacion ya fue rechazada." }, 409);
    }

    const { data: workspace, error: workspaceError } = await client
      .from("workspaces")
      .select("id, owner_user_id, name, kind, base_currency_code, description")
      .eq("id", invitation.workspace_id)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) {
      return jsonResponse({ ok: false, error: "Workspace no encontrado." }, 404);
    }

    return jsonResponse({
      ok: true,
      invite: {
        workspace: {
          id: Number(workspace.id ?? 0),
          ownerUserId: typeof workspace.owner_user_id === "string" ? workspace.owner_user_id : undefined,
          name: String(workspace.name ?? "Workspace"),
          kind: workspace.kind === "personal" ? "personal" : "shared",
          description: typeof workspace.description === "string" ? workspace.description : "",
          baseCurrencyCode: String(workspace.base_currency_code ?? "PEN"),
        },
        invitation: {
          id: Number(invitation.id ?? 0),
          workspaceId: Number(invitation.workspace_id ?? 0),
          invitedByUserId: String(invitation.invited_by_user_id ?? ""),
          invitedUserId: String(invitation.invited_user_id ?? ""),
          invitedEmail: String(invitation.invited_email ?? ""),
          invitedDisplayName: typeof invitation.invited_display_name === "string" ? invitation.invited_display_name : null,
          invitedByDisplayName: typeof invitation.invited_by_display_name === "string" ? invitation.invited_by_display_name : null,
          role: String(invitation.role ?? "member"),
          status: String(invitation.status ?? "pending"),
          token: String(invitation.token ?? token),
          note: typeof invitation.note === "string" ? invitation.note : null,
          acceptedAt: typeof invitation.accepted_at === "string" ? invitation.accepted_at : null,
          respondedAt: typeof invitation.responded_at === "string" ? invitation.responded_at : null,
          lastSentAt: typeof invitation.last_sent_at === "string" ? invitation.last_sent_at : null,
          createdAt: String(invitation.created_at ?? ""),
          updatedAt: String(invitation.updated_at ?? ""),
        },
      },
    });
  } catch (error) {
    console.error("[workspace-invite-details]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo cargar la invitacion.",
    }, 500);
  }
});
