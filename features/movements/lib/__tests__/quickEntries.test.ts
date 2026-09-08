import { buildQuickEntries, buildQuickRow } from "../quickEntries";
import type { SpendingHabit } from "../spendingHabits";

const plantilla = (over: Partial<Parameters<typeof buildQuickEntries>[0][number]> = {}) => ({
  id: 1,
  name: "Almuerzo",
  movementType: "expense" as const,
  sourceAccountId: 2,
  destinationAccountId: null,
  sourceAmount: 12,
  destinationAmount: null,
  categoryId: 5,
  counterpartyId: null,
  description: "Almuerzo",
  notes: null,
  ...over,
});

const habito = (over: Partial<SpendingHabit> = {}): SpendingHabit => ({
  key: "moto|2.00",
  label: "Moto",
  amount: 2,
  categoryId: 7,
  accountId: 2,
  times: 27,
  distinctDays: 17,
  fromHour: 5,
  toHour: 9,
  when: "weekday",
  daysSinceLast: 2,
  ...over,
});

describe("buildQuickEntries", () => {
  it("lo que fijaste va primero: es una decision tuya, no una deduccion", () => {
    const entries = buildQuickEntries([plantilla()], [habito()]);
    expect(entries.map((e) => e.label)).toEqual(["Almuerzo", "Moto"]);
    expect(entries[0].origin).toBe("pinned");
    expect(entries[1].origin).toBe("habit");
  });

  it("no se duplica: si fijaste lo mismo que la app detecta, se ve una vez", () => {
    const entries = buildQuickEntries(
      [plantilla({ id: 9, name: "Moto al trabajo", description: "Moto", sourceAmount: 2 })],
      [habito()],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Moto al trabajo"); // gana el nombre que tu pusiste
  });

  it("mismo concepto pero otro monto SI son dos atajos distintos", () => {
    const entries = buildQuickEntries(
      [plantilla({ id: 9, name: "Moto larga", description: "Moto", sourceAmount: 4 })],
      [habito()],
    );
    expect(entries).toHaveLength(2);
  });

  it("una plantilla sin monto no es un atajo: abriria el formulario", () => {
    expect(buildQuickEntries([plantilla({ sourceAmount: null })], [])).toHaveLength(0);
  });

  it("un ingreso fijado usa su cuenta de destino, no la de origen", () => {
    const [entry] = buildQuickEntries(
      [plantilla({
        movementType: "income",
        sourceAmount: null,
        destinationAmount: 500,
        sourceAccountId: null,
        destinationAccountId: 6,
      })],
      [],
    );
    expect(entry.amount).toBe(500);
    expect(entry.movementType).toBe("income");
    expect(entry.destinationAccountId).toBe(6);
  });

  it("sin nada que mostrar devuelve vacio, no una fila con titulo suelto", () => {
    expect(buildQuickEntries([], [])).toEqual([]);
  });
});

describe("buildQuickRow", () => {
  const entrada = (n: number): Parameters<typeof buildQuickRow>[0][number] => ({
    key: `k${n}`,
    label: `Gasto ${n}`,
    amount: n,
    movementType: "expense",
    sourceAccountId: 2,
    destinationAccountId: null,
    categoryId: 7,
    counterpartyId: null,
    notes: null,
    origin: "habit",
  });

  it("con tres justos se pintan los tres, sin puerta al resto", () => {
    const tres = [entrada(1), entrada(2), entrada(3)];
    expect(buildQuickRow(tres, tres)).toEqual({ tiles: tres, showAll: false });
  });

  it("con mas de los que caben, el tercer sitio es la puerta al resto", () => {
    const pool = [entrada(1), entrada(2), entrada(3), entrada(4), entrada(5)];
    const row = buildQuickRow(pool.slice(0, 3), pool);
    expect(row.tiles.map((t) => t.key)).toEqual(["k1", "k2"]);
    expect(row.showAll).toBe(true);
  });

  it("dos que encajan ahora y mas en el resto: se llena con la puerta", () => {
    const pool = [entrada(1), entrada(2), entrada(3), entrada(4)];
    const row = buildQuickRow(pool.slice(0, 2), pool);
    expect(row.tiles).toHaveLength(2);
    expect(row.showAll).toBe(true);
  });

  it("dos y nada mas no llena la fila: no se pinta", () => {
    const dos = [entrada(1), entrada(2)];
    expect(buildQuickRow(dos, dos)).toEqual({ tiles: [], showAll: false });
  });

  it("uno solo tampoco: una seccion con un dato anuncia su falta de datos", () => {
    const uno = [entrada(1)];
    expect(buildQuickRow(uno, uno)).toEqual({ tiles: [], showAll: false });
  });

  it("sin nada, vacia", () => {
    expect(buildQuickRow([], [])).toEqual({ tiles: [], showAll: false });
  });
});
