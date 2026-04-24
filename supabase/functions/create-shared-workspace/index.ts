/**
 * Deploy:
 *   npx supabase functions deploy create-shared-workspace --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
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
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
    const baseCurrencyCode = typeof body.baseCurrencyCode === "string" && /^[A-Za-z]{3}$/.test(body.baseCurrencyCode.trim())
      ? body.baseCurrencyCode.trim().toUpperCase()
      : "PEN";

    if (!name) {
      return jsonResponse({ ok: false, error: "Ingresa un nombre para el workspace." }, 400);
    }

    const now = new Date().toISOString();
    const { data: insertedWorkspace, error: workspaceError } = await client
      .from("workspaces")
      .insert({
        owner_user_id: user.id,
        name,
        kind: "shared",
        base_currency_code: baseCurrencyCode,
        description,
        is_archived: false,
      })
      .select("id, owner_user_id, name, kind, base_currency_code, description, is_archived")
      .single();
    if (workspaceError) throw workspaceError;

    const workspaceId = Number(insertedWorkspace.id ?? 0);
    const { error: memberError } = await client
      .from("workspace_members")
      .upsert({
        workspace_id: workspaceId,
        user_id: user.id,
        role: "owner",
        is_default_workspace: false,
        joined_at: now,
      }, { onConflict: "workspace_id,user_id" });
    if (memberError) throw memberError;

    return jsonResponse({
      ok: true,
      workspace: {
        id: workspaceId,
        ownerUserId: String(insertedWorkspace.owner_user_id ?? user.id),
        name: String(insertedWorkspace.name ?? name),
        kind: "shared",
        role: "owner",
        description: typeof insertedWorkspace.description === "string" ? insertedWorkspace.description : "",
        baseCurrencyCode: String(insertedWorkspace.base_currency_code ?? baseCurrencyCode),
        isArchived: Boolean(insertedWorkspace.is_archived),
        isDefaultWorkspace: false,
        joinedAt: now,
      },
    });
  } catch (error) {
    console.error("[create-shared-workspace]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo crear el workspace.",
    }, 500);
  }
});
