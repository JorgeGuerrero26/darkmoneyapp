export type DashboardAiTone = "managerial" | "personal";

export type DashboardAiComplexTerm = {
  term: string;
  explanation: string;
};

export type DashboardAiToneResponse = {
  reply: string;
  complexTerms: DashboardAiComplexTerm[];
  generatedAt: string;
};

export type DashboardAiDailyCache = {
  usageDate: string;
  lastUsedAt: string;
  responses: Partial<Record<DashboardAiTone, DashboardAiToneResponse>>;
};

export type DashboardAiTextPart =
  | { type: "text"; value: string }
  | { type: "term"; value: string; term: DashboardAiComplexTerm };

export const DASHBOARD_AI_TONE_OPTIONS: Array<{ id: DashboardAiTone; label: string; description: string }> = [
  {
    id: "managerial",
    label: "Informe gerencial",
    description: "Más ejecutivo y orientado a decisiones.",
  },
  {
    id: "personal",
    label: "Asesor personal",
    description: "Más claro, simple y pensado para el día a día.",
  },
];

import { EXTENDED_PALETTE } from "../../../constants/theme";

export const GEMINI_BRAND = {
  blue: EXTENDED_PALETTE.chartIndigo,
  teal: EXTENDED_PALETTE.chartTeal,
  coral: EXTENDED_PALETTE.chartCoral,
  gold: EXTENDED_PALETTE.chartGold,
};

const DASHBOARD_AI_TERM_CATALOG: DashboardAiComplexTerm[] = [
  { term: "balance visible", explanation: "Es el dinero que ves disponible ahora mismo en tus cuentas." },
  { term: "saldo actual", explanation: "Es el dinero disponible que tienes en este momento." },
  { term: "cierre estimado de mes", explanation: "Es cómo podrías terminar el mes si todo sigue como va hoy." },
  { term: "neto semanal", explanation: "Es la diferencia entre lo que entra y lo que sale durante la semana." },
  { term: "presión financiera", explanation: "Significa que tus pagos cercanos aprietan tu dinero disponible." },
  { term: "cobertura de caja", explanation: "Es cuántos días podrías seguir pagando con el dinero que ya tienes." },
  { term: "flujo", explanation: "Es el movimiento de dinero que entra y sale en un periodo." },
  { term: "proyección", explanation: "Es una estimación de lo que podría pasar con tus números más adelante." },
  { term: "compromisos inmediatos", explanation: "Son pagos u obligaciones que tienes que atender pronto." },
  { term: "desorden operativo", explanation: "Significa que hay pendientes o datos mal organizados que afectan el control." },
  { term: "margen", explanation: "Es el espacio que te queda entre lo que tienes y lo que necesitas pagar." },
  { term: "solidez", explanation: "Es qué tan fuerte o estable se ve tu situación financiera." },
  { term: "calidad operativa", explanation: "Es qué tan ordenados y confiables están tus datos para tomar decisiones." },
  { term: "lectura", explanation: "Es la interpretación del estado financiero usando los datos del dashboard." },
  { term: "riesgos", explanation: "Son problemas que podrían afectar tu dinero si no se atienden a tiempo." },
  { term: "oportunidades", explanation: "Son opciones para mejorar tu situación financiera o aprovechar mejor tu dinero." },
  { term: "prioridad", explanation: "Es lo más importante que conviene atender primero." },
];

function normalizeDashboardAiText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es");
}

function isDashboardAiWordChar(char: string | undefined) {
  if (!char) return false;
  return /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/.test(char);
}

function hasDashboardAiTermBoundary(text: string, index: number, length: number) {
  const before = index > 0 ? text[index - 1] : undefined;
  const after = index + length < text.length ? text[index + length] : undefined;
  return !isDashboardAiWordChar(before) && !isDashboardAiWordChar(after);
}

export function ensureDashboardAiComplexTerms(reply: string, terms: DashboardAiComplexTerm[]) {
  if (!reply) return [];
  const normalizedReply = normalizeDashboardAiText(reply);
  const candidates = [...terms, ...DASHBOARD_AI_TERM_CATALOG];
  const picked: DashboardAiComplexTerm[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const term = candidate.term.trim();
    const explanation = candidate.explanation.trim();
    if (!term || !explanation) continue;
    const normalizedTerm = normalizeDashboardAiText(term);
    const index = normalizedReply.indexOf(normalizedTerm);
    if (index === -1) continue;
    if (!hasDashboardAiTermBoundary(reply, index, term.length)) continue;
    const key = normalizedTerm;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ term, explanation });
    if (picked.length >= 6) break;
  }

  return picked;
}

export function buildDashboardAiTextParts(reply: string, terms: DashboardAiComplexTerm[]): DashboardAiTextPart[] {
  if (!reply) return [];
  const resolvedTerms = ensureDashboardAiComplexTerms(reply, terms).sort((a, b) => b.term.length - a.term.length);
  if (resolvedTerms.length === 0) return [{ type: "text", value: reply }];

  const normalizedReply = normalizeDashboardAiText(reply);
  const parts: DashboardAiTextPart[] = [];
  let cursor = 0;

  while (cursor < reply.length) {
    let matchedTerm: DashboardAiComplexTerm | null = null;
    let matchedLength = 0;

    for (const term of resolvedTerms) {
      const normalizedTerm = normalizeDashboardAiText(term.term);
      if (!normalizedReply.startsWith(normalizedTerm, cursor)) continue;
      if (!hasDashboardAiTermBoundary(reply, cursor, term.term.length)) continue;
      matchedTerm = term;
      matchedLength = term.term.length;
      break;
    }

    if (matchedTerm) {
      parts.push({
        type: "term",
        value: reply.slice(cursor, cursor + matchedLength),
        term: matchedTerm,
      });
      cursor += matchedLength;
      continue;
    }

    const nextCursor = cursor + 1;
    const lastPart = parts[parts.length - 1];
    const nextChar = reply.slice(cursor, nextCursor);
    if (lastPart?.type === "text") {
      lastPart.value += nextChar;
    } else {
      parts.push({ type: "text", value: nextChar });
    }
    cursor = nextCursor;
  }

  return parts;
}
