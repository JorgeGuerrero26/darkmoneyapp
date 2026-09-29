import { useMemo } from "react";

import { movementActsAsIncome, movementDisplayAccountId, movementDisplayAmount } from "../../../lib/movement-amounts";
import { DASHBOARD_MOVEMENTS_WINDOW_DAYS, PROJECTION_HISTORY_MONTHS } from "../../../services/queries/workspace-data";
import { buildCashflowCalendar, typicalMonthlySpend } from "../../projection/lib/cashflow-calendar";
import { monthlyDiscretionarySpend } from "../../projection/lib/discretionary-history";
import { liquidBalance } from "../../projection/lib/liquid-balance";
import { convertAmt, expenseAmt, isExpense } from "../lib/aggregations";
import type { DashboardMovementRow } from "../lib/dashboard-row";
import type { ConversionCtx } from "../lib/types";

export { PROJECTION_HISTORY_MONTHS };

export type ProjectionObligationInput = {
  id?: number;
  title: string;
  direction: string;
  status: string;
  currencyCode: string;
  pendingAmount: number;
  currentPrincipalAmount?: number | null;
  principalAmount: number;
  startDate: string;
  dueDate: string | null;
  paymentPlan?: unknown;
  installmentAmount?: number | null;
  lastPaymentDate?: string | null;
  events?: ReadonlyArray<{ eventType: string; amount: number; eventDate: string }>;
};

export type CashflowProjectionInputs = {
  movements: DashboardMovementRow[];
  /**
   * Seis meses terminados para medir el gasto típico (`useProjectionHistoryQuery`). Sin él se
   * cae a los 90 días de `movements`, que dan solo dos meses: la mediana de dos es su promedio y
   * no descarta nada. Mientras llega, se usa lo que hay.
   */
  historyMovements?: DashboardMovementRow[];
  /** Desde cuándo está cargado `historyMovements`. */
  historyCoveredFrom?: Date | null;
  obligations: ProjectionObligationInput[];
  subscriptions: Array<{
    id?: number;
    name: string;
    amount: number;
    currencyCode: string;
    frequency: string;
    intervalCount?: number | null;
    nextDueDate: string;
    endDate?: string | null;
    status: string;
  }>;
  recurringIncome: Array<{
    id?: number;
    name: string;
    amount: number;
    currencyCode: string;
    frequency: string;
    intervalCount?: number | null;
    nextExpectedDate: string;
    endDate?: string | null;
    status: string;
  }>;
  displayCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
  accountCurrencyMap: Map<number, string>;
  /** Las cuentas con su tipo: la proyección arranca del saldo LÍQUIDO, no del patrimonio neto. */
  accounts: Array<{
    id?: number;
    name?: string;
    type?: string | null;
    currencyCode?: string | null;
    currentBalance?: number | null;
    isArchived?: boolean | null;
    paymentDay?: number | null;
  }>;
};

/**
 * La proyección de flujo, calculada en UN solo sitio.
 *
 * Existe porque el inicio tenía dos cierres calculados de dos formas: "Fin de mes" en Resumen,
 * con su propia lógica (miraba solo la fecha final de cada deuda, así que ninguna cuota entraba),
 * y "Proyección" en Flujo. El usuario pidió lo evidente: que el cierre de este mes sea el mismo
 * número en las dos pantallas. La única forma de garantizarlo es que las dos llamen a esto.
 *
 * El primer mes no depende del horizonte, así que pedir 1 mes o 12 da el mismo cierre de mes.
 */
