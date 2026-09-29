export type LogBurstSummary = {
  suppressed: number;
  samples: string[];
  windowMs: number;
};

type Window = { count: number; suppressed: number; samples: string[] };

type Options = {
  windowMs: number;
  maxPerWindow: number;
  maxSamples: number;
  onSummary: (key: string, summary: LogBurstSummary) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
};

/**
 * Tope de filas por fuente y ventana, con un resumen de lo que se calló.
 *
 * Existe por el congelamiento del 2026-09-28: con la base sin RAM, la app escribió 201 filas a
 * app_error_logs en 5 s —un AbortError por cada query cortada— y cada INSERT le sumaba carga a
 * la base justo cuando no daba más. Pero esas filas fueron las que permitieron diagnosticar el
 * episodio, así que no se tiran: pasan las primeras de la ráfaga y el resto viaja en UNA fila de
 * resumen con el conteo y unas muestras.
 */
export function createLogRateLimiter({
  windowMs,
  maxPerWindow,
  maxSamples,
  onSummary,
  setTimer = setTimeout,
}: Options) {
  const windows = new Map<string, Window>();

  function close(key: string) {
    const w = windows.get(key);
    windows.delete(key);
    if (w && w.suppressed > 0) {
      onSummary(key, { suppressed: w.suppressed, samples: w.samples, windowMs });
    }
  }

  return {
    /** true = escribir esta fila; false = contada en el resumen de la ventana. */
    take(key: string, sample: string): boolean {
      let w = windows.get(key);
      if (!w) {
        w = { count: 0, suppressed: 0, samples: [] };
        windows.set(key, w);
        setTimer(() => close(key), windowMs);
      }
      if (w.count < maxPerWindow) {
        w.count += 1;
        return true;
      }
      w.suppressed += 1;
      if (w.samples.length < maxSamples) w.samples.push(sample);
      return false;
    },
  };
}
