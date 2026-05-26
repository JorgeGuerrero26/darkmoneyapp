import type { Period } from "./types";

export const UPCOMING_DAYS = 30;
export const ADVANCED_DASHBOARD_GIFT_EMAIL = "nicol.solano15@gmail.com";
export const DASHBOARD_AI_ADMIN_EMAIL = "joradrianmori@gmail.com";

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
