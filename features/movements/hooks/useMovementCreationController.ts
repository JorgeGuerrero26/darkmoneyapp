import { useMemo } from "react";

import { sortByName } from "../../../lib/sort-locale";
import type { AccountSummary, CategorySummary, MovementType } from "../../../types/domain";
import { filterCategoriesForMovementType } from "../lib/movement-creation-rules";

function parseAmountInput(value: string | number | null | undefined) {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function useMovementCreationController(input: {
  accounts: readonly AccountSummary[];
  categories: readonly CategorySummary[];
  movementType: MovementType | "expense" | "income" | "transfer";
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
  sourceAmount?: string | number | null;
  destinationAmount?: string | number | null;
}) {
  const activeAccountsSorted = useMemo(
    () => sortByName(input.accounts.filter((account) => !account.isArchived)),
    [input.accounts],
  );

  const destinationAccountsSorted = useMemo(() => {
    if (input.movementType === "transfer" && input.sourceAccountId != null) {
      return activeAccountsSorted.filter((account) => account.id !== input.sourceAccountId);
    }
    return activeAccountsSorted;
  }, [activeAccountsSorted, input.movementType, input.sourceAccountId]);

  const categoriesForPicker = useMemo(
    () => filterCategoriesForMovementType(input.categories, input.movementType),
    [input.categories, input.movementType],
  );

  const sourceAccount = useMemo(
    () => input.sourceAccountId == null
      ? null
      : activeAccountsSorted.find((account) => account.id === input.sourceAccountId) ?? null,
    [activeAccountsSorted, input.sourceAccountId],
  );

  const destinationAccount = useMemo(
    () => input.destinationAccountId == null
      ? null
      : activeAccountsSorted.find((account) => account.id === input.destinationAccountId) ?? null,
    [activeAccountsSorted, input.destinationAccountId],
  );

  const sourceAmountNum = useMemo(
    () => parseAmountInput(input.sourceAmount),
    [input.sourceAmount],
  );

  const destinationAmountNum = useMemo(
    () => parseAmountInput(input.destinationAmount),
    [input.destinationAmount],
  );

  const transferCurrenciesDiffer = Boolean(
    input.movementType === "transfer" &&
      sourceAccount &&
      destinationAccount &&
      sourceAccount.currencyCode !== destinationAccount.currencyCode,
  );

  return {
    activeAccountsSorted,
    destinationAccountsSorted,
    categoriesForPicker,
    sourceAccount,
    destinationAccount,
    sourceAmountNum,
    destinationAmountNum,
    transferCurrenciesDiffer,
  };
}
