/**
 * Deploy:
 *   npx supabase functions deploy create-obligation-share-invite --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  buildAndroidIntentShareUrl,
  buildMobileShareUrl,
  buildShareUrl,
  corsHeaders,
  findAuthUserByEmail,
  jsonResponse,
  maybeSendInviteEmail,
  normalizeEmail,
  numberFromBody,
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

    const workspaceId = numberFromBody(body.workspaceId);
    const obligationId = numberFromBody(body.obligationId);
    const invitedEmail = normalizeEmail(body.invitedEmail);
    const message = typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : null;

    if (!workspaceId || !obligationId) {
      return jsonResponse({ ok: false, error: "No se encontro la obligacion." }, 400);
    }
    if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      return jsonResponse({ ok: false, error: "Ingresa un correo valido." }, 400);
    }
    if (user.email?.trim().toLowerCase() === invitedEmail) {
      return jsonResponse({ ok: false, error: "No puedes compartirte esta obligacion a ti mismo." }, 400);
    }

    const { data: membership, error: membershipError } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || membership.role === "viewer") {
      return jsonResponse({ ok: false, error: "No tienes permisos para compartir esta obligacion." }, 403);
    }

    const { data: obligation, error: obligationError } = await client
      .from("obligations")
      .select("id, workspace_id, title, direction")
      .eq("id", obligationId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (obligationError) throw obligationError;
    if (!obligation) {
      return jsonResponse({ ok: false, error: "No se encontro la obligacion." }, 404);
    }

    const now = new Date().toISOString();
    const ownerDisplayName = await profileDisplayName(client, user.id, user.email ?? null);
    const invitedUser = await findAuthUserByEmail(client, invitedEmail);
    const invitedDisplayName = await profileDisplayName(client, invitedUser?.id, invitedEmail);

    const { data: activeShares, error: activeError } = await client
      .from("obligation_shares")
      .select("id, invited_email, status, token")
      .eq("workspace_id", workspaceId)
      .eq("obligation_id", obligationId)
      .in("status", ["pending", "accepted"])
      .order("updated_at", { ascending: false });
    if (activeError) throw activeError;

    const sameShare = (activeShares ?? []).find((share) =>
      typeof share.invited_email === "string" &&
      share.invited_email.trim().toLowerCase() === invitedEmail
    );

    let shareRow: Record<string, unknown>;
    if (sameShare) {
      const { data: updatedShare, error: updateError } = await client
        .from("obligation_shares")
        .update({
          invited_user_id: invitedUser?.id ?? null,
          invited_display_name: invitedDisplayName,
          invited_by_user_id: user.id,
          owner_display_name: ownerDisplayName,
          message,
          last_sent_at: now,
          updated_at: now,
        })
        .eq("id", sameShare.id)
        .select("id, token, invited_email")
        .single();
      if (updateError) throw updateError;
      shareRow = updatedShare as Record<string, unknown>;
    } else {
      const otherIds = (activeShares ?? []).map((share) => share.id).filter(Boolean);
      if (otherIds.length > 0) {
        const { error: revokeError } = await client
          .from("obligation_shares")
          .update({ status: "revoked", responded_at: now, updated_at: now })
          .in("id", otherIds);
        if (revokeError) throw revokeError;
      }

      const token = crypto.randomUUID();
      const { data: insertedShare, error: insertError } = await client
        .from("obligation_shares")
        .insert({
          workspace_id: workspaceId,
          obligation_id: obligationId,
          owner_user_id: user.id,
          invited_by_user_id: user.id,
          invited_user_id: invitedUser?.id ?? null,
          owner_display_name: ownerDisplayName,
          invited_display_name: invitedDisplayName,
          invited_email: invitedEmail,
          status: "pending",
          token,
          message,
          last_sent_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("id, token, invited_email")
        .single();
      if (insertError) throw insertError;
      shareRow = insertedShare as Record<string, unknown>;
    }

    const token = String(shareRow.token ?? "");
    const shareUrl = buildShareUrl(body.appUrl, token);
    const mobileShareUrl = buildMobileShareUrl(token);
    const androidIntentShareUrl = buildAndroidIntentShareUrl(token, shareUrl);
    const obligationDirection = String(obligation.direction ?? "");
    const inviteKindLabel = obligationDirection === "receivable"
      ? "deuda"
      : obligationDirection === "payable"
        ? "credito"
        : "obligacion";
    const notificationTitle = inviteKindLabel === "deuda"
      ? "Tienes una deuda compartida pendiente"
      : inviteKindLabel === "credito"
        ? "Tienes un credito compartido pendiente"
        : "Tienes una obligacion compartida pendiente";
    const notificationBody = inviteKindLabel === "obligacion"
      ? "Revisa la solicitud y confirma si deseas aceptarla o rechazarla."
      : `Revisa la solicitud de ${inviteKindLabel} y confirma si deseas aceptarla o rechazarla.`;

    if (invitedUser?.id) {
      await client.from("notifications").insert({
        user_id: invitedUser.id,
        channel: "in_app",
        status: "pending",
        kind: "obligation_share_invite",
        title: notificationTitle,
        body: notificationBody,
        scheduled_for: now,
        related_entity_type: "obligation_share",
        related_entity_id: Number(shareRow.id),
        payload: {
          type: "obligation_share_invite",
          token,
          shareId: Number(shareRow.id),
          workspaceId,
          obligationId,
          obligationTitle: String(obligation.title ?? ""),
          obligationDirection,
          inviteKindLabel,
          ownerDisplayName,
          shareUrl,
          mobileShareUrl,
          androidIntentShareUrl,
        },
      });
    }

    const emailSent = await maybeSendInviteEmail({
      to: invitedEmail,
      shareUrl,
      mobileShareUrl,
      androidIntentShareUrl,
      obligationTitle: String(obligation.title ?? "Obligacion"),
      ownerDisplayName,
      message,
    });

    return jsonResponse({
      ok: true,
      shareId: Number(shareRow.id),
      shareUrl,
      mobileShareUrl,
      androidIntentShareUrl,
      emailSent,
      invitedEmail,
      invitedDisplayName,
      status: sameShare?.status ?? "pending",
    });
  } catch (error) {
    console.error("[create-obligation-share-invite]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo compartir la obligacion.",
    }, 500);
  }
});
