import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = join(__dirname, "..", "components", "ui", "BiometricLock.tsx");

describe("BiometricLock", () => {
  const source = readFileSync(SOURCE, "utf8");

  it("coalesce intentos para no crear autenticaciones nativas concurrentes", () => {
    expect(source).toContain("const authenticationInFlightRef = useRef(false)");
    expect(source).toContain("if (authenticationInFlightRef.current) return");
    expect(source).toContain("authenticationInFlightRef.current = true");

    const finallyBlock = source.slice(
      source.indexOf("} finally {"),
      source.indexOf("}, [setBiometricLocked]);"),
    );
    expect(finallyBlock).toContain("authenticationInFlightRef.current = false");
  });

  it("no relanza Face ID cuando su propia hoja devuelve la app a active", () => {
    const lockedBranch = source.slice(
      source.indexOf("if (locked) {"),
      source.indexOf("// Revisar si el tiempo en background superó el límite"),
    );

    expect(lockedBranch).toContain("return;");
    expect(lockedBranch).not.toContain("authenticate()");
  });

  it("muestra progreso y feedback cuando la autenticación no tiene éxito", () => {
    expect(source).toContain('loading={isAuthenticating}');
    expect(source).toContain('loadingLabel="Verificando…"');
    expect(source).toContain('logWarn("biometric_lock", "authentication rejected"');
    expect(source).toContain("setAuthenticationError(");
  });
});
