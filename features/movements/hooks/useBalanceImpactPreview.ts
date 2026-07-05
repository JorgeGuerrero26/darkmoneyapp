import { useMemo } from "react";

import type { AccountSummary, MovementRecord, MovementType } from "../../../types/domain";

type Params = {
  accounts: AccountSummary[];
  editMovement: MovementRecord | undefined;
  isEditing: boolean;
  movementType: MovementType;
  sourceAccount: AccountSummary | null;
  destinationAccount: AccountSummary | null;
  sourceAmountNum: number;
  destinationAmountNum: number;
  transferCurrenciesDiffer: boolean;
};

/**
 * Proyecciones de saldo del preview de impacto, extraídas de MovementForm
 * (fase 3 del refactor R7). Regla clave al editar un movimiento posted:
 * currentBalance YA refleja el movimiento original, así que primero se revierte
 * el monto original y luego se aplica el nuevo. Si el usuario cambió de cuenta,
 * la cuenta original muestra su saldo revertido por separado.
 */
export function useBalanceImpactPreview({
  accounts,
  editMovement,
  isEditing,
  movementType,
  sourceAccount,
  destinationAccount,
  sourceAmountNum,
  destinationAmountNum,
  transferCurrenciesDiffer,
}: Params) {
  const originalSourceAccount = accounts.find((a) => a.id === (editMovement?.sourceAccountId ?? null)) ?? null;
  const originalDestinationAccount = accounts.find((a) => a.id === (editMovement?.destinationAccountId ?? null)) ?? null;

  const editOriginalSourceAmt =
    isEditing && editMovement?.status === "posted" ? (editMovement.sourceAmount ?? 0) : 0;
  const editOriginalDestAmt =
    isEditing && editMovement?.status === "posted" ? (editMovement.destinationAmount ?? 0) : 0;

  const projectedSourceBalance = useMemo(() => {
    if (!sourceAccount || sourceAmountNum <= 0) return null;
    if (movementType === "income") {
      return sourceAccount.currentBalance + sourceAmountNum;
    }
    // expense / transfer source:
    // if we kept the same account, reverse original amount and apply the new one;
    // if we changed account, only apply the new outgoing amount here.
    if (isEditing && originalSourceAccount && originalSourceAccount.id === sourceAccount.id) {
      return (sourceAccount.currentBalance + editOriginalSourceAmt) - sourceAmountNum;
    }
    return sourceAccount.currentBalance - sourceAmountNum;
  }, [sourceAccount, sourceAmountNum, movementType, editOriginalSourceAmt, isEditing, originalSourceAccount]);

  const projectedDestBalance = useMemo(() => {
    if (!destinationAccount) return null;
    const effectiveNewAmt =
      movementType === "transfer" && !transferCurrenciesDiffer
        ? sourceAmountNum
        : destinationAmountNum;
    if (effectiveNewAmt <= 0) return null;
    // destination:
    // if we kept the same account, reverse original amount and apply the new one;
    // if we changed account, only apply the new incoming amount here.
    if (isEditing && originalDestinationAccount && originalDestinationAccount.id === destinationAccount.id) {
      return (destinationAccount.currentBalance - editOriginalDestAmt) + effectiveNewAmt;
    }
    return destinationAccount.currentBalance + effectiveNewAmt;
  }, [destinationAccount, destinationAmountNum, sourceAmountNum, movementType, transferCurrenciesDiffer, editOriginalDestAmt, isEditing, originalDestinationAccount]);

  const revertedOriginalSourceBalance = useMemo(() => {
    if (!isEditing || !originalSourceAccount || editOriginalSourceAmt <= 0) return null;
    if (originalSourceAccount.id === sourceAccount?.id) return null;
    return originalSourceAccount.currentBalance + editOriginalSourceAmt;
  }, [isEditing, originalSourceAccount, editOriginalSourceAmt, sourceAccount?.id]);

  const revertedOriginalDestBalance = useMemo(() => {
    if (!isEditing || !originalDestinationAccount || editOriginalDestAmt <= 0) return null;
    if (originalDestinationAccount.id === destinationAccount?.id) return null;
    return originalDestinationAccount.currentBalance - editOriginalDestAmt;
  }, [isEditing, originalDestinationAccount, editOriginalDestAmt, destinationAccount?.id]);

  return {
    originalSourceAccount,
    originalDestinationAccount,
    projectedSourceBalance,
    projectedDestBalance,
    revertedOriginalSourceBalance,
    revertedOriginalDestBalance,
  };
}
