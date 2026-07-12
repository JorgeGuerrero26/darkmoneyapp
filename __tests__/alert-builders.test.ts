import {
  buildAccountDormantAlerts,
  buildBudgetLimitAlerts,
  buildBudgetPeriodEndingAlerts,
  buildCategorySpendingSpikeAlerts,
  buildDetectedSuggestionsPendingAlert,
  buildDuplicateChargeAlerts,
  buildExpectedIncomeMissedAlerts,
  buildExpenseIncomeImbalanceAlert,
  buildHighExpenseMonthAlert,
  buildHighInterestObligationAlerts,
  buildLowBalanceAlerts,
  buildMonthlyRecapAlert,
  buildMultipleObligationsOverdueAlert,
  buildMultipleSubscriptionsDueAlert,
  buildNegativeBalanceAlerts,
  buildNetWorthNegativeAlert,
  buildNoIncomeMonthAlert,
  buildNoMovementsWeekAlert,
  buildObligationDueAlerts,
  buildObligationMilestoneAlerts,
  buildObligationNoPaymentAlerts,
  buildSavingsRateLowAlert,
  buildSubscriptionCostHeavyAlert,
  buildSubscriptionOverdueAlerts,
  buildSubscriptionPriceIncreaseAlerts,
  buildSubscriptionReminderAlerts,
  buildUpcomingAnnualSubscriptionAlerts,
  computeMonthlyMovementAggregates,
} from "../features/notifications/lib/alertBuilders";

const sub = (over = {}) => ({ id: 5, name: "Netflix", currencyCode: "PEN", status: "active", ...over }) as any;
const pago = (id: number, occurredAt: string, sourceAmount: number) =>
  ({ id, subscriptionId: 5, occurredAt, sourceAmount, destinationAmount: null }) as any;
const mv = (id: number, occurredAt: string, categoryId: number, sourceAmount: number | null) =>
  ({ id, categoryId, occurredAt, sourceAmount, destinationAmount: null }) as any;
const catKinds = new Map([[10, "expense"], [20, "income"]]);
const ingreso = (over = {}) =>
  ({ id: 3, name: "Sueldo", status: "active", nextExpectedDate: "2026-07-05", currencyCode: "PEN", amount: 3000, ...over }) as any;

describe("buildSubscriptionPriceIncreaseAlerts", () => {
  it("alerta cuando el ultimo pago sube >=5% vs el anterior", () => {
    const rows = buildSubscriptionPriceIncreaseAlerts([sub()], [
      pago(1, "2026-06-05T10:00:00Z", 34.9),
      pago(2, "2026-07-05T10:00:00Z", 44.9),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_price_increase");
    expect(rows[0].related_entity_id).toBe(5);
    expect(rows[0].body).toContain("34.90");
    expect(rows[0].body).toContain("44.90");
  });
  it("no alerta con subida menor a 5%", () => {
    expect(
      buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 100), pago(2, "2026-07-05", 104)]),
    ).toHaveLength(0);
  });
  it("no alerta si el ultimo pago bajo, con un solo pago, o suscripcion inactiva", () => {
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-06-05", 50), pago(2, "2026-07-05", 40)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub()], [pago(1, "2026-07-05", 50)])).toHaveLength(0);
    expect(buildSubscriptionPriceIncreaseAlerts([sub({ status: "paused" })], [pago(1, "2026-06-05", 30), pago(2, "2026-07-05", 60)])).toHaveLength(0);
  });
});

