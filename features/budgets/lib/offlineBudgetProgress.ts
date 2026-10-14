import { centsText, decimalRatio, roundRatio, selectCalculation, type CalculationGate } from "../../../lib/offline/calculation";
import { exactCents } from "../../../lib/offline/money";

type Row = Record<string, unknown>;
export type BudgetProgressInput = {
  workspaceId: number;
  /** La vista hace occurred_at::date según la sesión SQL. Solo UTC tiene paridad comprobada. */
  serverTimeZone: string;
  budgets: Row[];
  movements: Row[];
  accounts: Row[];
  categories: Row[];
  spendTypes: Row[];
  rates: Row[];
};

function cents(value: unknown): bigint {
  const result = exactCents(value);
  if (result == null) throw new Error("El monto no se puede calcular en centavos exactos.");
  return BigInt(result);
}

function numeric14(centsValue: bigint): string {
  if (centsValue <= -100000000000000n || centsValue >= 100000000000000n) throw new Error("El monto excede el rango del servidor.");
  return centsText(centsValue);
}

/** Réplica de v_budget_progress; no abre períodos ni escribe en las tablas. */
export function computeBudgetProgress(input: BudgetProgressInput): Row[] {
  if (input.serverTimeZone !== "UTC") throw new Error("La zona horaria del servidor todavía no tiene paridad verificada.");
  const inWorkspace = (rows: Row[]) => rows.filter(row => row.workspace_id === input.workspaceId);
  const indexed = (rows: Row[]) => new Map(inWorkspace(rows).map(row => [row.id, row]));
  const accounts = indexed(input.accounts), categories = indexed(input.categories), spendTypes = indexed(input.spendTypes);
  const rates = new Map<string, [bigint, bigint]>();
  for (const rate of input.rates) {
    const key = `${String(rate.from_currency_code).toUpperCase()}:${String(rate.to_currency_code).toUpperCase()}`;
    // Un join SQL con varias tasas del mismo par multiplicaría las filas: no inventar un orden.
    if (rates.has(key)) throw new Error("Hay más de una tasa vigente para el mismo par.");
    rates.set(key, decimalRatio(rate.rate));
  }
  const movements = inWorkspace(input.movements).filter(row => row.status === "posted" && row.source_amount != null &&
    ["expense", "subscription_payment", "obligation_payment"].includes(String(row.movement_type)));

  return inWorkspace(input.budgets).map(budget => {
    const category = categories.get(budget.category_id), account = accounts.get(budget.account_id), spendType = spendTypes.get(budget.spend_type_id);
    const currency = String(budget.currency_code).toUpperCase();
    const limit = cents(budget.limit_amount);
    let spent = 0n, movementCount = 0;
    for (const movement of movements) {
      const occurredAt = new Date(String(movement.occurred_at));
      if (Number.isNaN(occurredAt.getTime())) throw new Error("La fecha del movimiento no es válida.");
      const date = occurredAt.toISOString().slice(0, 10);
      const movementSpendType = movement.spend_type_id ?? categories.get(movement.category_id)?.default_spend_type_id;
      if (date < String(budget.period_start) || date > String(budget.period_end) ||
        (budget.category_id != null && budget.category_id !== movement.category_id) ||
        (budget.account_id != null && budget.account_id !== movement.source_account_id) ||
        (budget.spend_type_id != null && budget.spend_type_id !== movementSpendType)) continue;
      const sourceCurrency = String(accounts.get(movement.source_account_id)?.currency_code ?? currency).toUpperCase();
      const amount = cents(movement.source_amount);
      let converted = amount;
      if (sourceCurrency !== currency) {
        const direct = rates.get(`${sourceCurrency}:${currency}`), inverse = rates.get(`${currency}:${sourceCurrency}`);
        if (direct && direct[0] > 0n) converted = roundRatio(amount * direct[0], direct[1]);
        else if (inverse && inverse[0] > 0n) converted = roundRatio(amount * inverse[1], inverse[0]);
        // El ELSE de la vista conserva el nominal cuando falta una tasa. Paridad, no una tasa inventada.
      }
      numeric14(converted);
      spent += converted; movementCount += 1;
    }
    const percent = limit <= 0n ? 0n : roundRatio(spent * 10000n, limit);
    if (percent <= -10000000n || percent >= 10000000n) throw new Error("El porcentaje excede el rango del servidor.");
    const [alert, alertScale] = decimalRatio(budget.alert_percent);
    const categoryId = budget.category_id, accountId = budget.account_id, spendTypeId = budget.spend_type_id;
    const scopeKind = categoryId != null ? (accountId != null ? "category_account" : "category")
      : spendTypeId != null ? (accountId != null ? "spend_type_account" : "spend_type") : accountId != null ? "account" : "general";
    const accountSuffix = accountId != null ? ` en ${account?.name ?? "cuenta"}` : "";
    const scopeLabel = categoryId != null && spendTypeId != null ? `${category?.name ?? "Categoria"} - ${spendType?.name ?? "tipo"}${accountSuffix}`
      : categoryId != null && accountId != null ? `${category?.name ?? "Categoria"}${accountSuffix}`
      : categoryId != null ? `Categoria: ${category?.name ?? "Sin categoria"}`
      : spendTypeId != null ? `${spendType?.name ?? "Tipo de gasto"}${accountSuffix}`
      : accountId != null ? `Cuenta: ${account?.name ?? "Sin cuenta"}` : "Gasto total del workspace";
    return {
      ...budget, currency_code: currency, category_name: category?.name ?? null, account_name: account?.name ?? null,
      spend_type_name: spendType?.name ?? null, scope_kind: scopeKind, scope_label: scopeLabel,
      limit_amount: numeric14(limit), spent_amount: numeric14(spent), remaining_amount: numeric14(limit - spent),
      used_percent: centsText(percent), movement_count: movementCount,
      is_near_limit: Boolean(budget.is_active) && spent <= limit && percent * alertScale >= alert * 100n,
      is_over_limit: Boolean(budget.is_active) && spent > limit,
    };
  });
}

export function selectBudgetProgress(gate: CalculationGate, input: BudgetProgressInput, serverRows: Row[]) {
  return selectCalculation(gate, serverRows, () => computeBudgetProgress(input));
}
