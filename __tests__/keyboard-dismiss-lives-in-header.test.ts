import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cerrar el teclado se hace desde la cabecera de la hoja, en todos los formularios.
 *
 * Era una franja con "Listo" encima del teclado —la barra de accesorios de iOS— y tenía dos
 * problemas: solo existía en los teclados numéricos (los demás traen tecla de retorno), así que
 * el botón de cerrar cambiaba de sitio y hasta de existencia según el campo que tocaras; y era
 * una superficie más, con su propio color, metida entre el formulario y el teclado.
 *
 * Ahora es un chevrón hacia abajo junto a la ×, con el mismo tratamiento, mientras el teclado
 * esté abierto. Vive en las dos cabeceras que existen —`BottomSheet` e `InlineFormSheet`— y por
 * eso alcanza a todos los formularios: todos los campos numéricos de la app viven dentro de una
 * de las dos.
 */
const ROOT = join(__dirname, "..");

function leer(...partes: string[]): string {
  return readFileSync(join(ROOT, ...partes), "utf8");
}

describe("cerrar el teclado", () => {
  it("las dos cabeceras traen el chevron y lo cierran de verdad", () => {
    for (const archivo of ["BottomSheet.tsx", "InlineFormSheet.tsx"]) {
      const fuente = leer("components", "ui", archivo);
      expect([archivo, fuente.includes("ChevronDown")]).toEqual([archivo, true]);
      expect([archivo, fuente.includes("Keyboard.dismiss()")]).toEqual([archivo, true]);
      // Un botón que no hace nada cuando no hay teclado es peor que no tenerlo.
      expect([archivo, fuente.includes("keyboardHeight > 0")]).toEqual([archivo, true]);
    }
  });

  it("no vuelve la franja sobre el teclado", () => {
    expect(leer("components", "ui", "TextField.tsx")).not.toContain("InputAccessoryView");
  });
});
