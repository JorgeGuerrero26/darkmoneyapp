/**
 * Parseo de correos de constancia bancarios. Puro y sin imports de Deno para poder testearlo
 * con jest desde el repo RN (mismo patrón que assistant-chat/logic.ts).
 *
 * Los patrones se PORTAN de AmountParsing.kt y del clasificador de
 * DarkMoneyNotificationListenerService.kt, ya probados en producción en Android.
 */

export type MovementType = "income" | "expense" | "transfer";
export type Confidence = "high" | "medium";
export type Classification = { movementType: MovementType; confidence: Confidence };

export type ParsedAmount = { amount: number; currencyCode: string };

// Acepta separador de miles con punto, coma o espacio (incl. NBSP): sin eso el match se
// truncaba en el primer grupo ("S/ 1"). El [\s ] tras el símbolo también cubre la tabulación
// con la que Yape maqueta el monto en su propia celda ("S/\t180.00").
const AMOUNT_RE =
  /(S\/|S\.|PEN|US\$|USD|\$)[\s ]*([0-9]{1,3}(?:[.,\s ][0-9]{3})*|[0-9]+)(?:([.,])([0-9]{1,2}))?/i;

export function extractAmount(text: string): ParsedAmount | null {
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;
  const [, rawSymbol, rawInt, , rawDecimals] = match;
  const intDigits = rawInt.replace(/[.,\s ]/g, "");
  const amount = Number(`${intDigits}.${rawDecimals ?? "0"}`);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = rawSymbol.toUpperCase();
  const currencyCode = symbol === "USD" || symbol === "US$" || symbol === "$" ? "USD" : "PEN";
  return { amount, currencyCode };
}

/** Sin tildes y en minúsculas, para que los verbos matcheen venga como venga el correo. */
function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Listas portadas de DarkMoneyNotificationListenerService.kt (producción).
const HIGH_EXPENSE = [
  "pagaste", "enviaste", "yapaste", "yapear exitosamente", "yapeo exitoso", "yapeo aprobado",
  "monto de yapeo", "pago exitoso", "realizaste un consumo", "realizaste una compra",
  "compra realizada", "operacion realizada consumo", "consumo con tu tarjeta",
];
const HIGH_INCOME = [
  "recibiste", "te enviaron", "te envio", "transferencia recibida", "abono recibido",
];
const MEDIUM_INCOME = ["abono", "deposito", "envio un pago", "pago por", "te depositaron"];

/**
 * Transferencia entre cuentas PROPIAS. Se evalúa ANTES que gasto: contarla como gasto bajaría
 * el patrimonio del usuario por mover su propio dinero de un bolsillo a otro.
 *
 * Verificado con un correo real: "Realizaste una transferencia de S/ 110.00 desde tu Clasica"
 * + campo "Operación realizada: Transferencia entre mis cuentas". Ninguna de las dos frases
 * estaba en las listas portadas, así que estas transferencias se descartaban en silencio.
 */
const TRANSFER = ["transferencia entre mis cuentas", "realizaste una transferencia"];

export function classifyMovement(text: string): Classification | null {
  const normalized = normalizeText(text);
  if (TRANSFER.some((verb) => normalized.includes(verb))) {
    return { movementType: "transfer", confidence: "high" };
  }
  if (HIGH_EXPENSE.some((verb) => normalized.includes(verb))) {
    return { movementType: "expense", confidence: "high" };
  }
  if (HIGH_INCOME.some((verb) => normalized.includes(verb))) {
    return { movementType: "income", confidence: "high" };
  }
  if (MEDIUM_INCOME.some((verb) => normalized.includes(verb))) {
    return { movementType: "income", confidence: "medium" };
  }
  return null;
}

export type ReceiptEmail = { from: string; subject: string; text: string };

export type ParsedReceipt = {
  movementType: MovementType;
  amount: number;
  currencyCode: string;
  description: string;
  financialAppKey: string;
  appLabel: string;
  confidence: Confidence;
};

/**
 * Remitentes aceptados. Cualquier otro se ignora aunque traiga monto y verbo: es la defensa
 * contra sugerencias inyectadas por quien conozca el alias.
 *
 * Los dos dominios están verificados contra correos reales y NINGUNO era el que parecía
 * obvio: BCP usa `notificacionesbcp.com.pe` (no `bcp.com.pe`) y Yape usa `yape.pe`
 * (no `yape.com.pe`). Con los dominios supuestos se descartaba el 100% de los correos.
 * Antes de agregar otro banco, confirmar su remitente con un correo real.
 */
