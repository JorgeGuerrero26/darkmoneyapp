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

const EPISODE_WINDOW_MS = 60_000;

type EpisodeSummary = {
  events: number;
  channels: string[];
  statuses: string[];
  durationMs: number;
};

type Episode = {
  startedAt: number;
  lastAt: number;
  events: number;
  channels: Set<string>;
  statuses: Set<string>;
};

/** Compartido por TODOS los canales a propósito: el socket que se cae también lo es. */
let episode: Episode | null = null;

/**
 * Olvida el episodio en curso. Solo para los tests: al vivir en el módulo, el estado sobrevive
 * de un caso al siguiente y el recuento de uno se colaría en la fila del otro.
 */
export function resetRealtimeEpisodeState(): void {
  episode = null;
}

function closeEpisode(): EpisodeSummary | null {
  if (!episode) return null;
  const closed = episode;
  episode = null;
  // Con un solo evento no hay nada que resumir: la fila que abrió el episodio ya lo contó todo.
  if (closed.events <= 1) return null;
  return {
    events: closed.events,
    channels: [...closed.channels].sort(),
    statuses: [...closed.statuses].sort(),
    durationMs: closed.lastAt - closed.startedAt,
  };
}

/**
 * Colapsa en UNA fila la caída de socket que los cuatro canales reportan a la vez.
 *
 * El filtro por canal (`lastLoggedStatus`) ya evitaba que un canal repitiera su estado, pero
 * seguía escribiendo una fila POR CANAL: cuando el teléfono se duerme o cambia de red, el socket
 * compartido muere y dashboard/notifications/movements/accounts avisan cada uno por su lado del
 * mismo hecho. Medido sobre los 4.707 avisos de 60 días (todos de un iPhone): 2.028 segundos
 * distintos, y 988 de ellos traían 3 canales a la vez. Agrupando por ventana de 60 s quedan 608
 * filas —87% menos— y la curva se aplana ahí: 5 minutos solo ahorra un 3% más y ya no se
 * distinguen dos episodios seguidos.
 *
 * El recuento del episodio no se escribe con un temporizador —el teléfono puede quedarse sin
 * proceso antes de que dispare, justo en el caso que lo provoca— sino que viaja en la fila del
 * episodio SIGUIENTE. Llega tarde, pero llega, y nunca cuesta una fila extra.
 */
function admitEpisodeEvent(
  channelName: string,
  status: string,
  /** Un motivo concreto del servidor se escribe siempre: son 3 en dos semanas y son los que valen. */
  force: boolean,
): { admit: boolean; previousEpisode: EpisodeSummary | null } {
  const now = Date.now();
  // Ventana fija desde el primer evento, no deslizante: un canal que parpadea sin parar no puede
  // mantener el episodio abierto para siempre y dejar de avisar.
  if (episode && now - episode.startedAt <= EPISODE_WINDOW_MS) {
    episode.lastAt = now;
    episode.events += 1;
    episode.channels.add(channelName);
    episode.statuses.add(status);
    return { admit: force, previousEpisode: null };
  }
  const previousEpisode = closeEpisode();
  episode = {
    startedAt: now,
    lastAt: now,
    events: 1,
    channels: new Set([channelName]),
    statuses: new Set([status]),
  };
  return { admit: true, previousEpisode };
}

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
 * - Log colapsado por episodio: la caída del socket compartido deja UNA fila,
 *   no una por canal (ver admitEpisodeEvent).
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
    const mine = next;
    channel = next.subscribe((status, err) => {
      // Ignorar eventos de un canal ya reemplazado: el removeChannel del retry
      // emite CLOSED sobre el canal viejo, y tratarlo como fallo nuevo mataba
      // al canal sano recién suscrito en un loop infinito de 5s (incidente
      // 2026-07-17: ~2000 warnings/hora en app_error_logs con la app abierta).
      if (disposed || channel !== mine) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        lastLoggedStatus = null;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Un fallo en el PRIMER intento no es una avería: el socket es compartido, y cuando el
        // teléfono se duerme o cambia de red se cae entero. Medido del 06 al 09 de agosto de
        // 2026: de 62 eventos, la mayoría eran CHANNEL_ERROR con attempt=0 llegando en el MISMO
        // segundo para dashboard/notifications/movements/accounts —la firma de un socket caído,
        // no de cuatro canales rotos— y se rehacían solos sin escalar.
        //
        // Se avisa cuando el reintento automático YA falló (attempt >= 1), o cuando el servidor
        // manda un motivo concreto: esos son los que valen ("mismatch between server and client
        // bindings", "InvalidJWTToken"), y son 3 en dos semanas frente a cientos de blips.
        // Mismo criterio que MIN_BLOCKED_FOR_NETWORK_WARNING: un solo síntoma no es una avería.
        const reason = err?.message ?? null;
        const worthLogging = attempt >= 1 || Boolean(reason);
        if (worthLogging && lastLoggedStatus !== status) {
          // Dos filtros, cada uno para un ruido distinto: este canal repitiendo su estado, y los
          // demás canales avisando del mismo socket muerto.
          const { admit, previousEpisode } = admitEpisodeEvent(channelName, status, Boolean(reason));
          if (admit) {
            lastLoggedStatus = status;
            logWarn("realtime", `${source} channel ${status}`, {
              channelName,
              attempt,
              error: reason,
              previousEpisode,
            });
          }
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
      // Soltar la referencia ANTES de removeChannel: así el CLOSED que emite el
      // canal retirado no pasa el guard `channel !== mine` del callback.
      const stale = channel;
      channel = null;
      if (stale) void supabase.removeChannel(stale);
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
