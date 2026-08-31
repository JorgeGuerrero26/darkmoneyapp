import {
  addMonthsIso,
  defaultFirstDueDate,
  describePlan,
  expandPaymentPlan,
  isPlanComplete,
  normalizePaymentPlan,
  parsePaymentPlan,
  planDifference,
  planTotal,
  reconcilePlan,
  remainingFromPlan,
} from "../payment-plan";

const START = "2026-08-30";
const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

/**
 * El plan de pagos del mockup Z: S/ 1.000 con tres pagos acordados (100, 150, 300) y S/ 200
 * "de ahí en adelante". El plan completo son seis pagos, y **el último es S/ 50, no 200**: es el
 * saldo que queda. Ese es el número que un plan a medida suele calcular mal.
 */
describe("plan a medida", () => {
  const plan = { mode: "custom", agreed: [{ amount: 100 }, { amount: 150 }, { amount: 300 }], tail: 200 } as const;

  it("los acordados se escriben y el resto se calcula hasta terminar el saldo", () => {
    const payments = expandPaymentPlan({ plan, principal: 1000, startDate: START });
    expect(payments.map((payment) => payment.amount)).toEqual([100, 150, 300, 200, 200, 50]);
    expect(payments.map((payment) => payment.source)).toEqual([
      "agreed", "agreed", "agreed", "calculated", "calculated", "calculated",
    ]);
  });

  it("las fechas son mensuales, con el día de la fecha de inicio", () => {
    const payments = expandPaymentPlan({ plan, principal: 1000, startDate: START });
    expect(payments[0].dueDate).toBe("2026-09-30");
    expect(payments[1].dueDate).toBe("2026-10-30");
    expect(payments[5].dueDate).toBe("2027-02-28"); // febrero no tiene 30
  });

  it("la suma cuadra con el monto", () => {
    const payments = expandPaymentPlan({ plan, principal: 1000, startDate: START });
    expect(planTotal(payments)).toBe(1000);
    expect(planDifference(1000, payments)).toBe(0);
    expect(isPlanComplete(1000, payments)).toBe(true);
  });

  it("nunca programa de más: si lo acordado ya cubre el monto, la cola no genera nada", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "custom", agreed: [{ amount: 600 }, { amount: 400 }], tail: 200 },
      principal: 1000,
      startDate: START,
    });
    expect(payments).toHaveLength(2);
    expect(planTotal(payments)).toBe(1000);
  });

  it("sin cola, lo acordado puede no llegar al monto y el pie lo dice", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "custom", agreed: [{ amount: 100 }, { amount: 150 }, { amount: 300 }], tail: null },
      principal: 1000,
      startDate: START,
    });
    expect(payments).toHaveLength(3);
    // "Faltan S/ 450.00 por programar"
    expect(planDifference(1000, payments)).toBe(450);
    expect(isPlanComplete(1000, payments)).toBe(false);
  });

  it("lo acordado de más deja diferencia negativa: sobra", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "custom", agreed: [{ amount: 700 }, { amount: 500 }], tail: null },
      principal: 1000,
      startDate: START,
    });
    expect(planDifference(1000, payments)).toBe(-200);
    expect(isPlanComplete(1000, payments)).toBe(false);
  });

  it("una cola diminuta no cuelga la pantalla", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "custom", agreed: [], tail: 0.01 },
      principal: 1000,
      startDate: START,
    });
    expect(payments.length).toBeLessThanOrEqual(600);
  });
});

/**
 * La cuota se calcula, no se escribe: sale de dividir el monto. Y el reparto no puede perder ni
 * ganar céntimos — 1.000 entre 3 son 333.33, 333.33 y 333.34.
 */
describe("cuotas iguales", () => {
  it("divide el monto y ajusta la última al saldo", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "equal", count: 6 },
      principal: 1000,
      startDate: START,
    });
    // La cuota es la del mockup —1.000 ÷ 6 = 166,67— y el último pago absorbe la diferencia.
    expect(payments.map((p) => p.amount)).toEqual([166.67, 166.67, 166.67, 166.67, 166.67, 166.65]);
    expect(planTotal(payments)).toBe(1000);
  });

  it("no pierde céntimos en una división que no es exacta", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "equal", count: 3 },
      principal: 1000,
      startDate: START,
    });
    expect(planTotal(payments)).toBe(1000);
    expect(payments[2].amount).toBe(333.34);
  });

  it("un monto en cero no programa nada", () => {
    expect(expandPaymentPlan({ plan: { mode: "equal", count: 6 }, principal: 0, startDate: START })).toEqual([]);
  });
});

