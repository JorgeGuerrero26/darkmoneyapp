// Sprint 4 #17 — fallback admin emails desde env vars.
// Lee FALLBACK_PRO_EMAILS y DASHBOARD_AI_ADMIN_EMAILS como CSV.
// Si no estan seteadas, cae al email default historico para no romper prod
// antes de configurar el env var en Supabase.

const DEFAULT_FALLBACK_PRO_EMAIL = "joradrianmori@gmail.com";
const DEFAULT_DASHBOARD_ADMIN_EMAIL = "joradrianmori@gmail.com";

function parseEmailList(raw: string | undefined, fallback: string): Set<string> {
  const source = raw && raw.trim().length > 0 ? raw : fallback;
  const set = new Set<string>();
  for (const part of source.split(",")) {
    const normalized = part.trim().toLowerCase();
    if (normalized) set.add(normalized);
  }
  return set;
}

let cachedFallbackPro: Set<string> | null = null;
let cachedDashboardAdmins: Set<string> | null = null;

export function getFallbackProEmails(): Set<string> {
  if (!cachedFallbackPro) {
    cachedFallbackPro = parseEmailList(
      Deno.env.get("FALLBACK_PRO_EMAILS"),
      DEFAULT_FALLBACK_PRO_EMAIL,
    );
  }
  return cachedFallbackPro;
}

export function getDashboardAdminEmails(): Set<string> {
  if (!cachedDashboardAdmins) {
    cachedDashboardAdmins = parseEmailList(
      Deno.env.get("DASHBOARD_AI_ADMIN_EMAILS"),
      DEFAULT_DASHBOARD_ADMIN_EMAIL,
    );
  }
  return cachedDashboardAdmins;
}

export function isFallbackProEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getFallbackProEmails().has(email.trim().toLowerCase());
}

export function isDashboardAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getDashboardAdminEmails().has(email.trim().toLowerCase());
}
