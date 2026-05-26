export type DescriptionCleanupSurface = "movement_form" | "notification_form" | "android_overlay";

export type DescriptionCleanupResult = {
  cleanedDescription: string;
  confidence: number;
  reasons: string[];
  source: "local" | "deepseek";
};

type CleanupInput = {
  rawDescription: string;
  appLabel?: string | null;
  financialAppKey?: string | null;
};

const BANK_NOISE_WORDS = new Set([
  "abono",
  "app",
  "atencion",
  "bbva",
  "bcp",
  "boleta",
  "cargo",
  "cod",
  "codigo",
  "compra",
  "consumo",
  "cta",
  "cuenta",
  "cuota",
  "de",
  "del",
  "en",
  "envio",
  "factura",
  "interbank",
  "mensualidad",
  "nro",
  "numero",
  "operacion",
  "op",
  "pago",
  "para",
  "pe",
  "plin",
  "por",
  "recibo",
  "recibiste",
  "ref",
  "scotiabank",
  "soles",
  "sueldo",
  "suscripcion",
  "tarjeta",
  "transferencia",
  "visa",
  "yape",
]);

const MERCHANT_PATTERNS: Array<{ pattern: RegExp; description: string; reason: string }> = [
  { pattern: /\b(botica|boticas|farmacia|farmacias|inkafarma|mifarma)\b/i, description: "Compra en botica", reason: "detectamos comercio de farmacia" },
  { pattern: /\b(rest|restaurant|restaurante|polleria|cevicheria|chifa|pizzeria|comida)\b/i, description: "Comida fuera de casa", reason: "detectamos comercio de comida" },
  { pattern: /\b(grifo|primax|repsol|pecsa|petroperu|combustible|gasolina)\b/i, description: "Compra de combustible", reason: "detectamos comercio de combustible" },
  { pattern: /\b(taxi|uber|cabify|didi|indriver)\b/i, description: "Pago de movilidad", reason: "detectamos servicio de movilidad" },
  { pattern: /\b(market|supermercado|tambo|oxxo|mass|plaza\s*vea|metro|wong|vivanda)\b/i, description: "Compra en supermercado", reason: "detectamos comercio de tienda" },
  { pattern: /\b(luz\s*del\s*sur|enel|enosa|sedapal|calidda|agua\b|internet|claro|movistar|win\b|bitel|entel)\b/i, description: "Pago de servicio", reason: "detectamos pago de servicio" },
  { pattern: /\b(rappi|pedidosya|uber\s*eats|glovo)\b/i, description: "Pedido por delivery", reason: "detectamos app de delivery" },
  { pattern: /\b(netflix|spotify|disney\+?|hbo|amazon\s*prime|apple\s*tv|youtube\s*premium|crunchyroll)\b/i, description: "Suscripcion de entretenimiento", reason: "detectamos servicio de streaming" },
  { pattern: /\b(cineplanet|cinemark|multicine|teatro|concierto)\b/i, description: "Entretenimiento", reason: "detectamos cine o evento" },
  { pattern: /\b(gym|gimnasio|bodytech|smartfit|athletic\s*club|crossfit|pilates)\b/i, description: "Mensualidad de gimnasio", reason: "detectamos servicio de gimnasio" },
  { pattern: /\b(clinica|hospital|laboratorio|dentista|medico|auna|sanna)\b/i, description: "Gasto de salud", reason: "detectamos servicio de salud" },
  { pattern: /\b(universidad|instituto|colegio|academia|udemy|coursera|escuela)\b/i, description: "Gasto educativo", reason: "detectamos servicio educativo" },
  { pattern: /\b(saga\s*falabella|ripley|oechsle|zara|boutique)\b/i, description: "Compra de ropa", reason: "detectamos tienda de ropa" },
  { pattern: /\b(openai|chatgpt|claude\b|google\s*one|microsoft\b|dropbox|adobe)\b/i, description: "Suscripcion de software", reason: "detectamos suscripcion de software" },
  { pattern: /\b(peaje|via\s*expresa|metropolitano\b|microbus|combi)\b/i, description: "Gasto de transporte", reason: "detectamos transporte publico o peaje" },
];

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sentenceCase(value: string) {
  const lower = value.toLocaleLowerCase("es-PE");
  return lower ? lower.charAt(0).toLocaleUpperCase("es-PE") + lower.slice(1) : "";
}

