import {
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
  const plan = { mode: "custom", agreed: [100, 150, 300], tail: 200 } as const;

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
      plan: { mode: "custom", agreed: [600, 400], tail: 200 },
      principal: 1000,
      startDate: START,
    });
    expect(payments).toHaveLength(2);
    expect(planTotal(payments)).toBe(1000);
  });

  it("sin cola, lo acordado puede no llegar al monto y el pie lo dice", () => {
    const payments = expandPaymentPlan({
      plan: { mode: "custom", agreed: [100, 150, 300], tail: null },
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
      plan: { mode: "custom", agreed: [700, 500], tail: null },
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
      plan: { mode: "custom", agreed: [100, 150, 300], tail: 200 },
      principal: 1000,
      startDate: START,
      formatAmount: money,
    })).toBe("A medida · 6 pagos");
  });

  it("sin plan no hay resumen", () => {
    expect(describePlan({ plan: null, principal: 1000, startDate: START, formatAmount: money })).toBeNull();
  });
});

describe("guardado y lectura", () => {
  it("descarta un plan que no dice nada", () => {
    expect(normalizePaymentPlan({ mode: "equal", count: 0 })).toBeNull();
    expect(normalizePaymentPlan({ mode: "custom", agreed: [], tail: null })).toBeNull();
    expect(normalizePaymentPlan(null)).toBeNull();
  });

  it("limpia los montos vacíos de lo acordado", () => {
    expect(normalizePaymentPlan({ mode: "custom", agreed: [100, 0, 150], tail: 0 })).toEqual({
      mode: "custom",
      agreed: [100, 150],
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
      agreed: [100, 150],
      tail: 200,
    });
  });
});
