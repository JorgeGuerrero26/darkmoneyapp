import type { Href } from "expo-router";

export function workspaceInviteHref(token: string): Href {
  const t = token.trim();
  return `/workspace-invite/${encodeURIComponent(t)}` as Href;
}

export function parseWorkspaceInviteTokenFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const normalized = pathname.split("?")[0].replace(/\/+$/, "") || "";
  const match = normalized.match(/\/workspace-invite\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function parseWorkspaceInviteTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/workspace-invite\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