const KNOWN_SENDERS: { match: RegExp; financialAppKey: string; appLabel: string }[] = [
  { match: /@(notificaciones)?yape\.pe$/i, financialAppKey: "yape_email", appLabel: "Yape" },
  { match: /@notificacionesbcp\.com\.pe$/i, financialAppKey: "bcp_email", appLabel: "BCP" },
];

/**
 * Los avisos legales del pie ("En nuestras comunicaciones…", "participa en sorteos o
 * promociones") están llenos de "en …" que el extractor de prosa confunde con un comercio.
 *
 * Recortar a 400 caracteres NO basta, y hay evidencia: en el correo real de Yape el aviso
 * empieza en el carácter 418. Dieciocho de margen. Una frase más en la plantilla del banco y
 * la descripción del movimiento pasaría a ser "nuestras comunicaciones nunca incluiremos
 * links". Por eso se corta en el marcador y la ventana queda solo como segundo cinturón.
 */
const DISCLAIMER =
  /\b(en nuestras comunicaciones|juntos somos m[áa]s seguros|por tu seguridad, te notificaremos|si no deseas recibir|para cualquier consulta|sorteos o promociones)/i;
const DESCRIPTION_WINDOW = 400;

/**
 * Campos tabulados, en orden de preferencia. Son mucho más fiables que la prosa y cada banco
 * usa el suyo: BCP pone el comercio en "Empresa", Yape pone la persona en "Nombre del
 * Beneficiario". Agregar un banco nuevo suele ser agregar una línea acá.
 */
const STRUCTURED_DESCRIPTION = [
  /^\s*Empresa\s*[\t:]\s*(.+)$/im,
  /^\s*Nombre del Beneficiario\s*[\t:]\s*(.+)$/im,
];

function cleanDescription(raw: string): string {
  return raw
    .trim()
    .replace(/\s{2,}/g, " ")
    .replace(/[.,;]+$/, "") // "CINEPLANET." -> "CINEPLANET"
    .slice(0, 80);
}

/**
 * En una transferencia NO se busca comercio: no hay ninguno, y el extractor termina agarrando
 * palabras sueltas del cuerpo. Misma regla que ya aplica el detector de Android.
 */
function buildDescription(
  text: string,
  subject: string,
  movementType: MovementType,
  appLabel: string,
): string {
  if (movementType === "transfer") return `Transferencia ${appLabel}`;

  for (const pattern of STRUCTURED_DESCRIPTION) {
    const hit = pattern.exec(text)?.[1]?.trim();
    if (hit) return cleanDescription(hit);
  }

  const cut = text.search(DISCLAIMER);
  const body = (cut >= 0 ? text.slice(0, cut) : text).slice(0, DESCRIPTION_WINDOW);
  const prose = /\ben\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .*&-]{3,40})/.exec(body);
  return cleanDescription(prose?.[1] ?? subject);
}

/**
 * Los dos bancos numeran cada operación, pero la escriben distinto: BCP pone "Número de
 * operación" y Yape abrevia "Nº de operación".
 */
export function extractOperationNumber(text: string): string | null {
  const match = /N(?:[úu]mero|[ºo°]|ro\.?)\s*de operaci[óo]n\s*[\t:]\s*([0-9]{4,})/i.exec(text);
  return match?.[1] ?? null;
}

export function parseReceiptEmail(email: ReceiptEmail): ParsedReceipt | null {
  const sender = KNOWN_SENDERS.find((entry) => entry.match.test(email.from.trim()));
  if (!sender) return null;

  const haystack = `${email.subject}\n${email.text}`;
  const classification = classifyMovement(haystack);
  if (!classification) return null;

  const parsedAmount = extractAmount(haystack);
  if (!parsedAmount) return null;

  return {
    movementType: classification.movementType,
    amount: parsedAmount.amount,
    currencyCode: parsedAmount.currencyCode,
    description: buildDescription(
      email.text,
      email.subject,
      classification.movementType,
      sender.appLabel,
    ),
    financialAppKey: sender.financialAppKey,
    appLabel: sender.appLabel,
    confidence: classification.confidence,
  };
}
