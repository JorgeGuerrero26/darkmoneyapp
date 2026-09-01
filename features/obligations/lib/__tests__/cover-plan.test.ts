import {
  coverPlan,
  describeCoverage,
  nextUncoveredPayment,
  type PaymentPlan,
} from "../payment-plan";

const START = "2026-03-15";

/** Un plan de cuotas iguales sin aumentos: apertura y deuda de hoy coinciden. */
function equalPlan(count: number, principal: number, payments: number[] = []) {
  const plan: PaymentPlan = { mode: "equal", count, firstDueDate: "2026-09-15" };
  return coverPlan({
    plan,
    openingPrincipal: principal,
    currentDebt: principal,
    startDate: START,
    payments: payments.map((amount, i) => ({ amount, date: `2026-09-${String(10 + i).padStart(2, "0")}` })),
  });
}

describe("coverPlan — la cascada", () => {
  it("un pago exacto cierra la primera cuota y deja la segunda intacta", () => {
    const rows = equalPlan(4, 800, [200]);
    expect(rows[0].status).toBe("covered");
    expect(rows[0].covered).toBe(200);
    expect(rows[1].status).toBe("pending");
    expect(rows[1].remaining).toBe(200);
  });

  it("DOS pagos del mismo mes cubren UNA cuota, no dos", () => {
    // El caso que lo destapó: 30 y 690 el mismo 31 de agosto.
    const rows = coverPlan({
      plan: { mode: "equal", count: 3, firstDueDate: "2026-09-15" },
      openingPrincipal: 1800,
      currentDebt: 1800,
      startDate: START,
      payments: [
        { amount: 30, date: "2026-08-31" },
        { amount: 690, date: "2026-08-31" },
      ],
    });
    // 720 sobre cuotas de 600: cierra la primera y deja 120 en la segunda.
    expect(rows[0].status).toBe("covered");
    expect(rows[1].status).toBe("partial");
    expect(rows[1].covered).toBe(120);
    expect(rows[1].remaining).toBe(480);
    expect(rows[2].status).toBe("pending");
  });

  it("un pago parcial deja la cuota a medias y no avanza", () => {
    const rows = equalPlan(4, 800, [100]);
    expect(rows[0].status).toBe("partial");
    expect(rows[0].covered).toBe(100);
    expect(rows[0].remaining).toBe(100);
    expect(nextUncoveredPayment(rows)?.seq).toBe(1);
  });

  it("el ejemplo del usuario: 100 y luego 150 sobre cuotas de 200", () => {
    const rows = equalPlan(4, 800, [100, 150]);
    expect(rows[0].status).toBe("covered");
    expect(rows[1].status).toBe("partial");
    expect(rows[1].covered).toBe(50);
    expect(rows[1].remaining).toBe(150);
  });

  it("dice con qué pago se cerró cada cuota", () => {
    const rows = equalPlan(4, 800, [100, 150]);
    // La primera se completó con el SEGUNDO pago, no con el primero.
    expect(rows[0].coveredAt).toBe("2026-09-11");
    expect(rows[1].coveredAt).toBeNull();
  });

  it("sin pagos, todo pendiente", () => {
    const rows = equalPlan(3, 900);
    expect(rows.every((row) => row.status === "pending")).toBe(true);
    expect(nextUncoveredPayment(rows)?.seq).toBe(1);
  });

  it("con todo pagado no queda ninguna abierta", () => {
    const rows = equalPlan(3, 900, [900]);
    expect(rows.every((row) => row.status === "covered")).toBe(true);
    expect(nextUncoveredPayment(rows)).toBeNull();
  });
});

describe("coverPlan — la deuda de hoy manda", () => {
  it("modo a medida: la cola crece con la deuda y lo acordado no se toca", () => {
    const plan: PaymentPlan = {
      mode: "custom",
      agreed: [{ amount: 500 }, { amount: 300 }],
      tail: 200,
      firstDueDate: "2026-09-15",
    };
    const chico = coverPlan({
      plan, openingPrincipal: 1000, currentDebt: 1000, startDate: START, payments: [],
    });
    const grande = coverPlan({
      plan, openingPrincipal: 1000, currentDebt: 2000, startDate: START, payments: [],
    });
    // Las dos acordadas, idénticas en los dos casos.
    expect(grande[0].amount).toBe(500);
    expect(grande[1].amount).toBe(300);
    // Y la cola absorbe el aumento con MÁS pagos, no con pagos más grandes.
    expect(grande.length).toBeGreaterThan(chico.length);
    expect(grande.slice(2, -1).every((row) => row.amount === 200)).toBe(true);
  });

  it("modo iguales: se mantiene el NÚMERO de cuotas y sube el monto", () => {
    const rows = coverPlan({
      plan: { mode: "equal", count: 6, firstDueDate: "2026-09-15" },
      openingPrincipal: 6000,
      currentDebt: 9000,
      startDate: START,
      payments: [],
    });
    expect(rows).toHaveLength(6);
    expect(rows[0].amount).toBe(1500);
  });

  it("opción B: lo ya cubierto se queda a su precio y solo se reparte lo que falta", () => {
    // 3 de 6 cuotas de 1.000 pagadas, y la deuda sube de 6.000 a 9.000.
    const rows = coverPlan({
      plan: { mode: "equal", count: 6, firstDueDate: "2026-09-15" },
      openingPrincipal: 6000,
      currentDebt: 9000,
      startDate: START,
      payments: [{ amount: 3000, date: "2026-09-15" }],
    });
    // Las tres pagadas siguen valiendo 1.000 y siguen cubiertas: el avance no retrocede.
    expect(rows.slice(0, 3).map((row) => row.amount)).toEqual([1000, 1000, 1000]);
    expect(rows.slice(0, 3).every((row) => row.status === "covered")).toBe(true);
    // Los 6.000 que faltan se reparten entre las tres restantes.
    expect(rows.slice(3).map((row) => row.amount)).toEqual([2000, 2000, 2000]);
    expect(nextUncoveredPayment(rows)?.seq).toBe(4);
  });
});

