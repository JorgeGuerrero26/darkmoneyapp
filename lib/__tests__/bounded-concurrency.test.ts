/**
 * El tope de concurrencia de la revalidación tras recuperar sesión. Ver runBounded: las ráfagas
 * de fallo medidas en app_error_logs llegaban de 3 a 12 en el mismo segundo.
 */
import { runBounded } from "../bounded-concurrency";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("runBounded", () => {
  it("nunca deja más de `limit` tareas en vuelo", async () => {
    let enVuelo = 0;
    let punta = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      enVuelo += 1;
      punta = Math.max(punta, enVuelo);
      await Promise.resolve();
      enVuelo -= 1;
    });

    await runBounded(tasks, 4);

    expect(punta).toBe(4);
    expect(enVuelo).toBe(0);
  });

  it("las ejecuta todas", async () => {
    const hechas: number[] = [];
    const tasks = Array.from({ length: 7 }, (_, i) => async () => {
      hechas.push(i);
    });

    await runBounded(tasks, 3);

    expect(hechas.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  /** Una revalidación que falla no puede llevarse por delante a las otras once. */
  it("una tarea que falla no aborta al resto", async () => {
    const hechas: number[] = [];
    const tasks = [
      async () => {
        throw new Error("boom");
      },
      async () => {
        hechas.push(1);
      },
      async () => {
        hechas.push(2);
      },
    ];

    await expect(runBounded(tasks, 2)).resolves.toBeUndefined();
    expect(hechas).toEqual([1, 2]);
  });

  /**
   * Arranca la siguiente en cuanto una termina, no por tandas: si fuera por tandas, una tarea
   * lenta dejaría a sus tres compañeras de hueco esperando sin hacer nada.
   */
  it("no espera a que termine la tanda para arrancar la siguiente", async () => {
    const lenta = deferred();
    let arrancadas = 0;
    const tasks = [
      async () => {
        arrancadas += 1;
        await lenta.promise;
      },
      ...Array.from({ length: 4 }, () => async () => {
        arrancadas += 1;
      }),
    ];

    const corriendo = runBounded(tasks, 2);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // La lenta sigue bloqueada, pero el otro carril ya despachó a las cuatro rápidas.
    expect(arrancadas).toBe(5);

    lenta.resolve();
    await corriendo;
  });

  it("un tope mayor que el número de tareas no rompe nada", async () => {
    const hechas: number[] = [];
    await runBounded([async () => void hechas.push(1)], 10);
    expect(hechas).toEqual([1]);
    await expect(runBounded([], 4)).resolves.toBeUndefined();
  });
});
