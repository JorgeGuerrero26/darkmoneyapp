export type MonthlyCategoryFactorPoint = {
  label: string;
  dateFrom: string;
  dateTo: string;
  isFuture?: boolean;
  categories: Array<{
    categoryId: number | null;
    name: string;
    amount: number;
  }>;
};

export type HistoryFactorCategory = {
  categoryId: number | null;
  name: string;
  amount: number;
  weight: number;
  direction: "sube_con_el_cambio" | "baja_con_el_cambio";
};

export type HistoryFactorAnalysis = {
  title: string;
  body: string;
  explainedVariancePct: number;
  topCategories: HistoryFactorCategory[];
  activeMonths: Array<{
    label: string;
    dateFrom: string;
    dateTo: string;
    score: number;
  }>;
};

type BuildHistoryFactorAnalysisOptions = {
  months: MonthlyCategoryFactorPoint[];
  maxCategories?: number;
};

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function vectorNorm(values: number[]) {
  return Math.sqrt(sum(values.map((value) => value * value)));
}

function multiplyCovariance(matrix: number[][], vector: number[]) {
  const rows = matrix.length;
  const cols = vector.length;
  const result = Array.from({ length: cols }, () => 0);

  for (let row = 0; row < rows; row += 1) {
    let projection = 0;
    for (let col = 0; col < cols; col += 1) {
      projection += matrix[row][col] * vector[col];
    }
    for (let col = 0; col < cols; col += 1) {
      result[col] += matrix[row][col] * projection;
    }
  }

  return result;
}

function orientVector(vector: number[], totals: number[]) {
  const weightedDirection = vector.reduce((acc, value, index) => acc + value * totals[index], 0);
  return weightedDirection < 0 ? vector.map((value) => -value) : vector;
}

export function buildHistoryFactorAnalysis({
  months,
  maxCategories = 8,
}: BuildHistoryFactorAnalysisOptions): HistoryFactorAnalysis | null {
  const observed = months.filter((month) => !month.isFuture && month.categories.some((category) => category.amount > 0.009));
  if (observed.length < 3) return null;

  const categoryTotals = new Map<number | null, { name: string; amount: number }>();
  for (const month of observed) {
    for (const category of month.categories) {
      if (category.amount <= 0.009) continue;
      const key = category.categoryId ?? null;
      const current = categoryTotals.get(key) ?? { name: category.name, amount: 0 };
      categoryTotals.set(key, { name: current.name, amount: current.amount + category.amount });
    }
  }

  const columns = Array.from(categoryTotals.entries())
    .map(([categoryId, value]) => ({ categoryId, name: value.name, total: value.amount }))
    .filter((category) => category.total > 0.009)
    .sort((a, b) => b.total - a.total)
    .slice(0, maxCategories);

  if (columns.length < 2) return null;

  const rawMatrix = observed.map((month) => {
    const amounts = new Map(month.categories.map((category) => [category.categoryId ?? null, category.amount]));
    return columns.map((column) => amounts.get(column.categoryId) ?? 0);
  });

  const means = columns.map((_, col) => sum(rawMatrix.map((row) => row[col])) / observed.length);
  const centered = rawMatrix.map((row) => row.map((value, col) => value - means[col]));
  const totalVariance = sum(centered.flat().map((value) => value * value));
  if (totalVariance <= 0.009) return null;

  let vector = Array.from({ length: columns.length }, () => 1 / Math.sqrt(columns.length));
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const next = multiplyCovariance(centered, vector);
    const norm = vectorNorm(next);
    if (norm <= 0.000001) return null;
    vector = next.map((value) => value / norm);
  }
  vector = orientVector(vector, columns.map((column) => column.total));

  const eigenVector = multiplyCovariance(centered, vector);
  const eigenValue = Math.max(0, vector.reduce((acc, value, index) => acc + value * eigenVector[index], 0));
  const explainedVariancePct = Math.max(1, Math.min(99, Math.round((eigenValue / totalVariance) * 100)));

  const categoryWeights = columns
    .map((column, index) => ({
      categoryId: column.categoryId,
      name: column.name,
      amount: column.total,
      rawWeight: vector[index],
      absWeight: Math.abs(vector[index]),
    }))
    .sort((a, b) => b.absWeight - a.absWeight || b.amount - a.amount);

  const topCategories = categoryWeights.slice(0, 4).map((category): HistoryFactorCategory => ({
    categoryId: category.categoryId,
    name: category.name,
    amount: category.amount,
    weight: Math.round(category.absWeight * 100),
    direction: category.rawWeight >= 0 ? "sube_con_el_cambio" : "baja_con_el_cambio",
  }));

  const monthScores = observed
    .map((month, rowIndex) => ({
      label: month.label,
      dateFrom: month.dateFrom,
      dateTo: month.dateTo,
      score: centered[rowIndex].reduce((acc, value, col) => acc + value * vector[col], 0),
    }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);

  const topNames = topCategories.slice(0, 3).map((category) => category.name);
  const title = topNames.length >= 2
    ? `${topNames[0]} + ${topNames[1]} explican el cambio`
    : `${topNames[0] ?? "Tus categorías"} explican el cambio`;

  return {
    title,
    body: `Este cálculo junta los meses y busca qué partidas se mueven juntas. Explica ${explainedVariancePct}% de la variación observada: cuando estas partidas cambian, el mes suele cambiar con ellas.`,
    explainedVariancePct,
    topCategories,
    activeMonths: monthScores,
  };
}
