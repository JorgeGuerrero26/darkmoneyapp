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

describe("calendario efectivo en la hoja del plan (deuda real)", () => {
  const { effectivePlanSchedule, planTotal } = require("../payment-plan");
  const plan = {
    mode: "custom" as const,
    tail: 610,
    firstDueDate: "2026-09-15",
    agreed: [580, 600, 750, 610, 660, 540, 540].map((amount, i) => ({ amount, dueDate: `${i < 4 ? 2026 : 2027}-${String(((8 + i) % 12) + 1).padStart(2, "0")}-15` })),
  };
  const payments = [
    { amount: 3155, date: "2026-08-20" }, // antes de que empezara el plan
    { amount: 580, date: "2026-10-01" },
  ];

  it("reparte la deuda de hoy menos lo cobrado antes del plan, no el monto de apertura", () => {
    const { payments: schedule, basis } = effectivePlanSchedule({ plan, context: { openingPrincipal: 7175, currentDebt: 25679, payments }, startDate: "2026-03-15" });
    expect(basis).toBe(22524);
    expect(planTotal(schedule)).toBe(22524);
    // Antes (solo apertura) terminaba en ago 2027; con la deuda real llega mucho más lejos.
    expect(schedule[schedule.length - 1].dueDate > "2027-08-15").toBe(true);
    // Las cuotas acordadas no se tocan.
    expect(schedule.slice(0, 7).map((p: { amount: number }) => p.amount)).toEqual([580, 600, 750, 610, 660, 540, 540]);
  });

  it("sin aumentos coincide con el calendario de siempre", () => {
    const { payments: schedule, basis } = effectivePlanSchedule({ plan, context: { openingPrincipal: 7175, currentDebt: 7175, payments: [] }, startDate: "2026-03-15" });
    expect(basis).toBe(7175);
    expect(planTotal(schedule)).toBe(7175);
  });
});

describe("día de cobro del plan", () => {
  const { applyPayDay, expandPaymentPlan: expand, normalizePaymentPlan: normalize, parsePaymentPlan: parse } = require("../payment-plan");
  const custom = {
    mode: "custom" as const,
    tail: 100,
    firstDueDate: "2026-10-15",
    agreed: [{ amount: 550, dueDate: "2026-10-15" }, { amount: 700, dueDate: "2026-11-15" }],
  };

  it("fin de mes: cada cuota cae en el último día de su mes, también en la cola", () => {
    const rows = expand({ plan: { ...custom, payDay: "last" }, principal: 1450, startDate: "2026-03-15" });
    expect(rows.map((r: { dueDate: string }) => r.dueDate)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"].slice(0, rows.length));
    expect(rows[0].dueDate).toBe("2026-10-31");
    expect(rows[1].dueDate).toBe("2026-11-30");
  });

  it("un día fijo que el mes no tiene cae en el último día del mes (31 en abril, 30 en febrero)", () => {
    expect(applyPayDay("2027-04-10", 31)).toBe("2027-04-30");
    expect(applyPayDay("2027-02-10", 30)).toBe("2027-02-28");
    expect(applyPayDay("2027-03-10", 5)).toBe("2027-03-05");
  });

  it("cuotas iguales también respetan el día", () => {
    const rows = expand({ plan: { mode: "equal", count: 3, firstDueDate: "2026-10-15", payDay: "last" }, principal: 300, startDate: "2026-03-15" });
    expect(rows.map((r: { dueDate: string }) => r.dueDate)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
  });

  it("sin día elegido todo sigue como antes (el día de la fecha de inicio)", () => {
    const rows = expand({ plan: custom, principal: 1450, startDate: "2026-03-15" });
    expect(rows[0].dueDate).toBe("2026-10-15");
    expect(rows[1].dueDate).toBe("2026-11-15");
  });

  it("el día se guarda y se lee de la base; uno inválido se descarta", () => {
    expect(normalize({ ...custom, payDay: "last" }).payDay).toBe("last");
    expect(parse({ ...custom, payDay: 20 }).payDay).toBe(20);
    expect(parse({ ...custom, payDay: 40 }).payDay).toBeUndefined();
    expect(parse({ ...custom, payDay: "otro" }).payDay).toBeUndefined();
    expect(parse(custom).payDay).toBeUndefined();
  });
});
