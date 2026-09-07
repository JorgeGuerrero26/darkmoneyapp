import { retryOnceIfSessionStale } from "../session-retry";

const rlsError = () => new Error('42501 | new row violates row-level security policy for table "movements"');

describe("retryOnceIfSessionStale", () => {
  it("un guardado que sale bien no renueva nada ni se repite", async () => {
    const run = jest.fn().mockResolvedValue({ id: 7 });
    const recover = jest.fn();
    await expect(retryOnceIfSessionStale(run, recover)).resolves.toEqual({ id: 7 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(recover).not.toHaveBeenCalled();
  });

  it("el rechazo por sesion se repite UNA vez, y con el token ya renovado", async () => {
    const orden: string[] = [];
    const run = jest
      .fn()
      .mockImplementationOnce(async () => { orden.push("intento-1"); throw rlsError(); })
      .mockImplementationOnce(async () => { orden.push("intento-2"); return { id: 7 }; });
    const recover = jest.fn().mockImplementation(async () => { orden.push("renovar"); });

    await expect(retryOnceIfSessionStale(run, recover)).resolves.toEqual({ id: 7 });
    // El orden es lo que arregla el fallo: repetir sin renovar sale con el mismo token caducado.
    expect(orden).toEqual(["intento-1", "renovar", "intento-2"]);
  });

  it("si sigue rechazando tras renovar, se rinde: ya no es la ventana de arranque", async () => {
    const run = jest.fn().mockRejectedValue(rlsError());
    const recover = jest.fn().mockResolvedValue(undefined);
    await expect(retryOnceIfSessionStale(run, recover)).rejects.toThrow("42501");
    expect(run).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("un error que no es de sesion no se repite: repetirlo seria adivinar", async () => {
    const run = jest.fn().mockRejectedValue(new Error("23514 | check constraint violation"));
    const recover = jest.fn();
    await expect(retryOnceIfSessionStale(run, recover)).rejects.toThrow("23514");
    expect(run).toHaveBeenCalledTimes(1);
    expect(recover).not.toHaveBeenCalled();
  });

  it("si la renovacion falla, el usuario ve el error de guardar y no el de renovar", async () => {
    const run = jest.fn().mockRejectedValue(rlsError());
    const recover = jest.fn().mockRejectedValue(new Error("refresh_token_not_found"));
    await expect(retryOnceIfSessionStale(run, recover)).rejects.toThrow("42501");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("un reintento logrado se anota: si no, el arreglo se tapa a si mismo", async () => {
    const run = jest
      .fn()
      .mockImplementationOnce(async () => { throw rlsError(); })
      .mockResolvedValue("ok");
    const anotado: string[] = [];
    await retryOnceIfSessionStale(run, jest.fn(), (m) => anotado.push(m));
    expect(anotado).toHaveLength(1);
    expect(anotado[0]).toContain("42501");
  });

  it("no se anota nada cuando no hizo falta reintentar", async () => {
    const onRetried = jest.fn();
    await retryOnceIfSessionStale(async () => "ok", jest.fn(), onRetried);
    expect(onRetried).not.toHaveBeenCalled();
  });

  it("cubre las otras caras del mismo fallo: JWT caducado y 401", async () => {
    for (const message of ["JWT expired", "401 Unauthorized"]) {
      const run = jest
        .fn()
        .mockImplementationOnce(async () => { throw new Error(message); })
        .mockResolvedValue("ok");
      await expect(retryOnceIfSessionStale(run, jest.fn())).resolves.toBe("ok");
      expect(run).toHaveBeenCalledTimes(2);
    }
  });
});
