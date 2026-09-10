import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Una hoja `InlineFormSheet` se pinta en la ranura `overlay` del sheet, nunca dentro de su scroll.
 *
 * `InlineFormSheet` se posiciona en absoluto para cubrir la pantalla. Metida entre los hijos del
 * `ScrollView` de un formulario, ese "absoluto" pasa a ser relativo al **contenido desplazado**:
 * la hoja se ancla a la altura donde quedo escrita, viaja con el scroll y deja asomando las filas
 * del formulario por debajo. Reportado el 2026-09-10 en "Dividir en categorias": se abria a media
 * altura, con "Fecha y hora" visible debajo de su propio boton de guardar, y no se podia
 * desplazar hasta su cabecera para escribir el primer monto.
 *
 * No lo ve el compilador ni un test de render: compila, se monta y hasta funciona si el contenido
 * es corto — `DateTimeSheet` llevaba en el mismo sitio sin que nadie lo notara. Por eso se lee el
 * codigo.
 */
const ROOT = join(__dirname, "..");
const CARPETAS = ["app", "components", "features"];

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === "__tests__") continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

const TSX = CARPETAS.flatMap((carpeta) => archivosTsx(join(ROOT, carpeta)));

/** Los componentes cuyo cuerpo ES una hoja inline: los que hay que pintar en `overlay`. */
function componentesHoja(): string[] {
  const nombres = new Set<string>(["InlineFormSheet"]);
  for (const ruta of TSX) {
    const fuente = readFileSync(ruta, "utf8");
    if (!fuente.includes("<InlineFormSheet")) continue;
    /* Un formulario que ABRE hojas inline no es una hoja inline: se presenta como sheet propio y
       ya trae su capa. Lo distingue tener un `BottomSheet`/`FormSheetScaffold` dentro. */
    if (fuente.includes("<BottomSheet") || fuente.includes("<FormSheetScaffold")) continue;
    const nombre = ruta.split(/[\\/]/).pop()!.replace(".tsx", "");
    if (fuente.includes(`export function ${nombre}`) || fuente.includes(`export const ${nombre}`)) {
      nombres.add(nombre);
    }
  }
  return [...nombres];
}

/** El bloque `overlay={...}` de un archivo, con sus llaves balanceadas. */
function bloquesOverlay(fuente: string): string {
  let salida = "";
  let desde = 0;
  while (true) {
    const inicio = fuente.indexOf("overlay={", desde);
    if (inicio === -1) break;
    let nivel = 0;
    let i = inicio + "overlay=".length;
    for (; i < fuente.length; i++) {
      if (fuente[i] === "{") nivel++;
      else if (fuente[i] === "}") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    salida += fuente.slice(inicio, i + 1);
    desde = i + 1;
  }
  return salida;
}

describe("las hojas inline se pintan en la capa, no en el scroll", () => {
  it("hay hojas que vigilar", () => {
    expect(componentesHoja().length).toBeGreaterThan(3);
  });

  it("ningun formulario las renderiza fuera de su overlay", () => {
    const hojas = componentesHoja();
    const culpables: string[] = [];

    for (const ruta of TSX) {
      const fuente = readFileSync(ruta, "utf8");
      const propio = ruta.split(/[\\/]/).pop()!.replace(".tsx", "");
      const overlay = bloquesOverlay(fuente);
      for (const hoja of hojas) {
        // Su propia definicion no cuenta, y una hoja dentro de otra hoja tampoco: esa ya vive
        // en una capa (PaymentPlanSheet abre PaymentMonthSheet, por ejemplo).
        if (hoja === propio || fuente.includes("<InlineFormSheet")) continue;
        const usos = fuente.split(`<${hoja}`).length - 1;
        const enOverlay = overlay.split(`<${hoja}`).length - 1;
        if (usos > enOverlay) {
          culpables.push(`${ruta.slice(ROOT.length + 1)} -> ${hoja}`);
        }
      }
    }

    expect(culpables.join("\n")).toBe("");
  });
});

/**
 * Y lo mismo un nivel mas adentro: los selectores y dialogos `inline` que se abren DESDE una hoja
 * inline tienen que ir en su ranura `overlay`, no entre sus hijos.
 *
 * Escritos como hijos van a parar dentro del `ScrollView` de la hoja, y ahi su `position:
 * absolute` deja de referirse a la pantalla para referirse al contenido desplazado. Funciona
 * mientras el contenido quepa —por eso paso desapercibido en "Dividir en categorias" hasta que la
 * hoja crecio con la fila del tipo de gasto— y deja de funcionar justo cuando la hoja se llena.
 */
const CAPAS = ["ConfirmDialog", "SearchableSelectSheet", "CurrencySelectOverlay"];

describe("las capas inline de una hoja inline", () => {
  it("van en su overlay, no entre sus hijos", () => {
    const culpables: string[] = [];
    for (const ruta of TSX) {
      const fuente = readFileSync(ruta, "utf8");
      if (!fuente.includes("<InlineFormSheet")) continue;
      const overlay = bloquesOverlay(fuente);
      for (const capa of CAPAS) {
        const usos = fuente.split(`<${capa}`).length - 1;
        const enOverlay = overlay.split(`<${capa}`).length - 1;
        if (usos > enOverlay) culpables.push(`${ruta.slice(ROOT.length + 1)} -> ${capa}`);
      }
    }
    expect(culpables.join(" | ")).toBe("");
  });
});
