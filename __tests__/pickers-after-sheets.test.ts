import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * En la capa `overlay` de un formulario, los selectores van DESPUÉS de las hojas.
 *
 * iOS presenta un Modal a la vez, así que lo que se abre desde un formulario se pinta como capa
 * dentro de él, por orden de aparición: lo último queda encima. Un `SearchableSelectSheet`
 * escrito antes de la `InlineFormSheet` desde la que se abre queda **por debajo**, así que al
 * tocar la fila no aparece nada — sin error, sin aviso, y con toda la pinta de que esa opción ya
 * no existe.
 *
 * Pasó el 2026-09-09: el selector de cuenta de BudgetForm estaba antes de la hoja "Opcionales",
 * y el usuario concluyó que ya no se podían hacer presupuestos por cuenta.
 *
 * Y volvió a pasar el 2026-09-18, en RecurringIncomeForm, con "Quién paga" y "Categoría". Este
 * test estaba y no lo vio: buscaba `<InlineFormSheet` LITERAL, y esa hoja se abre a través de un
 * envoltorio (`RecurringIncomeOptionalsSheet`). Una hoja envuelta seguía siendo una hoja para iOS
 * pero no para el test. Ahora los envoltorios se descubren solos: cualquier componente cuyo
 * archivo contenga un `<InlineFormSheet` cuenta como hoja.
 */
const ROOT = join(__dirname, "..");
const FORMS = join(ROOT, "components", "forms");

/** Nombres de componentes que, por dentro, SON una hoja. Se buscan, no se listan a mano. */
function sheetWrapperNames(): string[] {
  const names = new Set<string>(["InlineFormSheet"]);
  const roots = [join(ROOT, "components"), join(ROOT, "features")];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      const source = readFileSync(full, "utf8");
      if (!source.includes("<InlineFormSheet")) continue;
      for (const match of source.matchAll(/export function ([A-Z][A-Za-z0-9]*)/g)) {
        names.add(match[1]);
      }
    }
  };
  for (const dir of roots) walk(dir);
  return [...names];
}

function overlayBlock(source: string): string | null {
  const start = source.indexOf("overlay={");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + "overlay=".length; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

describe("los selectores se pintan sobre las hojas que los abren", () => {
  const SHEETS = sheetWrapperNames();
  const offenders: string[] = [];

  for (const file of readdirSync(FORMS).filter((name) => name.endsWith(".tsx"))) {
    const block = overlayBlock(readFileSync(join(FORMS, file), "utf8"));
    if (!block) continue;

    const lastSheet = Math.max(...SHEETS.map((name) => block.lastIndexOf(`<${name}`)));
    if (lastSheet < 0) continue;

    // Un selector escrito antes de la última hoja queda debajo de ella.
    const picker = /<SearchableSelectSheet|<CurrencySelectOverlay/g;
    for (const match of block.matchAll(picker)) {
      if ((match.index ?? 0) < lastSheet) {
        offenders.push(`${file} — ${match[0].slice(1)} se pinta antes de una hoja que lo abre`);
      }
    }
  }

  it("los envoltorios de hoja se descubren solos", () => {
    // Si esta lista se queda en el literal, el test vuelve a tener el punto ciego de 2026-09-18.
    expect(SHEETS).toContain("InlineFormSheet");
    expect(SHEETS).toContain("RecurringIncomeOptionalsSheet");
  });

  it("hay formularios con capas que revisar", () => {
    const conOverlay = readdirSync(FORMS)
      .filter((name) => name.endsWith(".tsx"))
      .filter((name) => overlayBlock(readFileSync(join(FORMS, name), "utf8")) !== null);
    expect(conOverlay.length).toBeGreaterThan(2);
  });

  it("ningún selector queda debajo de la hoja que lo abre", () => {
    expect(offenders.join("\n")).toBe("");
  });
});
