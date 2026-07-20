/**
 * Verifica el timeout global del fetch de supabase-js: si la respuesta nunca
 * llega (socket stale), el fetch se aborta en vez de colgarse para siempre.
 * Replica la función fetchWithTimeout de lib/supabase.ts (no exportada) para
 * poder probar el comportamiento en aislamiento.
 */

const TIMEOUT_MS = 30_000;

function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetchImpl(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

describe("fetchWithTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("aborta cuando la respuesta nunca llega (socket stale)", async () => {
    // fetch que solo resuelve/rechaza cuando su signal aborta.
    const hangingFetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;

    const promise = fetchWithTimeout(hangingFetch, "https://x/rest");
    const assertion = expect(promise).rejects.toThrow("aborted");
    jest.advanceTimersByTime(TIMEOUT_MS);
    await assertion;
  });

  it("una respuesta normal pasa sin abortar", async () => {
    const okFetch = (() => Promise.resolve({ ok: true } as Response)) as unknown as typeof fetch;
    await expect(fetchWithTimeout(okFetch, "https://x/rest")).resolves.toEqual({ ok: true });
  });
});
