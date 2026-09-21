/**
 * El texto de espera del asistente. Decía siempre "Buscando en tus movimientos…", incluso
 * mientras registraba un gasto que el usuario acababa de dictar.
 */
import { THINKING_REGISTER, THINKING_SEARCH, thinkingLabel } from "../thinking-label";

describe("thinkingLabel", () => {
  it("dictar un gasto dice que lo está anotando", () => {
    expect(thinkingLabel("gasté 28.5 soles en mi almuerzo")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("me dieron 5 soles de parte de Nicol")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("pagué 44 de Netflix")).toBe(THINKING_REGISTER);
    expect(thinkingLabel("anótame 20 de taxi")).toBe(THINKING_REGISTER);
  });

  /** La trampa: la pregunta más común de la app lleva el mismo verbo que el registro. */
  it("preguntar con el MISMO verbo no es registrar", () => {
    expect(thinkingLabel("cuánto gasté en mayo")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("cuanto pague de netflix este año")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("dime cuánto gasté en comida")).toBe(THINKING_SEARCH);
  });

  it("un signo de interrogación basta para tratarlo como pregunta", () => {
    expect(thinkingLabel("gasté mucho este mes?")).toBe(THINKING_SEARCH);
  });

  it("las consultas normales siguen diciendo que busca", () => {
    expect(thinkingLabel("en qué se me fue la plata en agosto")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("muéstrame mis suscripciones")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("compara mayo con junio")).toBe(THINKING_SEARCH);
  });

  it("las tildes no cambian el resultado", () => {
    expect(thinkingLabel("gaste 10 en pan")).toBe(thinkingLabel("gasté 10 en pan"));
    expect(thinkingLabel("cuanto gaste")).toBe(thinkingLabel("cuánto gasté"));
  });

  it("vacío o sin señales cae en el texto por defecto", () => {
    expect(thinkingLabel("")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("   ")).toBe(THINKING_SEARCH);
    expect(thinkingLabel("hola")).toBe(THINKING_SEARCH);
  });
});