describe("resumen para la fila que abre el plan", () => {
  it("describe las cuotas iguales con su cuota", () => {
    expect(describePlan({
      plan: { mode: "equal", count: 6 },
      principal: 1000,
      startDate: START,
      formatAmount: money,
    })).toBe("6 cuotas iguales de S/ 166.67");
  });

  it("describe el plan a medida por su cantidad de pagos", () => {
    expect(describePlan({
      plan: { mode: "custom", agreed: [{ amount: 100 }, { amount: 150 }, { amount: 300 }], tail: 200 },
      principal: 1000,
      startDate: START,
      formatAmount: money,
    })).toBe("A medida · 6 pagos");
  });

  it("sin plan no hay resumen", () => {
    expect(describePlan({ plan: null, principal: 1000, startDate: START, formatAmount: money })).toBeNull();
  });
});

/**
 * De dónde salen los meses (2026-08-31).
 *
 * El usuario abrió el plan de una deuda de marzo en agosto y la lista arrancaba en abril: cuatro
 * meses ya vencidos, sin año, y sin forma de moverlos.
 */
describe("los meses del plan", () => {
  it("un plan nuevo empieza en el mes actual, con el día de la fecha de inicio", () => {
    expect(defaultFirstDueDate("2026-03-15", new Date(2026, 7, 31))).toBe("2026-08-15");
  });

  it("si la obligación empieza después, manda su fecha: no se cobra antes de prestar", () => {
    expect(defaultFirstDueDate("2026-11-05", new Date(2026, 7, 31))).toBe("2026-11-05");
  });

  it("los pagos salen del primer pago del plan, uno por mes", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "equal", count: 3, firstDueDate: "2026-08-15" },
      principal: 300,
      startDate: "2026-03-15",
    });
    expect(payments.map((payment) => payment.dueDate)).toEqual([
      "2026-08-15", "2026-09-15", "2026-10-15",
    ]);
  });

  it("un plan guardado antes de esto conserva sus fechas", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "equal", count: 2 },
      principal: 200,
      startDate: "2026-03-15",
    });
    expect(payments.map((payment) => payment.dueDate)).toEqual(["2026-04-15", "2026-05-15"]);
  });

  it("un pago acordado puede llevar su propio mes, y la cola sigue desde ahí", () => {
    const payments = expandPaymentPlan({
      plan: {
        mode: "custom",
        agreed: [{ amount: 100, dueDate: "2026-09-15" }, { amount: 100, dueDate: "2026-12-15" }],
        tail: 100,
        firstDueDate: "2026-09-15",
      },
      principal: 400,
      startDate: "2026-03-15",
    });
    expect(payments.map((payment) => payment.dueDate)).toEqual([
      "2026-09-15", "2026-12-15", "2027-01-15", "2027-02-15",
    ]);
  });

  it("un pago nunca cae antes que el anterior: marzo detrás de abril se corre a mayo", () => {
    const payments = expandPaymentPlan({
      plan: {
        mode: "custom",
        agreed: [{ amount: 100, dueDate: "2026-04-15" }, { amount: 100, dueDate: "2026-03-15" }],
        tail: null,
        firstDueDate: "2026-04-15",
      },
      principal: 200,
      startDate: "2026-03-15",
    });
    expect(payments.map((payment) => payment.dueDate)).toEqual(["2026-04-15", "2026-05-15"]);
  });

  it("el mes siguiente es el mes siguiente, y el día se conserva", () => {
    expect(addMonthsIso("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonthsIso("2026-12-15", 2)).toBe("2027-02-15");
  });
});

