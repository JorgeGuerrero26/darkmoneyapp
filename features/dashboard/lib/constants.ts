import type { Period } from "./types";

export const UPCOMING_DAYS = 30;

// Overrides Pro/admin: lista de emails con acceso especial.
// Configurables via env vars sin rebuild. Fallback al email default si no hay env.
// Para agregar mas, definir EXPO_PUBLIC_DASHBOARD_GIFT_EMAILS / EXPO_PUBLIC_DASHBOARD_AI_ADMIN_EMAILS como CSV.
function parseEmailListEnv(raw: string | undefined, fallback: string): Set<string> {
  const source = raw && raw.trim().length > 0 ? raw : fallback;
  const set = new Set<string>();
  for (const part of source.split(",")) {
    const normalized = part.trim().toLowerCase();
    if (normalized) set.add(normalized);
  }
  return set;
}

export const ADVANCED_DASHBOARD_GIFT_EMAILS = parseEmailListEnv(
  process.env.EXPO_PUBLIC_DASHBOARD_GIFT_EMAILS,
  "nicol.solano15@gmail.com",
);

export const DASHBOARD_AI_ADMIN_EMAILS = parseEmailListEnv(
  process.env.EXPO_PUBLIC_DASHBOARD_AI_ADMIN_EMAILS,
  "joradrianmori@gmail.com",
);

export function isAdvancedDashboardGiftEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADVANCED_DASHBOARD_GIFT_EMAILS.has(email.trim().toLowerCase());
}

export function isDashboardAiAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return DASHBOARD_AI_ADMIN_EMAILS.has(email.trim().toLowerCase());
}


export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
  last_30: "30 días",
};

export const DASHBOARD_CURRENCY_KEY = "darkmoney.dashboard.displayCurrency";
export const DASHBOARD_AI_TONE_KEY_PREFIX = "darkmoney.dashboard.aiTone";
export const DASHBOARD_AI_SUMMARY_CACHE_KEY_PREFIX = "darkmoney.dashboard.aiSummaryCache";
export const DASHBOARD_AI_PATTERNS_CACHE_KEY_PREFIX = "darkmoney.dashboard.aiPatternsCache";
export const DASHBOARD_AI_FLOW_CACHE_KEY_PREFIX = "darkmoney.dashboard.aiFlowCache";
export const DASHBOARD_AI_HISTORY_CACHE_KEY_PREFIX = "darkmoney.dashboard.aiHistoryCache";
export const DASHBOARD_AI_HEALTH_CACHE_KEY_PREFIX = "darkmoney.dashboard.aiHealthCache";
