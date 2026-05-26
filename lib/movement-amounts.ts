/**
 * Pure (RN-free) movement amount helpers. Mirrors the relevant subset of
 * lib/movement-display.ts without depending on constants/theme.ts (which
 * carries side-effects via React Native). Used by selectors and tests.
 *
 * Keep this in sync with lib/movement-display.ts (or refactor that file to
 * re-export from here).
 */

type MovementLike = {
  movementType?: string | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};

function toNumber(value: number | null | undefined) {
  return Number(value ?? 0);
}

export function movementIsTransfer(movement: MovementLike) {
  return movement.movementType === "transfer";
}

export function movementActsAsIncome(movement: MovementLike) {
  if (movement.movementType === "income" || movement.movementType === "refund") return true;
  if (movement.movementType === "expense" || movement.movementType === "subscription_payment") return false;
  if (movementIsTransfer(movement)) return false;
  return toNumber(movement.destinationAmount) > toNumber(movement.sourceAmount);
}

export function movementActsAsExpense(movement: MovementLike) {
  if (movementIsTransfer(movement)) return false;
  return !movementActsAsIncome(movement);
}

export function movementDisplayAmount(movement: MovementLike) {
  const raw = movementActsAsIncome(movement)
    ? movement.destinationAmount ?? movement.sourceAmount ?? 0
    : movement.sourceAmount ?? movement.destinationAmount ?? 0;
  return Math.abs(toNumber(raw));
}

export function movementDisplayAccountId(movement: MovementLike) {
  if (movementIsTransfer(movement)) {
    return movement.sourceAccountId ?? movement.destinationAccountId ?? null;
  }
  return movementActsAsIncome(movement)
    ? movement.destinationAccountId ?? movement.sourceAccountId ?? null
    : movement.sourceAccountId ?? movement.destinationAccountId ?? null;
}
