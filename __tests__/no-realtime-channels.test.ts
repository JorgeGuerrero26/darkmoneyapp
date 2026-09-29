/**
 * Realtime quedó fuera a propósito (2026-09-28). Su servidor arrancaba en frío hasta 9 veces al
 * día; cada arranque hace DDL, eso recarga el schema cache de PostgREST y la base del plan Nano,
 * sin RAM, se congeló 3 minutos. Entregaba ~25 cambios al día. Ver hooks/useForegroundDataRefresh.
 *
 * Si algún día vuelve (p. ej. con más RAM), que sea una decisión y no un `.channel(` suelto.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOTS = ["app", "components", "features", "hooks", "lib", "services", "store"];

function sourceFiles(dir: string): string[] {
  let out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "__tests__" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("sin suscripciones Realtime", () => {
  it("ningún archivo abre canales de Supabase Realtime", () => {
    const root = join(__dirname, "..");
    const offenders = ROOTS.flatMap((r) => sourceFiles(join(root, r))).filter((file) =>
      /\.channel\(|\.realtime\./.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