describe("describeCoverage — lo que va a pasar al guardar", () => {
  const rows = equalPlan(4, 800, [100]); // cuota 1 a 100 de 200

  it("un monto que no llega dice cuánto quedará pendiente", () => {
    expect(describeCoverage(rows, 80)).toEqual({ settles: 0, overflow: 0, shortfall: 20 });
  });

  it("un monto exacto cierra la cuota y no adelanta nada", () => {
    expect(describeCoverage(rows, 100)).toEqual({ settles: 1, overflow: 0, shortfall: 0 });
  });

  it("un monto de más cierra la cuota y adelanta el resto", () => {
    expect(describeCoverage(rows, 150)).toEqual({ settles: 1, overflow: 50, shortfall: 0 });
  });

  it("un monto grande puede cerrar varias cuotas de una", () => {
    // 500 = los 100 que le faltan a la primera + las dos siguientes enteras.
    expect(describeCoverage(rows, 500)).toEqual({ settles: 3, overflow: 0, shortfall: 0 });
  });

  it("sin monto no dice nada", () => {
    expect(describeCoverage(rows, 0)).toEqual({ settles: 0, overflow: 0, shortfall: 0 });
  });
});

describe("el caso real de 'Diversas Ventas de Productos'", () => {
  // Plan y pagos tal como están hoy en produccion (obligación 3).
  const plan: PaymentPlan = {
    mode: "custom",
    agreed: [
      { amount: 540, dueDate: "2026-09-15" },
      { amount: 610, dueDate: "2026-10-15" },
      { amount: 750, dueDate: "2026-11-15" },
      { amount: 610, dueDate: "2026-12-15" },
      { amount: 660, dueDate: "2027-01-15" },
      { amount: 540, dueDate: "2027-02-15" },
      { amount: 540, dueDate: "2027-03-15" },
    ],
    tail: 610,
    firstDueDate: "2026-09-15",
  };
  const payments = [
    { amount: 330, date: "2026-03-31" },
    { amount: 580, date: "2026-04-30" },
    { amount: 30, date: "2026-04-30" },
    { amount: 350, date: "2026-05-30" },
    { amount: 450, date: "2026-06-30" },
    { amount: 5, date: "2026-07-19" },
    { amount: 690, date: "2026-07-31" },
    { amount: 690, date: "2026-08-31" },
    { amount: 30, date: "2026-08-31" },
  ];

  it("con los 3.155 cobrados, la que toca es la quinta y le faltan 15", () => {
    const rows = coverPlan({
      plan,
      openingPrincipal: 7175,
      currentDebt: 25355,
      startDate: "2026-03-15",
      payments,
    });
    const next = nextUncoveredPayment(rows);
    // Acumulado de cuotas: 540 / 1.150 / 1.900 / 2.510 / 3.170. Los 3.155 caen en la quinta.
    expect(next?.seq).toBe(5);
    expect(next?.dueDate).toBe("2027-01-15");
    expect(next?.covered).toBe(645);
    expect(next?.remaining).toBe(15);
  });

  it("cuatro cubiertas, no nueve como decia el emparejamiento por orden", () => {
    const rows = coverPlan({
      plan,
      openingPrincipal: 7175,
      currentDebt: 25355,
      startDate: "2026-03-15",
      payments,
    });
    expect(rows.filter((row) => row.status === "covered")).toHaveLength(4);
  });

  it("el plan reparte la deuda entera, no solo la primera venta", () => {
    const rows = coverPlan({
      plan,
      openingPrincipal: 7175,
      currentDebt: 25355,
      startDate: "2026-03-15",
      payments,
    });
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    expect(Math.round(total)).toBe(25355);
  });
});
