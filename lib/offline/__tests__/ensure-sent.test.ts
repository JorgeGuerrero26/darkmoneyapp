import { waitUntilSent, type SendStateSource } from "../ensure-sent";

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
