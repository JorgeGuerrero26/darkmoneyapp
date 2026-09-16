/**
 * Las dos implementaciones del calendario tienen que dar exactamente lo mismo.
 *
 * Una vive en `features/projection/lib` (la que dibuja el dashboard) y la otra en
 * `supabase/functions/_shared` (la que responde el asistente), porque las Edge Functions corren
 * en Deno y no pueden importar de `features/`. Este test es lo único que impide que se separen.
 *
 * Si falla: **no es el test el que está mal.** Significa que alguien tocó una y no la otra, y
 * que el dashboard y el asistente están a punto de decir dos cifras distintas para el mismo mes.
 */
import { buildCashflowCalendar as appEngine } from "../cashflow-calendar";
import { monthlyDiscretionarySpend as appHistory } from "../discretionary-history";
import {
  movementActsAsExpense as appActsAsExpense,
  movementActsAsIncome as appActsAsIncome,
  movementDisplayAccountId as appDisplayAccountId,
  movementDisplayAmount as appDisplayAmount,
} from "../../../../lib/movement-amounts";
import {
  buildCashflowCalendar as denoEngine,
  monthlyDiscretionarySpend as denoHistory,
  movementActsAsExpense as denoActsAsExpense,
  movementActsAsIncome as denoActsAsIncome,
  movementDisplayAccountId as denoDisplayAccountId,
  movementDisplayAmount as denoDisplayAmount,
} from "../../../../supabase/functions/_shared/cashflow-calendar";

const identity = (amount: number) => amount;
/** Un conversor con hueco: sirve para comprobar que las dos cuentan igual lo no convertible. */
const onlyPen = (amount: number, currency: string) => (currency === "PEN" ? amount : null);

type Scenario = {
  name: string;
  input: Parameters<typeof appEngine>[0];
};

function base(overrides: Partial<Parameters<typeof appEngine>[0]> = {}): Parameters<typeof appEngine>[0] {
  return {
    startingBalance: 3200,
    fromDate: "2026-09-16",
    months: 6,
    recurringIncome: [],
    subscriptions: [],
    obligations: [],
    plannedMovements: [],
    typicalDiscretionarySpend: 0,
    convert: identity,
    ...overrides,
  };
}

const sueldo = {
  name: "Sueldo",
  amount: 3659,
  currencyCode: "PEN",
  frequency: "monthly",
  nextExpectedDate: "2026-09-30",
  status: "active",
};