describe("buildDuplicateChargeAlerts", () => {
  const now = new Date("2026-07-10T20:00:00Z");
  it("alerta con dos gastos de mismo dia, monto y categoria en la ultima semana", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 11.6), mv(2, "2026-07-09T15:00:00Z", 10, 11.6)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(1); // menor id del par
    expect(rows[0].payload.day).toBe("2026-07-09");
  });
  it("ignora pares fuera de la ventana de 7 dias, montos distintos, categorias distintas e ingresos", () => {
    expect(buildDuplicateChargeAlerts([mv(1, "2026-06-20T10:00:00Z", 10, 5), mv(2, "2026-06-20T11:00:00Z", 10, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 10, 6)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 10, 5), mv(2, "2026-07-09T11:00:00Z", 99, 5)], catKinds, now)).toHaveLength(0);
    expect(buildDuplicateChargeAlerts([mv(1, "2026-07-09T10:00:00Z", 20, 5), mv(2, "2026-07-09T11:00:00Z", 20, 5)], catKinds, now)).toHaveLength(0);
  });
  it("un trio del mismo dia genera UNA alerta (no tres pares)", () => {
    const rows = buildDuplicateChargeAlerts(
      [mv(1, "2026-07-09T10:00:00Z", 10, 9), mv(2, "2026-07-09T11:00:00Z", 10, 9), mv(3, "2026-07-09T12:00:00Z", 10, 9)],
      catKinds, now,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("buildExpectedIncomeMissedAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando la fecha esperada paso hace >=2 dias sin ingreso posterior", () => {
    const rows = buildExpectedIncomeMissedAlerts([ingreso()], [], catKinds, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("expected_income_missed");
    expect(rows[0].related_entity_id).toBe(3);
  });
  it("no alerta si hay un ingreso registrado despues de la fecha esperada", () => {
    const rows = buildExpectedIncomeMissedAlerts(
      [ingreso()],
      [mv(9, "2026-07-06T09:00:00Z", 20, null)],
      catKinds, now,
    );
    expect(rows).toHaveLength(0);
  });
  it("no alerta si aun no pasan 2 dias, o el ingreso esta pausado", () => {
    expect(buildExpectedIncomeMissedAlerts([ingreso({ nextExpectedDate: "2026-07-09" })], [], catKinds, now)).toHaveLength(0);
    expect(buildExpectedIncomeMissedAlerts([ingreso({ status: "paused" })], [], catKinds, now)).toHaveLength(0);
  });
});

describe("buildMonthlyRecapAlert", () => {
  it("emite el recap los primeros 7 dias del mes con comparativa", () => {
    const row = buildMonthlyRecapAlert(
      { lastMonthExpenses: 1200, lastMonthIncome: 3000, prevMonthExpenses: 1500, topCategoryName: "Comida" },
      new Date("2026-07-03T12:00:00Z"),
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("monthly_recap");
    expect(row!.related_entity_id).toBe(202606);
    expect(row!.payload.monthFrom).toBe("2026-06-01");
    expect(row!.payload.monthTo).toBe("2026-06-30");
    expect(row!.body).toContain("20%"); // 1200 vs 1500 = -20%
  });
  it("no emite despues del dia 7 ni sin datos del mes cerrado", () => {
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 1, lastMonthIncome: 1, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-08T12:00:00Z"))).toBeNull();
    expect(buildMonthlyRecapAlert({ lastMonthExpenses: 0, lastMonthIncome: 0, prevMonthExpenses: 0, topCategoryName: null }, new Date("2026-07-03T12:00:00Z"))).toBeNull();
  });
});

const ob = (over = {}) =>
  ({ id: 8, title: "Préstamo auto", status: "active", progressPercent: 55, pendingAmount: 4500, currencyCode: "PEN", ...over }) as any;

describe("buildObligationMilestoneAlerts", () => {
  it("emite el hito mas alto cruzado (55% -> hito 50)", () => {
    const rows = buildObligationMilestoneAlerts([ob()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_id).toBe(8 * 1000 + 50);
    expect(rows[0].payload.milestone).toBe(50);
    expect(rows[0].payload.obligationId).toBe(8);
  });
  it("100% pagado usa mensaje de cierre", () => {
    const rows = buildObligationMilestoneAlerts([ob({ progressPercent: 100 })]);
    expect(rows[0].payload.milestone).toBe(100);
    expect(rows[0].title).toContain("completa");
  });
  it("sin hito bajo 25% y sin obligaciones inactivas", () => {
    expect(buildObligationMilestoneAlerts([ob({ progressPercent: 10 })])).toHaveLength(0);
    expect(buildObligationMilestoneAlerts([ob({ status: "settled" })])).toHaveLength(0);
  });
});

describe("buildDetectedSuggestionsPendingAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("emite con >=3 pendientes y la mas vieja de hace mas de 24h", () => {
    const row = buildDetectedSuggestionsPendingAlert(4, "2026-07-08T10:00:00Z", 1, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("detected_suggestions_pending");
    expect(row!.related_entity_id).toBe(1);
    expect(row!.body).toContain("4");
  });
  it("null con menos de 3, o si la mas vieja es reciente", () => {
    expect(buildDetectedSuggestionsPendingAlert(2, "2026-07-08T10:00:00Z", 1, now)).toBeNull();
    expect(buildDetectedSuggestionsPendingAlert(5, "2026-07-10T04:00:00Z", 1, now)).toBeNull();
    expect(buildDetectedSuggestionsPendingAlert(5, null, 1, now)).toBeNull();
  });
});

// ─── Builders legacy (migrados de useNotificationGenerator) ─────────────────

const budget = (over = {}) =>
  ({ id: 30, name: "Comida", isActive: true, usedPercent: 40, alertPercent: 80, limitAmount: 800, periodEnd: "2026-07-31", workspaceId: 1, ...over }) as any;

const daysFromFixed = (todayYmd: string) => (ymd: string) => {
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
};

describe("buildBudgetLimitAlerts", () => {
  it("alerta 'excedido' al llegar a 100% usado", () => {
    const rows = buildBudgetLimitAlerts([budget({ usedPercent: 112.4 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("budget_alert");
    expect(rows[0].title).toBe("Presupuesto excedido");
    expect(rows[0].body).toContain("112%");
    expect(rows[0].related_entity_id).toBe(30);
    expect(rows[0].payload.limitAmount).toBe(800);
  });
  it("alerta 'cerca del limite' al cruzar alertPercent sin llegar a 100", () => {
    const rows = buildBudgetLimitAlerts([budget({ usedPercent: 85 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Presupuesto cerca del límite");
    expect(rows[0].body).toContain("85%");
    expect(rows[0].body).toContain("80%");
  });
  it("no alerta bajo alertPercent, con alertPercent 0, o presupuesto inactivo", () => {
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 79 })])).toHaveLength(0);
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 90, alertPercent: 0 })])).toHaveLength(0);
    expect(buildBudgetLimitAlerts([budget({ usedPercent: 120, isActive: false })])).toHaveLength(0);
  });
});

describe("buildBudgetPeriodEndingAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta cuando cierra en <=3 dias con mas de 50% usado", () => {
    const rows = buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-12", usedPercent: 60 })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("budget_period_ending");
    expect(rows[0].payload.daysLeft).toBe(2);
    expect(rows[0].body).toContain("en 2 días");
  });
  it("'cierra hoy' cuando quedan 0 dias", () => {
    const rows = buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-10", usedPercent: 51 })], days);
    expect(rows[0].body).toContain("cierra hoy");
  });
  it("no alerta a 4 dias, con 50% exacto usado, o periodo ya cerrado", () => {
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-14", usedPercent: 90 })], days)).toHaveLength(0);
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-12", usedPercent: 50 })], days)).toHaveLength(0);
    expect(buildBudgetPeriodEndingAlerts([budget({ periodEnd: "2026-07-09", usedPercent: 90 })], days)).toHaveLength(0);
  });
});

describe("buildSubscriptionReminderAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta dentro de la ventana remindDaysBefore", () => {
    const rows = buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-12", remindDaysBefore: 3 })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_reminder");
    expect(rows[0].body).toContain("vence en 2 días");
    expect(rows[0].related_entity_id).toBe(5);
  });
  it("'vence hoy' y 'vencio hace 1 dia' siguen dentro de la ventana", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-10", remindDaysBefore: 3 })], days)[0].body).toContain("vence hoy");
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-09", remindDaysBefore: 3 })], days)[0].body).toContain("venció hace 1 día");
  });
  it("ventana minima de 1 dia aunque remindDaysBefore sea 0", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-11", remindDaysBefore: 0 })], days)).toHaveLength(1);
  });
  it("no alerta fuera de ventana, vencida hace 2+ dias, o inactiva", () => {
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-15", remindDaysBefore: 3 })], days)).toHaveLength(0);
    expect(buildSubscriptionReminderAlerts([sub({ nextDueDate: "2026-07-08", remindDaysBefore: 3 })], days)).toHaveLength(0);
    expect(buildSubscriptionReminderAlerts([sub({ status: "paused", nextDueDate: "2026-07-11", remindDaysBefore: 3 })], days)).toHaveLength(0);
  });
});

describe("buildSubscriptionOverdueAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta cuando vencio hace 2+ dias", () => {
    const rows = buildSubscriptionOverdueAlerts([sub({ nextDueDate: "2026-07-07" })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("subscription_overdue");
    expect(rows[0].body).toContain("hace 3 días");
    expect(rows[0].payload.diffDays).toBe(-3);
  });
  it("no alerta vencida hace 1 dia (la cubre el reminder) ni inactiva", () => {
    expect(buildSubscriptionOverdueAlerts([sub({ nextDueDate: "2026-07-09" })], days)).toHaveLength(0);
    expect(buildSubscriptionOverdueAlerts([sub({ status: "canceled", nextDueDate: "2026-07-01" })], days)).toHaveLength(0);
  });
});

describe("buildMultipleSubscriptionsDueAlert", () => {
  const days = daysFromFixed("2026-07-10");
  const tres = [
    sub({ id: 1, name: "Netflix", nextDueDate: "2026-07-11", amount: 44.9 }),
    sub({ id: 2, name: "Spotify", nextDueDate: "2026-07-14", amount: 22.9 }),
    sub({ id: 3, name: "iCloud", nextDueDate: "2026-07-17", amount: 3.9 }),
  ];
  it("alerta con 3+ suscripciones activas venciendo en <=7 dias", () => {
    const row = buildMultipleSubscriptionsDueAlert(tres, 1, days);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("multiple_subscriptions_due");
    expect(row!.related_entity_id).toBe(1); // workspaceId
    expect(row!.payload.count).toBe(3);
    expect(row!.payload.totalAmount).toBeCloseTo(71.7);
    expect(row!.body).toContain("Netflix, Spotify, iCloud");
  });
  it("null con solo 2 en ventana o si una cae fuera de los 7 dias", () => {
    expect(buildMultipleSubscriptionsDueAlert(tres.slice(0, 2), 1, days)).toBeNull();
    expect(buildMultipleSubscriptionsDueAlert([tres[0], tres[1], sub({ id: 3, nextDueDate: "2026-07-20" })], 1, days)).toBeNull();
  });
});

describe("buildObligationDueAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("emite obligation_overdue con dias vencidos y saldo", () => {
    const rows = buildObligationDueAlerts([ob({ dueDate: "2026-07-05" })], days);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("obligation_overdue");
    expect(rows[0].title).toBe("Obligación vencida");
    expect(rows[0].body).toContain("hace 5 días");
    expect(rows[0].body).toContain("4500");
    expect(rows[0].payload.diffDays).toBe(-5);
  });
  it("emite obligation_due dentro de 7 dias, con titulo especial si es hoy", () => {
    const rows = buildObligationDueAlerts([ob({ dueDate: "2026-07-15" })], days);
    expect(rows[0].kind).toBe("obligation_due");
    expect(rows[0].title).toBe("Obligación próxima a vencer");
    expect(rows[0].body).toContain("vence en 5 días");
    const hoy = buildObligationDueAlerts([ob({ dueDate: "2026-07-10" })], days);
    expect(hoy[0].title).toBe("Obligación vence hoy");
  });
  it("no alerta a 8 dias, sin dueDate, o inactiva", () => {
    expect(buildObligationDueAlerts([ob({ dueDate: "2026-07-18" })], days)).toHaveLength(0);
    expect(buildObligationDueAlerts([ob({ dueDate: null })], days)).toHaveLength(0);
    expect(buildObligationDueAlerts([ob({ status: "settled", dueDate: "2026-07-05" })], days)).toHaveLength(0);
  });
});

