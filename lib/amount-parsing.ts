/**
 * Parsing centralizado de montos ingresados por el usuario o extraídos de texto.
 *
 * Antes cada vía hacía `Number(x.replace(",", "."))`, que rompe con separadores de
 * miles: "1,234.56" → NaN, "1.500" → 1.5 (auditoría, hallazgo R4/N6). Heurística:
 * cuando hay dos tipos de separador, el ÚLTIMO es el decimal; con uno solo, decide
 * la cantidad de dígitos a la derecha. El mismo contrato se replica en Kotlin
 * (`normalizeAmountString` de DarkMoneyNotificationListenerService).
 */

export type ParseAmountKind = "amount" | "rate";

export function parseAmountInput(
  raw: string | null | undefined,
  opts?: { kind?: ParseAmountKind },
): number | null {
  if (raw == null) return null;
  const kind = opts?.kind ?? "amount";
  // Conservar solo dígitos, separadores y signo; fuera símbolos de moneda, letras,
  // espacios y NBSP ("S/ 1 234,56" → "1234,56").
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");
  if (!body) return null;

  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Ambos separadores: el último es el decimal, el otro agrupa miles.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    const decimalIndex = body.lastIndexOf(decimalSep);
    const integerPart = body.slice(0, decimalIndex);
    const decimalPart = body.slice(decimalIndex + 1);
    // Nada de separadores después del decimal, y la agrupación de miles debe ser
    // válida: primer grupo de 1-3 dígitos, los demás de exactamente 3 ("1.23.4,5" → null).
    if (decimalPart.includes(thousandsSep) || decimalPart.includes(decimalSep)) return null;
    const groups = integerPart.split(thousandsSep);
    if (groups.length > 1) {
      if (groups[0].length < 1 || groups[0].length > 3) return null;
      if (groups.slice(1).some((group) => group.length !== 3)) return null;
    }
    if (groups.some((group) => group.includes(decimalSep))) return null;
    normalized = `${groups.join("")}.${decimalPart}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = body.split(sep);
    if (parts.length > 2) {
      // Varias ocurrencias del mismo separador: agrupación de miles ("1.234.567").
      // Cada grupo intermedio debe tener 3 dígitos para ser una agrupación válida.
      if (parts.slice(1).some((part) => part.length !== 3)) return null;
      normalized = parts.join("");
    } else {
      const [left, right] = parts;
      const isThousandsGroup =
        kind === "amount" &&
        right.length === 3 &&
        left.length >= 1 &&
        left.length <= 3;
      // "1,234" como monto es miles; "3,672" como tipo de cambio es decimal (los
      // rates usan 3+ decimales); 1-2 dígitos a la derecha siempre es decimal.
      normalized = isThousandsGroup ? `${left}${right}` : `${left}.${right}`;
    }
  } else {
    normalized = body;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Variante estricta para inputs de formulario: solo montos positivos. */
export function parsePositiveAmountInput(
  raw: string | null | undefined,
  opts?: { kind?: ParseAmountKind },
): number | null {
  const value = parseAmountInput(raw, opts);
  return value != null && value > 0 ? value : null;
}
