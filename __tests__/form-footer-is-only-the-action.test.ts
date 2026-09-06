import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORMS_DIR = join(__dirname, "..", "components", "forms");

/**
 * La barra anclada es para la acción principal, no para navegar.
 *
 * El formulario de movimientos tenía la puerta a los campos opcionales **debajo** del botón de
 * guardar, mientras los otros seis la tenían como última fila del contenido. Se notó usándolo:
 * dos formularios de la misma app pedían lo mismo en sitios distintos.
 *
 * Cuando se dibujó tenía sentido —el botón vivía al final del scroll y ponerla encima dejaba
 * leer "detalles primero, guardar después"—, pero con la barra anclada esa razón caducó. Y
 * debajo del botón la fila decía lo contrario de lo que hace: ahí se lee como algo posterior a
 * guardar, cuando son campos que se llenan antes.
 *
 * Este test mira el bloque `footer={...}` de cada formulario y exige que dentro no haya nada
 * tocable que no sea un `Button`. El texto que acompaña al botón —"Falta el monto"— sí puede.
 */
function footerBlock(source: string): string | null {
  const start = source.indexOf("footer={");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + "footer=".length; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

describe("el pie del formulario es solo la acción principal", () => {
  const files = readdirSync(FORMS_DIR).filter((f) => f.endsWith(".tsx"));
  const offenders: string[] = [];

  for (const file of files) {
    const footer = footerBlock(readFileSync(join(FORMS_DIR, file), "utf8"));
    if (!footer) continue;
    // Un enlace o una fila dentro del pie: eso es navegación disfrazada de acción.
    if (/<(TouchableOpacity|Pressable|FormOptionRow)[\s>]/.test(footer)) {
      offenders.push(file);
    }
  }

  it("hay formularios con pie anclado que revisar", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("ningun pie esconde una puerta a otra pantalla", () => {
    expect(offenders.join("\n")).toBe("");
  });
});
