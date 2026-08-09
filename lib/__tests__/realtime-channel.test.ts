/**
 * Regresión del incidente 2026-07-17: el removeChannel del retry emite CLOSED
 * sobre el canal viejo; tratarlo como fallo nuevo mataba al canal sano recién
 * suscrito en un loop infinito de 5s (~2000 warnings/hora en app_error_logs).
 */

type StatusCallback = (status: string, err?: Error) => void;

const mockChannels: Array<{ cb: StatusCallback | null }> = [];

jest.mock("../error-logger", () => ({ logWarn: jest.fn() }));
jest.mock("../supabase", () => ({
  supabase: {
    channel: () => {
      const entry: { cb: StatusCallback | null } = { cb: null };
      mockChannels.push(entry);
      const ch = {
        entry,
        on: () => ch,
        subscribe: (cb: StatusCallback) => {
          entry.cb = cb;
          return ch;
        },
      };
      return ch;
    },
    // realtime-js emite CLOSED al callback del canal que se desuscribe
    removeChannel: (ch: { entry: { cb: StatusCallback | null } }) => {
      ch.entry.cb?.("CLOSED");
      return Promise.resolve("ok");
    },
  },
}));

import { subscribeRealtimeChannel } from "../realtime-channel";
import { logWarn } from "../error-logger";

const logWarnMock = logWarn as jest.Mock;

function subscribe() {
  return subscribeRealtimeChannel({
    source: "test",
    channelName: "test:ws-1",
    bindings: [{ table: "movements", onChange: () => {} }],
  });
}

describe("subscribeRealtimeChannel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockChannels.length = 0;
    logWarnMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("un fallo puntual re-suscribe una vez y el CLOSED del canal retirado no reinicia el loop", () => {
    const dispose = subscribe();
    expect(mockChannels).toHaveLength(1);

    mockChannels[0].cb?.("CHANNEL_ERROR", new Error("boom"));
    jest.advanceTimersByTime(5_000);
    // El retry removió el canal viejo (que emitió CLOSED) y abrió uno nuevo.
    expect(mockChannels).toHaveLength(2);

    mockChannels[1].cb?.("SUBSCRIBED");
    // Sano y sin fallos nuevos: ningún reintento más aunque pase el tiempo.
    jest.advanceTimersByTime(600_000);
    expect(mockChannels).toHaveLength(2);

    dispose();
  });

  it("un fallo real del canal vigente sí vuelve a re-suscribir", () => {
    const dispose = subscribe();
    mockChannels[0].cb?.("CHANNEL_ERROR");
    jest.advanceTimersByTime(5_000);
    mockChannels[1].cb?.("SUBSCRIBED");
    mockChannels[1].cb?.("CLOSED");
    jest.advanceTimersByTime(5_000);
    expect(mockChannels).toHaveLength(3);
    dispose();
  });

  /**
   * El socket es COMPARTIDO por todos los canales: cuando el teléfono se duerme o cambia de red
   * se cae entero y los cuatro canales reportan fallo en el mismo segundo. Medido del 06 al 09 de
   * agosto de 2026: la mayoría de los 62 eventos eran ese blip con attempt=0, y se rehacían solos.
   * Avisar de cada uno convertía el log en ruido y escondía los 3 fallos que sí importaban.
   */
  it("el primer fallo sin motivo NO se registra: es el blip de un socket que se rehace solo", () => {
    const dispose = subscribe();

    mockChannels[0].cb?.("CHANNEL_ERROR");
    expect(logWarnMock).not.toHaveBeenCalled();

    dispose();
  });

  it("si el reintento tampoco lo arregla, entonces sí se registra", () => {
    const dispose = subscribe();

    mockChannels[0].cb?.("CHANNEL_ERROR");
    jest.advanceTimersByTime(5_000);
    // Segundo canal: el reintento ya salió y vuelve a fallar.
    mockChannels[1].cb?.("CHANNEL_ERROR");

    expect(logWarnMock).toHaveBeenCalledTimes(1);
    expect(logWarnMock.mock.calls[0][2]).toMatchObject({ attempt: 1 });

    dispose();
  });

  it("un motivo concreto del servidor se registra siempre, aunque sea el primer intento", () => {
    const dispose = subscribe();

    // Estos son los que valen: "mismatch between server and client bindings", "InvalidJWTToken".
    mockChannels[0].cb?.("CHANNEL_ERROR", new Error("mismatch between server and client bindings"));

    expect(logWarnMock).toHaveBeenCalledTimes(1);
    expect(logWarnMock.mock.calls[0][2]).toMatchObject({
      attempt: 0,
      error: "mismatch between server and client bindings",
    });

    dispose();
  });

  it("el dispose no dispara re-suscripciones", () => {
    const dispose = subscribe();
    dispose();
    // El removeChannel del cleanup emite CLOSED sobre el canal desechado.
    jest.advanceTimersByTime(600_000);
    expect(mockChannels).toHaveLength(1);
  });
});
