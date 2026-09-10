import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Todo campo que el formulario sabe editar tiene que llegar al `update`.
 *
 * Estas mutaciones construyen el payload campo a campo, con un `if` por cada uno, así que añadir
 * uno nuevo al formulario y olvidar la línea del update no rompe nada: compila, guarda el resto y
 * el campo nuevo se pierde en silencio. Pasó con `recurrence` en la fase 36 —se añadió al insert
 * y no al update, así que la cadencia solo se podía fijar al crear— y el tipo de gasto por
 * defecto de una categoría tiene exactamente la misma forma.
 *
 * Se comprueba leyendo el código, no ejecutándolo: lo que falla es una línea que no existe, y una
 * línea que no existe no se puede probar llamando a la función.
 */
const CASES = [
  {
    nombre: "useUpdateBudgetMutation",
    archivo: ["services", "queries", "budgets.ts"],
    tipo: "export type BudgetFormInput = {",
    funcion: "export function useUpdateBudgetMutation",
  },
  {
    nombre: "useUpdateCategoryMutation",
    archivo: ["services", "queries", "categories-counterparties.ts"],
    tipo: "export type CategoryFormInput = {",
    funcion: "export function useUpdateCategoryMutation",
  },
] as const;

function leer(archivo: readonly string[]): string {
  return readFileSync(join(__dirname, "..", ...archivo), "utf8");
}

function cuerpo(source: string, funcion: string): string {
  const start = source.indexOf(funcion);
  const end = source.indexOf("export function", start + 10);
  return source.slice(start, end === -1 ? undefined : end);
}

function camposDelFormulario(source: string, tipo: string): string[] {
  const start = source.indexOf(tipo);
  const end = source.indexOf("};", start);
  return [...source.slice(start, end).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("los campos del formulario llegan al update", () => {
  it.each(CASES)("$nombre no pierde ninguno en silencio", ({ archivo, tipo, funcion }) => {
    const source = leer(archivo);
    const body = cuerpo(source, funcion);
    const olvidados = camposDelFormulario(source, tipo).filter(
      (field) => !body.includes(`input.${field}`),
    );
    expect(olvidados.join(", ")).toBe("");
  });

  it("la cadencia del presupuesto, que es la que se perdia", () => {
    const source = leer(CASES[0].archivo);
    expect(cuerpo(source, CASES[0].funcion)).toContain("payload.recurrence = input.recurrence");
  });

  it("y el tipo por defecto se puede QUITAR, no solo cambiar", () => {
    /* Con `?? null` el "ninguno" se perdería y la categoría se quedaría con el tipo viejo. */
    const source = leer(CASES[1].archivo);
    const body = cuerpo(source, CASES[1].funcion);
    expect(body).toContain("input.defaultSpendTypeId !== undefined");
    expect(body).toContain("payload.default_spend_type_id = input.defaultSpendTypeId");
  });
});
