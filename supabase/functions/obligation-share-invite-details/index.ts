/**
 * Deploy:
 *   npx supabase functions deploy obligation-share-invite-details --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
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

    const { data: share, error: shareError } = await client
      .from("obligation_shares")
      .select("id, obligation_id, status, owner_display_name, message")
      .eq("token", token)
      .in("status", ["pending", "accepted", "declined"])
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) return jsonResponse({ ok: false, error: "Invitacion no encontrada o expirada." }, 404);
    if (share.status === "declined") {
      return jsonResponse({ ok: false, error: "Esta invitacion ya fue rechazada." }, 409);
    }

    const { data: summary, error: summaryError } = await client
      .from("v_obligation_summary")
      .select("*")
      .eq("id", share.obligation_id)
      .maybeSingle();
    if (summaryError) throw summaryError;
    if (!summary) return jsonResponse({ ok: false, error: "No se encontro la obligacion." }, 404);

    const invite = {
      title: String(summary.title ?? "Obligacion"),
      direction: String(summary.direction ?? ""),
      counterparty: String(summary.counterparty ?? summary.counterparty_name ?? "Sin contacto"),
      currencyCode: String(summary.currency_code ?? "PEN"),
      principalAmount: Number(summary.principal_amount ?? summary.principal_initial_amount ?? 0),
      currentPrincipalAmount: Number(summary.principal_current_amount ?? summary.current_principal_amount ?? 0),
      pendingAmount: Number(summary.pending_amount ?? 0),
      status: String(share.status ?? "pending"),
      ownerDisplayName: typeof share.owner_display_name === "string" ? share.owner_display_name : null,
      message: typeof share.message === "string" ? share.message : null,
    };

    return jsonResponse({ ok: true, invite });
  } catch (error) {
    console.error("[obligation-share-invite-details]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo cargar la invitacion.",
    }, 500);
  }
});
