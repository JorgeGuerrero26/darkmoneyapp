import { detectMovementAnomalies } from "../../services/analytics/anomaly-detection";
import { simulateMonthEndCashflow } from "../../services/analytics/cashflow-forecast";
import { buildCategorySuggestionCandidates } from "../../services/analytics/category-suggestions";
import { findProbableDuplicateGroups } from "../../services/analytics/duplicate-detection";
import { buildFinancialGraphRank } from "../../services/analytics/financial-graph";
import { buildFocusActionRanking } from "../../services/analytics/focus-scoring";
import { buildHistoryFactorAnalysis } from "../../services/analytics/history-factor-analysis";
import { detectHistoryChangePoint } from "../../services/analytics/history-change-points";
import { clusterHistoryMonths } from "../../services/analytics/month-clustering";
import { buildPaymentOptimizationPlan } from "../../services/analytics/payment-optimization";
import { buildPatternClusters } from "../../services/analytics/pattern-clustering";

type Movement = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  amount: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expense(
  id: number,
  description: string,
  amount: number,
  occurredAt: string,
  categoryId: number | null = 10,
  counterpartyId: number | null = 100,
): Movement {
  return {
    id,
    movementType: "expense",
    status: "posted",
    occurredAt,
    sourceAccountId: 1,
    destinationAccountId: null,
    categoryId,
    counterpartyId,
    description,
    amount,
  };
}

function income(id: number, description: string, amount: number, occurredAt: string): Movement {
  return {
    id,
    movementType: "income",
    status: "posted",
    occurredAt,
    sourceAccountId: null,
    destinationAccountId: 2,
    categoryId: 30,
    counterpartyId: 300,
    description,
    amount,
  };
}

function runCategorySuggestionTest() {
  const movements = [
    expense(1, "Taxi Centro", 18, "2026-04-01T10:00:00.000Z"),
    expense(2, "Taxi Centro", 19, "2026-04-05T10:00:00.000Z"),
    expense(3, "Taxi Centro", 18.5, "2026-04-09T10:00:00.000Z"),
    expense(4, "Taxi Centro", 18.2, "2026-04-12T10:00:00.000Z", null),
  ];

  const suggestions = buildCategorySuggestionCandidates({
    movements,
    categories: [{ id: 10, name: "Transporte" }],
    isCashflow: () => true,
    isIncomeLike: (movement) => movement.movementType === "income",
    getAmount: (movement) => movement.amount,
  });

  assert(suggestions.length === 1, "debe sugerir una categoría para el movimiento sin categoría");
  assert(suggestions[0].movementId === 4, "debe sugerir sobre el movimiento correcto");
  assert(suggestions[0].suggestedCategoryId === 10, "debe sugerir la categoría histórica dominante");
  assert(suggestions[0].confidence >= 0.6, "debe tener confianza suficiente para mostrarse");
}

function runDuplicateTest() {
  const movements = [
    expense(10, "Taxi Centro", 18, "2026-04-10T10:00:00.000Z"),
    expense(11, "Taxi Centro", 18.1, "2026-04-10T11:00:00.000Z"),
    expense(12, "Supermercado", 80, "2026-04-10T12:00:00.000Z", 20, 200),
  ];

  const groups = findProbableDuplicateGroups({ movements, getAmount: (movement) => movement.amount });
  assert(groups.length === 1, "debe detectar un grupo duplicado probable");
  assert(groups[0].movementIds.includes(10) && groups[0].movementIds.includes(11), "debe agrupar los dos taxis parecidos");
}

function runPatternClusteringTest() {
  const movements = [
    expense(13, "Taxi Centro", 18, "2026-04-01T10:00:00.000Z", 10, null),
    expense(14, "Uber Centro", 19, "2026-04-08T10:00:00.000Z", 10, null),
    expense(15, "Cabify Centro", 18.5, "2026-04-15T10:00:00.000Z", 10, null),
    expense(16, "Supermercado", 90, "2026-04-15T11:00:00.000Z", 20, 200),
  ];

  const clusters = buildPatternClusters({
    movements,
    isCashflow: () => true,
    isIncomeLike: (movement) => movement.movementType === "income",
    getAmount: (movement) => movement.amount,
    categoryNames: new Map([[10, "Transporte"], [20, "Comida"]]),
    now: new Date("2026-04-21T12:00:00.000Z"),
  });

  assert(clusters.length >= 1, "debe detectar un hábito aunque los nombres no sean idénticos");
  assert(clusters[0].movementIds.includes(13) && clusters[0].movementIds.includes(14) && clusters[0].movementIds.includes(15), "debe agrupar taxi, uber y cabify como hábito parecido");
  assert(clusters[0].category === "Transporte", "debe conservar la categoría dominante del hábito");
}