function stripBankNoise(raw: string) {
  return normalizeSpaces(
    raw
      .replace(/\b(?:s\/|pen|usd|\$)\s*\d+(?:[.,]\d{1,2})?\b/gi, " ")
      .replace(/\b\d+(?:[.,]\d{1,2})?\s*(?:soles|pen|usd)\b/gi, " ")
      .replace(/\b\d{1,2}(?:ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)\b/gi, " ")
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
      .replace(/\b\d{3,}[*xX•]+\d*\b/g, " ")
      .replace(/\b[*xX•]{2,}\d*\b/g, " ")
      .replace(/\b(?:op|operacion|nro|ref|cod|codigo)\s*[:#-]?\s*[a-z0-9-]+\b/gi, " ")
      .replace(/\b[a-z]{2,}\d{4,}\b/gi, " ")
      .replace(/\b\d{5,}\b/g, " ")
      .replace(/[|_#*•]+/g, " ")
      .replace(/\s*[-–—]\s*/g, " "),
  );
}

function meaningfulPhrase(value: string) {
  const normalized = removeAccents(value)
    .replace(/[^a-zA-ZñÑáéíóúÁÉÍÓÚüÜ\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !BANK_NOISE_WORDS.has(removeAccents(word).toLocaleLowerCase("es-PE")))
    .filter((word) => word.length >= 3)
    .slice(0, 5)
    .join(" ");
  return sentenceCase(normalized);
}

function looksRawBankText(raw: string, appLabel?: string | null, financialAppKey?: string | null) {
  const normalized = removeAccents(raw).toLowerCase();
  const appHint = `${appLabel ?? ""} ${financialAppKey ?? ""}`.toLowerCase();
  return /(\d{3,}[*x•]|operacion|nro|ref|cod|plin|yape|bcp|bbva|interbank|scotiabank|\d{1,2}(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic))/i.test(normalized) ||
    /(yape|plin|bcp|bbva|interbank|scotiabank)/i.test(appHint);
}

export function cleanupMovementDescriptionLocally(input: CleanupInput): DescriptionCleanupResult | null {
  const raw = normalizeSpaces(input.rawDescription);
  if (raw.length < 4) return null;

  const stripped = stripBankNoise(raw);
  const rawLooksNoisy = looksRawBankText(raw, input.appLabel, input.financialAppKey);
  for (const item of MERCHANT_PATTERNS) {
    if (!item.pattern.test(stripped) && !item.pattern.test(raw)) continue;
    return {
      cleanedDescription: item.description,
      confidence: rawLooksNoisy ? 0.88 : 0.78,
      reasons: [item.reason, rawLooksNoisy ? "quitamos datos bancarios de la notificación" : "normalizamos la descripción"],
      source: "local",
    };
  }

  const phrase = meaningfulPhrase(stripped);
  if (phrase.length >= 4 && phrase.toLocaleLowerCase("es-PE") !== raw.toLocaleLowerCase("es-PE")) {
    const confidence = rawLooksNoisy ? 0.72 : 0.58;
    return {
      cleanedDescription: phrase,
      confidence,
      reasons: [rawLooksNoisy ? "quitamos códigos, fechas o teléfonos" : "simplificamos el texto"],
      source: "local",
    };
  }

  return null;
}

export function shouldShowDescriptionCleanup(rawDescription: string, cleanedDescription: string) {
  const raw = normalizeSpaces(rawDescription).toLocaleLowerCase("es-PE");
  const cleaned = normalizeSpaces(cleanedDescription).toLocaleLowerCase("es-PE");
  return cleaned.length >= 4 && cleaned !== raw;
}
