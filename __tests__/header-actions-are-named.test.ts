import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const APP = join(ROOT, "app");

/**
 * El encabezado no acumula íconos sin nombre.
 *
 * Un ícono suelto obliga a adivinar, y en estas pantallas alguno **borra**. El detalle de
 * presupuesto llegó a tener cuatro —alfiler, copia, lápiz y papelera— sin una palabra; el de
 * movimiento tenía un marcador que nadie relacionaba con los atajos; y el alfiler tachado de
 * contactos era ambiguo en los dos sentidos: ¿está fijado, o lo fijo?
 *
 * La regla, ya aplicada en cuenta, suscripción, ingreso fijo, presupuesto, movimiento y
 * contacto: **como mucho un ícono con significado propio** —analítica, que es a lo que se entra
 * a mirar— **más el menú de tres puntos**, donde cada acción se lee con su nombre.
 *
 * Se cuentan las acciones del encabezado, no las de las barras de selección múltiple: ahí el
 * ícono acompaña a una etiqueta.
 */
function screens(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) screens(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** El bloque `rightAction={...}` de la pantalla, con las llaves balanceadas. */
function rightActionBlock(source: string): string | null {
  const start = source.indexOf("rightAction={");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + "rightAction=".length; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const MAX_ICONS_IN_HEADER = 2;

/**
 * Íconos que en un encabezado no dicen lo que hacen, aunque el dibujo se entienda.
 *
 * No es que sean malos dibujos: es que la acción es rara —exportar, duplicar, fijar— y nadie
 * llega a esta pantalla a hacerla, así que la flecha hacia abajo lo mismo baja un archivo que
 * ordena la lista. Van al menú, donde se leen. Refrescar o ver la analítica sí pueden ir
 * sueltos: es a lo que se entra.
 */
const ICONS_THAT_MUST_BE_READ = [
  "Download", "Copy", "Pin", "PinOff", "BookmarkPlus", "Pencil", "Trash2", "Archive", "Power",
];

/**
 * Cada acción del bloque, como el trozo de texto que la define.
 *
 * Se busca el `icon:` y se abre hacia los lados hasta las llaves que lo encierran, en vez de
 * trocear el bloque por llaves: una acción puede llevar llaves dentro —`label: `${n} filtros``—
 * y trocear se saltaba justo esas.
 */
function headerActions(block: string): string[] {
  const actions: string[] = [];
  for (const match of block.matchAll(/icon:\s/g)) {
    const at = match.index ?? 0;

    let depth = 0;
    let start = -1;
    for (let i = at; i >= 0; i -= 1) {
      if (block[i] === "}") depth += 1;
      else if (block[i] === "{") {
        if (depth === 0) { start = i; break; }
        depth -= 1;
      }
    }
    if (start < 0) continue;

    depth = 0;
    for (let i = start; i < block.length; i += 1) {
      if (block[i] === "{") depth += 1;
      else if (block[i] === "}") {
        depth -= 1;
        if (depth === 0) { actions.push(block.slice(start, i + 1)); break; }
      }
    }
  }
  return actions;
}

/** El menú de tres puntos se entiende sin etiqueta: lo que hay dentro viene escrito. */
function isNamed(action: string): boolean {
  return /label:/.test(action) || /icon:\s*MoreVertical/.test(action);
}

describe("las acciones del encabezado se leen", () => {
  const offenders: string[] = [];

  for (const full of screens(APP)) {
    const source = readFileSync(full, "utf8");
    const block = rightActionBlock(source);
    if (!block || !block.includes("HeaderActionGroup")) continue;

    const icons = (block.match(/\bicon:\s/g) || []).length;
    if (icons > MAX_ICONS_IN_HEADER) {
      const rel = full.slice(ROOT.length + 1).split("\\").join("/");
      offenders.push(`${rel} — ${icons} íconos en el encabezado`);
    }
  }

  it("hay encabezados que revisar", () => {
    expect(screens(APP).length).toBeGreaterThan(10);
  });

  it("ninguna pantalla apila iconos sin nombre en el encabezado", () => {
    expect(offenders.join("\n")).toBe("");
  });
});
