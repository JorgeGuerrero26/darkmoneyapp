export type MonthlyHistoryPoint = {
  label: string;
  income: number;
  expense: number;
  net: number;
  isFuture?: boolean;
};

export type HistoryChangePoint = {
  title: string;
  body: string;
  metric: "income" | "expense" | "net";
  direction: "up" | "down";
  recentAverage: number;
  previousAverage: number;
  changePct: number;
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function pctChange(current: number, previous: number) {
  if (Math.abs(previous) < 0.009) return current > 0.009 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function detectHistoryChangePoint(months: MonthlyHistoryPoint[]): HistoryChangePoint | null {
  const observed = months.filter((month) => !month.isFuture && (month.income > 0.009 || month.expense > 0.009));
  if (observed.length < 6) return null;

  const recent = observed.slice(-3);
  const previous = observed.slice(-6, -3);
  const metrics: Array<{ key: "income" | "expense" | "net"; label: string }> = [
    { key: "expense", label: "gasto" },
    { key: "income", label: "ingreso" },
    { key: "net", label: "saldo neto" },
  ];

  const ranked = metrics
    .map((metric) => {
      const recentAverage = average(recent.map((month) => month[metric.key]));
      const previousAverage = average(previous.map((month) => month[metric.key]));
      const changePct = pctChange(recentAverage, previousAverage);
      return { ...metric, recentAverage, previousAverage, changePct };
    })
    .filter((item) => Math.abs(item.changePct) >= 18 && Math.abs(item.recentAverage - item.previousAverage) >= 10)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const strongest = ranked[0];
  if (!strongest) return null;

  const direction = strongest.changePct >= 0 ? "up" : "down";
  const recentLabels = `${recent[0].label}-${recent[recent.length - 1].label}`;
  const previousLabels = `${previous[0].label}-${previous[previous.length - 1].label}`;

  return {
    title: `${strongest.label[0].toUpperCase()}${strongest.label.slice(1)} ${direction === "up" ? "subió" : "bajó"} ${Math.abs(strongest.changePct).toFixed(0)}%`,
    body: `Los últimos 3 meses (${recentLabels}) cambiaron frente a los 3 anteriores (${previousLabels}). Esto marca un posible cambio de comportamiento, no solo un mes aislado.`,
    metric: strongest.key,
    direction,
    recentAverage: strongest.recentAverage,
    previousAverage: strongest.previousAverage,
    changePct: strongest.changePct,
  };
}