function runAnomalyTest() {
  const movements = [
    expense(20, "Menu diario", 20, "2026-04-01T10:00:00.000Z", 40, 400),
    expense(21, "Menu diario", 21, "2026-04-03T10:00:00.000Z", 40, 400),
    expense(22, "Menu diario", 19, "2026-04-05T10:00:00.000Z", 40, 400),
    expense(23, "Menu diario", 22, "2026-04-07T10:00:00.000Z", 40, 400),
    expense(24, "Menu diario", 82, "2026-04-09T10:00:00.000Z", 40, 400),
  ];

  const anomalies = detectMovementAnomalies({ movements, getAmount: (movement) => movement.amount });
  assert(anomalies.some((item) => item.movementId === 24), "debe marcar el gasto que se disparó");
  assert(anomalies[0].score >= 70, "la anomalía principal debe tener score alto");
}

function runCashflowTest() {
  const result = simulateMonthEndCashflow({
    currentBalance: 1000,
    committedInflow: 400,
    committedOutflow: 300,
    dailySamples: [
      { income: 0, expense: 25 },
      { income: 80, expense: 30 },
      { income: 0, expense: 15 },
    ],
    incomeDailyAverage: 30,
    expenseDailyAverage: 24,
    remainingDays: 10,
    iterations: 120,
  });

  assert(result.lowBalance <= result.medianBalance, "el percentil bajo debe ser menor o igual a la mediana");
  assert(result.medianBalance <= result.highBalance, "la mediana debe ser menor o igual al percentil alto");
  assert(result.pressureProbability >= 0 && result.pressureProbability <= 100, "la probabilidad debe estar entre 0 y 100");
}

function runFinancialGraphTest() {
  const movements = [
    expense(30, "Taxi Centro", 18, "2026-04-01T10:00:00.000Z", 10, 100),
    expense(31, "Taxi Oficina", 22, "2026-04-02T10:00:00.000Z", 10, 100),
    expense(32, "Taxi Casa", 20, "2026-04-03T10:00:00.000Z", 10, 100),
    income(33, "Venta", 120, "2026-04-04T10:00:00.000Z"),
  ];

  const rank = buildFinancialGraphRank({
    movements,
    getAmount: (movement) => movement.amount,
    getAccountIds: (movement) => [movement.sourceAccountId, movement.destinationAccountId],
    getCategoryId: (movement) => movement.categoryId,
    getCounterpartyId: (movement) => movement.counterpartyId,
    getFlowKind: (movement) => movement.movementType === "income" ? "income" : "expense",
    accountNames: new Map([[1, "Billetera"], [2, "Caja"]]),
    categoryNames: new Map([[10, "Transporte"], [30, "Ventas"]]),
    counterpartyNames: new Map([[100, "Taxi"], [300, "Cliente"]]),
    limit: 8,
  });

  assert(rank.length > 0, "debe devolver nodos rankeados");
  assert(rank.some((node) => node.label === "Transporte"), "debe incluir la categoría con más conexiones");
  assert(rank[0].score >= rank[rank.length - 1].score, "debe ordenar por score descendente");
}

function runFocusAndPaymentTests() {
  const focus = buildFocusActionRanking({
    uncategorizedCount: 6,
    overdueObligationsCount: 0,
    subscriptionsAttentionCount: 0,
    learningReadinessScore: 52,
    weekExpectedInflow: 300,
    weekExpectedOutflow: 260,
    monthExpense: 900,
    cashCushionDays: 80,
    cashDailyBurn: 30,
    spendingTrendPct: 0,
    pressureProbability: 10,
    pressureThresholdLabel: "S/ 850",
    formatAmount: (amount) => `S/ ${amount.toFixed(0)}`,
  });
  assert(focus.key === "uncategorized", "debe priorizar ordenar categorías cuando ese es el problema dominante");

  const plan = buildPaymentOptimizationPlan({
    currentBalance: 500,
    weekExpectedInflow: 100,
    weekExpectedOutflow: 700,
    pressureProbability: 60,
    today: new Date("2026-04-21T12:00:00.000Z"),
    obligations: [
      { id: 1, title: "Cobro cliente", direction: "receivable", amount: 450, dueDate: "2026-04-18", status: "active", counterparty: "Cliente" },
      { id: 2, title: "Pago pequeño", direction: "payable", amount: 20, dueDate: "2026-05-20", status: "active", counterparty: "Proveedor" },
    ],
  });
  assert(plan[0].id === 1, "debe priorizar el cobro vencido que cubre presión de caja");
}

