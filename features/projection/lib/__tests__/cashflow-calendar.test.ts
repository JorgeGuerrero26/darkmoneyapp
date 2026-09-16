import {
  buildCashflowCalendar,
  typicalMonthlySpend,
  type ProjectionInput,
} from "../cashflow-calendar";

/** Sin conversión: todo llega ya en la moneda de la proyección. */
const identityConvert = (amount: number) => amount;

function baseInput(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    startingBalance: 3200,
    fromDate: "2026-09-16",
    months: 4,
    recurringIncome: [],
    subscriptions: [],
    obligations: [],
    plannedMovements: [],
    typicalDiscretionarySpend: 0,
    convert: identityConvert,
    ...overrides,
  };
}

describe("typicalMonthlySpend", () => {
  it("el mes de la compra grande no arrastra al resto", () => {
    // El promedio de estos seis meses es 1.040 por culpa de los 2.180.
    const meses = [780, 820, 850, 800, 2180, 810];
    const promedio = meses.reduce((a, b) => a + b, 0) / meses.length;

    expect(promedio).toBeCloseTo(1040, 0);
    expect(typicalMonthlySpend(meses)).toBeCloseTo(815, 2);
  });

  it("con impares toma el del medio, con pares promedia los dos", () => {
    expect(typicalMonthlySpend([300, 100, 200])).toBe(200);
    expect(typicalMonthlySpend([100, 200, 300, 400])).toBe(250);
  });

  it("sin historial devuelve cero en vez de NaN", () => {
    expect(typicalMonthlySpend([])).toBe(0);
    expect(typicalMonthlySpend([Number.NaN])).toBe(0);
  });

  it("el signo del gasto da igual: 800 de gasto son 800", () => {
    expect(typicalMonthlySpend([-800, -900, -1000])).toBe(900);
  });
});

