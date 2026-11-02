/**
 * delete-account: elimina la cuenta de quien la pide y todos sus datos.
 *
 * POST { preview: true }       → qué pasaría (sin borrar): { mustCancelPro, transfers, deletedWorkspaces }
 * POST { confirm: "ELIMINAR" } → { deleted: true }
 * 401 unauthorized · 400 bad_confirm · 409 cancel_pro_first · 500 delete_failed
 *
 * Orden (repetirla tras un fallo a mitad es seguro: cada paso deja igual lo que ya hizo):
 *  1. Si Paddle le sigue cobrando → 409: primero cancela Pro en la web.
 *  2. Sus espacios con otros miembros pasan al admin más antiguo (o al miembro más antiguo): nunca se borran datos
 *     de otras personas. Los que solo son suyos se borran con la cuenta.
 *  3. Archivos de Storage (el borrado en cascada no los alcanza): su avatar y los comprobantes de los espacios que
 *     se van a borrar. Los que subió a un espacio que sigue son del espacio y se quedan.
 *  4. Lo que deja en deudas de otros: solicitudes de pago pendientes fuera; las aceptadas quedan como «Cuenta
 *     eliminada». Avisos de pago sin nombre ni correo. Sus registros de errores, fuera.
 *  5. auth.admin.deleteUser: en cascada se va su perfil, su espacio, notificaciones, token push, alias de correo,
 *     suscripción, deudas compartidas… (migración 202611020001_account_deletion_fks.sql).
 *  6. Registro anónimo «cuenta eliminada», sin correo ni id.
 *
 * Deploy:
 *   npx supabase functions deploy delete-account --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import {
  DELETED_ACCOUNT_LABEL,
  isDeleteConfirmed,
  type MemberLike,
  mustCancelProFirst,
  pickNewOwner,
  redactPersonalData,
} from "../_shared/account-deletion.ts";
import { corsHeaders, jsonResponse, readJsonBody, serviceClient } from "../_shared/obligation-share-utils.ts";

type Admin = ReturnType<typeof serviceClient>;

const AVATARS_BUCKET = "avatars";
const RECEIPTS_BUCKET = "receipts";

function fail(step: string, error: { message?: string } | null | undefined): never {
  throw new Error(`${step}: ${error?.message ?? "error"}`);
}

/** Borra todo lo que hay bajo una carpeta de un bucket, subcarpetas incluidas. */
async function removeTree(admin: Admin, bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 100; round++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) fail(`listar ${bucket}/${prefix}`, error);
    if (!data?.length) return removed;
    const files = data.filter((entry) => entry.id != null).map((entry) => `${prefix}/${entry.name}`);
    const folders = data.filter((entry) => entry.id == null).map((entry) => `${prefix}/${entry.name}`);
    for (const folder of folders) removed += await removeTree(admin, bucket, folder);
    if (files.length) {
      const { error: removeError } = await admin.storage.from(bucket).remove(files);
      if (removeError) fail(`borrar ${bucket}/${prefix}`, removeError);
      removed += files.length;
    } else if (!folders.length) {
      return removed;
    }
  }
  return removed;
}

type Plan = {
  transfers: Array<{ workspaceId: number; workspaceName: string; newOwnerId: string; newOwnerName: string }>;
  deletedWorkspaceIds: number[];
};

/** Qué espacios pasan a otra persona y cuáles se borran con la cuenta. */
async function planWorkspaces(admin: Admin, userId: string): Promise<Plan> {
  const { data: owned, error } = await admin.from("workspaces").select("id, name").eq("owner_user_id", userId);
  if (error) fail("leer espacios", error);
  const plan: Plan = { transfers: [], deletedWorkspaceIds: [] };
  for (const workspace of owned ?? []) {
    const { data: members, error: membersError } = await admin
      .from("workspace_members")
      .select("user_id, role, joined_at, created_at")
      .eq("workspace_id", workspace.id);
    if (membersError) fail("leer miembros", membersError);
    const next = pickNewOwner((members ?? []) as MemberLike[], userId);
    if (!next) {
      plan.deletedWorkspaceIds.push(Number(workspace.id));
      continue;
    }
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", next.user_id).maybeSingle();
    plan.transfers.push({
      workspaceId: Number(workspace.id),
      workspaceName: String(workspace.name ?? "Espacio compartido"),
      newOwnerId: next.user_id,
      newOwnerName: String(profile?.full_name ?? "").trim() || "otro miembro",
    });
  }
  return plan;
}

