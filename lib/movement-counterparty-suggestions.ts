import { normalizeAnalyticsText } from "../services/analytics/movement-features";
import type { CounterpartySummary, CounterpartyType } from "../types/domain";

export type CounterpartySuggestionSurface = "movement_form" | "notification_form" | "android_overlay";

export type CounterpartySuggestionResult = {
  type: "existing_counterparty" | "new_counterparty" | "none";
  counterpartyId: number | null;
  counterpartyName: string | null;
  newCounterpartyName: string | null;
  counterpartyType: CounterpartyType;
  confidence: number;
  reasons: string[];
  source: "local" | "deepseek";
};

type Input = {
  description: string;
  counterparties: CounterpartySummary[];
};

const GENERIC_WORDS = new Set([
  "abono",
  "botica",
  "boticas",
  "compra",
  "consumo",
  "delivery",
  "farmacia",
  "farmacias",
  "gasto",
  "movilidad",
  "pago",
  "servicio",
  "tienda",
  "transferencia",
]);

const NEW_COUNTERPARTY_PATTERNS: Array<{ pattern: RegExp; type: CounterpartyType; prefix?: string }> = [
  { pattern: /\b(?:en|a|para)\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.'-]{2,48})$/i, type: "merchant" },
  { pattern: /\b(?:restaurante|rest|polleria|chifa|pizzeria)\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.'-]{2,36})/i, type: "merchant", prefix: "Restaurante" },
  { pattern: /\b(?:botica|farmacia)\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.'-]{2,36})/i, type: "merchant", prefix: "Botica" },
  { pattern: /\b(?:grifo)\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.'-]{2,36})/i, type: "merchant", prefix: "Grifo" },
];

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word ? word.charAt(0).toLocaleUpperCase("es-PE") + word.slice(1).toLocaleLowerCase("es-PE") : "")
    .join(" ")
    .slice(0, 64);
}

function tokenSet(value: string) {
  return new Set(normalizeAnalyticsText(value).split(" ").filter((token) => token.length >= 3));
}

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let overlap = 0;
  for (const token of union) if (left.has(token) && right.has(token)) overlap++;
  return overlap / union.size;
}

function extractNewCounterpartyName(description: string): { name: string; type: CounterpartyType } | null {
  const cleaned = description.trim().replace(/\s+/g, " ");
  for (const item of NEW_COUNTERPARTY_PATTERNS) {
    const match = cleaned.match(item.pattern);
    const raw = match?.[1]?.replace(/[^\p{L}\p{N}\s.'-]/gu, " ").trim();
    if (!raw) continue;
    const words = normalizeAnalyticsText(raw).split(" ").filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token));
    if (words.length === 0) continue;
    const name = titleCase(item.prefix ? `${item.prefix} ${raw}` : raw);
    if (name.length >= 3) return { name, type: item.type };
  }
  return null;
}

export function suggestCounterpartyLocally({
  description,
  counterparties,
}: Input): CounterpartySuggestionResult | null {
  const descTokens = tokenSet(description);
  if (descTokens.size === 0) return null;

  const ranked = counterparties
    .filter((counterparty) => !counterparty.isArchived)
    .map((counterparty) => {
      const nameTokens = tokenSet(counterparty.name);
      const score = jaccard(descTokens, nameTokens);
      const normalizedDesc = normalizeAnalyticsText(description);
      const normalizedName = normalizeAnalyticsText(counterparty.name);
      const containsName = normalizedName.length >= 3 && normalizedDesc.includes(normalizedName);
      const confidence = containsName ? 0.9 : Math.min(0.82, 0.36 + score * 0.7);
      return { counterparty, confidence, containsName, score };
    })
    .filter((item) => item.containsName || item.confidence >= 0.62)
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  if (best) {
    return {
      type: "existing_counterparty",
      counterpartyId: best.counterparty.id,
      counterpartyName: best.counterparty.name,
      newCounterpartyName: null,
      counterpartyType: best.counterparty.type,
      confidence: best.confidence,
      reasons: [best.containsName ? "nombre encontrado en la descripción" : "nombre parecido en tus contactos"],
      source: "local",
    };
  }

  const extracted = extractNewCounterpartyName(description);
  if (!extracted) return null;
  return {
    type: "new_counterparty",
    counterpartyId: null,
    counterpartyName: null,
    newCounterpartyName: extracted.name,
    counterpartyType: extracted.type,
    confidence: 0.58,
    reasons: ["posible comercio detectado en la descripción"],
    source: "local",
  };
}
