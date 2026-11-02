// Eliminar la cuenta: reglas puras que usan la Edge Function delete-account y sus pruebas (sin Deno ni red).

/** Lo que hay que escribir para confirmar: un toque suelto no borra todo. */
export const DELETE_CONFIRM_WORD = "ELIMINAR";

/** Nombre que queda en lo que la persona deja en deudas de otros (solicitudes de pago ya aceptadas). */
export const DELETED_ACCOUNT_LABEL = "Cuenta eliminada";

export function isDeleteConfirmed(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

export type EntitlementLike = {
  billing_provider?: string | null;
  billing_status?: string | null;
  cancel_at_period_end?: boolean | null;
  manual_override?: boolean | null;
} | null | undefined;

/** Estados de Paddle en los que se le sigue cobrando (o se le cobrará al terminar la prueba). */
const PADDLE_CHARGING_STATUSES = new Set(["trialing", "active", "paused", "past_due"]);

/**
 * Si Paddle le va a seguir cobrando, primero cancela Pro: borrar la cuenta no debe dejar un cobro vivo que ya
 * nadie puede ver ni cancelar. Una cancelación ya programada no bloquea; el acceso Pro manual (sin cobro) tampoco.
 */
export function mustCancelProFirst(entitlement: EntitlementLike): boolean {
  if (!entitlement) return false;
  if ((entitlement.billing_provider ?? "").trim().toLowerCase() !== "paddle") return false;
  if (entitlement.cancel_at_period_end) return false;
  return PADDLE_CHARGING_STATUSES.has((entitlement.billing_status ?? "").trim().toLowerCase());
}

export type MemberLike = { user_id: string; role: string; joined_at?: string | null; created_at?: string | null };

const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

/**
 * A quién pasa un espacio compartido cuando su dueña elimina la cuenta: el miembro más antiguo, prefiriendo un
 * admin. null = no hay nadie más y el espacio se borra con la cuenta.
 */
export function pickNewOwner(members: MemberLike[], leavingUserId: string): MemberLike | null {
  const others = members.filter((member) => member.user_id !== leavingUserId);
  if (others.length === 0) return null;
  const since = (member: MemberLike) => member.joined_at ?? member.created_at ?? "9999";
  return [...others].sort((a, b) =>
    (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9) || since(a).localeCompare(since(b)) || a.user_id.localeCompare(b.user_id)
  )[0];
}

/** Claves de un aviso de pago que identifican a la persona. Se vacían; el resto (monto, fechas, ids) se conserva. */
const PERSONAL_KEY = /(^|_)(e-?mail|name|first_name|last_name|full_name|phone|address|address_line\d*|line\d|first_line|second_line|street|postal_code|zip|city|region|ip|ip_address|tax_id|business_name|payer|customer_name|card_holder|cardholder_name|holder)$/i;
const EMAIL_IN_TEXT = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

/** Copia del aviso de pago sin nombre, correo, dirección, teléfono ni IP (en cualquier nivel). */
export function redactPersonalData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPersonalData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        PERSONAL_KEY.test(key) && (typeof inner === "string" || typeof inner === "number") ? null : redactPersonalData(inner),
      ]),
    );
  }
  if (typeof value === "string") return value.replace(EMAIL_IN_TEXT, "[correo eliminado]");
  return value;
}
