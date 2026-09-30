/** Base común de Salud y de los días de caja. Solo recibe meses completos. */
export function healthBaselineFromMonths(months: readonly { income: number; expense: number }[]) {
  const active = months.filter((month) => month.income > 0.009 || month.expense > 0.009);
  const monthsUsed = active.length;
  const income = active.reduce((sum, month) => sum + month.income, 0);
  const expense = active.reduce((sum, month) => sum + month.expense, 0);
  const averageIncome = monthsUsed > 0 ? income / monthsUsed : 0;
  const averageExpense = monthsUsed > 0 ? expense / monthsUsed : 0;
  return { averageIncome, averageExpense, averageNet: averageIncome - averageExpense, monthsUsed };
}

export function reserveDays(liquidBalance: number, monthlyExpense: number) {
  return monthlyExpense > 0 ? Math.round(liquidBalance / monthlyExpense * 30) : 0;
}
