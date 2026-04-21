export type MonthlyClusterPoint = {
  label: string;
  income: number;
  expense: number;
  net: number;
  dateFrom: string;
  dateTo: string;
  isFuture?: boolean;
};

export type MonthClusterKind =
  | "high-expense"
  | "high-income"
  | "tight"
  | "surplus"
  | "quiet"
  | "normal";

export type MonthCluster = {
  kind: MonthClusterKind;
  title: string;
  description: string;
  count: number;
  monthLabels: string[];
  averageIncome: number;
  averageExpense: number;
  averageNet: number;
  representativeMonth: MonthlyClusterPoint;
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function safeRatio(value: number, baseline: number) {
  if (Math.abs(baseline) < 0.009) return value > 0.009 ? 2 : 1;
  return value / baseline;
}

function classifyMonth(
  month: MonthlyClusterPoint,
  baselines: { income: number; expense: number; net: number },
): { kind: MonthClusterKind; title: string; description: string } {
  const incomeRatio = safeRatio(month.income, baselines.income);
  const expenseRatio = safeRatio(month.expense, baselines.expense);
  const savingsRate = month.income > 0.009 ? month.net / month.income : null;

  if (month.income <= 0.009 && month.expense <= 0.009) {
    return {
      kind: "quiet",
      title: "Mes quieto",
      description: "Casi no tuvo movimientos. Puede ser un mes con poca data o actividad baja.",
    };
  }

  if (expenseRatio >= 1.35 && month.net < baselines.net) {
    return {
      kind: "high-expense",
      title: "Mes caro",
      description: "El gasto estuvo bastante por encima de lo habitual.",
    };
  }

  if (incomeRatio >= 1.35 && month.net > baselines.net) {
    return {
      kind: "high-income",
      title: "Mes de alto ingreso",
      description: "Entró más dinero de lo normal y el resultado del mes mejoró.",
    };
  }

  if (month.net < 0 || (savingsRate != null && savingsRate < 0.03 && month.expense > 0)) {
    return {
      kind: "tight",
      title: "Mes ajustado",
      description: "El mes dejó poco margen o consumió caja.",
    };
  }

  if (savingsRate != null && savingsRate >= 0.2) {
    return {
      kind: "surplus",
      title: "Mes con margen",
      description: "El ingreso cubrió bien el gasto y dejó espacio de ahorro.",
    };
  }

  return {
    kind: "normal",
    title: "Mes normal",
    description: "Se parece a tu comportamiento promedio del año seleccionado.",
  };
}

export function clusterHistoryMonths(months: MonthlyClusterPoint[]): MonthCluster[] {
  const observed = months.filter((month) => !month.isFuture && (month.income > 0.009 || month.expense > 0.009));
  if (observed.length < 3) return [];

  const baselines = {
    income: average(observed.map((month) => month.income)),
    expense: average(observed.map((month) => month.expense)),
    net: average(observed.map((month) => month.net)),
  };

  const grouped = new Map<MonthClusterKind, Array<MonthlyClusterPoint & { title: string; description: string }>>();
  for (const month of observed) {
    const classified = classifyMonth(month, baselines);
    grouped.set(classified.kind, [
      ...(grouped.get(classified.kind) ?? []),
      { ...month, title: classified.title, description: classified.description },
    ]);
  }

  return Array.from(grouped.entries())
    .map(([kind, items]) => {
      const representativeMonth = items
        .slice()
        .sort((a, b) => Math.abs(b.net - baselines.net) - Math.abs(a.net - baselines.net))[0];
      return {
        kind,
        title: representativeMonth.title,
        description: representativeMonth.description,
        count: items.length,
        monthLabels: items.map((item) => item.label),
        averageIncome: average(items.map((item) => item.income)),
        averageExpense: average(items.map((item) => item.expense)),
        averageNet: average(items.map((item) => item.net)),
        representativeMonth,
      };
    })
    .sort((a, b) => {
      const priority: Record<MonthClusterKind, number> = {
        "high-expense": 6,
        tight: 5,
        "high-income": 4,
        surplus: 3,
        normal: 2,
        quiet: 1,
      };
      return priority[b.kind] - priority[a.kind] || b.count - a.count;
    });
}
