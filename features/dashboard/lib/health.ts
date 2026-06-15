/**
 * Salud financiera unificada (web + móvil). Score 0-100 con 4 sub-indicadores,
 * tomando la mecánica del móvil pero con los inputs sólidos de la web:
 * - dinero = solo líquido (cash/bank/savings), lo decide el caller
 * - cobertura = liquidMoney / gasto promedio de 6 meses (estable)
 * - savingsRate = periodNet / periodIncome (mismo período en ambas plataformas)
 */

export type HealthTone = "success" | "warning" | "danger";

export type HealthIndicator = {
  key: "savings" | "coverage" | "debt" | "overdue";
  label: string;
  score: number;
  valueLabel: string;
  interpret: string;
};

export type HealthScoreResult = {
  score: number;
  tone: HealthTone;
  headline: string;
  savingsRate: number | null;
  coverageMonths: number | null;
  debtToIncomeRatio: number | null;
  overdueCount: number;
  indicators: HealthIndicator[];
};

export type BuildHealthScoreInput = {
  /** Dinero líquido (solo cash/bank/savings), ya convertido a la moneda de vista. */
  liquidMoney: number;
  /** Gasto promedio mensual de los últimos 6 meses. */
  averageMonthlyExpense: number;
  /** Ingreso del período (mismo período que usa el resto del dashboard). */
  periodIncome: number;
  /** Neto del período (income - expense). */
  periodNet: number;
  /** Total por pagar (obligaciones activas payable), convertido. */
  totalPayable: number;
  /** Cantidad de obligaciones vencidas. */
  overdueCount: number;
};

/** Mapea un valor a 100/75/50/25 según tres umbrales descendentes. */
function scoreFor(value: number, thresholds: [number, number, number]): number {
  if (value >= thresholds[0]) return 100;
  if (value >= thresholds[1]) return 75;
  if (value >= thresholds[2]) return 50;
  return 25;
}

export function buildHealthScore(input: BuildHealthScoreInput): HealthScoreResult {
  const { liquidMoney, averageMonthlyExpense, periodIncome, periodNet, totalPayable, overdueCount } =
    input;

  const savingsRate = periodIncome > 0 ? periodNet / periodIncome : null;
  const coverageMonths = averageMonthlyExpense > 0 ? liquidMoney / averageMonthlyExpense : null;
  const debtToIncomeRatio = periodIncome > 0 ? totalPayable / periodIncome : null;

  // Sub-scores (cuando falta el dato, se asume el mejor caso neutral del móvil).
  const s1 = scoreFor(savingsRate ?? 0, [0.2, 0.1, 0]);
  const s2 = scoreFor(coverageMonths ?? 12, [6, 3, 1]);
  const s3 = scoreFor(1 - Math.min(debtToIncomeRatio ?? 0, 1.5) / 1.5, [0.8, 0.5, 0.2]);
  const s4 = overdueCount === 0 ? 100 : overdueCount === 1 ? 75 : overdueCount === 2 ? 50 : 25;

  const score = Math.round((s1 + s2 + s3 + s4) / 4);
  const tone: HealthTone = score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
  const headline =
    score >= 80
      ? "Finanzas en buen estado — sin señales de alerta."
      : score >= 60
        ? "Estado aceptable — hay áreas que mejorar."
        : "Varias señales de alerta — revisa los indicadores en rojo.";

  const indicators: HealthIndicator[] = [
    {
      key: "savings",
      label: "Tasa de ahorro",
      score: s1,
      valueLabel: savingsRate !== null ? `${(savingsRate * 100).toFixed(1)}% del ingreso` : "Sin ingresos",
      interpret:
        s1 >= 75
          ? "Buen margen — ahorras más del 20% del ingreso."
          : s1 >= 50
            ? "Ahorro por debajo del 10% — margen ajustado."
            : (savingsRate ?? 0) < 0
              ? "Gastos superan los ingresos este período."
              : "Ahorrando poco — sin margen para imprevistos.",
    },
    {
      key: "coverage",
      label: "Meses de cobertura",
      score: s2,
      valueLabel: coverageMonths !== null ? `${coverageMonths.toFixed(1)} meses` : "Sin referencia",
      interpret:
        s2 >= 75
          ? "Cobertura sólida — más de 6 meses de reserva."
          : s2 >= 50
            ? "Cobertura suficiente, pero ajustada (3–6 meses)."
            : "Menos de 3 meses de reserva — zona de precaución.",
    },
    {
      key: "debt",
      label: "Relación deuda/ingreso",
      score: s3,
      valueLabel: debtToIncomeRatio !== null ? `${(debtToIncomeRatio * 100).toFixed(1)}%` : "Sin ingresos",
      interpret:
        s3 >= 75
          ? "Deuda manejable respecto al ingreso."
          : s3 >= 50
            ? "Obligaciones moderadas — monitorear de cerca."
            : "Obligaciones elevadas vs ingresos — prioriza resolver.",
    },
    {
      key: "overdue",
      label: "Obligaciones al día",
      score: s4,
      valueLabel: overdueCount === 0 ? "Sin vencidas" : `${overdueCount} vencidas`,
      interpret:
        overdueCount === 0
          ? "Todo al día — sin compromisos vencidos."
          : overdueCount === 1
            ? "Hay 1 obligación vencida — actúa pronto."
            : `${overdueCount} obligaciones vencidas — requieren atención urgente.`,
    },
  ];

  return { score, tone, headline, savingsRate, coverageMonths, debtToIncomeRatio, overdueCount, indicators };
}
