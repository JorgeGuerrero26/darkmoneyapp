import { useCallback, useState } from "react";
import { format } from "date-fns";

import { useConfirmRecurringIncomeArrivalMutation } from "../../../services/queries/workspace-data";
import { useToast } from "../../../hooks/useToast";
import type { RecurringIncomeSummary } from "../../../types/domain";
import {
  parseMoneyInput,
  validateArrivalDraft,
  type RecurringIncomeBaseChangeMode,
} from "./arrival-validation";

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
  const [baseChangeMode, setBaseChangeMode] = useState<RecurringIncomeBaseChangeMode>("once");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  /**
   * `arrivalDate` es la llegada que se está anotando.
   *
   * Desde el detalle se anotan las que quedaron sin confirmar, y abrir siempre en "hoy" obligaba
   * a corregir la fecha a mano — equivocarse ahí desplaza el calendario entero. Desde la lista y
   * el dashboard no se pasa: ahí se anota la de hoy.
   */
  const open = useCallback((item: RecurringIncomeSummary, arrivalDate?: string) => {
    setTarget(item);
    setDate(arrivalDate ?? format(new Date(), "yyyy-MM-dd"));
    // Con dos decimales: "2630.5" al lado de una tarjeta que dice "S/ 2,630.50" hacía ver el
    // campo como dato en bruto justo al confirmar plata.
    setAmount(item.amount.toFixed(2));
    setAccountId(item.accountId ?? null);
    setBaseChangeMode("once");
    setNotes("");
    setError("");
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setError("");
  }, []);

  const submit = useCallback(async () => {
    if (!target) return;
    const validation = validateArrivalDraft({
      date,
      actualAmount: parseMoneyInput(amount),
      accountId,
      baseChangeMode,
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
        /* La dirección sale de los montos, no de una cápsula: el usuario ya no declara un
           motivo, declara que de ahora en adelante llega esto. */
        baseChangeKind:
          validation.nextBaseAmount == null
            ? null
            : validation.nextBaseAmount > target.amount
              ? "bonus"
              : "discount",
        notes: notes.trim() || null,
      });
      setTarget(null);
      showToast("Llegada confirmada", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos confirmar la llegada";
      setError(message);
      showToast(message, "error");
    }
  }, [accountId, amount, baseChangeMode, confirmArrivalMutation, date, notes, showToast, target]);

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
      notes,
      onNotesChange: setNotes,
      error,
      loading: confirmArrivalMutation.isPending,
      onClose: close,
      onSubmit: submit,
    },
  };
}
