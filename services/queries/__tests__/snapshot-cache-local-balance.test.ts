import { QueryClient } from "@tanstack/react-query";

import { patchSnapshotWithCreatedMovement } from "../snapshot-cache";

const KEY = ["workspace-snapshot", 1, "core"];

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(KEY, {
    workspaces: [{ id: 1, baseCurrencyCode: "PEN" }],
    accounts: [{ id: 7, currencyCode: "PEN", currentBalance: 48.8, currentBalanceInBaseCurrency: 48.8 }],
    exchangeRates: [],
    categoryPostedMovements: [],
    subscriptionPostedMovements: [],
    counterpartyPostedMovements: [],
  });
  return queryClient;
}

const income = {
  id: 1, status: "posted", movementType: "income", occurredAt: "2026-10-13T12:00:00.000Z",
  sourceAccountId: null, sourceAmount: null, destinationAccountId: 7, destinationAmount: 1,
};

describe("patchSnapshotWithCreatedMovement y el saldo del motor offline", () => {
  it("camino de siempre: suma el movimiento al saldo del cache", () => {
    const queryClient = setup();
    patchSnapshotWithCreatedMovement(queryClient, 1, income);
    expect((queryClient.getQueryData(KEY) as { accounts: Array<{ currentBalance: number }> }).accounts[0].currentBalance).toBeCloseTo(49.8, 5);
  });

  it("guardado en local: el saldo del cache ya lo incluye y no se suma otra vez", () => {
    const queryClient = setup();
    patchSnapshotWithCreatedMovement(queryClient, 1, income, { balances: false });
    expect((queryClient.getQueryData(KEY) as { accounts: Array<{ currentBalance: number }> }).accounts[0].currentBalance).toBeCloseTo(48.8, 5);
  });
});