describe("buildMultipleObligationsOverdueAlert", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta con 2+ obligaciones vencidas", () => {
    const row = buildMultipleObligationsOverdueAlert(
      [ob({ id: 1, title: "Préstamo", dueDate: "2026-07-01" }), ob({ id: 2, title: "Tarjeta", dueDate: "2026-07-05" })],
      9, days,
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("multiple_obligations_overdue");
    expect(row!.related_entity_id).toBe(9);
    expect(row!.payload.count).toBe(2);
    expect(row!.body).toContain("Préstamo, Tarjeta");
  });
  it("null con solo 1 vencida, y las no vencidas no cuentan", () => {
    expect(buildMultipleObligationsOverdueAlert([ob({ dueDate: "2026-07-01" })], 9, days)).toBeNull();
    expect(buildMultipleObligationsOverdueAlert([ob({ id: 1, dueDate: "2026-07-01" }), ob({ id: 2, dueDate: "2026-07-15" })], 9, days)).toBeNull();
  });
});

describe("buildObligationNoPaymentAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  const cuota = (over = {}) => ob({ installmentAmount: 500, startDate: "2026-01-10", ...over });
  it("alerta sin pagos en 45+ dias", () => {
    const rows = buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: "2026-05-01T12:00:00Z" })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("obligation_no_payment");
    expect(rows[0].payload.daysSincePayment).toBe(70);
    expect(rows[0].body).toContain("Sin pagos en 70 días");
  });
  it("'sin pagos registrados aun' cuando nunca hubo pago (999 dias)", () => {
    const rows = buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: null })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("Sin pagos registrados");
    expect(rows[0].payload.daysSincePayment).toBe(999);
  });
  it("no alerta con pago hace 44 dias, sin cuotas, saldo 0, u obligacion de menos de 15 dias", () => {
    expect(buildObligationNoPaymentAlerts([cuota({ lastPaymentDate: "2026-05-27T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ installmentAmount: null, lastPaymentDate: null })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ pendingAmount: 0, lastPaymentDate: null })], now)).toHaveLength(0);
    expect(buildObligationNoPaymentAlerts([cuota({ startDate: "2026-07-01", lastPaymentDate: null })], now)).toHaveLength(0);
  });
});

const cuenta = (over = {}) =>
  ({ id: 12, name: "BCP Soles", type: "bank", currencyCode: "PEN", openingBalance: 1000, currentBalance: 500, isArchived: false, includeInNetWorth: true, lastActivity: "2026-07-01T10:00:00Z", workspaceId: 1, ...over }) as any;

describe("buildHighInterestObligationAlerts", () => {
  it("alerta con tasa >=10% y saldo pendiente", () => {
    const rows = buildHighInterestObligationAlerts([ob({ interestRate: 45 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("high_interest_obligation");
    expect(rows[0].body).toContain("45%");
    expect(rows[0].payload.interestRate).toBe(45);
  });
  it("no alerta con tasa 9.9, sin tasa, saldo 0, o inactiva", () => {
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 9.9 })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: null })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 20, pendingAmount: 0 })])).toHaveLength(0);
    expect(buildHighInterestObligationAlerts([ob({ interestRate: 20, status: "settled" })])).toHaveLength(0);
  });
});

describe("buildLowBalanceAlerts", () => {
  it("alerta bajo el umbral (10% de apertura, minimo 50)", () => {
    const rows = buildLowBalanceAlerts([cuenta({ currentBalance: 80 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("low_balance");
    expect(rows[0].payload.threshold).toBe(100); // 10% de 1000
    expect(rows[0].body).toContain("80.00");
  });
  it("umbral minimo de 50 cuando la apertura es chica", () => {
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 100, currentBalance: 30 })])).toHaveLength(1);
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 100, currentBalance: 60 })])).toHaveLength(0);
  });
  it("no alerta sobre umbral, saldo <=0, apertura <=0, tipo credito, o archivada", () => {
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: 150 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: 0 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ currentBalance: -20 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ openingBalance: 0, currentBalance: 10 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ type: "credit_card", currentBalance: 10 })])).toHaveLength(0);
    expect(buildLowBalanceAlerts([cuenta({ isArchived: true, currentBalance: 10 })])).toHaveLength(0);
  });
});

