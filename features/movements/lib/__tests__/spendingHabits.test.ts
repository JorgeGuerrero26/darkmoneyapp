import { detectSpendingHabits, habitsForNow, type HabitMovement } from "../spendingHabits";

/** Un gasto en una fecha y hora de Lima (Lima = UTC-5, sin horario de verano). */
function gasto(
  description: string,
  amount: number,
  limaDate: string,
  limaHour: number,
  extra: Partial<HabitMovement> = {},
): HabitMovement {
  const utcHour = String(limaHour + 5).padStart(2, "0");
  return {
    description,
    occurred_at: `${limaDate}T${utcHour}:00:00.000Z`,
    source_amount: amount,
    category_id: 7,
    source_account_id: 2,
    movement_type: "expense",
    status: "posted",
    ...extra,
  };
}

const NOW = new Date("2026-09-08T16:30:00.000Z"); // martes 8 sep, 11:30 en Lima

/** Lunes a viernes de la semana del 31 ago al 4 sep de 2026. */
const DIAS_SEMANA = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
const FINDE = ["2026-09-05", "2026-09-06"];

describe("detectSpendingHabits", () => {
  it("el caso real: moto a S/ 2.00, solo entre semana", () => {
    const movimientos = DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 11));
    const [habit] = detectSpendingHabits(movimientos, NOW);
    expect(habit.label).toBe("Moto");
    expect(habit.amount).toBe(2);
    expect(habit.times).toBe(5);
    expect(habit.when).toBe("weekday");
    expect(habit.categoryId).toBe(7);
    expect(habit.accountId).toBe(2);
  });

  /** "Taxi" aparece a 7, 8, 8.50 y 9 soles: no se puede registrar de un toque. */
  it("montos distintos son habitos distintos, y ninguno llega solo", () => {
    const movimientos = [
      ...DIAS_SEMANA.slice(0, 3).map((d) => gasto("Taxi", 8, d, 14)),
      ...DIAS_SEMANA.slice(3).map((d) => gasto("Taxi", 9, d, 14)),
    ];
    expect(detectSpendingHabits(movimientos, NOW)).toHaveLength(0);
  });

  it("cinco veces el mismo dia no es un habito", () => {
    const movimientos = Array.from({ length: 6 }, () => gasto("Chicle", 1.5, "2026-09-03", 10));
    expect(detectSpendingHabits(movimientos, NOW)).toHaveLength(0);
  });

  it("lo que dejaste de hacer no se propone", () => {
    // Seis veces en junio y nada desde entonces: la vendomatica de los datos reales.
    const junio = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];
    const movimientos = junio.map((d) => gasto("Vendomática", 2, d, 14));
    expect(detectSpendingHabits(movimientos, NOW)).toHaveLength(0);
  });

  it("reparte entre semana y finde: no promete un dia", () => {
    const movimientos = [
      ...DIAS_SEMANA.slice(0, 3).map((d) => gasto("Pan", 3, d, 9)),
      ...FINDE.map((d) => gasto("Pan", 3, d, 9)),
      gasto("Pan", 3, "2026-08-30", 9),
    ];
    expect(detectSpendingHabits(movimientos, NOW)[0].when).toBe("any");
  });

  it("solo cuenta gastos: ni traspasos ni anulados", () => {
    const movimientos = [
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 11, { movement_type: "transfer" })),
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 11, { status: "voided" })),
    ];
    expect(detectSpendingHabits(movimientos, NOW)).toHaveLength(0);
  });

  it("usa el nombre tal como lo escribes, no el normalizado", () => {
    const movimientos = [
      ...DIAS_SEMANA.slice(0, 2).map((d) => gasto("moto", 2, d, 11)),
      ...DIAS_SEMANA.slice(2).map((d) => gasto("Moto", 2, d, 11)),
    ];
    expect(detectSpendingHabits(movimientos, NOW)[0].label).toBe("Moto");
  });
});

