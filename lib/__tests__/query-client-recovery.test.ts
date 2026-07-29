import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isAuthLikeError } from "../auth-error";

describe("isAuthLikeError", () => {
  it("flags stale-session / auth errors that warrant a session recovery", () => {
    expect(isAuthLikeError('42501 | new row violates row-level security policy for table "movements"')).toBe(true);
    expect(isAuthLikeError("JWT expired")).toBe(true);
    expect(isAuthLikeError("Invalid Refresh Token")).toBe(true);
    expect(isAuthLikeError("Request failed with status 401")).toBe(true);
    expect(isAuthLikeError("403 Forbidden")).toBe(true);
    expect(isAuthLikeError("User not authenticated")).toBe(true);
  });

  it("does NOT flag plain network failures (handled by onlineManager, not a token refresh)", () => {
    expect(isAuthLikeError("TypeError: Network request failed")).toBe(false);
    expect(isAuthLikeError("Timeout (20000ms) at list-shared-obligations")).toBe(false);
    expect(isAuthLikeError("")).toBe(false);
  });
});

describe("recuperación al volver a foreground", () => {
  it("refresca conectividad sin invalidar globalmente todas las queries", () => {
    const source = readFileSync(join(__dirname, "..", "query-client.ts"), "utf8");
    const listenerStart = source.indexOf('AppState.addEventListener("change"');
    const listenerEnd = source.indexOf("let recoveringPromise", listenerStart);
    const foregroundListener = source.slice(listenerStart, listenerEnd);

    expect(listenerStart).toBeGreaterThanOrEqual(0);
    expect(listenerEnd).toBeGreaterThan(listenerStart);
    expect(foregroundListener).toContain("NetInfo.refresh()");
    expect(foregroundListener).not.toContain("recoverSession(");
  });
});
