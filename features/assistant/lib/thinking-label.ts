/** Lo que se muestra mientras el asistente piensa. */
export const THINKING_DEFAULT = "Pensando…";
export const THINKING_SEARCH = "Buscando en tus movimientos…";
export const THINKING_REGISTER = "Anotando lo que me dijiste…";

/**
 * Qué dice mientras el servidor usa cada herramienta. Llega en vivo (evento `status`), así que
 * ya no es una adivinanza: "Buscando en tus movimientos" sale solo cuando de verdad busca.
 * Una herramienta nueva sin texto aquí muestra "Pensando…" (y una prueba avisa que falta).
 */
const TOOL_LABELS: Record<string, string> = {
  search_movements: THINKING_SEARCH,
  summarize_movements: "Sumando tus movimientos…",
  compare_periods: "Comparando los periodos…",
  analyze_trade: "Revisando compras y ventas…",
  list_obligations: "Revisando tus deudas y préstamos…",
  list_subscriptions: "Revisando tus suscripciones…",
  list_recurring_income: "Revisando tus ingresos fijos…",
  list_budgets: "Revisando tus presupuestos…",
  project_cashflow: "Calculando tu proyección…",
  projection_gaps: "Revisando qué te falta registrar…",
  draft_movement: THINKING_REGISTER,
  draft_budget: "Preparando el presupuesto…",
  draft_obligation: "Preparando la deuda…",
  draft_recurring: "Preparando el pago recurrente…",
  remember_fact: "Guardando lo que me pediste recordar…",
  forget_fact: "Olvidando ese dato…",
};

export function toolStatusLabel(tool: string | null | undefined): string {
  return (tool && TOOL_LABELS[tool]) || THINKING_DEFAULT;
}

const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Verbos con los que alguien DICTA algo que ya pasó, o pide anotarlo.
 * Sin tildes porque el texto se normaliza antes de comparar.
 */
const VERBOS_REGISTRO = [
  "gaste", "pague", "compre", "cobre", "deposite", "transferi", "recibi", "invertí", "inverti",
  "me dieron", "me llego", "me pagaron", "me deposit", "me transfir", "me presto", "me prestaron",
  "anota", "anotame", "registra", "registrame", "apunta", "apuntame", "agrega", "agregame",
  "añade", "anade", "anademe", "añademe",
];

/**
 * Palabras con las que alguien PREGUNTA por sus datos.
 *
 * Van primero que los verbos a propósito: "cuánto gasté en mayo" contiene "gaste" y NO es un
 * registro. Sin esta comprobación, la pregunta más común de la app se etiquetaría al revés.
 */
const INTERROGATIVOS = [
  "cuanto", "cuanta", "cuando", "que ", "qué ", "cual", "cuales", "donde", "como ",
  "quien", "por que", "porque", "dime", "muestra", "muestrame", "busca", "buscame",
  "lista", "listame", "resume", "resumeme", "compara",
];

/**
 * Qué decir en el primer instante, antes de que el servidor cuente qué hace.
 *
 * El texto era siempre "Buscando en tus movimientos…": al dictar un gasto decía lo contrario de
 * lo que hacía, y hasta un "Hola" salía como búsqueda. Ahora solo se adelanta "anotando" cuando
 * la frase dicta algo y no pregunta nada; lo demás es "Pensando…" hasta que llega el aviso real.
 */
export function thinkingLabel(message: string): string {
  const texto = sinTildes(message);
  if (!texto) return THINKING_DEFAULT;
  if (texto.includes("?")) return THINKING_DEFAULT;
  if (INTERROGATIVOS.some((palabra) => texto.startsWith(sinTildes(palabra)) || texto.includes(` ${sinTildes(palabra)}`))) {
    return THINKING_DEFAULT;
  }
  if (VERBOS_REGISTRO.some((verbo) => texto.includes(sinTildes(verbo)))) return THINKING_REGISTER;
  return THINKING_DEFAULT;
}
