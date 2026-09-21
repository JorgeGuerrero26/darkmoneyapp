/** Lo que se muestra mientras el asistente piensa. */
export const THINKING_SEARCH = "Buscando en tus movimientos…";
export const THINKING_REGISTER = "Anotando lo que me dijiste…";

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
 * Qué decir mientras el asistente responde.
 *
 * El texto era siempre "Buscando en tus movimientos…", y al dictar un gasto decía justo lo
 * contrario de lo que estaba haciendo: registrarlo. El reclamo fue literal — "no tiene mucho
 * sentido".
 *
 * La regla es conservadora: una pregunta manda sobre el verbo, así que solo se dice "anotando"
 * cuando la frase dicta algo y no pregunta nada.
 */
export function thinkingLabel(message: string): string {
  const texto = sinTildes(message);
  if (!texto) return THINKING_SEARCH;
  if (texto.includes("?")) return THINKING_SEARCH;
  if (INTERROGATIVOS.some((palabra) => texto.startsWith(sinTildes(palabra)) || texto.includes(` ${sinTildes(palabra)}`))) {
    return THINKING_SEARCH;
  }
  if (VERBOS_REGISTRO.some((verbo) => texto.includes(sinTildes(verbo)))) return THINKING_REGISTER;
  return THINKING_SEARCH;
}
