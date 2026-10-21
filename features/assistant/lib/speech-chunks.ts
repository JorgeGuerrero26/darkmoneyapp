/**
 * Modo hablante con la respuesta en vivo: se lee frase por frase a medida que llega, en vez de
 * esperar el texto completo. El teléfono encola cada frase (Android QUEUE_ADD, iOS
 * AVSpeechSynthesizer), así que basta con mandarlas en orden.
 */

/** Texto apto para la voz: sin negritas, emojis ni flechas, y sin espacios dobles. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Lo que ya se puede leer desde `from`: hasta el último fin de frase seguido de espacio o salto.
 * Exige el espacio después del punto para no cortar "S/ 1,200.50" cuando llegó solo "S/ 1,200.".
 */
export function nextSpeakableChunk(text: string, from: number): { chunk: string; next: number } {
  const pending = text.slice(from);
  let end = -1;
  const boundary = /[.!?…:;](?=\s)|\n/g;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(pending)) !== null) end = match.index + match[0].length;
  if (end <= 0) return { chunk: "", next: from };
  return { chunk: pending.slice(0, end), next: from + end };
}

/**
 * Lo que falta leer cuando llega la respuesta final. Si lo leído no es el comienzo de la
 * respuesta (el servidor la cambió), no se lee nada más: repetir o mezclar suena peor que callar.
 */
export function unspokenRest(reply: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return reply;
  const final = reply.trimStart();
  return final.startsWith(said) ? final.slice(said.length) : "";
}
