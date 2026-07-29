import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Si un parámetro forma parte de la `queryKey`, `enabled` tiene que exigirlo.
 *
 * De ese desajuste salió el arranque de 15 s: `dashboard-movements` y `dashboard-analytics`
 * llevaban `userScopeKey` en la clave pero su `enabled` solo miraba `workspaceId`. En la ventana
 * del arranque —workspace ya restaurado de AsyncStorage, `profile.id` todavía undefined— la
 * query se ejecutaba con la clave `["...", null, wsId]`; al llegar el id la clave cambiaba y
 * arrancaba OTRA query desde cero, duplicando el trabajo en el peor momento, y la huérfana
 * quedaba fetching sin datos reteniendo el overlay de arranque hasta su válvula de 15 s.
 *
 * Registrado 6 veces en app_error_logs, siempre con esas dos queries en pending.
 */
const SOURCE = join(__dirname, "..", "services", "queries", "workspace-data.ts");

describe("consistencia entre queryKey y enabled", () => {
  const source = readFileSync(SOURCE, "utf8");

  it("ninguna query mete userScopeKey en la clave sin exigirlo en enabled", () => {
    // Cada bloque useQuery({...}) del archivo, partido por su queryKey.
    const blocks = source.split(/queryKey:\s*\[/).slice(1);
    const offenders: string[] = [];

    for (const block of blocks) {
      const keyLine = block.slice(0, block.indexOf("]"));
      if (!keyLine.includes("userScopeKey")) continue;

      const rootKey = keyLine.match(/^\s*"([^"]+)"/)?.[1] ?? "(desconocida)";
      // El `enabled` de esta query: el primero que aparece antes de la siguiente queryKey.
      const enabled = block.match(/enabled:\s*([^\n]+)/)?.[1] ?? "";
      if (!enabled.includes("userScopeKey")) offenders.push(rootKey);
    }

    expect(offenders).toEqual([]);
  });

  it("el test detecta el defecto que arregló (guarda contra un falso verde)", () => {
    const roto = `
      queryKey: ["dashboard-movements", userScopeKey ?? null, workspaceId],
      enabled: Boolean(workspaceId),
    `;
    const bloque = roto.split(/queryKey:\s*\[/)[1];
    const keyLine = bloque.slice(0, bloque.indexOf("]"));
    const enabled = bloque.match(/enabled:\s*([^\n]+)/)?.[1] ?? "";

    expect(keyLine.includes("userScopeKey")).toBe(true);
    expect(enabled.includes("userScopeKey")).toBe(false); // <- lo que el test caza
  });
});
