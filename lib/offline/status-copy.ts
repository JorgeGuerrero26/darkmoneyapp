import type { InboxEntry } from "./outbox";
import type { OfflineState } from "./runtime";

/**
 * Textos del modo sin conexión, en lenguaje de persona (docs/CHANGELOG_STYLE.md): nada de
 * "cola", "outbox" ni "sincronización"; se habla de "cambios" y de "enviar".
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ONLINE_ONLY_COMPOUND_NOTICE = "Necesitas internet para registrar este pago o llegada. Conéctate y vuelve a intentarlo; no se guardó ningún cambio.";

export const ONLINE_ONLY_OBLIGATION_NOTICE = "Necesitas internet para registrar el movimiento de apertura de esta deuda o préstamo. Conéctate y vuelve a intentarlo; no se guardó ningún cambio.";

export const ONLINE_ONLY_DELETE_SUBSCRIPTION_NOTICE = "Necesitas internet para eliminar esta suscripción: tiene pagos registrados y el servidor debe borrarlos junto con ella. Conéctate y vuelve a intentarlo; no se borró nada.";

export const ONLINE_ONLY_DELETE_OBLIGATION_NOTICE = "Necesitas internet para eliminar esta obligación: el servidor debe confirmar que no tiene pagos. Conéctate y vuelve a intentarlo; no se borró nada.";

export type SyncLine = {
  kind: "offline" | "pending" | "sending" | "review";
  text: string;
  /** Si se puede tocar para abrir la hoja de pendientes. */
  tappable: boolean;
};

/**
 * La línea de estado del encabezado (Revisión 54): reemplaza a "Actualizado hace…" cuando hay algo que decir y
 * deja de aparecer cuando todo está al día. Cuatro estados: sin conexión (dorado), enviando (gris),
 * por enviar tras un reintento (dorado) y "necesita revisión" (rojo, no desaparece hasta resolverlo).
 */
export function describeSyncLine(state: OfflineState): SyncLine | null {
  if (state.availability !== "ready") return null;
  const needsReview = state.rejected + state.review;

  if (state.syncing && state.pending > 0) {
    const total = Math.max(state.sendingTotal, state.pending);
    const current = Math.min(total, total - state.pending + 1);
    return { kind: "sending", text: `Enviando ${current} de ${total}…`, tappable: false };
  }
  if (needsReview > 0) {
    return {
      kind: "review",
      text: `${needsReview} ${plural(needsReview, "cambio necesita revisión", "cambios necesitan revisión")}`,
      tappable: true,
    };
  }
  if (!state.online) {
    return { kind: "offline", text: state.pending > 0 ? `Sin conexión · ${state.pending} por enviar` : "Sin conexión", tappable: true };
  }
  if (state.pending > 0) {
    // El último intento no llegó (servidor lento): se dice que se reintenta solo, para que no parezca atascado.
    const text = state.lastError ? `${state.pending} por enviar · reintentando` : `${state.pending} por enviar`;
    return { kind: "pending", text, tappable: true };
  }
  return null;
}

/** Qué cambió, en palabras de persona: "Nuevo movimiento", "Cuenta editada · nombre", "Categoría borrada". */
const TABLE_NOUN: Record<string, { noun: string; feminine: boolean }> = {
  movements: { noun: "movimiento", feminine: false },
  accounts: { noun: "cuenta", feminine: true },
  categories: { noun: "categoría", feminine: true },
  counterparties: { noun: "contacto", feminine: false },
  spend_types: { noun: "tipo de gasto", feminine: false },
  movement_templates: { noun: "plantilla", feminine: true },
  budgets: { noun: "presupuesto", feminine: false },
  subscriptions: { noun: "suscripción", feminine: true },
  recurring_income: { noun: "ingreso fijo", feminine: false },
  obligations: { noun: "crédito o deuda", feminine: false },
  obligation_events: { noun: "pago de deuda", feminine: false },
};

const FIELD_LABEL: Record<string, string> = {
  name: "nombre", title: "título", description: "descripción", notes: "notas", status: "estado", color: "color", icon: "ícono",
  source_amount: "monto", destination_amount: "monto", amount: "monto", limit_amount: "límite", opening_balance: "saldo inicial",
  occurred_at: "fecha", due_date: "vencimiento", next_due_date: "próximo vencimiento", category_id: "categoría",
  counterparty_id: "contacto", source_account_id: "cuenta", destination_account_id: "cuenta", is_active: "estado",
  is_archived: "archivada", is_pinned: "fijado", kind: "tipo", type: "tipo", currency_code: "moneda",
};

