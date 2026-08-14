import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORMS_DIR = join(__dirname, "..", "components", "forms");

/**
 * iOS solo presenta UN Modal a la vez. `BottomSheet` es un Modal y `ConfirmDialog` también, así
 * que un diálogo renderizado como HERMANO de un sheet abierto no llega a aparecer nunca: el
 * usuario escribe algo, toca cerrar y no pasa nada. En Android los Modal hermanos se apilan bien,
 * por eso el fallo estuvo invisible hasta que el usuario tuvo un iPhone (reportado 2026-08-13,
 * afectaba a 10 formularios).
 *
 * La forma correcta es la prop `overlay` de BottomSheet con `<ConfirmDialog inline />`, que lo
 * pinta dentro del mismo Modal y fuera del ScrollView.
 *
 * Ojo: esto solo aplica cuando ambos pueden estar visibles A LA VEZ. Un diálogo disparado desde
 * la pantalla (no desde dentro del sheet) no colisiona — por eso `AttachmentPicker` y
 * `app/settings.tsx` se quedan como están, y moverlos los rompería.
 */
describe("los diálogos de confirmación viven dentro de su sheet", () => {
  const forms = readdirSync(FORMS_DIR).filter((f) => f.endsWith(".tsx"));

  it("hay formularios que revisar", () => {
    expect(forms.length).toBeGreaterThan(5);
  });

  it.each(forms)("%s no renderiza ConfirmDialog como hermano del BottomSheet", (file) => {
    const source = readFileSync(join(FORMS_DIR, file), "utf8");
    if (!source.includes("<BottomSheet")) return;

    const sheetClose = source.indexOf("</BottomSheet>");
    if (sheetClose === -1) return;

    // Después del cierre del sheet no puede quedar ningún diálogo suelto.
    expect(source.slice(sheetClose)).not.toContain("<ConfirmDialog");

    // Y antes de que el sheet abra tampoco: en ContactForm estaba ahí y fallaba igual.
    const sheetOpen = source.indexOf("<BottomSheet");
    expect(source.slice(0, sheetOpen)).not.toContain("<ConfirmDialog");
  });

  it("todo ConfirmDialog de un formulario declara inline", () => {
    for (const file of forms) {
      const source = readFileSync(join(FORMS_DIR, file), "utf8");
      const dialogs = source.match(/<ConfirmDialog/g)?.length ?? 0;
      const inlines = source.match(/\binline\b/g)?.length ?? 0;
      if (dialogs > 0) {
        expect({ file, dialogs, inlines }).toMatchObject({ file });
        expect(inlines).toBeGreaterThanOrEqual(dialogs);
      }
    }
  });
});
