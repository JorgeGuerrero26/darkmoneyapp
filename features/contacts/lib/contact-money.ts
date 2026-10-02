import type { WorkspaceSnapshot } from "../../../services/queries/workspace-data";
import { comparableAmount, currencyTotals, catalogMovementAmount, type CurrencyAmount } from "../../../lib/catalog-money";
import { convertAmountToWorkspaceBase } from "../../../lib/subscription-helpers";
import { formatCurrency } from "../../../lib/format-currency";
import { movementActsAsIncome } from "../../../lib/movement-amounts";

export const formatContactAmounts = (items: CurrencyAmount[]) =>
  items.map((item) => formatCurrency(item.amount, item.currencyCode)).join(" · ");

export function buildContactMoney(snapshot: Pick<WorkspaceSnapshot, "obligations" | "subscriptions" | "recurringIncome" | "exchangeRates" | "counterpartyPostedMovements" | "catalogHistoryErrors">, contactId: number, baseCurrency: string) {
  // Some old obligation snapshots labelled the native value as a base value.
  // Reconvert from the original currency rather than trusting that placeholder.
  const convert = (amount: number, currencyCode: string): CurrencyAmount => ({
    amount, currencyCode,
    amountInBaseCurrency: convertAmountToWorkspaceBase(amount, currencyCode, baseCurrency, snapshot.exchangeRates),
  });
  const obligations = (snapshot.obligations ?? []).filter((item) => item.counterpartyId === contactId && item.status !== "cancelled");
  const incoming = obligations.filter((item) => item.direction === "receivable");
  const outgoing = obligations.filter((item) => item.direction === "payable");
  const principal = (item: typeof obligations[number]) => convert(item.currentPrincipalAmount ?? item.principalAmount, item.currencyCode);
  const pending = (item: typeof obligations[number]) => convert(item.pendingAmount, item.currencyCode);
  const rows = (snapshot.counterpartyPostedMovements ?? []).filter((item) => item.counterpartyId === contactId);
  const monetary = (item: typeof rows[number]): CurrencyAmount => ({
    amount: catalogMovementAmount(item), currencyCode: item.amountCurrencyCode ?? baseCurrency,
    amountInBaseCurrency: item.amountInBaseCurrency,
  });
  const flowIn = rows.filter(movementActsAsIncome).map(monetary);
  const flowOut = rows.filter((item) => !movementActsAsIncome(item)).map(monetary);
  const subscriptions = snapshot.subscriptions.filter((item) => item.vendorPartyId === contactId && item.status === "active");
  const incomes = snapshot.recurringIncome.filter((item) => item.payerPartyId === contactId && item.status === "active");
  const sum = (items: CurrencyAmount[]) => items.reduce((total, item) => total + (comparableAmount(item, baseCurrency) ?? 0), 0);
  const missing = (items: CurrencyAmount[]) => items.filter((item) => comparableAmount(item, baseCurrency) == null).length;
  const expense = subscriptions.map((item) => convert(item.amount, item.currencyCode));
  const income = incomes.map((item) => convert(item.amount, item.currencyCode));
  return {
    receivable: currencyTotals(incoming.map(pending), baseCurrency),
    payable: currencyTotals(outgoing.map(pending), baseCurrency),
    inflow: currencyTotals(flowIn, baseCurrency), outflow: currencyTotals(flowOut, baseCurrency),
    scheduledExpense: currencyTotals(expense, baseCurrency), scheduledIncome: currencyTotals(income, baseCurrency),
    receivableCount: incoming.length, payableCount: outgoing.length,
    receivablePendingTotal: sum(incoming.map(pending)), payablePendingTotal: sum(outgoing.map(pending)),
    receivablePrincipalTotal: sum(incoming.map(principal)), payablePrincipalTotal: sum(outgoing.map(principal)),
    inflowTotal: sum(flowIn), outflowTotal: sum(flowOut),
    scheduledExpenseTotal: sum(expense), scheduledIncomeTotal: sum(income),
    hasReceivable: incoming.some((item) => item.pendingAmount > 0), hasPayable: outgoing.some((item) => item.pendingAmount > 0),
    unconvertedExposure: obligations.filter((item) => comparableAmount(pending(item), baseCurrency) == null || comparableAmount(principal(item), baseCurrency) == null).length,
    unconvertedFlow: missing([...flowIn, ...flowOut]),
    unconvertedScheduled: missing([...expense, ...income]),
    flowLoaded: snapshot.counterpartyPostedMovements !== undefined,
    flowError: snapshot.catalogHistoryErrors?.contacts,
    exposureLoaded: snapshot.obligations !== undefined,
  };
}
