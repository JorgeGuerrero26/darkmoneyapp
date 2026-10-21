import {
  createChatStreamAccumulator,
  createMarkerFilter,
  createSseLineReader,
  splitSuggestions,
  SUGGESTIONS_MARKER,
} from "../stream";

describe("splitSuggestions", () => {
  it("separa la respuesta de las sugerencias y las limpia", () => {
    const { reply, suggestions } = splitSuggestions(
      `Gastaste **S/ 1,200** este mes.\n${SUGGESTIONS_MARKER} ¿Y el mes pasado? | - ¿En qué categorías? | ¿En qué categorías?`,
    );
    expect(reply).toBe("Gastaste **S/ 1,200** este mes.");
    expect(suggestions).toEqual(["¿Y el mes pasado?", "¿En qué categorías?"]);
  });

  it("sin marcador devuelve el texto tal cual y ninguna sugerencia", () => {
    expect(splitSuggestions("  Hola  ")).toEqual({ reply: "Hola", suggestions: [] });
  });

  it("descarta sugerencias vacías o demasiado largas y deja máximo tres", () => {
    const long = "x".repeat(80);
    const { suggestions } = splitSuggestions(`ok ${SUGGESTIONS_MARKER} a | ${long} | uno? | dos? | tres? | cuatro?`);
    expect(suggestions).toEqual(["uno?", "dos?", "tres?"]);
  });
});

describe("createMarkerFilter", () => {
  function run(chunks: string[]) {
    const filter = createMarkerFilter();
    return chunks.map((chunk) => filter.push(chunk)).join("") + filter.flush();
  }

  it("deja pasar todo el texto si no hay marcador", () => {
    expect(run(["Hola, ", "¿en qué ", "te ayudo? [nota]"])).toBe("Hola, ¿en qué te ayudo? [nota]");
  });

  it("corta en el marcador aunque llegue partido en varios trozos", () => {
    expect(run(["Listo.\n[", "[SI", "GUE]] ¿Y ", "ayer?"])).toBe("Listo.\n");
  });

  it("retiene un posible inicio de marcador hasta saber que no lo es", () => {
    const filter = createMarkerFilter();
    expect(filter.push("Total [[")).toBe("Total ");
    expect(filter.push("x")).toBe("[[x");
  });
});

describe("createSseLineReader", () => {
  it("entrega solo los data completos aunque los trozos corten líneas", () => {
    const reader = createSseLineReader();
    expect(reader.push('data: {"a":')).toEqual([]);
    expect(reader.push('1}\r\n\r\n: ping\n\ndata: [DONE]\n')).toEqual(['{"a":1}', "[DONE]"]);
  });
});

describe("createChatStreamAccumulator", () => {
  it("junta el texto y devuelve cada trozo nuevo", () => {
    const acc = createChatStreamAccumulator();
    expect(acc.push({ choices: [{ delta: { role: "assistant", content: "Ho" } }] })).toBe("Ho");
    expect(acc.push({ choices: [{ delta: { content: "la" } }] })).toBe("la");
    expect(acc.push({ choices: [{ delta: {} , finish_reason: "stop" }] })).toBe("");
    expect(acc.message()).toEqual({ role: "assistant", content: "Hola" });
  });

  it("arma tool_calls partidos por index y conserva la firma de Gemini", () => {
    const acc = createChatStreamAccumulator();
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "search_movements", arguments: '{"te' }, extra_content: { google: { thought_signature: "sig" } } }] } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'xt":"taxi"}' } }] } }] });
    expect(acc.message()).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          type: "function",
          id: "c1",
          extra_content: { google: { thought_signature: "sig" } },
          function: { name: "search_movements", arguments: '{"text":"taxi"}' },
        },
      ],
    });
  });

  it("sin index separa las llamadas por id", () => {
    const acc = createChatStreamAccumulator();
    acc.push({ choices: [{ delta: { tool_calls: [{ id: "a", function: { name: "list_budgets", arguments: "{}" } }] } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ id: "b", function: { name: "list_subscriptions", arguments: "{}" } }] } }] });
    expect(acc.message().tool_calls?.map((call) => call.function.name)).toEqual(["list_budgets", "list_subscriptions"]);
  });
});
