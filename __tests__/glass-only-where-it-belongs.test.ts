import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "features"];

/**
 * Rediseño fase 3: el vidrio esmerilado sale de todas partes menos DOS sitios — la barra
 * inferior y el fondo de las hojas —, los únicos donde algo pasa realmente por detrás.
 *
 * En el resto era ruido caro: cuesta legibilidad al sol (el fondo cambia bajo el texto),
 * cuesta batería en listas largas y sugiere que la superficie es un efecto y no un dato.
 *
 * `SafeBlurView` difumina solo con la prop `blur`, que por defecto es false. Este test
 * existe porque ese defecto es fácil de revertir sin querer: basta que alguien copie un
 * `<SafeBlurView blur .../>` de la barra a un componente nuevo para que el vidrio vuelva a
 * repartirse por la app sin que nadie lo note en la revisión.
 */
const ALLOWED = new Set([
  // La barra inferior: el contenido de la lista se desplaza literalmente por debajo.
  "app/(app)/_layout.tsx",
  // El backdrop de las hojas: tapa la pantalla que sigue viva detrás.
  "components/ui/BottomSheet.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function relative(full: string): string {
  return full.slice(ROOT.length + 1).split("\\").join("/");
}

describe("el vidrio esmerilado solo sobrevive donde algo pasa por detrás", () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

  it("hay archivos que revisar", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("nadie fuera de la barra inferior y del backdrop de hojas pide blur", () => {
    const offenders = files
      .filter((full) => {
        const source = readFileSync(full, "utf8");
        // `blur` como prop booleana suelta dentro de un <SafeBlurView ...>.
        return /<SafeBlurView[^>]*\sblur[\s/>]/.test(source);
      })
      .map(relative)
      .filter((rel) => !ALLOWED.has(rel));

    expect(offenders).toEqual([]);
  });

  it("los dos sitios permitidos siguen difuminando", () => {
    for (const rel of ALLOWED) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(/<SafeBlurView[^>]*\sblur[\s/>]/.test(source)).toBe(true);
    }
  });

  it("SafeBlurView no difumina si no se lo piden", () => {
    const source = readFileSync(join(ROOT, "components/ui/SafeBlurView.tsx"), "utf8");
    expect(source).toMatch(/blur\s*=\s*false/);
  });
});
