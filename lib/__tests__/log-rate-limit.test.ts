import { createLogRateLimiter, type LogBurstSummary } from "../log-rate-limit";

function setup() {
  const timers: (() => void)[] = [];
  const summaries: [string, LogBurstSummary][] = [];
  const limiter = createLogRateLimiter({
    windowMs: 30_000,
    maxPerWindow: 3,
    maxSamples: 2,
    onSummary: (key, summary) => summaries.push([key, summary]),
    setTimer: (fn) => timers.push(fn),
  });
  const fireWindow = () => timers.shift()?.();
  return { limiter, summaries, fireWindow };
}

describe("createLogRateLimiter", () => {
  it("deja pasar las primeras de una ráfaga y resume el resto en una sola fila", () => {
    const { limiter, summaries, fireWindow } = setup();
    const results = Array.from({ length: 201 }, (_, i) => limiter.take("warn:query", `q${i}`));

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(summaries).toHaveLength(0);

    fireWindow();
    expect(summaries).toEqual([
      ["warn:query", { suppressed: 198, samples: ["q3", "q4"], windowMs: 30_000 }],
    ]);
  });

  it("cada fuente tiene su propio tope", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i += 1) limiter.take("warn:query", "q");
    expect(limiter.take("warn:query", "q")).toBe(false);
    expect(limiter.take("error:mutation", "m")).toBe(true);
  });

  it("sin nada omitido no escribe resumen, y la ventana siguiente arranca de cero", () => {
    const { limiter, summaries, fireWindow } = setup();
    limiter.take("info:startup", "s");
    fireWindow();
    expect(summaries).toHaveLength(0);
    for (let i = 0; i < 3; i += 1) expect(limiter.take("info:startup", "s")).toBe(true);
  });
});
