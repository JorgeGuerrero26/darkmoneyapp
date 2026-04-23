/**
 * Deploy:
 *   npx supabase functions deploy unlink-obligation-share --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  numberFromBody,
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

    const shareId = numberFromBody(body.shareId);
    const workspaceId = numberFromBody(body.workspaceId);
    const obligationId = numberFromBody(body.obligationId);

    if (!shareId && (!workspaceId || !obligationId)) {
      return jsonResponse({ ok: false, error: "No se encontro la relacion compartida." }, 400);
    }

    let query = client
      .from("obligation_shares")
      .select("id, workspace_id, obligation_id, owner_user_id, invited_user_id, status");

    if (shareId) {
      query = query.eq("id", shareId);
    } else {
      query = query
        .eq("workspace_id", workspaceId)
        .eq("obligation_id", obligationId)
        .in("status", ["pending", "accepted"]);
    }

    const { data: share, error: shareError } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) {
      return jsonResponse({ ok: false, error: "Esta relacion compartida ya no esta activa." }, 404);
    }

    const isOwner = share.owner_user_id === user.id;
    const isViewer = share.invited_user_id === user.id;

    let isWorkspaceAdmin = false;
    if (!isOwner) {
      const { data: membership, error: membershipError } = await client
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", share.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      isWorkspaceAdmin = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!isOwner && !isViewer && !isWorkspaceAdmin) {
      return jsonResponse({ ok: false, error: "No tienes permisos para desvincular esta relacion." }, 403);
    }

    if (share.status !== "pending" && share.status !== "accepted") {
      return jsonResponse({ ok: true, status: share.status, alreadyInactive: true });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from("obligation_shares")
      .update({
        status: "revoked",
        responded_at: now,
        updated_at: now,
      })
      .eq("id", share.id);
    if (updateError) throw updateError;

    if (share.invited_user_id) {
      await client
        .from("notifications")
        .update({ status: "read", read_at: now })
        .eq("user_id", share.invited_user_id)
        .eq("kind", "obligation_share_invite")
        .eq("related_entity_type", "obligation_share")
        .eq("related_entity_id", share.id);
    }

    return jsonResponse({
      ok: true,
      shareId: share.id,
      status: "revoked",
      role: isOwner || isWorkspaceAdmin ? "owner" : "viewer",
    });
  } catch (error) {
    console.error("[unlink-obligation-share]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo desvincular la relacion compartida.",
    }, 500);
  }
});
