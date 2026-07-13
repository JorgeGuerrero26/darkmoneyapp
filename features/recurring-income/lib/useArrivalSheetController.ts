import { useCallback, useState } from "react";
import { format } from "date-fns";

import { useConfirmRecurringIncomeArrivalMutation } from "../../../services/queries/workspace-data";
import { useToast } from "../../../hooks/useToast";
import type { RecurringIncomeSummary } from "../../../types/domain";
import type { RecurringIncomeBaseChangeMode } from "../components/RecurringIncomeArrivalSheet";
import { parseMoneyInput, validateArrivalDraft } from "./arrival-validation";

/**
 * Estado + validación + submit del sheet "¿Llegó tu ingreso?" — compartido por
 * la lista de ingresos fijos y el dashboard. Comportamiento idéntico al que
 * vivía inline en app/recurring-income.tsx.
 */
export function useArrivalSheetController(workspaceId: number | null) {
  const confirmArrivalMutation = useConfirmRecurringIncomeArrivalMutation(workspaceId);
  const { showToast } = useToast();

  const [target, setTarget] = useState<RecurringIncomeSummary | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [baseChangeMode, setBaseChangeMode] = useState<RecurringIncomeBaseChangeMode>("none");
  const [newBaseAmount, setNewBaseAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const open = useCallback((item: RecurringIncomeSummary) => {
    setTarget(item);
    setDate(format(new Date(), "yyyy-MM-dd"));
    setAmount(String(item.amount));
    setAccountId(item.accountId ?? null);
    setBaseChangeMode("none");
    setNewBaseAmount(String(item.amount));
    setNotes("");
    setError("");
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setError("");
  }, []);

  const parsedNewBaseAmount = parseMoneyInput(newBaseAmount);
  const baseDelta = target && parsedNewBaseAmount != null ? parsedNewBaseAmount - target.amount : null;

  const submit = useCallback(async () => {
    if (!target) return;
    const validation = validateArrivalDraft({
      date,
      actualAmount: parseMoneyInput(amount),
      accountId,
      baseChangeMode,
      parsedNewBaseAmount: parseMoneyInput(newBaseAmount),
      currentBaseAmount: target.amount,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      setError("");
      await confirmArrivalMutation.mutateAsync({
        recurringIncomeId: target.id,
        recurringIncomeName: target.name,
        expectedDate: target.nextExpectedDate,
        actualDate: date,
        amount: parseMoneyInput(amount)!,
        accountId: accountId!,
        currentAccountId: target.accountId ?? null,
        categoryId: target.categoryId ?? null,
        payerPartyId: target.payerPartyId ?? null,
        description: target.description ?? null,
        currencyCode: target.currencyCode,
        frequency: target.frequency,
        intervalCount: target.intervalCount,
        currentBaseAmount: target.amount,
        newBaseAmount: validation.nextBaseAmount,
        baseChangeKind: baseChangeMode === "none" ? null : baseChangeMode,
        notes: notes.trim() || null,
      });
      setTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos confirmar la llegada";
      setError(message);
      showToast(message, "error");
    }
  }, [accountId, amount, baseChangeMode, confirmArrivalMutation, date, newBaseAmount, notes, showToast, target]);

  return {
    target,
    open,
    close,
    isPending: confirmArrivalMutation.isPending,
    /** Spread directo en <RecurringIncomeArrivalSheet {...sheetProps} accounts={...} /> */
    sheetProps: {
      visible: Boolean(target),
      item: target,
      date,
      onDateChange: setDate,
      amount,
      onAmountChange: setAmount,
      accountId,
      onAccountIdChange: setAccountId,
      baseChangeMode,
      onBaseChangeModeChange: setBaseChangeMode,
      newBaseAmount,
      onNewBaseAmountChange: setNewBaseAmount,
      notes,
      onNotesChange: setNotes,
      error,
      parsedNewBaseAmount,
      baseDelta,
      loading: confirmArrivalMutation.isPending,
      onClose: close,
      onSubmit: submit,
    },
  };
}
