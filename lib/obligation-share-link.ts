import type { Href } from "expo-router";

/** Ruta interna (misma que web: /share/obligations/:token). */
export function obligationShareHref(token: string): Href {
  const t = token.trim();
  return `/share/obligations/${encodeURIComponent(t)}` as Href;
}

/**
 * Extrae el token desde pathname de la app (`/share/obligations/uuid`).
 */
export function parseObligationShareTokenFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const normalized = pathname.split("?")[0].replace(/\/+$/, "") || "";
  const m = normalized.match(/\/share\/obligations\/([^/]+)$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Desde URL completa (https, universal link o darkmoney://).
 */
export function parseObligationShareTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/share\/obligations\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
