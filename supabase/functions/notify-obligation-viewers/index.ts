/**
 * Avisa a quien mira una obligación compartida de lo que le pasó a un evento.
 *
 * ## Por qué existe
 *
 * La app escribía estas notificaciones directamente desde el teléfono. Dejó de poder el
 * 2026-06-10, cuando la auditoría S1 puso RLS al esquema base: `notifications` quedó como tabla
 * personal —`user_id = auth.uid()` en select, insert, update y delete—, así que **nadie puede
 * escribirle una notificación a otro usuario desde el cliente**. Antes funcionaba porque la
 * tabla no tenía RLS ninguna: cualquiera con la anon key podía escribir cualquier fila.
 *
 * El fallo era silencioso hasta el 2026-09-01, cuando el insert bloqueado tumbó la mutación de
 * editar un evento: el usuario vio "new row violates row-level security policy" sobre un cambio
 * que **ya estaba guardado**, y le dio a guardar cuatro veces.
 *
 * ## Qué garantiza
 *
 * - **El cliente no escribe el texto.** Manda el `kind` y los hechos; el título y el cuerpo los
 *   compone esta función con plantillas fijas. Nadie puede redactar la notificación que ve otro.
 * - **El destinatario se valida contra la base**: solo usuarios con un `obligation_shares`
 *   aceptado sobre esa obligación. Si se manda un `viewerUserId`, tiene que estar en esa lista.
 * - **El emisor tiene que tener sitio en esa obligación**: para avisar a un invitado, ser
 *   miembro no-viewer del workspace; para pedirle algo al dueño, ser un invitado aceptado. En
 *   ese sentido el destinatario es el dueño que dice el share, y el nombre que firma la
 *   solicitud sale del perfil de quien llama.
 *
 * Deploy:
 *   npx supabase functions deploy notify-obligation-viewers --project-ref cawrdzrcipgibcoefltr
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  numberFromBody,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

/**
 * Lo que esta función sabe decir. Nada fuera de esta lista se envía.
 *
 * Los cuatro primeros van del dueño al invitado; los dos últimos, del invitado al dueño —una
 * solicitud, que el dueño aprueba o rechaza—. El sentido decide quién puede llamar y quién
 * recibe, y las dos cosas se comprueban contra la base.
 */
const OWNER_KINDS = [
  "obligation_event_updated",
  "obligation_event_deleted",
  "obligation_event_delete_accepted",
  "obligation_event_delete_rejected",
] as const;

const VIEWER_KINDS = [
  "obligation_event_delete_request",
  "obligation_event_edit_request",
] as const;

const KINDS = [...OWNER_KINDS, ...VIEWER_KINDS] as const;

type Kind = (typeof KINDS)[number];

function isViewerKind(kind: Kind) {
  return (VIEWER_KINDS as readonly string[]).includes(kind);
}

const MAX_REASON = 300;

