export type DailyCashflowSample = {
  income: number;
  expense: number;
};

export type MonteCarloCashflowResult = {
  lowBalance: number;
  medianBalance: number;
  highBalance: number;
  pressureThreshold: number;
  pressureProbability: number;
};

type SimulateMonthEndOptions = {
  currentBalance: number;
  committedInflow: number;
  committedOutflow: number;
  dailySamples: DailyCashflowSample[];
  incomeDailyAverage: number;
  expenseDailyAverage: number;
  remainingDays: number;
  iterations?: number;
};

function createSeed(values: number[]) {
  const seed = values.reduce((acc, value, index) => {
    const scaled = Math.round(Math.abs(value) * 100);
    return (acc + scaled * (index + 17)) % 2_147_483_647;
  }, 97_531);
  return seed || 97_531;
}

function createRandom(seedValue: number) {
  let seed = seedValue;
  return () => {
    seed = (seed * 48_271) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
}

function percentile(sortedValues: number[], pct: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * pct)));
  return sortedValues[index];
}

export function simulateMonthEndCashflow({
  currentBalance,
  committedInflow,
  committedOutflow,
  dailySamples,
  incomeDailyAverage,
  expenseDailyAverage,
  remainingDays,
  iterations = 800,
}: SimulateMonthEndOptions): MonteCarloCashflowResult {
  const usableSamples = dailySamples.length > 0
    ? dailySamples
    : [{ income: incomeDailyAverage, expense: expenseDailyAverage }];
  const seed = createSeed([
    currentBalance,
    committedInflow,
    committedOutflow,
    incomeDailyAverage,
    expenseDailyAverage,
    remainingDays,
    usableSamples.length,
  ]);
  const random = createRandom(seed);
  const balances: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let variableIncome = 0;
    let variableExpense = 0;
    for (let day = 0; day < remainingDays; day += 1) {
      const sample = usableSamples[Math.floor(random() * usableSamples.length)] ?? usableSamples[0];
      const incomeNoise = 0.75 + random() * 0.6;
      const expenseNoise = 0.78 + random() * 0.72;
      variableIncome += Math.max(0, sample.income * incomeNoise);
      variableExpense += Math.max(0, sample.expense * expenseNoise);
    }

    const committedInflowNoise = 0.9 + random() * 0.18;
    const committedOutflowNoise = 0.98 + random() * 0.09;
    balances.push(
      currentBalance +
        committedInflow * committedInflowNoise -
        committedOutflow * committedOutflowNoise +
        variableIncome -
        variableExpense,
    );
  }

  balances.sort((a, b) => a - b);
  const pressureThreshold = currentBalance >= 0
    ? Math.max(0, currentBalance * 0.85)
    : currentBalance * 1.15;
  const pressureCount = balances.filter((balance) => balance < pressureThreshold).length;

  return {
    lowBalance: percentile(balances, 0.1),
    medianBalance: percentile(balances, 0.5),
    highBalance: percentile(balances, 0.9),
    pressureThreshold,
    pressureProbability: Math.round((pressureCount / Math.max(balances.length, 1)) * 100),
  };
}
