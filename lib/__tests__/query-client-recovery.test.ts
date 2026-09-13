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

  /**
   * Los tres que esperan recoverSession lo hacen por el TOKEN: el retry de crear/actualizar
   * movimiento (dentro de SAVE_CEILING_MS) y el reconcile de detección. Si la promesa esperara
   * además a la revalidación escalonada, el guardado se acercaría a su propio techo — que es el
   * fallo que esto viene a evitar, no a causar.
   */
  it("recoverSession no espera a la revalidación: resuelve con el token", () => {
    const source = readFileSync(join(__dirname, "..", "query-client.ts"), "utf8");
    const bodyStart = source.indexOf("export async function recoverSession");
    const body = source.slice(bodyStart, source.indexOf("const PERSIST_MAX_AGE_MS", bodyStart));

    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(body).toContain("void drainRecoveryRefetch()");
    // El invalidate global sin filtro era la avalancha: 3-12 peticiones en el mismo segundo.
    expect(body).not.toContain("await queryClient.invalidateQueries()");
  });

  it("la revalidación sale con tope de concurrencia, no toda de golpe", () => {
    const source = readFileSync(join(__dirname, "..", "query-client.ts"), "utf8");
    const drainStart = source.indexOf("async function drainRecoveryRefetch");
    const drain = source.slice(drainStart, source.indexOf("export async function recoverSession", drainStart));

    expect(drainStart).toBeGreaterThanOrEqual(0);
    // refetchType "none" separa "marcar obsoleto" de "pedir": sin eso el tope no sirve de nada.
    expect(drain).toContain('refetchType: "none"');
    expect(drain).toContain("runBounded(tasks, RECOVERY_REFETCH_CONCURRENCY)");
  });
});
