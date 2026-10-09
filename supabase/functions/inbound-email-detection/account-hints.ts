type Hint = { kind: "account" | "card"; last4: string };
type Hints = { source?: Hint; destination?: Hint };

/** Only masked identifiers under explicit account/card labels; never beneficiary phone numbers. */
export function extractReceiptAccountHints(text: string, movementType: string): Hints {
  const lines = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\r?\n/)
    .map((line) => line.replace(/^[|\s]+|[|\s]+$/g, "").trim()).filter(Boolean);
  const found: { source: Hint[]; destination: Hint[] } = { source: [], destination: [] };
  const label = /^(?:desde|origen|cuenta (?:de )?origen|cuenta (?:de )?cargo|cuenta de ahorro|tarjeta(?: de (?:debito|credito))?|(?:numero|n[º°o]) (?:de )?(?:cuenta|tarjeta)|destino|hacia|cuenta (?:de )?destino|cuenta abonada)\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!label.test(line)) continue;
    const destination = /^(?:destino|hacia|cuenta (?:de )?destino|cuenta abonada)\b/.test(line);
    // Account rows can wrap the name and masked number onto subsequent lines.
    let section = line;
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      if (label.test(lines[j]) || /^(?:fecha|moneda|monto|enviado|celular|nombre|mensaje|canal|numero|n[º°o]|por tu|si tu|para cualquier)\b/.test(lines[j])) break;
      section += ` ${lines[j]}`;
    }
    const masked = [...section.matchAll(/[*x•]{2,}[\s*-]*(\d{4})(?!\d)/g)];
    const identifiers = new Set(masked.map((m) => m[1]));
    if (identifiers.size !== 1) continue;
    const kind = /tarjeta/.test(section) ? "card" : "account";
    const side = destination || (movementType === "income" && !/^(?:desde|origen|cuenta (?:de )?origen)\b/.test(line)) ? "destination" : "source";
    found[side].push({ kind, last4: [...identifiers][0] });
  }
  const unique = (hints: Hint[]) => {
    const distinct = new Map(hints.map((hint) => [`${hint.kind}:${hint.last4}`, hint]));
    return distinct.size === 1 ? [...distinct.values()][0] : undefined;
  };
  const result: Hints = {};
  const source = unique(found.source), destination = unique(found.destination);
  if (source) result.source = source;
  if (destination) result.destination = destination;
  return result;
}
