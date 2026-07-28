/**
 * Parseo de correos de constancia bancarios. Puro y sin imports de Deno para poder testearlo
 * con jest desde el repo RN (mismo patrón que assistant-chat/logic.ts).
 *
 * Los patrones se PORTAN de AmountParsing.kt y del clasificador de
 * DarkMoneyNotificationListenerService.kt, ya probados en producción en Android.
 */

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
