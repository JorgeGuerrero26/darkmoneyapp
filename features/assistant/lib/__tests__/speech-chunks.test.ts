import { cleanForSpeech, nextSpeakableChunk, unspokenRest } from "../speech-chunks";

describe("cleanForSpeech", () => {
  it("quita negritas, emojis y espacios dobles", () => {
    expect(cleanForSpeech("💰 Saldo:  **S/ 1,200**")).toBe("Saldo: S/ 1,200");
  });
});

describe("nextSpeakableChunk", () => {
  it("entrega las frases completas y guarda la que sigue escribiéndose", () => {
    const text = "Gastaste S/ 300. En comida fue la mayor parte y";
    expect(nextSpeakableChunk(text, 0)).toEqual({ chunk: "Gastaste S/ 300.", next: 16 });
    expect(nextSpeakableChunk(text, 16)).toEqual({ chunk: "", next: 16 });
  });

  it("no corta un monto con decimales que aún no termina de llegar", () => {
    expect(nextSpeakableChunk("Total S/ 1,200.", 0)).toEqual({ chunk: "", next: 0 });
    expect(nextSpeakableChunk("Total S/ 1,200.50 al mes. Y", 0).chunk).toBe("Total S/ 1,200.50 al mes.");
  });

  it("cada línea de un desglose se lee aparte", () => {
    const text = "💰 Saldo: S/ 100\n➖ Taxi: S/ 20\n🟰 To";
    expect(nextSpeakableChunk(text, 0).chunk).toBe("💰 Saldo: S/ 100\n➖ Taxi: S/ 20\n");
  });
});

describe("unspokenRest", () => {
  it("devuelve lo que falta después de lo ya leído", () => {
    expect(unspokenRest("Hola. ¿En qué te ayudo?", "Hola.")).toBe(" ¿En qué te ayudo?");
  });

  it("sin nada leído devuelve la respuesta entera", () => {
    expect(unspokenRest("Hola.", "")).toBe("Hola.");
  });

  it("si la respuesta final cambió, no repite ni mezcla", () => {
    expect(unspokenRest("Otra respuesta distinta.", "Hola.")).toBe("");
  });
});
