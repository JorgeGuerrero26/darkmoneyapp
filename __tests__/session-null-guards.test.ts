import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8").replace(/\s+/g, " ");
}

/**
 * Un `null` de sesión NO prueba que la sesión expirara.
 *
 * `getSession()` lee del Llavero a través de secure-session-storage, y esa capa devuelve null
 * SIN lanzar cuando la lectura sale incompleta: falta un chunk, el Keystore no respondió, u otro
 * contexto (la tarea headless de notificaciones) estaba escribiendo. Para getSession() eso es
 * indistinguible de "no hay sesión".
 *
 * Borrar la sesión ante ese null tiene dos costes, ambos reportados por el usuario el 2026-08-07:
 * el parpadeo de la pantalla de login al bloquear/desbloquear el teléfono, y —peor— la llamada a
 * clearSessionScopedClientState() que tira la caché entera y fuerza a recargarlo todo de golpe.
 *
 * Estos casos fijan que TODA vía que pueda recibir un null de sesión pida una segunda opinión
 * antes de borrar. Ya existían dos guardianes así; al del regreso a primer plano le faltaba.
 */
describe("nadie borra la sesión por un solo null", () => {
  const authContext = read("lib/auth-context.tsx");

  it("el regreso a primer plano conserva la sesión local ante un null", () => {
    expect(authContext).toContain("if (!data.session && sessionRef.current) {");
    expect(authContext).toContain(
      'logInfo("auth", "foreground reconcile devolvio null con sesion local viva: se conserva")',
    );
  });

  it("un SIGNED_OUT que no iniciamos nosotros se revalida antes de borrar", () => {
    expect(authContext).toContain(
      'if (event === "SIGNED_OUT" && !signingOutRef.current && supabase) {',
    );
    expect(authContext).toContain(
      'logInfo("auth", "ignored spurious SIGNED_OUT (session still valid server-side)")',
    );
  });

  it("un fallo de red al revalidar tampoco borra la sesión", () => {
    expect(authContext).toContain(
      'logInfo("auth", "spurious SIGNED_OUT revalidation failed, keeping local session")',
    );
  });

  it("sessionRef se mantiene al día en el punto central de sincronización", () => {
    // Si syncSession deja de escribirlo, el guardián de arriba se vuelve inútil en silencio.
    expect(authContext).toContain("sessionRef.current = nextSession; setSession(nextSession);");
  });
});
