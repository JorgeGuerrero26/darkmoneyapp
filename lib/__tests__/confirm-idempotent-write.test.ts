/**
 * Regresión del 2026-08-26 19:37.
 *
 * El cliente abortó el INSERT del movimiento "Moto" a los 12 s; el servidor —que nunca se
 * entera de un abort— lo confirmó igualmente, y la fila quedó en la base. La confirmación se
 * cortaba en cuanto un SELECT limpio devolvía "sin fila", así que el usuario recibió "No
 * pudimos confirmar si se guardó" sobre un registro que sí existía.
 */
import { IDEMPOTENT_CONFIRM_BACKOFF_MS, confirmIdempotentWrite } from "../idempotency";

const ABORT = { code: "", message: "AbortError: Aborted", details: "", hint: "" };
const RLS = { code: "42501", message: "permission denied for table movements", details: "", hint: "" };

const noSleep = async () => {};

describe("confirmIdempotentWrite", () => {
  it("sigue esperando cuando el SELECT responde limpio pero aun sin fila", async () => {
    const row = { id: 7 };
    let calls = 0;
    // El servidor commitea recien en el tercer intento: es el caso real.
    const lookup = async () => {
      calls += 1;
      return calls < 3 ? { data: null, error: null } : { data: row, error: null };
    };

    await expect(confirmIdempotentWrite(lookup, { sleep: noSleep })).resolves.toBe(row);
    expect(calls).toBe(3);
  });

  it("insiste tambien cuando el propio SELECT se aborta", async () => {
    const row = { id: 8 };
    let calls = 0;
    const lookup = async () => {
      calls += 1;
      return calls < 2 ? { data: null, error: ABORT } : { data: row, error: null };
    };

    await expect(confirmIdempotentWrite(lookup, { sleep: noSleep })).resolves.toBe(row);
  });

  it("se rinde si la fila nunca aparece, sin exceder el calendario", async () => {
    let calls = 0;
    const lookup = async () => {
      calls += 1;
      return { data: null, error: null };
    };

    await expect(confirmIdempotentWrite(lookup, { sleep: noSleep })).resolves.toBeNull();
    expect(calls).toBe(IDEMPOTENT_CONFIRM_BACKOFF_MS.length);
  });

  it("corta de inmediato si el SELECT falla por RLS: repetirlo no cambia nada", async () => {
    let calls = 0;
    const lookup = async () => {
      calls += 1;
      return { data: null, error: RLS };
    };

    await expect(confirmIdempotentWrite(lookup, { sleep: noSleep })).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it("espera de forma creciente y no bloquea en el primer intento", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await confirmIdempotentWrite(async () => ({ data: null, error: null }), { sleep });
    expect(waits).toEqual(IDEMPOTENT_CONFIRM_BACKOFF_MS.filter((ms) => ms > 0));
    expect(IDEMPOTENT_CONFIRM_BACKOFF_MS[0]).toBe(0);
  });
});
