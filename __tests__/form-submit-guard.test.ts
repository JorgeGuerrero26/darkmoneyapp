import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard de convención (incidente 2026-07-25): un formulario que dispara mutaciones sin
 * `submittingRef` permite doble-tap y crea registros duplicados — pasó en obligaciones
 * (2 movimientos de apertura para una deuda) y estaba latente en pagos de deuda, que es
 * peor (pago duplicado). El botón deshabilitado por `loading` NO alcanza: el estado de
 * React llega tarde para taps rápidos.
 *
 * Este test es la red anti-regresión: si alguien crea un form nuevo con mutateAsync y
 * olvida el guard, CI falla y explica qué agregar. Barato, determinista, sin BD.
 */

const FORMS_DIR = join(__dirname, "..", "components", "forms");

/** Archivos que no son formularios con submit (campos/piezas reutilizables). */
const NOT_A_FORM = new Set(["FormDateField.tsx"]);

function formFiles(): string[] {
  return readdirSync(FORMS_DIR)
    .filter((f) => f.endsWith(".tsx") && !NOT_A_FORM.has(f))
    .sort();
}

describe("guard anti-doble-tap en formularios", () => {
  const files = formFiles();

  it("encuentra formularios que revisar (el test no puede quedar vacío por un rename)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s: si dispara mutaciones, tiene submittingRef con set y reset", (file) => {
    const source = readFileSync(join(FORMS_DIR, file), "utf8");

    // Solo aplica a forms que escriben en el backend desde un submit propio.
    const mutates = source.includes("mutateAsync");
    const hasSubmit = /async function handle(Submit|Save|Confirm)/.test(source);
    if (!mutates || !hasSubmit) return;

    // 1) declara el ref, 2) corta la re-entrada, 3) lo activa, 4) lo libera en finally.
    expect(source).toContain("submittingRef = useRef(false)");
    expect(source).toContain("if (submittingRef.current) return");
    expect(source).toContain("submittingRef.current = true");
    expect(source).toContain("submittingRef.current = false");
  });
});