describe("guardado y lectura", () => {
  it("descarta un plan que no dice nada", () => {
    expect(normalizePaymentPlan({ mode: "equal", count: 0 })).toBeNull();
    expect(normalizePaymentPlan({ mode: "custom", agreed: [], tail: null })).toBeNull();
    expect(normalizePaymentPlan(null)).toBeNull();
  });

  it("limpia los montos vacíos de lo acordado", () => {
    expect(normalizePaymentPlan({ mode: "custom", agreed: [{ amount: 100 }, { amount: 0 }, { amount: 150 }], tail: 0 })).toEqual({
      mode: "custom",
      agreed: [{ amount: 100 }, { amount: 150 }],
      tail: null,
    });
  });

  it("no confía en lo que viene de la base", () => {
    expect(parsePaymentPlan(null)).toBeNull();
    expect(parsePaymentPlan("6 cuotas")).toBeNull();
    expect(parsePaymentPlan({ mode: "otra cosa" })).toBeNull();
    expect(parsePaymentPlan({ mode: "equal", count: "6" })).toEqual({ mode: "equal", count: 6 });
    expect(parsePaymentPlan({ mode: "custom", agreed: [100, "150", null], tail: 200 })).toEqual({
      mode: "custom",
      agreed: [{ amount: 100 }, { amount: 150 }],
      tail: 200,
    });
  });

  it("guarda y devuelve el mes de cada pago, y descarta una fecha que no lo es", () => {
    expect(parsePaymentPlan({
      mode: "custom",
      agreed: [{ amount: 100, dueDate: "2026-09-15" }, { amount: 50, dueDate: "el jueves" }],
      tail: null,
      firstDueDate: "2026-09-15",
    })).toEqual({
      mode: "custom",
      agreed: [{ amount: 100, dueDate: "2026-09-15" }, { amount: 50 }],
      tail: null,
      firstDueDate: "2026-09-15",
    });
  });
});

/**
 * El caso del mockup AB: sobre el plan de 100 / 150 / 300 y 200 de ahí en adelante, en noviembre
 * pagaron 320 en vez de 300. El plan queda FIJO —diciembre y enero siguen en 200, que es lo que
 * se pactó con otra persona— y los S/ 20 de más bajan a febrero, que era la cuota calculada y ya
 * existía para absorber el saldo: pasa de 50.00 a 30.00.
 */
describe("el plan contra lo pagado", () => {
  const plan = { mode: "custom", agreed: [{ amount: 100 }, { amount: 150 }, { amount: 300 }], tail: 200 } as const;
  const pagos = [
    { amount: 100, date: "2026-09-02" },
    { amount: 150, date: "2026-10-03" },
    { amount: 320, date: "2026-11-01" },
  ];

  it("cada fila lleva lo acordado y lo pagado", () => {
    const rows = reconcilePlan({ plan, principal: 1000, startDate: START, payments: pagos });
    expect(rows.slice(0, 3).map((row) => [row.amount, row.paid])).toEqual([
      [100, 100], [150, 150], [300, 320],
    ]);
    expect(rows[2].deviation).toBe(20);
    expect(rows[0].deviation).toBeNull();
  });

  it("el excedente cae en la cuota calculada, no en las acordadas", () => {
    const rows = reconcilePlan({ plan, principal: 1000, startDate: START, payments: pagos });
    expect(rows[3].amount).toBe(200); // diciembre, acordado por la cola: no se toca
    expect(rows[4].amount).toBe(200); // enero
    expect(rows[5].amount).toBe(30);  // febrero: 50 - 20
    expect(rows[5].adjustedFrom).toBe(50);
  });

  it("si paga de menos, el faltante sube a la cuota final", () => {
    const rows = reconcilePlan({
      plan,
      principal: 1000,
      startDate: START,
      payments: [{ amount: 100, date: "2026-09-02" }, { amount: 120, date: "2026-10-03" }],
    });
    expect(rows[1].deviation).toBe(-30);
    expect(rows[5].amount).toBe(80); // 50 + 30
    expect(rows[5].adjustedFrom).toBe(50);
  });

  it("sin desviación no se toca nada", () => {
    const rows = reconcilePlan({
      plan,
      principal: 1000,
      startDate: START,
      payments: [{ amount: 100, date: "2026-09-02" }],
    });
    expect(rows.every((row) => row.adjustedFrom === null)).toBe(true);
    expect(rows[5].amount).toBe(50);
  });

  it("cuando todo es acordado no hay dónde absorber: el plan no se reescribe", () => {
    const rows = reconcilePlan({
      plan: { mode: "custom", agreed: [{ amount: 400 }, { amount: 600 }], tail: null },
      principal: 1000,
      startDate: START,
      payments: [{ amount: 450, date: "2026-09-02" }],
    });
    expect(rows[0].deviation).toBe(50);
    expect(rows[1].amount).toBe(600);
    expect(rows.every((row) => row.adjustedFrom === null)).toBe(true);
  });

  it("lo que falta es la suma de lo que no se ha pagado", () => {
    const rows = reconcilePlan({ plan, principal: 1000, startDate: START, payments: pagos });
    // 200 + 200 + 30
    expect(remainingFromPlan(rows)).toBe(430);
  });
});
