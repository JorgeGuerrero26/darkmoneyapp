import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["services", "app", "features", "hooks"];

/**
 * Nadie escribe en el cache de `["movements"]` dando por hecho que hay páginas.
 *
 * Ese prefijo es un **contrato compartido**: cuelgan de él la lista paginada y el total del
 * filtro (`["movements","summary",…]`), que devuelve `{ incomeTotal, … }` y no tiene `pages`.
 * Un `old.pages.map(...)` sobre todas las coincidencias reventaba dentro de `onMutate`, y
 * cuando `onMutate` lanza, React Query **aborta la mutación sin ejecutarla**: eliminar un
 * movimiento dejó de funcionar y nadie se enteró, porque la fila se ocultaba igual.
 *
 * Este test existe además por CÓMO se arregló mal la primera vez: la función guardada se
 * escribió y se probó, pero no llegó a llamarse desde la mutación —el script que la enchufaba
 * se abortó a mitad— y el import sin usar no rompe `tsc`. Los tests de la función pura pasaban
 * verdes con el fallo intacto en producción. Esto mira el código que de verdad corre.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("el cache de movimientos no asume que todo tenga paginas", () => {
  const offenders: string[] = [];

  for (const dir of SCAN) {
    for (const full of walk(join(ROOT, dir))) {
      const rel = full.slice(ROOT.length + 1).split("\\").join("/");
      if (rel.endsWith("drop-movement-from-pages.ts")) continue;
      const source = readFileSync(full, "utf8");
      if (/\.pages\.map\(/.test(source)) offenders.push(rel);
    }
  }

  it("ningun sitio hace .pages.map() fuera del helper con guarda", () => {
    expect(offenders.join("\n")).toBe("");
  });

  it("la mutacion de borrado usa el helper, no un parche propio", () => {
    const source = readFileSync(join(ROOT, "services/queries/workspace-data.ts"), "utf8");
    const deleteMutation = source.slice(source.indexOf('mutationKey: ["delete-movement"]'));
    const onMutate = deleteMutation.slice(0, deleteMutation.indexOf("onError:"));
    expect(onMutate).toContain("dropMovementFromPages(old, id)");
  });
});
