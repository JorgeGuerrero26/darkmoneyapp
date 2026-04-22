/**
 * Deploy:
 *   npx supabase functions deploy list-shared-obligations --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
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
    await readJsonBody(req);
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const userEmail = normalizeEmail(user.email);

    const emailFilter = userEmail ? `,invited_email.eq.${userEmail}` : "";
    const { data: shares, error: sharesError } = await client
      .from("obligation_shares")
      .select("*")
      .eq("status", "accepted")
      .or(`invited_user_id.eq.${user.id}${emailFilter}`)
      .order("updated_at", { ascending: false });
    if (sharesError) throw sharesError;

    const obligationIds = Array.from(new Set((shares ?? []).map((share) => Number(share.obligation_id)).filter(Boolean)));
    if (obligationIds.length === 0) return jsonResponse({ ok: true, items: [] });

    const { data: obligations, error: obligationsError } = await client
      .from("v_obligation_summary")
      .select("*")
      .in("id", obligationIds);
    if (obligationsError) throw obligationsError;

    const { data: events, error: eventsError } = await client
      .from("obligation_events")
      .select("id, obligation_id, event_type, event_date, created_at, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata")
      .in("obligation_id", obligationIds)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false });
    if (eventsError) throw eventsError;

    const obligationsById = new Map<number, Record<string, unknown>>();
    for (const obligation of obligations ?? []) {
      obligationsById.set(Number(obligation.id), obligation as Record<string, unknown>);
    }

    const eventsByObligationId = new Map<number, Record<string, unknown>[]>();
    for (const event of events ?? []) {
      const obligationId = Number(event.obligation_id);
      const list = eventsByObligationId.get(obligationId) ?? [];
      list.push(event as Record<string, unknown>);
      eventsByObligationId.set(obligationId, list);
    }

    const items = (shares ?? [])
      .map((share) => {
        const obligationId = Number(share.obligation_id);
        const obligation = obligationsById.get(obligationId);
        if (!obligation) return null;
        return {
          obligation: {
            ...obligation,
            events: eventsByObligationId.get(obligationId) ?? [],
          },
          share,
        };
      })
      .filter(Boolean);

    return jsonResponse({ ok: true, items });
  } catch (error) {
    console.error("[list-shared-obligations]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudieron cargar las obligaciones compartidas.",
    }, 500);
  }
});
