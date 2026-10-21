import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

jest.mock("expo", () => ({
  requireOptionalNativeModule: (name: string) => {
    if (name === "Roto") throw new Error("boom");
    return name === "ExpoSQLite" ? {} : null;
  },
}));

import { hasNativeModule } from "../native-module";

describe("hasNativeModule", () => {
  it("dice si el binario trae el módulo, sin cargar el paquete", () => {
    expect(hasNativeModule("ExpoSQLite")).toBe(true);
    expect(hasNativeModule("ExpoCrypto")).toBe(false);
  });

  it("nunca lanza", () => {
    expect(hasNativeModule("Roto")).toBe(false);
  });
});

/**
 * Alarma del incidente del 2026-10-21: un `require()` tardío de un paquete nativo, protegido solo con try/catch, cierra
 * la app en un binario que no trae ese módulo (Metro lo vuelve error fatal). Todo archivo con un require así debe
 * preguntar antes con hasNativeModule.
 */
describe("requires tardíos de paquetes nativos", () => {
  // Se cargan durante el arranque (ahí el try/catch sí protege) o el módulo está en todos los binarios vivos.
  const ALLOWED = new Set(["lib/speech-recognition-safe.ts", "lib/notifications-runtime.ts"]);
  const ROOTS = ["app", "components", "features", "hooks", "lib", "services", "store"];
  const root = join(__dirname, "..", "..");

  function walk(dir: string, out: string[]) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  }

  it("preguntan antes con hasNativeModule", () => {
    const files: string[] = [];
    for (const dir of ROOTS) walk(join(root, dir), files);
    const offenders = files
      .map((file) => ({ file: file.slice(root.length + 1).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }))
      .filter(({ file, text }) => !ALLOWED.has(file) && /require\("expo[-/]/.test(text) && !text.includes("hasNativeModule("))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
