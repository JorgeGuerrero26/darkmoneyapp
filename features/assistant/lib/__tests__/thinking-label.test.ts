/**
 * El texto de espera del asistente. Decía siempre "Buscando en tus movimientos…", incluso
 * mientras registraba un gasto que el usuario acababa de dictar.
 */
import { THINKING_DEFAULT, THINKING_REGISTER, THINKING_SEARCH, thinkingLabel, toolStatusLabel } from "../thinking-label";
import { ASSISTANT_TOOLS } from "../../../../supabase/functions/assistant-chat/logic";

describe("thinkingLabel", () => {
  it("dictar un gasto dice que lo está anotando", () => {
    expect(thinkingLabel("gasté 28.5 soles en mi almuerzo")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("me dieron 5 soles de parte de Nicol")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("pagué 44 de Netflix")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("anótame 20 de taxi")).toBe(THINKING_REGISTER);
  });

  /** La trampa: la pregunta más común de la app lleva el mismo verbo que el registro. */
  it("preguntar con el MISMO verbo no es registrar", () => {
    expect(thinkingLabel("cuánto gasté en mayo")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("cuanto pague de netflix este año")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("dime cuánto gasté en comida")).toBe(THINKING_DEFAULT);
  });

  it("un signo de interrogación basta para tratarlo como pregunta", () => {
    expect(thinkingLabel("gasté mucho este mes?")).toBe(THINKING_DEFAULT);
  });

  it("las consultas esperan el aviso real con «Pensando…»", () => {
    expect(thinkingLabel("en qué se me fue la plata en agosto")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("muéstrame mis suscripciones")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("compara mayo con junio")).toBe(THINKING_DEFAULT);
  });

  it("las tildes no cambian el resultado", () => {
    expect(thinkingLabel("gaste 10 en pan")).toBe(thinkingLabel("gasté 10 en pan"));
    expect(thinkingLabel("cuanto gaste")).toBe(thinkingLabel("cuánto gasté"));
  });

  it("vacío o sin señales cae en el texto por defecto", () => {
    expect(thinkingLabel("")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("   ")).toBe(THINKING_DEFAULT);
    expect(thinkingLabel("hola")).toBe(THINKING_DEFAULT);
  });
});

describe("toolStatusLabel", () => {
  it("un saludo o el arranque dicen «Pensando…», no «Buscando»", () => {
    expect(thinkingLabel("Hola")).toBe(THINKING_DEFAULT);
    expect(toolStatusLabel(null)).toBe(THINKING_DEFAULT);
  });

  it("buscar solo se dice cuando el servidor de verdad busca", () => {
    expect(toolStatusLabel("search_movements")).toBe(THINKING_SEARCH);
    expect(toolStatusLabel("draft_movement")).toBe(THINKING_REGISTER);
    expect(toolStatusLabel("herramienta_nueva")).toBe(THINKING_DEFAULT);
  });

  it("cada herramienta del asistente tiene su propio texto", () => {
    const names = ASSISTANT_TOOLS.map((tool: { function: { name: string } }) => tool.function.name);
    const sinTexto = names.filter((name: string) => toolStatusLabel(name) === THINKING_DEFAULT);
    expect(sinTexto).toEqual([]);
  });
});
