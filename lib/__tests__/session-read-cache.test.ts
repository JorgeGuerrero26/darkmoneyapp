import { SessionReadCache } from "../session-read-cache";

/**
 * Este caché guarda el token de sesión. Un fallo aquí no es lentitud: es mandar un refresh token
 * viejo, que el servidor rechaza, y dejar al usuario deslogueado. Los casos de invalidación
 * importan más que los de rendimiento.
 */
describe("SessionReadCache", () => {
  /** Reloj controlado para poder probar el TTL sin esperar. */
  function makeCache(ttl = 3000) {
    let now = 1_000_000;
    const cache = new SessionReadCache(ttl, () => now);
    return { cache, advance: (ms: number) => { now += ms; } };
  }

  it("colapsa lecturas repetidas en una sola ida al Keychain", async () => {
    const { cache } = makeCache();
    const read = jest.fn().mockResolvedValue("sesion-1");

    const results = [
      await cache.get("k", read),
      await cache.get("k", read),
      await cache.get("k", read),
    ];

    expect(results).toEqual(["sesion-1", "sesion-1", "sesion-1"]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("comparte una sola lectura entre llamadas simultáneas", async () => {
    const { cache } = makeCache();
    let resolve: (v: string) => void = () => {};
    const read = jest.fn(() => new Promise<string | null>((r) => { resolve = r; }));

    const a = cache.get("k", read);
    const b = cache.get("k", read);
    const c = cache.get("k", read);
    resolve("sesion-1");

    expect(await Promise.all([a, b, c])).toEqual(["sesion-1", "sesion-1", "sesion-1"]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("vuelve al Keychain cuando el TTL expira", async () => {
    const { cache, advance } = makeCache(3000);
    const read = jest.fn().mockResolvedValueOnce("vieja").mockResolvedValueOnce("nueva");

    expect(await cache.get("k", read)).toBe("vieja");
    advance(2999);
    expect(await cache.get("k", read)).toBe("vieja"); // dentro de la ventana
    advance(2);
    expect(await cache.get("k", read)).toBe("nueva"); // fuera: relee
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("una escritura hace autoritativo el valor nuevo, sin releer", async () => {
    const { cache } = makeCache();
    const read = jest.fn().mockResolvedValue("vieja");
    await cache.get("k", read);

    cache.set("k", "refrescada");

    expect(await cache.get("k", read)).toBe("refrescada");
    expect(read).toHaveBeenCalledTimes(1); // no volvió al Keychain
  });

  it("una lectura en vuelo no sobrescribe una escritura autoritativa", async () => {
    const { cache } = makeCache();
    let resolveRead: (value: string) => void = () => {};
    const read = jest.fn(() => new Promise<string | null>((resolve) => { resolveRead = resolve; }));
    const staleRead = cache.get("k", read);

    cache.set("k", "refrescada");
    resolveRead("vieja");

    expect(await staleRead).toBe("refrescada");
    expect(await cache.get("k", read)).toBe("refrescada");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("invalidar fuerza releer: es la salida de emergencia ante cualquier duda", async () => {
    const { cache } = makeCache();
    const read = jest.fn().mockResolvedValueOnce("vieja").mockResolvedValueOnce("nueva");
    await cache.get("k", read);

    cache.invalidate("k");

    expect(await cache.get("k", read)).toBe("nueva");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("tras cerrar sesión devuelve null y no resucita la sesión anterior", async () => {
    const { cache } = makeCache();
    const read = jest.fn().mockResolvedValue("sesion-1");
    await cache.get("k", read);

    cache.set("k", null); // lo que hace removeItem

    expect(await cache.get("k", read)).toBeNull();
  });

  it("una lectura en vuelo no resucita la sesión después de cerrar sesión", async () => {
    const { cache } = makeCache();
    let resolveRead: (value: string) => void = () => {};
    const read = jest.fn(() => new Promise<string | null>((resolve) => { resolveRead = resolve; }));
    const staleRead = cache.get("k", read);

    cache.set("k", null);
    resolveRead("sesion-anterior");

    expect(await staleRead).toBeNull();
    expect(await cache.get("k", read)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("invalidar permite una lectura nueva sin que la anterior la borre o publique", async () => {
    const { cache } = makeCache();
    let resolveOld: (value: string) => void = () => {};
    let resolveNew: (value: string) => void = () => {};
    const read = jest.fn()
      .mockImplementationOnce(() => new Promise<string | null>((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise<string | null>((resolve) => { resolveNew = resolve; }));
    const staleRead = cache.get("k", read);

    cache.invalidate("k");
    const currentRead = cache.get("k", read);
    resolveOld("vieja");
    expect(await staleRead).toBe("vieja");

    const joinedRead = cache.get("k", read);
    resolveNew("nueva");

    expect(await Promise.all([currentRead, joinedRead])).toEqual(["nueva", "nueva"]);
    expect(await cache.get("k", read)).toBe("nueva");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("no mezcla keys distintas", async () => {
    const { cache } = makeCache();
    const read = jest.fn(async () => "de-a");
    await cache.get("a", read);

    expect(await cache.get("b", async () => "de-b")).toBe("de-b");
    expect(await cache.get("a", read)).toBe("de-a");
  });

  it("un fallo de lectura no queda cacheado", async () => {
    const { cache } = makeCache();
    const read = jest.fn()
      .mockRejectedValueOnce(new Error("Keychain no disponible"))
      .mockResolvedValueOnce("sesion-1");

    await expect(cache.get("k", read)).rejects.toThrow("Keychain no disponible");
    // El error no debe dejar una entrada envenenada ni una promesa colgada.
    expect(await cache.get("k", read)).toBe("sesion-1");
  });
});
