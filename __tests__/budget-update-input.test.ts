import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Todo campo que el formulario sabe editar tiene que llegar al `update`.
 *
 * `useUpdateBudgetMutation` construye el payload campo a campo con un `if` por cada uno, así que
 * añadir uno nuevo al formulario y olvidar la línea del update no rompe nada: compila, guarda el
 * resto y el campo nuevo se pierde en silencio. Pasó con `recurrence` en la fase 36 — se añadió
 * al insert y no al update, así que la cadencia solo se podía fijar al crear.
 */
const source = readFileSync(join(__dirname, "..", "services", "queries", "budgets.ts"), "utf8");

function updateBody(): string {
  const start = source.indexOf("export function useUpdateBudgetMutation");
  const end = source.indexOf("export function", start + 10);
  return source.slice(start, end === -1 ? undefined : end);
}

function formInputFields(): string[] {
  const start = source.indexOf("export type BudgetFormInput = {");
  const end = source.indexOf("};", start);
  return [...source.slice(start, end).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("useUpdateBudgetMutation", () => {
  it("mapea todos los campos del formulario, ninguno se pierde en silencio", () => {
    const body = updateBody();
    const olvidados = formInputFields().filter((field) => !body.includes(`input.${field}`));
    expect(olvidados.join(", ")).toBe("");
  });

  it("y la cadencia en particular, que es la que se perdia", () => {
    expect(updateBody()).toContain("payload.recurrence = input.recurrence");
  });
});
