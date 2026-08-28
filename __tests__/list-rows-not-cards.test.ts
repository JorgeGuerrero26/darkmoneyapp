import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN = ["components/domain", "features"];

/**
 * Toda fila de lista se dibuja como **fila**, no como tarjeta.
 *
 * La Revisión 03 lo pide para las ocho pantallas: "de 118px de tarjeta a 64px de fila". Sin
 * `variant="row"`, `ResourceCard` pinta fondo, borde y esquinas, y la lista vuelve a leerse
 * como una pila de bloques sueltos.
 *
 * Este test existe porque el fallo ya se coló DOS veces, y las dos por lo mismo: el script que
 * añadía la prop reemplazaba solo la PRIMERA aparición de cada archivo, y hay componentes con
 * dos `ResourceCard` —uno para el modo selección y otro para el normal—. Ninguna comprobación
 * lo detectaba: compila igual, los tests pasaban igual, y solo se veía en el teléfono.
 */
const EXCEPTIONS = new Set([
  // Una invitación con aceptar/rechazar es una tarjeta de ACCIÓN, no una fila de lista.
  "components/domain/NotificationInviteCard.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("las listas se dibujan como filas, no como tarjetas", () => {
  const offenders: string[] = [];

  for (const dir of SCAN) {
    for (const full of walk(join(ROOT, dir))) {
      const rel = full.slice(ROOT.length + 1).split("\\").join("/");
      if (EXCEPTIONS.has(rel)) continue;
      const source = readFileSync(full, "utf8");

      // Cada apertura de <ResourceCard necesita SU propia variant: un archivo puede tener dos.
      const opens = (source.match(/<ResourceCard[\s>]/g) || []).length;
      if (opens === 0) continue;
      const rows = (source.match(/variant="row"/g) || []).length;
      if (rows < opens) offenders.push(`${rel} — ${opens} ResourceCard, ${rows} con variant="row"`);
    }
  }

  it("hay componentes de fila que revisar", () => {
    expect(walk(join(ROOT, "components/domain")).length).toBeGreaterThan(5);
  });

  it("ningun ResourceCard de lista se queda sin variant row", () => {
    expect(offenders.join("\n")).toBe("");
  });
});
