import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/**
 * Toda cara declarada en `FONT_FAMILY` tiene que estar en el `useFonts` del layout raíz.
 *
 * Este fallo es silencioso y por eso merece un test: React Native no avisa cuando un
 * `fontFamily` apunta a una fuente que nadie cargó — simplemente cae a la del sistema. La app
 * sigue funcionando, nada peta, y el rediseño se ve a medias sin que ninguna herramienta lo
 * marque. Pasó de verdad al cambiar Outfit/Manrope por Archivo/IBM Plex Sans: tres estilos de
 * la pantalla de arranque seguían nombrando las fuentes viejas.
 *
 * También cubre el sentido contrario: cargar una cara que nadie usa retiene la pantalla de
 * carga descargando un archivo para nada.
 */
function readFile(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function declaredFamilies(): string[] {
  const theme = readFile("constants/theme.ts");
  const block = theme.slice(theme.indexOf("export const FONT_FAMILY"));
  const body = block.slice(0, block.indexOf("};"));
  return [...body.matchAll(/"([A-Za-z]+_\d{3}[A-Za-z]+)"/g)].map((m) => m[1]);
}

function loadedFaces(): string[] {
  const layout = readFile("app/_layout.tsx");
  const block = layout.slice(layout.indexOf("useFonts({"));
  const body = block.slice(0, block.indexOf("});"));
  return [...body.matchAll(/([A-Za-z]+_\d{3}[A-Za-z]+)/g)].map((m) => m[1]);
}

describe("las fuentes declaradas son las que de verdad se cargan", () => {
  const declared = declaredFamilies();
  const loaded = loadedFaces();

  it("FONT_FAMILY declara caras", () => {
    expect(declared.length).toBeGreaterThan(3);
  });

  it("ninguna cara de FONT_FAMILY se queda sin cargar", () => {
    expect(declared.filter((face) => !loaded.includes(face))).toEqual([]);
  });

  it("no se carga ninguna cara que nadie declare", () => {
    expect(loaded.filter((face) => !declared.includes(face))).toEqual([]);
  });

  it("no quedan restos de las fuentes anteriores", () => {
    for (const rel of ["constants/theme.ts", "app/_layout.tsx", "package.json"]) {
      expect(readFile(rel)).not.toMatch(/Outfit_\d|Manrope_\d|google-fonts\/(outfit|manrope)/);
    }
  });
});
