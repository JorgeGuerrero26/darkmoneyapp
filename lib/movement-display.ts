import { COLORS } from "../constants/theme";

import { movementActsAsIncome, movementIsTransfer } from "./movement-amounts";

export {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
  movementIsTransfer,
} from "./movement-amounts";

type MovementLike = {
  movementType?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};

export function movementDisplayPrefix(movement: MovementLike) {
  if (movementIsTransfer(movement)) return "";
  return movementActsAsIncome(movement) ? "+" : "−";
}

export function movementDisplayColor(movement: MovementLike) {
  if (movementIsTransfer(movement)) return COLORS.transfer;
  return movementActsAsIncome(movement) ? COLORS.income : COLORS.expense;
}
