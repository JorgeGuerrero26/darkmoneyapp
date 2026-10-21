import { createSseDataReader, parseStreamEvent } from "../live-reply";

describe("createSseDataReader", () => {
  it("junta los trozos y salta los comentarios de latido", () => {
    const reader = createSseDataReader();
    expect(reader.push('data: {"type":"sta')).toEqual([]);
    expect(reader.push('tus","tool":null}\n\n: ping\n\ndata: {"type":"reset"}\n\n')).toEqual([
      '{"type":"status","tool":null}',
      '{"type":"reset"}',
    ]);
  });
});

describe("parseStreamEvent", () => {
  it("lee cada tipo de evento", () => {
    expect(parseStreamEvent('{"type":"status","tool":"list_budgets"}')).toEqual({ type: "status", tool: "list_budgets" });
    expect(parseStreamEvent('{"type":"status","tool":null}')).toEqual({ type: "status", tool: null });
    expect(parseStreamEvent('{"type":"delta","text":"Hola"}')).toEqual({ type: "delta", text: "Hola" });
    expect(parseStreamEvent('{"type":"reset"}')).toEqual({ type: "reset" });
    expect(parseStreamEvent('{"type":"error","error":"Gemini respondió 503"}')).toEqual({
      type: "error",
      error: "Gemini respondió 503",
    });
  });

  it("done trae la respuesta completa sin el campo type", () => {
    expect(parseStreamEvent('{"type":"done","ok":true,"reply":"Listo","suggestions":["¿Y ayer?"]}')).toEqual({
      type: "done",
      payload: { ok: true, reply: "Listo", suggestions: ["¿Y ayer?"] },
    });
  });

  it("ignora lo que no entiende", () => {
    expect(parseStreamEvent("no es json")).toBeNull();
    expect(parseStreamEvent('{"type":"otro"}')).toBeNull();
    expect(parseStreamEvent('{"type":"delta","text":""}')).toBeNull();
  });
});
