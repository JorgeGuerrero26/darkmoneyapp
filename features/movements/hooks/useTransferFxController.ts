import { useEffect, useMemo, useRef, useState } from "react";

import { useSyncExchangeRatePairMutation } from "../../../services/queries/workspace-data";
import type { AccountSummary, ExchangeRateSummary, MovementType } from "../../../types/domain";
import {
  findTransferExchangeRate,
  formatExchangeRateInput,
  formatExchangeRateLabel,
  formatTransferAmount,
  parseDecimalInput,
  type TransferFxState,
} from "../lib/movement-form-support";

type Params = {
  visible: boolean;
  movementType: MovementType;
  transferCurrenciesDiffer: boolean;
  sourceAccount: AccountSummary | null;
  destinationAccount: AccountSummary | null;
  exchangeRates: ExchangeRateSummary[];
  sourceAmountNum: number;
  destinationAmountNum: number;
  destinationAmount: string;
  /** Aplica el monto destino autocalculado al form ("" limpia el campo). */
  onAutoDestinationAmount: (value: string) => void;
};

/**
 * Estado y sincronización del tipo de cambio en transferencias multi-moneda,
 * extraído de MovementForm (fase 2 del refactor R7). Reglas que preserva:
 * - Al cambiar el par de monedas se pide la tasa viva a la API (una vez por par
 *   visible); mientras tanto se usa la última tasa local persistida.
 * - Si el usuario edita la tasa a mano, manda la manual.
 * - Si el usuario edita el monto destino a mano, la tasa se deriva de los montos.
 * - Si no editó nada, el monto destino se autocalcula con la tasa efectiva.
 */