export function useCashflowProjection(inputs: CashflowProjectionInputs, months: number) {
  const {
    movements,
    historyMovements,
    historyCoveredFrom,
    obligations,
    subscriptions,
    recurringIncome,
    displayCurrency,
    baseCurrency,
    exchangeRateMap,
    accountCurrencyMap,
    accounts,
  } = inputs;

  const liquid = useMemo(
    () =>
      liquidBalance(accounts, (amount, currency) =>
        convertAmt(amount, currency, displayCurrency, exchangeRateMap, baseCurrency),
      ),
    [accounts, displayCurrency, exchangeRateMap, baseCurrency],
  );

  const conversionCtx = useMemo<ConversionCtx>(
    () => ({ accountCurrencyMap, exchangeRateMap, displayCurrency, baseCurrency }),
    [accountCurrencyMap, exchangeRateMap, displayCurrency, baseCurrency],
  );

  /** Tarjetas activas. El resto de cuentas no gasta en un mes y cobra en otro. */
  const cardAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived && account.type === "credit_card"),
    [accounts],
  );
  const cardIds = useMemo(
    () => new Set(cardAccounts.map((account) => Number(account.id)).filter((id) => Number.isFinite(id))),
    [cardAccounts],
  );

  /*
   * De dónde sale el historial y hasta dónde llega. Un mes anterior a lo cargado no es un mes sin
   * gasto: es un mes que no se cargó, y tratarlo como cero parte la mediana.
   */
  const historySource = historyMovements ?? movements;
  const coveredFrom = useMemo(() => {
    if (historyMovements && historyCoveredFrom) return historyCoveredFrom;
    const from = new Date();
    from.setDate(from.getDate() - DASHBOARD_MOVEMENTS_WINDOW_DAYS);
    return from;
  }, [historyMovements, historyCoveredFrom]);

  const typicalSpend = useMemo(() => {
    // Lo cargado a una tarjeta NO entra aquí: sale por su propia línea, en el mes en que se
    // paga. Si se colara, se restaría dos veces y además en el mes equivocado.
    const history = monthlyDiscretionarySpend({
      movements: historySource,
      months: PROJECTION_HISTORY_MONTHS,
      earliestCoveredDate: coveredFrom,
      expenseAmountOf: (movement) => {
        if (!isExpense(movement)) return 0;
        const accountId = movementDisplayAccountId(movement);
        if (accountId != null && cardIds.has(accountId)) return 0;
        return expenseAmt(movement, conversionCtx);
      },
    });
    // Los meses medidos, con su nombre: la pantalla los enseña para que el número se pueda
    // auditar en vez de creerlo. `monthlyDiscretionarySpend` devuelve los últimos meses
    // terminados cubiertos, del más viejo al más reciente.
    const now = new Date();
    const months = history.map((total, index) => {
      const back = history.length - index;
      const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return { monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, total };
    });
    return { typical: typicalMonthlySpend(history), monthsUsed: history.length, months };
  }, [historySource, coveredFrom, conversionCtx, cardIds]);

  /** Una entrada por tarjeta: lo que ya se debe y lo que se le suele cargar al mes. */
  const creditCards = useMemo(() => {
    return cardAccounts.map((account) => {
      const id = Number(account.id);
      const perCard = monthlyDiscretionarySpend({
        movements: historySource,
        months: PROJECTION_HISTORY_MONTHS,
        earliestCoveredDate: coveredFrom,
        expenseAmountOf: (movement) => {
          if (!isExpense(movement)) return 0;
          return movementDisplayAccountId(movement) === id ? expenseAmt(movement, conversionCtx) : 0;
        },
      });
      // El saldo de una tarjeta es negativo cuando se debe. Un saldo a favor no es una deuda.
      const balance = Number(account.currentBalance ?? 0);
      return {
        id,
        name: account.name ?? "Tarjeta",
        currencyCode: account.currencyCode ?? baseCurrency,
        currentDebt: Math.max(0, -balance),
        paymentDay: account.paymentDay ?? null,
        typicalMonthlySpend: typicalMonthlySpend(perCard),
      };
    });
  }, [cardAccounts, historySource, coveredFrom, conversionCtx, baseCurrency]);

  /** Lo anotado con fecha futura: la maestría de abril entra en abril. */
  const plannedMovements = useMemo(() => {
    const now = new Date();
    return movements
      .filter((movement) => movement.status === "planned" && new Date(movement.occurredAt) > now)
      .map((movement) => {
        const income = movementActsAsIncome(movement);
        const accountId = movementDisplayAccountId(movement);
        return {
          id: movement.id,
          description: movement.description || (income ? "Ingreso planificado" : "Gasto planificado"),
          signedAmount: movementDisplayAmount(movement) * (income ? 1 : -1),
          currencyCode: (accountId ? accountCurrencyMap.get(accountId) : undefined) ?? baseCurrency,
          occurredAt: movement.occurredAt,
        };
      });
  }, [movements, accountCurrencyMap, baseCurrency]);

  const projectionObligations = useMemo(
    () =>
      obligations.map((obligation) => ({
        id: obligation.id,
        title: obligation.title,
        direction: obligation.direction,
        status: obligation.status,
        currencyCode: obligation.currencyCode,
        pendingAmount: obligation.pendingAmount,
        // El principal vigente manda: con aumentos o reducciones, el de apertura ya no dice cuánto
        // se debe y las cuotas saldrían corridas.
        principalCurrentAmount: obligation.currentPrincipalAmount ?? obligation.principalAmount,
        openingPrincipal: obligation.principalAmount,
        startDate: obligation.startDate,
        dueDate: obligation.dueDate,
        paymentPlan: obligation.paymentPlan,
        installmentAmount: obligation.installmentAmount,
        lastPaymentDate: obligation.lastPaymentDate ?? null,
        // Los mismos cobros con los que el detalle de la deuda pinta su avance.
        payments: (obligation.events ?? [])
          .filter((event) => event.eventType === "payment")
          .map((event) => ({ amount: event.amount, date: event.eventDate })),
        // Una deuda compartida se lee al revés: la marca viaja tal cual al motor.
        ...("viewerMode" in obligation ? { viewerMode: (obligation as { viewerMode?: unknown }).viewerMode } : {}),
      })),
    [obligations],
  );

  const projection = useMemo(() => {
    const today = new Date();
    const fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;

    return buildCashflowCalendar({
      startingBalance: liquid.total,
      fromDate,
      months,
      typicalDiscretionarySpend: typicalSpend.typical,
      convert: (amount, fromCurrency) =>
        convertAmt(amount, fromCurrency, displayCurrency, exchangeRateMap, baseCurrency),
      recurringIncome,
      subscriptions,
      obligations: projectionObligations,
      plannedMovements,
      creditCards,
    });
  }, [
    baseCurrency,
    liquid.total,
    displayCurrency,
    exchangeRateMap,
    months,
    projectionObligations,
    creditCards,
    plannedMovements,
    recurringIncome,
    subscriptions,
    typicalSpend,
  ]);

  return { projection, liquid, typicalSpend };
}
