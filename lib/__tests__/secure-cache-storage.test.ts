import { createSecureStorage, decryptText, encryptText, isEncryptedValue, type CacheKeyState } from "../secure-cache-storage";

const KEY = new Uint8Array(32).map((_, i) => i + 1);
const OTHER_KEY = new Uint8Array(32).map((_, i) => 200 - i);
const nonceOf = (n: number) => new Uint8Array(12).fill(n);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => { data.set(k, v); },
    removeItem: async (k: string) => { data.delete(k); },
  };
}
let counter = 0;
const randomBytes = (count: number) => new Uint8Array(count).fill((counter += 1) % 250);

describe("cifrado de la caché", () => {
  it("ida y vuelta con tildes, eñes y emojis", () => {
    const text = JSON.stringify({ nota: "Cobro de Sueldo AGV · S/ 3,958.38 ñandú 💸", n: [1, 2, 3] });
    const sealed = encryptText(text, KEY, nonceOf(7));
    expect(sealed.startsWith("enc1:")).toBe(true);
    expect(sealed).not.toContain("Sueldo");
    expect(decryptText(sealed, KEY)).toBe(text);
  });

  it("con otra llave o con el dato alterado no devuelve nada (y no lanza)", () => {
    const sealed = encryptText("secreto", KEY, nonceOf(1));
    expect(decryptText(sealed, OTHER_KEY)).toBeNull();
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptText(tampered, KEY)).toBeNull();
    expect(decryptText("enc1:no-es-base64!!", KEY)).toBeNull();
    expect(decryptText("texto en claro", KEY)).toBeNull();
  });

  it("un valor grande (300 KB) se cifra y descifra rápido", () => {
    const big = JSON.stringify({ filas: Array.from({ length: 3000 }, (_, i) => ({ id: i, descripcion: `Movimiento número ${i} de prueba`, monto: i * 1.5 })) });
    expect(big.length).toBeGreaterThan(150_000);
    const t0 = Date.now();
    const out = decryptText(encryptText(big, KEY, nonceOf(3)), KEY);
    expect(out).toBe(big);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("almacenamiento cifrado", () => {
  const withKey = async (): Promise<CacheKeyState> => ({ kind: "key", key: KEY });

  it("con llave guarda cifrado, y lo guardado en claro antes se sigue leyendo (migración transparente)", async () => {
    const inner = memoryStorage();
    inner.data.set("viejo", '{"data":"en claro"}');
    const storage = createSecureStorage(inner, withKey, randomBytes);
    expect(await storage.getItem("viejo")).toBe('{"data":"en claro"}');
    await storage.setItem("cache", '{"movimientos":[1,2,3]}');
    expect(isEncryptedValue(inner.data.get("cache") ?? null)).toBe(true);
    expect(inner.data.get("cache")).not.toContain("movimientos");
    expect(await storage.getItem("cache")).toBe('{"movimientos":[1,2,3]}');
  });

  it("cada escritura usa un nonce nuevo (el mismo texto no da el mismo resultado)", async () => {
    const inner = memoryStorage();
    const storage = createSecureStorage(inner, withKey, randomBytes);
    await storage.setItem("a", "igual");
    const first = inner.data.get("a");
    await storage.setItem("a", "igual");
    expect(inner.data.get("a")).not.toBe(first);
  });

  it("un binario que no puede cifrar deja la caché como siempre", async () => {
    const inner = memoryStorage();
    const storage = createSecureStorage(inner, async () => ({ kind: "none" }), () => null);
    await storage.setItem("cache", "en claro");
    expect(inner.data.get("cache")).toBe("en claro");
    expect(await storage.getItem("cache")).toBe("en claro");
  });

  it("con el llavero bloqueado NO guarda nada en claro y no lee lo cifrado", async () => {
    const inner = memoryStorage();
    const sealed = encryptText("dato", KEY, nonceOf(9));
    inner.data.set("cache", sealed);
    const storage = createSecureStorage(inner, async () => ({ kind: "unavailable" }), randomBytes);
    await storage.setItem("nuevo", "financiero");
    expect(inner.data.has("nuevo")).toBe(false);
    expect(inner.data.get("cache")).toBe(sealed); // lo que ya estaba no se toca
    expect(await storage.getItem("cache")).toBeNull();
  });

  it("si falla pedir la llave, se trata como bloqueado (no lanza)", async () => {
    const inner = memoryStorage();
    const storage = createSecureStorage(inner, async () => { throw new Error("llavero"); }, randomBytes);
    await expect(storage.setItem("x", "y")).resolves.toBeUndefined();
    expect(inner.data.size).toBe(0);
  });

  it("sin aleatoriedad del sistema no improvisa un nonce", async () => {
    const inner = memoryStorage();
    const storage = createSecureStorage(inner, withKey, () => null);
    await storage.setItem("x", "y");
    expect(inner.data.size).toBe(0);
  });

  it("quitar una clave funciona igual", async () => {
    const inner = memoryStorage();
    const storage = createSecureStorage(inner, withKey, randomBytes);
    await storage.setItem("x", "y");
    await storage.removeItem("x");
    expect(inner.data.size).toBe(0);
  });
});