async function transferWorkspaces(admin: Admin, userId: string, plan: Plan) {
  for (const transfer of plan.transfers) {
    const { error: ownerError } = await admin.from("workspaces").update({ owner_user_id: transfer.newOwnerId }).eq("id", transfer.workspaceId);
    if (ownerError) fail("transferir espacio", ownerError);
    const { error: roleError } = await admin
      .from("workspace_members")
      .update({ role: "owner" })
      .eq("workspace_id", transfer.workspaceId)
      .eq("user_id", transfer.newOwnerId);
    if (roleError) fail("nuevo dueño", roleError);
    const { error: leaveError } = await admin.from("workspace_members").delete().eq("workspace_id", transfer.workspaceId).eq("user_id", userId);
    if (leaveError) fail("salir del espacio", leaveError);
  }
}

/** Lo que la persona deja en datos de otros y en registros técnicos. */
async function cleanUpTraces(admin: Admin, userId: string) {
  const { error: pendingError } = await admin
    .from("obligation_payment_requests")
    .delete()
    .eq("requested_by_user_id", userId)
    .eq("status", "pending");
  if (pendingError) fail("solicitudes pendientes", pendingError);
  const { error: labelError } = await admin
    .from("obligation_payment_requests")
    .update({ requested_by_display_name: DELETED_ACCOUNT_LABEL })
    .eq("requested_by_user_id", userId);
  if (labelError) fail("solicitudes aceptadas", labelError);

  const { data: events, error: eventsError } = await admin.from("billing_events").select("id, payload").eq("user_id", userId);
  if (eventsError) fail("leer avisos de pago", eventsError);
  for (const event of events ?? []) {
    const { error } = await admin
      .from("billing_events")
      .update({ payload: redactPersonalData(event.payload ?? {}), external_reference: null })
      .eq("id", event.id);
    if (error) fail("limpiar aviso de pago", error);
  }

  const { error: logsError } = await admin.from("app_error_logs").delete().eq("user_id", userId);
  if (logsError) fail("registros de errores", logsError);
}

async function logEvent(admin: Admin, row: Record<string, unknown>) {
  await admin.from("app_error_logs").insert({ source: "delete-account", platform: "edge", ...row }).then(() => undefined, () => undefined);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const admin = serviceClient();
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = userData?.user;
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await readJsonBody(req);
  const { data: entitlement, error: entitlementError } = await admin
    .from("user_entitlements")
    .select("billing_provider, billing_status, cancel_at_period_end, manual_override")
    .eq("user_id", user.id)
    .maybeSingle();
  if (entitlementError) return jsonResponse({ error: "delete_failed" }, 500);
  const mustCancelPro = mustCancelProFirst(entitlement);
  const manageUrl = `${(Deno.env.get("APP_URL") ?? "https://darkmoney.company").replace(/\/+$/, "")}/settings`;

  if (body.preview === true) {
    try {
      const plan = await planWorkspaces(admin, user.id);
      return jsonResponse({
        mustCancelPro,
        manageUrl,
        transfers: plan.transfers.map(({ workspaceName, newOwnerName }) => ({ workspaceName, newOwnerName })),
        deletedWorkspaces: plan.deletedWorkspaceIds.length,
      });
    } catch {
      return jsonResponse({ error: "preview_failed" }, 500);
    }
  }

  if (!isDeleteConfirmed(body.confirm)) return jsonResponse({ error: "bad_confirm" }, 400);
  if (mustCancelPro) {
    return jsonResponse({
      error: "cancel_pro_first",
      message: "Tu plan Pro se sigue cobrando. Cancélalo primero en la web (Configuración → Suscripción) y vuelve a intentarlo.",
      manageUrl,
    }, 409);
  }

  try {
    const plan = await planWorkspaces(admin, user.id);
    await transferWorkspaces(admin, user.id, plan);
    await removeTree(admin, AVATARS_BUCKET, user.id);
    for (const workspaceId of plan.deletedWorkspaceIds) await removeTree(admin, RECEIPTS_BUCKET, String(workspaceId));
    await cleanUpTraces(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    // Un reintento tras un fallo de red puede encontrarse con la persona ya borrada: eso es éxito.
    if (error && !/not.?found/i.test(error.message ?? "")) fail("deleteUser", error);
  } catch (error) {
    await logEvent(admin, {
      user_id: user.id,
      level: "error",
      message: String(error instanceof Error ? error.message : error).slice(0, 1000),
    });
    return jsonResponse({ error: "delete_failed" }, 500);
  }

  // Sin correo ni id: la persona ya no existe y el registro no debe identificarla.
  await logEvent(admin, { level: "info", message: "cuenta eliminada" });
  return jsonResponse({ deleted: true });
});