describe("buildNegativeBalanceAlerts", () => {
  it("alerta con saldo negativo en cuenta no-credito", () => {
    const rows = buildNegativeBalanceAlerts([cuenta({ currentBalance: -120.5 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("negative_balance");
    expect(rows[0].body).toContain("-120.50");
  });
  it("no alerta con saldo >=0, tipo credito, o archivada", () => {
    expect(buildNegativeBalanceAlerts([cuenta({ currentBalance: 0 })])).toHaveLength(0);
    expect(buildNegativeBalanceAlerts([cuenta({ type: "credit_card", currentBalance: -50 })])).toHaveLength(0);
    expect(buildNegativeBalanceAlerts([cuenta({ isArchived: true, currentBalance: -50 })])).toHaveLength(0);
  });
});

describe("buildAccountDormantAlerts", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta con 60+ dias sin actividad y saldo distinto de 0 (aplica a cualquier tipo)", () => {
    const rows = buildAccountDormantAlerts([cuenta({ lastActivity: "2026-05-01T12:00:00Z" })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("account_dormant");
    expect(rows[0].payload.daysSince).toBe(70);
  });
  it("no alerta con 59 dias, saldo 0, sin lastActivity, o archivada", () => {
    expect(buildAccountDormantAlerts([cuenta({ lastActivity: "2026-05-12T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ currentBalance: 0, lastActivity: "2026-01-01T12:00:00Z" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ lastActivity: "" })], now)).toHaveLength(0);
    expect(buildAccountDormantAlerts([cuenta({ isArchived: true, lastActivity: "2026-01-01T12:00:00Z" })], now)).toHaveLength(0);
  });
});

const mvIn = (id: number, occurredAt: string, categoryId: number, destinationAmount: number) =>
  ({ id, categoryId, occurredAt, sourceAmount: null, destinationAmount }) as any;

describe("computeMonthlyMovementAggregates", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  const kinds = new Map([[10, "expense"], [11, "expense"], [20, "income"], [30, "transfer"]]);
  const nombres = new Map([[10, "Comida"], [11, "Transporte"], [20, "Sueldo"]]);
  it("separa este mes, mes pasado y mes anterior, ignorando transferencias", () => {
    const agg = computeMonthlyMovementAggregates(
      [
        mv(1, "2026-07-02T10:00:00Z", 10, 100),
        mvIn(2, "2026-07-05T10:00:00Z", 20, 3000),
        mv(3, "2026-06-15T10:00:00Z", 10, 400),
        mv(4, "2026-06-20T10:00:00Z", 11, 150),
        mvIn(5, "2026-06-28T10:00:00Z", 20, 2800),
        mv(6, "2026-05-10T10:00:00Z", 10, 900),
        mv(7, "2026-07-03T10:00:00Z", 30, 999), // transfer: fuera
        mv(8, "2026-07-04T10:00:00Z", 99, 777), // categoria desconocida: fuera
      ],
      kinds, nombres, now,
    );
    expect(agg.thisMonthExpenses).toBe(100);
    expect(agg.thisMonthIncome).toBe(3000);
    expect(agg.lastMonthExpenses).toBe(550);
    expect(agg.lastMonthIncome).toBe(2800);
    expect(agg.prevMonthExpenses).toBe(900);
    expect(agg.thisMonthByCategory.get(10)).toBe(100);
    expect(agg.lastMonthByCategory.get(11)).toBe(150);
    expect(agg.lastMonthTopCategoryName).toBe("Comida"); // 400 > 150
  });
  it("sin movimientos devuelve todo en cero y sin top category", () => {
    const agg = computeMonthlyMovementAggregates([], kinds, nombres, now);
    expect(agg.thisMonthExpenses).toBe(0);
    expect(agg.lastMonthIncome).toBe(0);
    expect(agg.lastMonthTopCategoryName).toBeNull();
  });
});

describe("buildNoIncomeMonthAlert", () => {
  it("alerta desde el dia 15 sin ingresos en el mes", () => {
    const row = buildNoIncomeMonthAlert(0, 7, new Date("2026-07-15T12:00:00Z"));
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("no_income_month");
    expect(row!.related_entity_id).toBe(7);
    expect(row!.payload.dayOfMonth).toBe(15);
  });
  it("null antes del dia 15 o si hay ingresos", () => {
    expect(buildNoIncomeMonthAlert(0, 7, new Date("2026-07-14T12:00:00Z"))).toBeNull();
    expect(buildNoIncomeMonthAlert(100, 7, new Date("2026-07-20T12:00:00Z"))).toBeNull();
  });
});

describe("buildHighExpenseMonthAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando el gasto supera al mes pasado en mas de 30% (desde el dia 7)", () => {
    const row = buildHighExpenseMonthAlert({ thisMonthExpenses: 1400, lastMonthExpenses: 1000 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("high_expense_month");
    expect(row!.body).toContain("40%");
  });
  it("null con subida de exactamente 30%, antes del dia 7, o sin base del mes pasado", () => {
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 1300, lastMonthExpenses: 1000 }, 7, now)).toBeNull();
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 2000, lastMonthExpenses: 1000 }, 7, new Date("2026-07-06T12:00:00Z"))).toBeNull();
    expect(buildHighExpenseMonthAlert({ thisMonthExpenses: 2000, lastMonthExpenses: 0 }, 7, now)).toBeNull();
  });
});

describe("buildCategorySpendingSpikeAlerts", () => {
  it("alerta cuando una categoria sube mas de 50% con gasto > 50", () => {
    const rows = buildCategorySpendingSpikeAlerts(
      new Map([[10, 160]]), new Map([[10, 100]]), new Map([[10, "Comida"]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("category_spending_spike");
    expect(rows[0].related_entity_id).toBe(10);
    expect(rows[0].title).toBe('Gasto elevado en "Comida"');
    expect(rows[0].body).toContain("60% más");
    expect(rows[0].payload.categoryName).toBe("Comida");
  });
  it("no alerta con subida de exactamente 50%, monto <=50, o sin base del mes pasado", () => {
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 150]]), new Map([[10, 100]]), new Map())).toHaveLength(0);
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 45]]), new Map([[10, 20]]), new Map())).toHaveLength(0);
    expect(buildCategorySpendingSpikeAlerts(new Map([[10, 300]]), new Map(), new Map())).toHaveLength(0);
  });
});

describe("buildExpenseIncomeImbalanceAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta cuando los gastos superan 85% de los ingresos (desde el dia 10)", () => {
    const row = buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 1000 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("expense_income_imbalance");
    expect(row!.body).toContain("90%");
  });
  it("null con 85% exacto, antes del dia 10, o sin ingresos", () => {
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 850, thisMonthIncome: 1000 }, 7, now)).toBeNull();
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 1000 }, 7, new Date("2026-07-09T12:00:00Z"))).toBeNull();
    expect(buildExpenseIncomeImbalanceAlert({ thisMonthExpenses: 900, thisMonthIncome: 0 }, 7, now)).toBeNull();
  });
});

describe("buildNetWorthNegativeAlert", () => {
  it("alerta cuando la suma en moneda base es negativa (incluye prestamos)", () => {
    const row = buildNetWorthNegativeAlert(
      [
        cuenta({ currentBalance: 500, currentBalanceInBaseCurrency: 500 }),
        cuenta({ id: 13, type: "loan", currentBalance: -3000, currentBalanceInBaseCurrency: -800 }),
      ],
      1,
    );
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("net_worth_negative");
    expect(row!.payload.netWorth).toBe(-300);
    expect(row!.body).toContain("-300.00");
  });
  it("usa currentBalance como fallback sin valor en moneda base", () => {
    const row = buildNetWorthNegativeAlert([cuenta({ currentBalance: -100, currentBalanceInBaseCurrency: null })], 1);
    expect(row!.payload.netWorth).toBe(-100);
  });
  it("null con patrimonio >=0; ignora archivadas y excluidas del net worth", () => {
    expect(buildNetWorthNegativeAlert([cuenta({ currentBalanceInBaseCurrency: 100 })], 1)).toBeNull();
    expect(
      buildNetWorthNegativeAlert(
        [
          cuenta({ currentBalanceInBaseCurrency: 100 }),
          cuenta({ id: 14, isArchived: true, currentBalanceInBaseCurrency: -900 }),
          cuenta({ id: 15, includeInNetWorth: false, currentBalanceInBaseCurrency: -900 }),
        ],
        1,
      ),
    ).toBeNull();
  });
});

