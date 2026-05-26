import {
  DASHBOARD_AI_FLOW_CACHE_KEY_PREFIX,
  DASHBOARD_AI_HEALTH_CACHE_KEY_PREFIX,
  DASHBOARD_AI_HISTORY_CACHE_KEY_PREFIX,
  DASHBOARD_AI_PATTERNS_CACHE_KEY_PREFIX,
  DASHBOARD_AI_SUMMARY_CACHE_KEY_PREFIX,
  DASHBOARD_AI_TONE_KEY_PREFIX,
} from "./constants";

export function getDashboardAiToneKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_TONE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiSummaryCacheKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_SUMMARY_CACHE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiPatternsCacheKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_PATTERNS_CACHE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiFlowCacheKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_FLOW_CACHE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiHistoryCacheKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_HISTORY_CACHE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiHealthCacheKey(userId?: string | null) {
  if (!userId) return null;
  return `${DASHBOARD_AI_HEALTH_CACHE_KEY_PREFIX}.${userId}`;
}

export function getDashboardAiUsageDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
