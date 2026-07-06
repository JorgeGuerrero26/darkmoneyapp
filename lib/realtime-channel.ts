import { logWarn } from "./error-logger";
import { supabase } from "./supabase";

type Binding = {
  table: string;
  /** Filtro server-side estilo `workspace_id=eq.123`. */
  filter?: string;
  onChange: () => void;
};

type Params = {
  /** Etiqueta para los logs ("movements", "dashboard", …). */
  source: string;
  channelName: string;
  bindings: Binding[];
};

/**
 * Suscripción realtime robusta, compartida por los hooks de sync (diagnóstico
 * app_error_logs 2026-07-06: ~350 warnings de canal en 14 días y canales que
 * quedaban muertos hasta el remount). Diferencias contra suscribirse a mano:
 *
 * - Re-suscripción con backoff (5s→15s→60s→5min) ante CHANNEL_ERROR/TIMED_OUT/
 *   CLOSED: el canal vuelve solo en cuanto hay red, sin esperar a remontar la
 *   pantalla.
 * - Consciente del desmontaje: el CLOSED que dispara el propio removeChannel
 *   del cleanup ya no se registra como error (era gran parte del spam).
 * - Log deduplicado: una línea por racha de fallo, no una por reintento.
 */
export function subscribeRealtimeChannel({ source, channelName, bindings }: Params): () => void {
  if (!supabase) return () => {};
  let disposed = false;
  let attempt = 0;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastLoggedStatus: string | null = null;

  const RESUBSCRIBE_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];

  function open() {
    if (disposed || !supabase) return;
    let next = supabase.channel(channelName);
    for (const binding of bindings) {
      next = next.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: binding.table,
          ...(binding.filter ? { filter: binding.filter } : {}),
        },
        binding.onChange,
      );
    }
    channel = next.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        lastLoggedStatus = null;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (lastLoggedStatus !== status) {
          lastLoggedStatus = status;
          logWarn("realtime", `${source} channel ${status}`, { channelName, attempt });
        }
        scheduleResubscribe();
      }
    });
  }

  function scheduleResubscribe() {
    if (disposed || retryTimer) return;
    const delay = RESUBSCRIBE_DELAYS_MS[Math.min(attempt, RESUBSCRIBE_DELAYS_MS.length - 1)];
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (disposed || !supabase) return;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      open();
    }, delay);
  }

  open();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
  };
}
