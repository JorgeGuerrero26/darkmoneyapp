/**
 * Bajo el prefijo ["workspace-snapshot"] cuelgan DOS entradas: el núcleo y la diferida
 * ({ budgets, obligations }). Un parche por prefijo tipado como WorkspaceSnapshot da por hecho que
 * toda entrada tiene `accounts`, `subscriptions`… y revienta sobre la diferida con
 * "Cannot read property 'map' of undefined".
 *
 * Pasó en cuatro sitios a la vez (archivar y borrar cuenta, fijar suscripción, fijar ingreso
 * fijo) — el reportado fue que no se podía desarchivar una cuenta. El guardia `isCoreSnapshot`
 * ya existía; esos cuatro no lo usaban. Este test impide el quinto.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname, "..", "services", "queries");

describe("parches por prefijo del snapshot", () => {
  it("ninguno asume que toda entrada es el núcleo", () => {
    const culpables = readdirSync(DIR)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) =>
        /setQueriesData<WorkspaceSnapshot>\(\s*\{\s*queryKey:\s*\["workspace-snapshot"\]\s*\}/.test(
          readFileSync(join(DIR, f), "utf8"),
        ),
      );
    expect(culpables).toEqual([]);
  });
});
