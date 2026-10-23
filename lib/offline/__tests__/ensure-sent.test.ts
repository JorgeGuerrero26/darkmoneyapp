import { waitUntilSent, whenSent, type SendStateSource, type WatchableSendState } from "../ensure-sent";

function fake(opts: { online: boolean; pending: number[]; clearsOnSync?: boolean }) {
  const state = { pending: [...opts.pending], syncs: 0 };
  const runtime: SendStateSource = {
    getState: () => ({ online: opts.online }),
    pendingRowIds: async () => [...state.pending],
    requestSync: async () => {
      state.syncs += 1;
      if (opts.clearsOnSync) state.pending = [];
    },
  };
  return { runtime, state };
}

describe("¿ya llegó la fila al servidor?", () => {
  it("si no está pendiente (o el modo está apagado) ya se envió y no hace nada más", async () => {
    const { runtime, state } = fake({ online: true, pending: [] });
    expect(await waitUntilSent(runtime, 1, "obligations", 7)).toBe(true);
    expect(state.syncs).toBe(0);
  });

  it("pendiente y sin internet: no está en el servidor y no espera", async () => {
    const { runtime, state } = fake({ online: false, pending: [7] });
    const started = Date.now();
    expect(await waitUntilSent(runtime, 1, "obligations", 7, 5000)).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    expect(state.syncs).toBe(0);
  });

  it("pendiente con internet: pide enviar y, al salir, confirma", async () => {
    const { runtime, state } = fake({ online: true, pending: [7], clearsOnSync: true });
    expect(await waitUntilSent(runtime, 1, "obligations", 7)).toBe(true);
    expect(state.syncs).toBe(1);
  });

  it("pendiente con internet pero no sale a tiempo: false tras el tope", async () => {
    const { runtime } = fake({ online: true, pending: [7], clearsOnSync: false });
    expect(await waitUntilSent(runtime, 1, "obligations", 7, 60)).toBe(false);
  });

  it("solo importa esa fila: otras pendientes no la retienen", async () => {
    const { runtime } = fake({ online: false, pending: [3, 4] });
    expect(await waitUntilSent(runtime, 1, "obligations", 7)).toBe(true);
  });
});

function watchable(pending: number[]) {
  const listeners = new Set<() => void>();
  const state = { pending: [...pending], failReads: false };
  const runtime: WatchableSendState = {
    pendingRowIds: async () => {
      if (state.failReads) throw new Error("sin base");
      return [...state.pending];
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const change = (next: number[]) => {
    state.pending = next;
    listeners.forEach((listener) => listener());
  };
  return { runtime, state, change, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("esperar en segundo plano a que la fila salga (aprendizaje de un movimiento guardado sin internet)", () => {
  it("si ya salió (o el modo está apagado) responde enseguida", async () => {
    const { runtime, listeners } = watchable([]);
    expect(await whenSent(runtime, 1, "movements", 13)).toBe(true);
    expect(listeners.size).toBe(0); // no deja nada escuchando
  });

  it("sin internet no se rinde: espera a que vuelva la red y el movimiento se envíe", async () => {
    const { runtime, change, listeners } = watchable([13]);
    let result: boolean | null = null;
    void whenSent(runtime, 1, "movements", 13).then((sent) => { result = sent; });
    await settle();
    change([13, 14]); // pasan cosas, pero el 13 sigue sin salir
    await settle();
    expect(result).toBeNull();
    change([14]); // salió el 13
    await settle();
    expect(result).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("un fallo al leer la copia local no cuenta como enviado", async () => {
    const { runtime, state, change } = watchable([13]);
    let result: boolean | null = null;
    void whenSent(runtime, 1, "movements", 13).then((sent) => { result = sent; });
    await settle();
    state.failReads = true;
    change([]);
    await settle();
    expect(result).toBeNull();
    state.failReads = false;
    change([]);
    await settle();
    expect(result).toBe(true);
  });

  it("tras el tope se rinde con false (nunca escribe a destiempo) y deja de escuchar", async () => {
    jest.useFakeTimers();
    try {
      const { runtime, listeners } = watchable([13]);
      const promise = whenSent(runtime, 1, "movements", 13, 1000);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      expect(await promise).toBe(false);
      expect(listeners.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
