/**
 * humanizeError es lo que ve el usuario cuando algo falla. Lo que se protege aquí: que nunca
 * llegue texto de programador a un aviso.
 */
import { humanizeError } from "../errors";

describe("humanizeError", () => {
  /** El caso real: al desarchivar una cuenta el aviso decía exactamente esto. */
  it("un fallo interno de JavaScript no se muestra tal cual", () => {
    for (const tecnico of [
      "Cannot read property 'map' of undefined",
      "undefined is not an object (evaluating 'a.b')",
      "null is not an object",
      "x.filter is not a function",
      "Maximum call stack size exceeded",
      "[object Object]",
    ]) {
      const humano = humanizeError(new TypeError(tecnico));
      expect(humano).toBe("Algo salió mal. Inténtalo de nuevo");
    }
  });

  it("los mensajes propios en español siguen pasando", () => {
    const propio = "No puedes eliminar esta obligación porque tiene eventos.";
    expect(humanizeError(new Error(propio))).toBe(propio);
  });

  it("el JWT rechazado ya no nombra la Edge Function ni verify_jwt", () => {
    const humano = humanizeError(new Error("Invalid JWT"));
    expect(humano).not.toMatch(/edge function|verify_jwt|jwt/i);
  });

  it("sin mensaje no dice 'Error desconocido'", () => {
    expect(humanizeError(undefined)).toBe("Algo salió mal. Inténtalo de nuevo");
  });

  it("los casos traducidos de antes siguen igual", () => {
    expect(humanizeError(new Error("TypeError: Network request failed"))).toBe(
      "Sin conexión. Revisa tu internet e intenta de nuevo",
    );
    expect(humanizeError({ code: "23505", message: "duplicate key value" })).toBe(
      "Ya existe un registro con esos datos",
    );
  });
});