export function describePendingChange(change: { table: string; kind: "insert" | "update" | "delete"; changedFields: string[]; label: string | null }): {
  title: string;
  detail: string | null;
} {
  const entry = TABLE_NOUN[change.table] ?? { noun: "cambio", feminine: false };
  const editado = entry.feminine ? "editada" : "editado";
  const borrado = entry.feminine ? "borrada" : "borrado";
  const nuevo = entry.feminine ? "Nueva" : "Nuevo";
  const head = change.kind === "insert" ? `${nuevo} ${entry.noun}` : `${capitalize(entry.noun)} ${change.kind === "update" ? editado : borrado}`;
  const fields = [...new Set(change.changedFields.map((field) => FIELD_LABEL[field]).filter((label): label is string => Boolean(label)))];
  const detail = change.kind === "update" && fields.length ? fields.join(", ") : null;
  return { title: change.label ? `${head} · ${change.label}` : head, detail };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Resumen de una línea para la fila de Ajustes y la cabecera de la pantalla de estado. */
export function describeOfflineSummary(state: OfflineState, flagEnabled: boolean): string {
  if (!flagEnabled) return "Apagado";
  switch (state.availability) {
    case "unavailable":
      return "No disponible en esta versión de la app";
    case "error":
      return "No se pudo iniciar";
    case "starting":
      return "Preparando…";
    case "disabled":
      return "Apagado";
    case "ready":
      break;
  }
  if (!state.hydrated) return "Preparando tus datos…";
  if (state.rejected > 0) return `${state.rejected} ${plural(state.rejected, "cambio no se pudo guardar", "cambios no se pudieron guardar")}`;
  if (!state.online) return state.pending > 0 ? `Sin conexión · ${state.pending} por enviar` : "Sin conexión";
  if (state.syncing) return "Sincronizando…";
  if (state.pending > 0) return `${state.pending} ${plural(state.pending, "cambio por enviar", "cambios por enviar")}`;
  return "Todo al día";
}

/** Qué explica la bandeja de cada entrada, sin jerga. */
export function describeInboxEntry(entry: InboxEntry): { title: string; body: string } {
  const what = entry.summary ?? "Un cambio";
  if (entry.status === "review") {
    const before = entry.previous && typeof entry.previous === "object" ? Object.entries(entry.previous) : [];
    const detail = before.length ? ` Antes decía: ${before.map(([key, value]) => `${labelOf(key)} ${String(value)}`).join(", ")}.` : "";
    return {
      title: what,
      body: `Se guardó, pero otra persona había cambiado esto antes que tú.${detail} Revisa que quedó como esperabas.`,
    };
  }
  if (entry.kind === "delete" && entry.code === "dependency") {
    return { title: what, body: "Este registro todavía se usa en otro lugar y no se puede borrar. Revisa sus registros relacionados." };
  }
  return { title: what, body: reasonOf(entry.code, entry.message) };
}

function labelOf(column: string): string {
  const labels: Record<string, string> = {
    source_amount: "monto de salida",
    destination_amount: "monto de entrada",
    source_account_id: "cuenta de salida",
    destination_account_id: "cuenta de entrada",
    fx_rate: "tipo de cambio",
    occurred_at: "fecha",
  };
  return labels[column] ?? column;
}

function reasonOf(code: string | null, message: string | null): string {
  switch (code) {
    case "row_not_found":
      return "Otra persona borró este movimiento antes de que se enviara tu cambio.";
    case "edited_since":
      return "Otra persona lo cambió mientras estabas sin conexión, así que no se borró. Revísalo y bórralo de nuevo si todavía quieres.";
    case "dependency":
      return "Usa una cuenta, categoría o contacto que ya no existe. Vuelve a registrarlo con uno que exista.";
    case "forbidden":
      return "Ya no tienes permiso para hacer este cambio en este espacio.";
    case "duplicate":
      return "Ya existía un movimiento igual.";
    case "check_violation":
      return "Los datos no cumplen una regla de la app (por ejemplo, montos o cuentas que no corresponden).";
    default:
      return message ? `No se pudo guardar: ${message}` : "No se pudo guardar este cambio.";
  }
}