export function useTransferFxController({
  visible,
  movementType,
  transferCurrenciesDiffer,
  sourceAccount,
  destinationAccount,
  exchangeRates,
  sourceAmountNum,
  destinationAmountNum,
  destinationAmount,
  onAutoDestinationAmount,
}: Params) {
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();
  const [transferDestinationEdited, setTransferDestinationEdited] = useState(false);
  const [transferRateInput, setTransferRateInput] = useState("");
  const [transferRateEdited, setTransferRateEdited] = useState(false);
  const [transferLiveRate, setTransferLiveRate] = useState<TransferFxState | null>(null);
  const [transferRateError, setTransferRateError] = useState<string | null>(null);

  // Callback en ref: los efectos de autocálculo NO deben re-dispararse porque el
  // padre re-cree la función (mismo contrato que el código original, que omitía
  // patch de las dependencias).
  const onAutoDestinationAmountRef = useRef(onAutoDestinationAmount);
  onAutoDestinationAmountRef.current = onAutoDestinationAmount;
  const syncPairRef = useRef(syncExchangeRatePair);
  syncPairRef.current = syncExchangeRatePair;

  const transferFxSuggestion = useMemo(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    const local = findTransferExchangeRate(
      exchangeRates,
      sourceAccount.currencyCode,
      destinationAccount.currencyCode,
    );
    return local
      ? { ...local, source: "local" as const, provider: undefined }
      : null;
  }, [destinationAccount, exchangeRates, sourceAccount, transferCurrenciesDiffer]);

  const transferPairKey = useMemo(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    return `${sourceAccount.currencyCode.toUpperCase()}:${destinationAccount.currencyCode.toUpperCase()}`;
  }, [destinationAccount, sourceAccount, transferCurrenciesDiffer]);

  useEffect(() => {
    if (!visible || !transferPairKey || !sourceAccount || !destinationAccount) {
      setTransferLiveRate(null);
      setTransferRateError(null);
      return;
    }

    let cancelled = false;
    const fromCurrencyCode = sourceAccount.currencyCode.toUpperCase();
    const toCurrencyCode = destinationAccount.currencyCode.toUpperCase();
    setTransferRateError(null);
    setTransferLiveRate(null);
    setTransferRateEdited(false);
    setTransferRateInput("");

    void syncPairRef.current.mutateAsync({ fromCurrencyCode, toCurrencyCode })
      .then((result) => {
        if (cancelled) return;
        setTransferLiveRate({
          rate: result.rate,
          effectiveAt: result.effectiveAt,
          source: "api",
          provider: result.provider,
          label: formatExchangeRateLabel(fromCurrencyCode, toCurrencyCode, result.rate),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setTransferRateError(error instanceof Error ? error.message : "No se pudo actualizar el tipo de cambio");
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferPairKey, visible]);

  const transferBaseFxSuggestion = transferLiveRate ?? transferFxSuggestion;
  const transferManualRate = parseDecimalInput(transferRateInput);
  const effectiveTransferFxSuggestion = useMemo<TransferFxState | null>(() => {
    if (!transferCurrenciesDiffer || !sourceAccount || !destinationAccount) return null;
    const from = sourceAccount.currencyCode.toUpperCase();
    const to = destinationAccount.currencyCode.toUpperCase();
    if (transferRateEdited) {
      if (!transferManualRate) return null;
      return {
        rate: transferManualRate,
        effectiveAt: null,
        source: "manual",
        label: formatExchangeRateLabel(from, to, transferManualRate),
      };
    }
    return transferBaseFxSuggestion ?? null;
  }, [
    destinationAccount,
    sourceAccount,
    transferBaseFxSuggestion,
    transferCurrenciesDiffer,
    transferManualRate,
    transferRateEdited,
  ]);

  useEffect(() => {
    if (!transferCurrenciesDiffer) {
      if (transferRateInput) setTransferRateInput("");
      setTransferRateEdited(false);
      setTransferLiveRate(null);
      setTransferRateError(null);
      return;
    }
    if (transferRateEdited || !transferBaseFxSuggestion) return;
    const nextRate = formatExchangeRateInput(transferBaseFxSuggestion.rate);
    if (nextRate && nextRate !== transferRateInput) {
      setTransferRateInput(nextRate);
    }
  }, [transferBaseFxSuggestion, transferCurrenciesDiffer, transferRateEdited, transferRateInput]);

  useEffect(() => {
    if (movementType !== "transfer" || !transferCurrenciesDiffer || !transferDestinationEdited) return;
    if (sourceAmountNum <= 0 || destinationAmountNum <= 0) return;

    const nextRate = formatExchangeRateInput(destinationAmountNum / sourceAmountNum);
    if (!nextRate) return;
    if (!transferRateEdited) setTransferRateEdited(true);
    if (nextRate !== transferRateInput) {
      setTransferRateInput(nextRate);
    }
  }, [
    destinationAmountNum,
    movementType,
    sourceAmountNum,
    transferCurrenciesDiffer,
    transferDestinationEdited,
    transferRateEdited,
    transferRateInput,
  ]);

  useEffect(() => {
    if (movementType !== "transfer" || !transferCurrenciesDiffer || transferDestinationEdited) return;
    if (sourceAmountNum <= 0) {
      if (destinationAmount) onAutoDestinationAmountRef.current("");
      return;
    }
    if (!effectiveTransferFxSuggestion) {
      if (destinationAmount) onAutoDestinationAmountRef.current("");
      return;
    }
    const nextDestinationAmount = formatTransferAmount(sourceAmountNum * effectiveTransferFxSuggestion.rate);
    if (nextDestinationAmount && nextDestinationAmount !== destinationAmount) {
      onAutoDestinationAmountRef.current(nextDestinationAmount);
    }
  }, [
    destinationAmount,
    movementType,
    sourceAmountNum,
    transferCurrenciesDiffer,
    transferDestinationEdited,
    effectiveTransferFxSuggestion,
  ]);

  const transferInverseFxLabel = useMemo(() => {
    if (!sourceAccount || !destinationAccount || !effectiveTransferFxSuggestion) return "";
    return formatExchangeRateLabel(
      destinationAccount.currencyCode,
      sourceAccount.currencyCode,
      1 / effectiveTransferFxSuggestion.rate,
    );
  }, [destinationAccount, effectiveTransferFxSuggestion, sourceAccount]);

  /** Al (re)abrir el form: en edición el destino cuenta como editado por el usuario. */
  function resetFxState(destinationEdited: boolean) {
    setTransferDestinationEdited(destinationEdited);
    setTransferRateInput("");
    setTransferRateEdited(false);
    setTransferLiveRate(null);
    setTransferRateError(null);
  }

  /** El usuario editó la tasa a mano: manda la manual y se re-deriva el destino. */
  function onChangeTransferRate(value: string) {
    setTransferRateEdited(true);
    setTransferDestinationEdited(false);
    setTransferRateInput(value);
  }

  return {
    transferRateInput,
    transferRateError,
    transferDestinationEdited,
    setTransferDestinationEdited,
    transferBaseFxSuggestion,
    transferManualRate,
    effectiveTransferFxSuggestion,
    transferInverseFxLabel,
    syncExchangeRateIsPending: syncExchangeRatePair.isPending,
    resetFxState,
    onChangeTransferRate,
  };
}