describe("habitsForNow", () => {
  const habitosMoto = detectSpendingHabits(DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 11)), NOW);

  it("un martes a las 11:30 propone la moto de las 11", () => {
    expect(habitsForNow(habitosMoto, NOW).map((h) => h.label)).toEqual(["Moto"]);
  });

  it("el mismo martes a las 20:00 no propone nada: fuera de su franja", () => {
    const noche = new Date("2026-09-09T01:00:00.000Z"); // 20:00 del martes en Lima
    expect(habitsForNow(habitosMoto, noche)).toHaveLength(0);
  });

  it("un domingo a las 11:30 tampoco: es habito de dia de semana", () => {
    const domingo = new Date("2026-09-06T16:30:00.000Z");
    expect(habitsForNow(habitosMoto, domingo)).toHaveLength(0);
  });

  it("uno sin patron de dia se propone si la hora encaja", () => {
    // El caso real: un taxi de S/ 8 tomado 25 veces, mitad entre semana y mitad en finde. Es
    // rutina, solo que no de lunes a viernes; descartarlo lo dejaba fuera para siempre.
    const cualquierDia = [
      ...DIAS_SEMANA.map((d) => gasto("Taxi", 8, d, 15)),
      gasto("Taxi", 8, "2026-09-05", 15),
      gasto("Taxi", 8, "2026-09-06", 15),
      gasto("Taxi", 8, "2026-08-30", 15),
    ];
    const habitos = detectSpendingHabits(cualquierDia, NOW);
    expect(habitos[0].when).toBe("any");
    const tarde = new Date("2026-09-08T20:00:00.000Z"); // 15:00 del martes en Lima
    expect(habitsForNow(habitos, tarde).map((h) => h.label)).toEqual(["Taxi"]);
  });

  it("y sigue sin proponerse fuera de su franja, que es el filtro que acota", () => {
    const cualquierDia = [
      ...DIAS_SEMANA.map((d) => gasto("Taxi", 8, d, 15)),
      gasto("Taxi", 8, "2026-09-05", 15),
      gasto("Taxi", 8, "2026-09-06", 15),
    ];
    const madrugada = new Date("2026-09-08T08:00:00.000Z"); // 03:00 del martes en Lima
    expect(habitsForNow(detectSpendingHabits(cualquierDia, NOW), madrugada)).toHaveLength(0);
  });

  it("ida y vuelta: la moto de las 6 y la de las 19 son DOS franjas", () => {
    /* El caso reportado el 2026-09-08. En los datos reales la moto de S/ 2 tiene 14 registros a
       las 6 y 11 a las 19; con una sola franja sobre la mediana (7 -> 5-9h), los once regresos
       quedaban fuera de su propia franja y a las 7 de la tarde no se proponia nada. */
    const idaYVuelta = [
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 6)),
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 6)),
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 19)),
    ];
    const [habito] = detectSpendingHabits(idaYVuelta, NOW);
    expect(habito.windows).toEqual([{ from: 4, to: 8 }, { from: 17, to: 21 }]);

    const tarde = new Date("2026-09-09T00:20:00.000Z"); // 19:20 del martes en Lima
    expect(habitsForNow([habito], tarde).map((h) => h.label)).toEqual(["Moto"]);
    const manana = new Date("2026-09-08T11:00:00.000Z"); // 06:00 del martes en Lima
    expect(habitsForNow([habito], manana).map((h) => h.label)).toEqual(["Moto"]);
  });

  it("una hora suelta no es un pico: sin pico claro se vuelve a la mediana", () => {
    // Repartido entre las 11 y las 13, sin ninguna hora que llegue al 20% con 3 registros.
    const disperso = [
      gasto("Café", 5, DIAS_SEMANA[0], 11),
      gasto("Café", 5, DIAS_SEMANA[1], 12),
      gasto("Café", 5, DIAS_SEMANA[2], 13),
      gasto("Café", 5, DIAS_SEMANA[3], 11),
      gasto("Café", 5, DIAS_SEMANA[4], 13),
    ];
    const [habito] = detectSpendingHabits(disperso, NOW);
    expect(habito.windows).toHaveLength(1);
  });

  it("como mucho dos franjas: tres ya es 'a cualquier hora'", () => {
    const tresPicos = [
      ...DIAS_SEMANA.map((d) => gasto("Agua", 2, d, 8)),
      ...DIAS_SEMANA.map((d) => gasto("Agua", 2, d, 14)),
      ...DIAS_SEMANA.map((d) => gasto("Agua", 2, d, 20)),
    ];
    expect(detectSpendingHabits(tresPicos, NOW)[0].windows).toHaveLength(2);
  });

  it("como mucho tres, para no llenar la pantalla", () => {
    const muchos = [
      ...DIAS_SEMANA.map((d) => gasto("Moto", 2, d, 11)),
      ...DIAS_SEMANA.map((d) => gasto("Chicle", 1.5, d, 11)),
      ...DIAS_SEMANA.map((d) => gasto("Café", 5, d, 11)),
      ...DIAS_SEMANA.map((d) => gasto("Agua", 2.5, d, 11)),
    ];
    expect(habitsForNow(detectSpendingHabits(muchos, NOW), NOW)).toHaveLength(3);
  });
});
