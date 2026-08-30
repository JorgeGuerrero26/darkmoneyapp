import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN = ["app", "components", "features", "lib", "hooks", "services", "constants"];

/**
 * Ningún valor de la paleta ANTERIOR puede seguir vivo en el código.
 *
 * Este test existe porque la auditoría que hice a mano falló dos veces, y de la misma forma
 * las dos: buscaba tinte **frío** (`azul > rojo`), así que dejó pasar los colores viejos que
 * son **cálidos** — el coral `#FF7D8D` y el dorado `#D7BE7B` de los gráficos sobrevivieron a
 * la limpieza y el dashboard avanzado siguió viéndose mal. Una heurística de temperatura no
 * sirve; hay que comparar contra la lista exacta.
 *
 * También cubre el blanco puro. Sobre grafito cálido `rgba(255,255,255,…)` deja un halo frío
 * en cada borde y cada velo, que es justo lo que hacía que la app siguiera leyéndose azulada
 * aunque sus fondos ya fueran cálidos. Va todo al hueso del texto.
 *
 * Excluidos a propósito: las paletas de IDENTIDAD (marcas de bancos, colores que el usuario
 * elige para cuentas y categorías) y la paleta clara de impresión del PDF. El azul del BCP es
 * del BCP y no es un token de tema.
 */
const OLD_HEX: Record<string, string> = {
  "6BE4C5": "menta — era acción, éxito, ingreso y foco a la vez",
  "8EA5FF": "lavanda — info y transferencia",
  D7BE7B: "dorado de advertencia",
  FF8F9E: "rosa suave — gasto",
  FF637D: "rosa fuerte — error",
  "5C8DFF": "chartIndigo",
  "49D7BE": "chartTeal",
  FF7D8D: "chartCoral",
  FFD15C: "chartGold",
  FF9DBA: "rosePink",
  "7F1020": "wineDeep",
  "4A5568": "textDisabled",
  A7B2C2: "fog",
  "96A2B5": "storm",
  F5F7FB: "ink",
  "05070B": "textInverse",
  "0B1020": "indigoBg",
  "9EB7FF": "skySoft",
  "4BC9A8": "primaryDark",
};

const IDENTITY = [
  "account-institutions",
  "ColorPicker",
  "account-types",
  "composition/",
  "CategoryForm",
  "obligationReport",
  "workspace-data",
];

function toHex(r: number, g: number, b: number): string {
  return [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

type Finding = { file: string; line: number; value: string; why: string };

function scan(): { old: Finding[]; white: Finding[] } {
  const old: Finding[] = [];
  const white: Finding[] = [];
  for (const dir of SCAN) {
    for (const full of walk(join(ROOT, dir))) {
      const rel = full.slice(ROOT.length + 1).split("\\").join("/");
      if (IDENTITY.some((i) => rel.includes(i))) continue;
      readFileSync(full, "utf8").split(/\r?\n/).forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        for (const m of line.matchAll(/#([0-9A-Fa-f]{6})/g)) {
          const key = m[1].toUpperCase();
          if (OLD_HEX[key]) old.push({ file: rel, line: i + 1, value: `#${key}`, why: OLD_HEX[key] });
        }
        for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          const key = toHex(r, g, b);
          if (OLD_HEX[key]) old.push({ file: rel, line: i + 1, value: m[0], why: OLD_HEX[key] });
          if (r === 255 && g === 255 && b === 255) {
            white.push({ file: rel, line: i + 1, value: m[0], why: "blanco puro" });
          }
        }
      });
    }
  }
  return { old, white };
}

const { old, white } = scan();
const show = (list: Finding[]) =>
  list.map((f) => `${f.file}:${f.line}  ${f.value}  (${f.why})`).join("\n");

describe("la paleta anterior no sobrevive en ningun sitio", () => {
  it("hay archivos que revisar", () => {
    expect(walk(join(ROOT, "features")).length).toBeGreaterThan(50);
  });

  it("ningun color de la paleta vieja sigue escrito a mano", () => {
    expect(show(old)).toBe("");
  });

  it("ningun blanco puro: sobre grafito calido deja halo frio", () => {
    expect(show(white)).toBe("");
  });
});