function runHistoryTests() {
  const months = [
    { label: "ene", income: 1000, expense: 400, net: 600, dateFrom: "2026-01-01", dateTo: "2026-01-31" },
    { label: "feb", income: 1000, expense: 420, net: 580, dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    { label: "mar", income: 1000, expense: 410, net: 590, dateFrom: "2026-03-01", dateTo: "2026-03-31" },
    { label: "abr", income: 1000, expense: 1100, net: -100, dateFrom: "2026-04-01", dateTo: "2026-04-30" },
    { label: "may", income: 1000, expense: 1120, net: -120, dateFrom: "2026-05-01", dateTo: "2026-05-31" },
    { label: "jun", income: 1000, expense: 1080, net: -80, dateFrom: "2026-06-01", dateTo: "2026-06-30" },
  ];

  const change = detectHistoryChangePoint(months);
  assert(change?.metric === "expense" && change.direction === "up", "debe detectar una subida fuerte del gasto reciente");

  const clusters = clusterHistoryMonths(months);
  assert(clusters.some((cluster) => cluster.kind === "high-expense" || cluster.kind === "tight"), "debe agrupar meses caros o ajustados");
}

function runHistoryFactorTest() {
  const factor = buildHistoryFactorAnalysis({
    months: [
      { label: "ene", dateFrom: "2026-01-01", dateTo: "2026-01-31", categories: [{ categoryId: 1, name: "Comida", amount: 120 }, { categoryId: 2, name: "Transporte", amount: 40 }] },
      { label: "feb", dateFrom: "2026-02-01", dateTo: "2026-02-28", categories: [{ categoryId: 1, name: "Comida", amount: 130 }, { categoryId: 2, name: "Transporte", amount: 42 }] },
      { label: "mar", dateFrom: "2026-03-01", dateTo: "2026-03-31", categories: [{ categoryId: 1, name: "Comida", amount: 320 }, { categoryId: 2, name: "Transporte", amount: 95 }] },
      { label: "abr", dateFrom: "2026-04-01", dateTo: "2026-04-30", categories: [{ categoryId: 1, name: "Comida", amount: 340 }, { categoryId: 2, name: "Transporte", amount: 98 }] },
    ],
  });

  assert(factor != null, "debe calcular un factor principal con historia suficiente");
  assert(factor.explainedVariancePct > 50, "debe explicar gran parte de la variación cuando dos categorías se mueven juntas");
  assert(factor.topCategories.some((category) => category.name === "Comida"), "debe incluir la categoría dominante");
}

function runEdgeCaseTests() {
  const sparseMovements = [
    expense(50, "", 0, "2026-04-01T10:00:00.000Z", null, null),
    expense(51, "Sin cuenta", 12, "2026-04-02T10:00:00.000Z", null, null),
    { ...expense(52, "Pendiente", 12, "2026-04-02T10:00:00.000Z", null, null), status: "pending" },
  ];

  const patternClusters = buildPatternClusters({
    movements: sparseMovements,
    isCashflow: () => true,
    isIncomeLike: (movement) => movement.movementType === "income",
    getAmount: (movement) => movement.amount,
    now: new Date("2026-04-21T12:00:00.000Z"),
  });
  assert(Array.isArray(patternClusters), "clustering debe tolerar montos cero, textos vacíos y datos incompletos");

  const duplicates = findProbableDuplicateGroups({ movements: sparseMovements, getAmount: (movement) => movement.amount });
  assert(duplicates.length === 0, "duplicados no debe marcar montos cero o pendientes como casos válidos");

  const graph = buildFinancialGraphRank({
    movements: sparseMovements,
    getAmount: (movement) => movement.amount,
    getAccountIds: (movement) => [movement.sourceAccountId, movement.destinationAccountId],
    getCategoryId: (movement) => movement.categoryId,
    getCounterpartyId: (movement) => movement.counterpartyId,
    getFlowKind: () => "expense",
  });
  assert(graph.length > 0, "grafo debe tolerar movimientos sin categoría, cuenta o contraparte");
}

runCategorySuggestionTest();
runDuplicateTest();
runPatternClusteringTest();
runAnomalyTest();
runCashflowTest();
runFinancialGraphTest();
runFocusAndPaymentTests();
runHistoryTests();
runHistoryFactorTest();
runEdgeCaseTests();

console.log("analytics smoke tests passed");