function textFromBody(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function amountFromBody(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function moneyLabel(amount: number | null, currencyCode: string | null): string {
  if (amount == null) return "";
  const code = (currencyCode ?? "PEN").trim().toUpperCase();
  try {
    return ` de ${new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount))}`;
  } catch {
    return ` de ${code} ${Math.abs(amount).toFixed(2)}`;
  }
}

/** El texto lo pone la función, no quien la llama. */
function compose(
  kind: Kind,
  money: string,
  title: string | null,
  reason: string | null,
  requesterName: string,
) {
  const where = title ? ` en "${title}"` : "";
  switch (kind) {
    case "obligation_event_delete_request":
      return {
        title: "Solicitud de eliminación",
        body: `${requesterName} solicitó eliminar un evento${money}${where}.`,
      };
    case "obligation_event_edit_request":
      return {
        title: "Solicitud de cambio",
        body: `${requesterName} propuso cambiar un evento${money}${where}.`,
      };
    case "obligation_event_updated":
      return { title: "Evento actualizado", body: `Se actualizó un evento${money}${where}.` };
    case "obligation_event_deleted":
      return { title: "Evento eliminado", body: `Se eliminó un evento${money}${where}.` };
    case "obligation_event_delete_accepted":
      return { title: "Eliminación aprobada", body: `Se eliminó el evento${money}${where}.` };
    case "obligation_event_delete_rejected":
      return {
        title: "Solicitud rechazada",
        body: `No se aprobó la eliminación del evento${money}${where}${reason ? `. Motivo: ${reason}` : ""}.`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);

    const obligationId = numberFromBody(body.obligationId);
    const eventId = numberFromBody(body.eventId);
    const kind = KINDS.find((candidate) => candidate === body.kind) ?? null;
    if (!obligationId || !eventId || !kind) {
      return jsonResponse({ ok: false, error: "Faltan datos para avisar." }, 400);
    }

    const { data: obligation, error: obligationError } = await client
      .from("obligations")
      .select("id, workspace_id, title, currency_code")
      .eq("id", obligationId)
      .maybeSingle();
    if (obligationError) throw obligationError;
    if (!obligation) return jsonResponse({ ok: false, error: "No se encontro la obligacion." }, 404);

    // Los destinatarios salen de la base, nunca de la petición.
    const { data: shareRows, error: shareError } = await client
      .from("obligation_shares")
      .select("invited_user_id, owner_user_id")
      .eq("obligation_id", obligationId)
      .eq("status", "accepted");
    if (shareError) throw shareError;

    const shares = (shareRows ?? []) as Array<{
      invited_user_id: string | null;
      owner_user_id: string | null;
    }>;
    const accepted = new Set(
      shares
        .map((row) => row.invited_user_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    );

    let recipients: string[];

    if (isViewerKind(kind)) {
      // Va del invitado al dueño: quien llama tiene que ser un invitado aceptado, y el dueño
      // sale del propio share.
      if (!accepted.has(user.id)) {
        return jsonResponse({ ok: false, error: "No compartes esta obligacion." }, 403);
      }
      const owner = shares.find((row) => row.invited_user_id === user.id)?.owner_user_id ?? null;
      if (!owner) return jsonResponse({ ok: false, error: "No se encontro al dueno." }, 404);
      recipients = [owner];
    } else {
      // Va del dueño al invitado: miembro no-viewer del workspace de la obligación.
      const { data: membership, error: membershipError } = await client
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", obligation.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || membership.role === "viewer") {
        return jsonResponse({ ok: false, error: "No tienes permisos sobre esta obligacion." }, 403);
      }

      const requestedViewer = typeof body.viewerUserId === "string" ? body.viewerUserId.trim() : "";
      if (requestedViewer) {
        if (!accepted.has(requestedViewer)) {
          return jsonResponse({ ok: false, error: "Ese usuario no comparte esta obligacion." }, 403);
        }
        recipients = [requestedViewer];
      } else {
        recipients = [...accepted];
      }
    }
    if (recipients.length === 0) return jsonResponse({ ok: true, notified: 0 });

    // El evento puede haberse borrado: entonces los hechos vienen en la petición, y son del
    // dueño, que es quien acaba de borrarlo.
    const { data: eventRow } = await client
      .from("obligation_events")
      .select("amount, event_date, installment_no, description, notes, event_type")
      .eq("id", eventId)
      .eq("obligation_id", obligationId)
      .maybeSingle();

    const amount = eventRow?.amount != null
      ? Number(eventRow.amount)
      : amountFromBody((body.deleted as Record<string, unknown> | undefined)?.amount);
    const eventType = eventRow?.event_type
      ?? textFromBody((body.deleted as Record<string, unknown> | undefined)?.eventType, 40);
    const eventDate = eventRow?.event_date
      ?? dateFromBody((body.deleted as Record<string, unknown> | undefined)?.eventDate);
    const reason = textFromBody(body.rejectionReason, MAX_REASON);
    const currencyCode = (obligation.currency_code ?? "PEN").trim().toUpperCase();

    // El nombre sale del perfil de quien llama: así nadie firma una solicitud con otro nombre.
    let requesterName = "Alguien";
    if (isViewerKind(kind)) {
      const { data: profile } = await client
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      requesterName = profile?.full_name?.trim() || user.email?.split("@")[0] || "El invitado";
    }

    const { title, body: message } = compose(
      kind,
      moneyLabel(amount, currencyCode),
      obligation.title ?? null,
      reason,
      requesterName,
    );

    const previous = (body.previous ?? {}) as Record<string, unknown>;
    const proposed = (body.proposed ?? {}) as Record<string, unknown>;
    const payload = {
      obligationId,
      eventId,
      currencyCode,
      eventType: eventType ?? null,
      eventDate: eventDate ?? null,
      amount: amount ?? null,
      obligationTitle: obligation.title ?? null,
      rejectionReason: reason,
      responseStatus: kind === "obligation_event_delete_accepted"
        ? "accepted"
        : kind === "obligation_event_delete_rejected"
          ? "rejected"
          : null,
      currentAmount: amountFromBody(previous.amount),
      currentEventDate: dateFromBody(previous.eventDate),
      currentInstallmentNo: amountFromBody(previous.installmentNo),
      currentDescription: textFromBody(previous.description, 500),
      currentNotes: textFromBody(previous.notes, 1000),
      // En una solicitud, lo propuesto es lo que el invitado pide; en un aviso del dueño, lo que
      // el evento dice ahora.
      proposedAmount: amountFromBody(proposed.amount) ?? amount ?? null,
      proposedEventDate: dateFromBody(proposed.eventDate) ?? eventDate ?? null,
      proposedInstallmentNo: amountFromBody(proposed.installmentNo)
        ?? (eventRow?.installment_no != null ? Number(eventRow.installment_no) : null),
      proposedDescription: textFromBody(proposed.description, 500) ?? eventRow?.description ?? null,
      proposedNotes: textFromBody(proposed.notes, 1000) ?? eventRow?.notes ?? null,
      requestedByUserId: isViewerKind(kind) ? user.id : null,
      requestedByDisplayName: isViewerKind(kind) ? requesterName : null,
    };

    const now = new Date().toISOString();
    let notified = 0;
    for (const userId of recipients) {
      // Misma semántica que createOrRefreshNotificationRow: una fila por
      // (usuario, kind, entidad), refrescada si ya existe.
      const { data: existing, error: findError } = await client
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("related_entity_type", "obligation_event")
        .eq("related_entity_id", eventId);
      if (findError) throw findError;

      const row = {
        channel: "in_app",
        status: "pending",
        title,
        body: message,
        scheduled_for: now,
        payload,
        read_at: null,
      };

      if ((existing?.length ?? 0) > 0) {
        const { error: updateError } = await client
          .from("notifications")
          .update(row)
          .eq("user_id", userId)
          .eq("kind", kind)
          .eq("related_entity_type", "obligation_event")
          .eq("related_entity_id", eventId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await client.from("notifications").insert({
          ...row,
          user_id: userId,
          kind,
          related_entity_type: "obligation_event",
          related_entity_id: eventId,
        });
        if (insertError) throw insertError;
      }
      notified += 1;
    }

    return jsonResponse({ ok: true, notified });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