describe("buildSavingsRateLowAlert", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  it("alerta con tasa de ahorro bajo 10% desde el dia 20", () => {
    const row = buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 950 }, 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("savings_rate_low");
    expect(row!.body).toContain("5%");
  });
  it("null con tasa de exactamente 10%, tasa negativa, o antes del dia 20", () => {
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 900 }, 7, now)).toBeNull();
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 1100 }, 7, now)).toBeNull();
    expect(buildSavingsRateLowAlert({ thisMonthIncome: 1000, thisMonthExpenses: 950 }, 7, new Date("2026-07-19T12:00:00Z"))).toBeNull();
  });
});

describe("buildSubscriptionCostHeavyAlert", () => {
  it("alerta cuando el costo mensualizado supera 30% del ingreso del mes pasado", () => {
    const row = buildSubscriptionCostHeavyAlert([sub({ amount: 350, frequency: "monthly" })], 1000, 7);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("subscription_cost_heavy");
    expect(row!.body).toContain("35%");
    expect(row!.payload.subCount).toBe(1);
  });
  it("mensualiza anuales, trimestrales, semanales y diarias", () => {
    const row = buildSubscriptionCostHeavyAlert(
      [
        sub({ id: 1, amount: 1200, frequency: "yearly" }),   // 100/mes
        sub({ id: 2, amount: 300, frequency: "quarterly" }), // 100/mes
        sub({ id: 3, amount: 23.1, frequency: "weekly" }),   // ~100/mes (x4.33)
        sub({ id: 4, amount: 2, frequency: "daily" }),       // 60/mes (x30)
      ],
      1000, 7,
    );
    expect(row).not.toBeNull();
    expect(row!.payload.monthlySubCost as number).toBeCloseTo(360, 0);
  });
  it("null con 30% exacto, sin subs activas, o sin ingreso del mes pasado", () => {
    expect(buildSubscriptionCostHeavyAlert([sub({ amount: 300, frequency: "monthly" })], 1000, 7)).toBeNull();
    expect(buildSubscriptionCostHeavyAlert([sub({ status: "paused", amount: 900, frequency: "monthly" })], 1000, 7)).toBeNull();
    expect(buildSubscriptionCostHeavyAlert([sub({ amount: 900, frequency: "monthly" })], 0, 7)).toBeNull();
  });
});

describe("buildUpcomingAnnualSubscriptionAlerts", () => {
  const days = daysFromFixed("2026-07-10");
  it("alerta para renovacion anual entre 14 y 30 dias", () => {
    const rows = buildUpcomingAnnualSubscriptionAlerts(
      [sub({ frequency: "yearly", nextDueDate: "2026-07-30", amount: 120 })], days,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("upcoming_annual_subscription");
    expect(rows[0].payload.diffDays).toBe(20);
    expect(rows[0].body).toContain("120"); // monto; la fecha localizada no se fija (depende del ICU)
  });
  it("no alerta a 13 o 31 dias, ni para frecuencia mensual", () => {
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "yearly", nextDueDate: "2026-07-23" })], days)).toHaveLength(0);
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "yearly", nextDueDate: "2026-08-10" })], days)).toHaveLength(0);
    expect(buildUpcomingAnnualSubscriptionAlerts([sub({ frequency: "monthly", nextDueDate: "2026-07-30" })], days)).toHaveLength(0);
  });
});

describe("buildNoMovementsWeekAlert", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  it("alerta sin movimientos en 7 dias pero con actividad la semana previa", () => {
    const row = buildNoMovementsWeekAlert([mv(1, "2026-06-30T10:00:00Z", 10, 50)], 7, now);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("no_movements_week");
    expect(row!.related_entity_id).toBe(7);
    expect(row!.payload.daysSinceLastMovement).toBe(7);
  });
  it("null si hay movimientos recientes o si tampoco hubo actividad previa", () => {
    expect(buildNoMovementsWeekAlert([mv(1, "2026-07-08T10:00:00Z", 10, 50)], 7, now)).toBeNull();
    expect(buildNoMovementsWeekAlert([], 7, now)).toBeNull();
  });
});
