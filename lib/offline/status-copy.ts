import type { InboxEntry } from "./outbox";
import type { OfflineState } from "./runtime";

/**
 * Textos del modo sin conexión, en lenguaje de persona (docs/CHANGELOG_STYLE.md): nada de
 * "cola", "outbox" ni "sincronización"; se habla de "cambios" y de "enviar".
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type OfflineNotice = {
  title: string;
  body: string;
  tone: "info" | "attention";
  busy: boolean;
};

/** El aviso de la lista de movimientos. null = todo al día, no se muestra nada. */
export function describeOfflineNotice(state: OfflineState): OfflineNotice | null {
  if (state.availability !== "ready") return null;

  if (state.rejected > 0) {
    return {
      title: `${state.rejected} ${plural(state.rejected, "cambio no se pudo guardar", "cambios no se pudieron guardar")}`,
      body: "Toca para ver qué pasó y qué hacer.",
      tone: "attention",
      busy: false,
    };
  }
  if (!state.online) {
    return {
      title: "Sin conexión",
      body:
        state.pending > 0
          ? `${state.pending} ${plural(state.pending, "cambio guardado", "cambios guardados")} en tu teléfono. Se enviarán solos cuando vuelva internet.`
          : "Puedes seguir registrando: se guarda en tu teléfono y se envía solo cuando vuelva internet.",
      tone: "info",
      busy: false,
    };
  }
  if (state.pending > 0) {
    return {
      title: state.syncing
        ? `Enviando ${state.pending} ${plural(state.pending, "cambio", "cambios")}…`
        : `${state.pending} ${plural(state.pending, "cambio sin enviar", "cambios sin enviar")}`,
      body: state.syncing ? "Ya están guardados en tu teléfono." : "Ya están guardados en tu teléfono; se reintentará solo.",
      tone: "info",
      busy: state.syncing,
    };
  }
  if (state.review > 0) {
    return {
      title: `${state.review} ${plural(state.review, "cambio para revisar", "cambios para revisar")}`,
      body: "Se guardaron, pero otra persona había cambiado el mismo monto.",
      tone: "attention",
      busy: false,
    };
  }
  return null;
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