describe("buildCashflowCalendar", () => {
  it("devuelve un mes por cada mes del horizonte, empezando por el actual", () => {
    const result = buildCashflowCalendar(baseInput());
    expect(result.months.map((m) => m.monthKey)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(result.months[0].isPartial).toBe(true);
    expect(result.months[1].isPartial).toBe(false);
  });

  it("repite el sueldo en cada mes: es lo que el flujo futuro de 30 días no hacía", () => {
    const result = buildCashflowCalendar(
      baseInput({
        recurringIncome: [
          {
            name: "Sueldo",
            amount: 3659,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-30",
            status: "active",
          },
        ],
      }),
    );

    expect(result.months.map((m) => m.inflowTotal)).toEqual([3659, 3659, 3659, 3659]);
    expect(result.endingBalance).toBe(3200 + 3659 * 4);
  });

  it("un ingreso pausado o con fecha de cierre deja de contarse", () => {
    const pausado = buildCashflowCalendar(
      baseInput({
        recurringIncome: [
          {
            name: "Sueldo",
            amount: 3659,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-30",
            status: "paused",
          },
        ],
      }),
    );
    expect(pausado.endingBalance).toBe(3200);

    const conCierre = buildCashflowCalendar(
      baseInput({
        recurringIncome: [
          {
            name: "Apoyo temporal",
            amount: 100,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-20",
            endDate: "2026-10-31",
            status: "active",
          },
        ],
      }),
    );
    expect(conCierre.months.map((m) => m.inflowTotal)).toEqual([100, 100, 0, 0]);
  });

  it("sigue el cronograma pactado cuota por cuota, no el saldo total", () => {
    // El caso de Kevin: montos distintos cada mes, con cola de 610 hacia adelante.
    const result = buildCashflowCalendar(
      baseInput({
        obligations: [
          {
            title: "Kevin",
            direction: "receivable",
            status: "active",
            currencyCode: "PEN",
            pendingAmount: 22610,
            principalCurrentAmount: 22610,
            startDate: "2026-05-15",
            dueDate: null,
            paymentPlan: {
              mode: "custom",
              firstDueDate: "2026-10-15",
              agreed: [
                { amount: 500, dueDate: "2026-10-15" },
                { amount: 750, dueDate: "2026-11-15" },
                { amount: 610, dueDate: "2026-12-15" },
              ],
              tail: 610,
            },
          },
        ],
      }),
    );

    // Setiembre no tiene cuota; los otros tres traen la suya, no los 22.610.
    expect(result.months.map((m) => m.inflowTotal)).toEqual([0, 500, 750, 610]);
    expect(result.months[2].inflows[0]).toMatchObject({
      kind: "obligation_receivable",
      label: "Kevin",
      source: "scheduled",
    });
  });

  it("descuenta las cuotas ya pagadas, incluida la que quedó a medias", () => {
    // Principal 1.000 en 4 cuotas de 250; van 300 abonados. La primera está cubierta y la
    // segunda debe quedar por 200, no por 250.
    const result = buildCashflowCalendar(
      baseInput({
        fromDate: "2026-07-01",
        months: 4,
        obligations: [
          {
            title: "Sergio",
            direction: "receivable",
            status: "active",
            currencyCode: "PEN",
            pendingAmount: 700,
            principalCurrentAmount: 1000,
            startDate: "2026-06-15",
            dueDate: null,
            paymentPlan: { mode: "equal", count: 4, firstDueDate: "2026-07-15" },
          },
        ],
      }),
    );

    expect(result.months.map((m) => m.inflowTotal)).toEqual([0, 200, 250, 250]);
    expect(result.endingBalance).toBe(3200 + 700);
  });

  it("una deuda que yo debo sale, no entra", () => {
    const result = buildCashflowCalendar(
      baseInput({
        obligations: [
          {
            title: "Préstamo",
            direction: "payable",
            status: "active",
            currencyCode: "PEN",
            pendingAmount: 900,
            principalCurrentAmount: 900,
            startDate: "2026-09-01",
            dueDate: null,
            paymentPlan: { mode: "equal", count: 3, firstDueDate: "2026-10-01" },
          },
        ],
      }),
    );

    expect(result.months.map((m) => m.outflowTotal)).toEqual([0, 300, 300, 300]);
    expect(result.endingBalance).toBe(3200 - 900);
  });

  it("sin plan pero con cuota pactada, repite la cuota hasta cubrir el saldo", () => {
    const result = buildCashflowCalendar(
      baseInput({
        obligations: [
          {
            title: "Primo",
            direction: "receivable",
            status: "active",
            currencyCode: "PEN",
            pendingAmount: 120,
            principalCurrentAmount: 120,
            startDate: "2026-09-20",
            dueDate: "2026-10-20",
            paymentPlan: null,
            installmentAmount: 50,
          },
        ],
      }),
    );

    // 50 + 50 + 20: la última cuota es lo que queda, no otra de 50.
    expect(result.months.map((m) => m.inflowTotal)).toEqual([0, 50, 50, 20]);
  });

  it("el mes en curso solo carga el gasto típico que le queda por delante", () => {
    // Del 16 al 30 de setiembre quedan 15 de 30 días: la mitad del mes típico.
    const result = buildCashflowCalendar(baseInput({ typicalDiscretionarySpend: 850 }));

    expect(result.months[0].outflowTotal).toBeCloseTo(425, 2);
    expect(result.months[0].outflows[0].label).toBe("Gasto típico (resto del mes)");
    expect(result.months[1].outflowTotal).toBeCloseTo(850, 2);
  });

  it("marca qué parte del mes está pactada y qué parte es estimación", () => {
    const result = buildCashflowCalendar(
      baseInput({
        typicalDiscretionarySpend: 850,
        recurringIncome: [
          {
            name: "Sueldo",
            amount: 3659,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-30",
            status: "active",
          },
        ],
      }),
    );

    // Octubre: 3.659 pactados contra 850 estimados sobre un movimiento de 4.509.
    expect(result.months[1].scheduledShare).toBeCloseTo(3659 / 4509, 4);
    // Un mes sin nada no es un mes incierto: es un mes vacío.
    const vacio = buildCashflowCalendar(baseInput());
    expect(vacio.months[0].scheduledShare).toBe(1);
  });

  it("coloca un gasto puntual futuro en su mes y no antes", () => {
    const result = buildCashflowCalendar(
      baseInput({
        months: 8,
        plannedMovements: [
          { description: "Maestría", signedAmount: -3000, currencyCode: "PEN", occurredAt: "2027-04-10" },
          { description: "Ya pasó", signedAmount: -500, currencyCode: "PEN", occurredAt: "2026-09-01" },
        ],
      }),
    );

    const abril = result.months.find((m) => m.monthKey === "2027-04");
    expect(abril?.outflowTotal).toBe(3000);
    // El movimiento anterior a `fromDate` no entra: ya está dentro del saldo de partida.
    expect(result.months[0].outflowTotal).toBe(0);
    expect(result.endingBalance).toBe(3200 - 3000);
  });

  it("lo que no se puede convertir suma cero y queda contado, no escondido", () => {
    const result = buildCashflowCalendar(
      baseInput({
        convert: (amount, currency) => (currency === "PEN" ? amount : null),
        recurringIncome: [
          {
            name: "Sueldo",
            amount: 3659,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-30",
            status: "active",
          },
        ],
        subscriptions: [
          {
            name: "Servicio en dólares",
            amount: 200,
            currencyCode: "USD",
            frequency: "monthly",
            nextDueDate: "2026-09-20",
            status: "active",
          },
        ],
      }),
    );

    expect(result.unconvertedCount).toBe(4);
    expect(result.months[0].outflowTotal).toBe(0);
    expect(result.endingBalance).toBe(3200 + 3659 * 4);
  });

  it("encadena los saldos: el cierre de un mes es la apertura del siguiente", () => {
    const result = buildCashflowCalendar(
      baseInput({
        typicalDiscretionarySpend: 850,
        recurringIncome: [
          {
            name: "Sueldo",
            amount: 3659,
            currencyCode: "PEN",
            frequency: "monthly",
            nextExpectedDate: "2026-09-30",
            status: "active",
          },
        ],
        subscriptions: [
          {
            name: "YouTube Premium",
            amount: 53.9,
            currencyCode: "PEN",
            frequency: "monthly",
            nextDueDate: "2026-10-05",
            status: "active",
          },
        ],
      }),
    );

    expect(result.months[0].openingBalance).toBe(3200);
    result.months.forEach((month, index) => {
      expect(month.closingBalance).toBeCloseTo(month.openingBalance + month.netFlow, 6);
      if (index > 0) {
        expect(month.openingBalance).toBeCloseTo(result.months[index - 1].closingBalance, 6);
      }
    });
    expect(result.endingBalance).toBeCloseTo(result.months[3].closingBalance, 6);
  });

  it("una fecha ilegible devuelve un calendario vacío en vez de reventar", () => {
    const result = buildCashflowCalendar(baseInput({ fromDate: "no es una fecha" }));
    expect(result.months).toEqual([]);
    expect(result.endingBalance).toBe(3200);
  });
});
