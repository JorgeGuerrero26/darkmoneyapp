import {
  forgetLocallyRegistered,
  hideWhileResolving,
  stopHidingResolved,
  rememberLocallyRegistered,
  resetLocallyRegistered,
  stillLocalRegistrations,
  withoutLocallyRegistered,
} from "../locallyRegistered";

const item = (id: number) => ({ id });

describe("detecciones registradas en el teléfono que aún no llegan al servidor", () => {
  beforeEach(() => resetLocallyRegistered());

  it("se ocultan mientras su movimiento siga sin enviar, aunque el servidor todavía las liste", async () => {
    rememberLocallyRegistered(570, 1640);
    const checked = await stillLocalRegistrations(async (movementId) => movementId === 1640);
    expect(withoutLocallyRegistered([item(570), item(571)], checked).map((s) => s.id)).toEqual([571]);
    // y siguen ocultas en la siguiente lectura
    expect(withoutLocallyRegistered([item(570)], await stillLocalRegistrations(async () => true))).toEqual([]);
  });

  it("cuando el servidor ya la resolvió (no la lista) se olvida", async () => {
    rememberLocallyRegistered(570, 1640);
    expect(withoutLocallyRegistered([item(571)], await stillLocalRegistrations(async () => false)).map((s) => s.id)).toEqual([571]);
    // si por cualquier motivo vuelve a estar pendiente en el servidor, se muestra
    expect(withoutLocallyRegistered([item(570)], await stillLocalRegistrations(async () => false)).map((s) => s.id)).toEqual([570]);
  });

  it("si el movimiento ya salió y el servidor la sigue listando (envío rechazado), vuelve a mostrarse", async () => {
    rememberLocallyRegistered(570, 1640);
    const checked = await stillLocalRegistrations(async () => false);
    expect(withoutLocallyRegistered([item(570)], checked).map((s) => s.id)).toEqual([570]);
  });

  it("una registrada mientras se pedía la lista sigue oculta (no se compara con una comprobación anterior a ella)", async () => {
    const checked = await stillLocalRegistrations(async () => false); // nada registrado aún
    rememberLocallyRegistered(570, 1640); // se guarda durante la consulta
    expect(withoutLocallyRegistered([item(570)], checked)).toEqual([]);
  });

  it("Deshacer la devuelve a la lista", async () => {
    rememberLocallyRegistered(570, 1640);
    forgetLocallyRegistered(570);
    expect(withoutLocallyRegistered([item(570)], await stillLocalRegistrations(async () => true)).map((s) => s.id)).toEqual([570]);
  });

  it("un fallo al consultar la copia local no oculta nada de más", async () => {
    rememberLocallyRegistered(570, 1640);
    const checked = await stillLocalRegistrations(async () => { throw new Error("sin base"); });
    expect(withoutLocallyRegistered([item(570)], checked).map((s) => s.id)).toEqual([570]);
  });

  it("una omitida aquí se oculta mientras el servidor responde, y vuelve si hay que mostrarla", async () => {
    hideWhileResolving(571);
    expect(withoutLocallyRegistered([item(571), item(572)], await stillLocalRegistrations(async () => false)).map((s) => s.id)).toEqual([572]);
    stopHidingResolved(571);
    expect(withoutLocallyRegistered([item(571)], await stillLocalRegistrations(async () => false)).map((s) => s.id)).toEqual([571]);
  });
});