const SCENARIOS: Scenario[] = [
  { name: "vacío", input: base() },
  {
    name: "cronograma a medida con cola",
    input: base({
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
  },
  {
    name: "plan de cuotas iguales con pagos ya hechos",
    input: base({
      fromDate: "2026-07-01",
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
  },
  {
    name: "plan viejo con agreed como números sueltos",
    input: base({
      obligations: [
        {
          title: "Plan antiguo",
          direction: "payable",
          status: "active",
          currencyCode: "PEN",
          pendingAmount: 1500,
          principalCurrentAmount: 1500,
          startDate: "2026-08-10",
          dueDate: null,
          paymentPlan: { mode: "custom", agreed: [300, 400], tail: 200 },
        },
      ],
    }),
  },
  {
    name: "sin plan, con cuota pactada",
    input: base({
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
  },
  {
    name: "sin plan y sin cuota: el saldo entero en su vencimiento",
    input: base({
      obligations: [
        {
          title: "Pago único",
          direction: "payable",
          status: "active",
          currencyCode: "PEN",
          pendingAmount: 900,
          principalCurrentAmount: 900,
          startDate: "2026-09-01",
          dueDate: "2026-11-30",
          paymentPlan: null,
        },
      ],
    }),
  },
  {
    name: "cadencias variadas",
    input: base({
      months: 12,
      recurringIncome: [
        sueldo,
        {
          name: "Gratificación",
          amount: 3202,
          currencyCode: "PEN",
          frequency: "yearly",
          nextExpectedDate: "2026-12-15",
          status: "active",
        },
      ],
      subscriptions: [
        {
          name: "Semanal",
          amount: 20,
          currencyCode: "PEN",
          frequency: "weekly",
          nextDueDate: "2026-09-18",
          status: "active",
        },
        {
          name: "Trimestral",
          amount: 300,
          currencyCode: "PEN",
          frequency: "quarterly",
          nextDueDate: "2026-10-01",
          status: "active",
        },
        {
          name: "Cada dos meses",
          amount: 80,
          currencyCode: "PEN",
          frequency: "monthly",
          intervalCount: 2,
          nextDueDate: "2026-09-25",
          status: "active",
        },
      ],
    }),
  },
  {
    name: "día 31: el recorte de mes corto tiene que coincidir",
    input: base({
      fromDate: "2026-01-31",
      months: 6,
      recurringIncome: [{ ...sueldo, nextExpectedDate: "2026-01-31" }],
    }),
  },
  {
    name: "año bisiesto y cruce de año",
    input: base({
      fromDate: "2027-12-29",
      months: 4,
      recurringIncome: [{ ...sueldo, nextExpectedDate: "2028-02-29" }],
      typicalDiscretionarySpend: 850,
    }),
  },
  {
    name: "ingreso con fecha de cierre y suscripción pausada",
    input: base({
      recurringIncome: [
        { ...sueldo, name: "Apoyo", amount: 100, nextExpectedDate: "2026-09-20", endDate: "2026-11-30" },
      ],
      subscriptions: [
        {
          name: "Pausada",
          amount: 40,
          currencyCode: "PEN",
          frequency: "monthly",
          nextDueDate: "2026-10-01",
          status: "paused",
        },
      ],
    }),
  },
  {
    name: "movimientos planificados en ambos sentidos",
    input: base({
      months: 8,
      plannedMovements: [
        { description: "Maestría", signedAmount: -3000, currencyCode: "PEN", occurredAt: "2027-04-10" },
        { description: "Bono", signedAmount: 1200, currencyCode: "PEN", occurredAt: "2026-12-20" },
        { description: "Ya pasó", signedAmount: -500, currencyCode: "PEN", occurredAt: "2026-09-01" },
      ],
    }),
  },
  {
    name: "moneda sin tipo de cambio",
    input: base({
      convert: onlyPen,
      recurringIncome: [sueldo],
      subscriptions: [
        {
          name: "Inversión",
          amount: 200,
          currencyCode: "USD",
          frequency: "monthly",
          nextDueDate: "2026-09-20",
          status: "active",
        },
      ],
    }),
  },
  {
    name: "el escenario completo",
    input: base({
      months: 8,
      typicalDiscretionarySpend: 850,
      recurringIncome: [sueldo, { ...sueldo, name: "Primo", amount: 50, nextExpectedDate: "2026-10-05" }],
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
      obligations: [
        {
          title: "Kevin",
          direction: "receivable",
          status: "active",
          currencyCode: "PEN",
          pendingAmount: 22610,
          principalCurrentAmount: 25765,
          startDate: "2026-05-15",
          dueDate: null,
          paymentPlan: {
            mode: "custom",
            firstDueDate: "2026-05-15",
            agreed: [
              { amount: 350, dueDate: "2026-05-15" },
              { amount: 550, dueDate: "2026-06-15" },
              { amount: 650, dueDate: "2026-07-15" },
              { amount: 690, dueDate: "2026-08-15" },
              { amount: 540, dueDate: "2026-09-15" },
              { amount: 500, dueDate: "2026-10-15" },
              { amount: 750, dueDate: "2026-11-15" },
            ],
            tail: 610,
          },
        },
      ],
      plannedMovements: [
        { description: "Maestría", signedAmount: -3000, currencyCode: "PEN", occurredAt: "2027-04-10" },
      ],
    }),
  },
  { name: "fecha ilegible", input: base({ fromDate: "no es una fecha" }) },
  { name: "horizonte de un solo mes", input: base({ months: 1, recurringIncome: [sueldo] }) },
];

describe("paridad entre el motor de la app y el de la Edge Function", () => {
  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    "coinciden en: %s",
    (_name, scenario) => {
      const app = appEngine(scenario.input);
      const deno = denoEngine(scenario.input);

      expect(deno.months.map((month) => month.monthKey)).toEqual(app.months.map((month) => month.monthKey));
      expect(deno.endingBalance).toBeCloseTo(app.endingBalance, 6);
      expect(deno.unconvertedCount).toBe(app.unconvertedCount);
      expect(deno.overallScheduledShare).toBeCloseTo(app.overallScheduledShare, 9);

      app.months.forEach((month, index) => {
        const mirror = deno.months[index];
        expect(mirror.openingBalance).toBeCloseTo(month.openingBalance, 6);
        expect(mirror.closingBalance).toBeCloseTo(month.closingBalance, 6);
        expect(mirror.inflowTotal).toBeCloseTo(month.inflowTotal, 6);
        expect(mirror.outflowTotal).toBeCloseTo(month.outflowTotal, 6);
        expect(mirror.isPartial).toBe(month.isPartial);
        expect(mirror.unconvertedCount).toBe(month.unconvertedCount);
        // Las líneas, con etiqueta y origen: dos motores pueden cuadrar en el total y estar
        // contando cosas distintas.
        const shape = (lines: typeof month.inflows) =>
          lines.map((line) => `${line.kind}|${line.label}|${line.source}|${line.amount.toFixed(4)}`);
        expect(shape(mirror.inflows)).toEqual(shape(month.inflows));
        expect(shape(mirror.outflows)).toEqual(shape(month.outflows));
      });
    },
  );
});

describe("paridad del historial que alimenta la mediana", () => {
  const NOW = new Date("2026-09-16T12:00:00.000Z");
  type Row = { movementType: string; status: string; occurredAt: string; amount: number };
  const amountOf = (row: Row) => row.amount;

  const HISTORY_CASES: Array<{ name: string; movements: Row[]; months: number; coveredFrom?: Date }> = [
    {
      name: "meses corrientes",
      months: 6,
      movements: [
        { occurredAt: "2026-04-10T12:00:00.000Z", amount: 700, movementType: "expense", status: "posted" },
        { occurredAt: "2026-07-10T12:00:00.000Z", amount: 800, movementType: "expense", status: "posted" },
        { occurredAt: "2026-08-10T12:00:00.000Z", amount: 900, movementType: "expense", status: "posted" },
      ],
    },
    {
      name: "tipos con línea propia y estados no aplicados",
      months: 3,
      movements: [
        { occurredAt: "2026-08-05T12:00:00.000Z", amount: 53.9, movementType: "subscription_payment", status: "posted" },
        { occurredAt: "2026-08-06T12:00:00.000Z", amount: 500, movementType: "obligation_payment", status: "posted" },
        { occurredAt: "2026-08-07T12:00:00.000Z", amount: 2000, movementType: "obligation_opening", status: "posted" },
        { occurredAt: "2026-08-08T12:00:00.000Z", amount: 300, movementType: "expense", status: "planned" },
        { occurredAt: "2026-08-09T12:00:00.000Z", amount: 640, movementType: "expense", status: "posted" },
      ],
    },
    {
      name: "ventana recortada",
      months: 6,
      coveredFrom: new Date("2026-06-18T00:00:00.000Z"),
      movements: [
        { occurredAt: "2026-05-10T12:00:00.000Z", amount: 999, movementType: "expense", status: "posted" },
        { occurredAt: "2026-07-10T12:00:00.000Z", amount: 800, movementType: "expense", status: "posted" },
        { occurredAt: "2026-08-10T12:00:00.000Z", amount: 900, movementType: "expense", status: "posted" },
      ],
    },
    {
      name: "el mes en curso y el futuro quedan fuera",
      months: 3,
      movements: [
        { occurredAt: "2026-09-10T12:00:00.000Z", amount: 400, movementType: "expense", status: "posted" },
        { occurredAt: "2026-11-10T12:00:00.000Z", amount: 400, movementType: "expense", status: "posted" },
        { occurredAt: "2026-08-10T12:00:00.000Z", amount: 900, movementType: "expense", status: "posted" },
      ],
    },
    { name: "sin movimientos", months: 6, movements: [] },
  ];

  it.each(HISTORY_CASES.map((testCase) => [testCase.name, testCase] as const))(
    "coinciden en: %s",
    (_name, testCase) => {
      const args = {
        movements: testCase.movements,
        months: testCase.months,
        expenseAmountOf: amountOf,
        earliestCoveredDate: testCase.coveredFrom ?? null,
        now: NOW,
      };
      expect(denoHistory(args)).toEqual(appHistory(args));
    },
  );
});

describe("paridad de qué cuenta como gasto", () => {
  // Si estas dos reglas se separan, los totales por mes cuadran y aun así suman movimientos
  // distintos: el "gasto típico" del asistente y el del dashboard divergen en silencio.
  const CASES: Array<Record<string, unknown>> = [
    { movementType: "expense", sourceAmount: 100, destinationAmount: null, sourceAccountId: 1 },
    { movementType: "income", sourceAmount: null, destinationAmount: 200, destinationAccountId: 2 },
    { movementType: "refund", sourceAmount: 10, destinationAmount: 30, destinationAccountId: 3 },
    { movementType: "transfer", sourceAmount: 50, destinationAmount: 50, sourceAccountId: 1, destinationAccountId: 2 },
    { movementType: "subscription_payment", sourceAmount: 53.9, sourceAccountId: 1 },
    { movementType: "obligation_payment", sourceAmount: 300, destinationAmount: 0, sourceAccountId: 1 },
    { movementType: "obligation_payment", sourceAmount: 0, destinationAmount: 300, destinationAccountId: 2 },
    { movementType: "adjustment", sourceAmount: 40, destinationAmount: 40 },
    { movementType: "adjustment", sourceAmount: 10, destinationAmount: 80, destinationAccountId: 4 },
    { movementType: null, sourceAmount: null, destinationAmount: null },
  ];

  it.each(CASES.map((movement, index) => [index, movement] as const))("coinciden en el caso %i", (_index, movement) => {
    expect(denoActsAsIncome(movement)).toBe(appActsAsIncome(movement));
    expect(denoActsAsExpense(movement)).toBe(appActsAsExpense(movement));
    expect(denoDisplayAmount(movement)).toBe(appDisplayAmount(movement));
    expect(denoDisplayAccountId(movement)).toBe(appDisplayAccountId(movement));
  });
});
