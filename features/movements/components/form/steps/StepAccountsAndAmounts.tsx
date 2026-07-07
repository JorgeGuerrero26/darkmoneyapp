import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AccountPicker } from "../../../../../components/domain/AccountPicker";
import { BalanceImpactPreview } from "../../../../../components/domain/BalanceImpactPreview";
import { Button } from "../../../../../components/ui/Button";
import { CurrencyInput } from "../../../../../components/ui/CurrencyInput";
import { Input } from "../../../../../components/ui/Input";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../../constants/theme";
import type { AccountSummary, MovementType } from "../../../../../types/domain";

function FrequentAmountChips({ amounts, currencyCode, onPick }: {
  amounts: number[];
  currencyCode: string;
  onPick: (amount: number) => void;
}) {
  if (amounts.length === 0) return null;
  return (
    <View style={styles.frequentRow}>
      <Text style={styles.frequentLabel}>Frecuentes:</Text>
      {amounts.map((amount) => (
        <TouchableOpacity
          key={amount}
          style={styles.frequentChip}
          onPress={() => onPick(amount)}
          accessibilityRole="button"
          accessibilityLabel={`Usar monto frecuente ${amount} ${currencyCode}`}
        >
          <Text style={styles.frequentChipText}>
            {amount.toLocaleString("es-PE", { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export type TransferFxSuggestion = {
  rate: number;
  effectiveAt: string | null;
  label: string;
  source: "api" | "local" | "manual";
  provider?: string;
};

type FormErrors = {
  sourceAccountId?: string;
  destinationAccountId?: string;
  sourceAmount?: string;
  destinationAmount?: string;
};

type FormWarnings = {
  sourceAmount?: string;
};

type Props = {
  movementType: MovementType;
  isEditing: boolean;

  // Amounts
  sourceAmount: string;
  destinationAmount: string;
  onChangeSourceAmount: (value: string) => void;
  onChangeDestinationAmount: (value: string) => void;
  onChangeTransferDestinationAmount: (value: string) => void;

  // Accounts
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  activeAccountsSorted: AccountSummary[];
  destinationAccountsSorted: AccountSummary[];
  sourceAccount: AccountSummary | null;
  destinationAccount: AccountSummary | null;
  onChangeSourceAccount: (id: number) => void;
  onChangeDestinationAccount: (id: number) => void;

  // Transfer FX
  transferCurrenciesDiffer: boolean;
  transferRateInput: string;
  onChangeTransferRate: (value: string) => void;
  effectiveTransferFxSuggestion: TransferFxSuggestion | null;
  transferBaseFxSuggestion: TransferFxSuggestion | null;
  transferInverseFxLabel: string;
  transferDestinationEdited: boolean;
  syncExchangeRateIsPending: boolean;
  transferRateError: boolean;

  // Balance preview
  projectedSourceBalance: number | null;
  revertedOriginalSourceBalance: number | null;
  projectedDestBalance: number | null;
  revertedOriginalDestBalance: number | null;
  originalSourceAccount: AccountSummary | null;
  originalDestinationAccount: AccountSummary | null;

  // Montos frecuentes (2+ usos) para el tipo+cuenta: chips de un tap bajo el input.
  frequentAmounts?: number[];
  onPickFrequentAmount?: (amount: number) => void;

  // Defaults / shared
  baseCurrencyCode: string;
  errors: FormErrors;
  warnings: FormWarnings;

  // Nav
  onBack: () => void;
  onNext: () => void;
};

export const StepAccountsAndAmounts = memo(function StepAccountsAndAmounts({
  movementType,
  isEditing,
  sourceAmount,
  destinationAmount,
  onChangeSourceAmount,
  onChangeDestinationAmount,
  onChangeTransferDestinationAmount,
  sourceAccountId,
  destinationAccountId,
  activeAccountsSorted,
  destinationAccountsSorted,
  sourceAccount,
  destinationAccount,
  onChangeSourceAccount,
  onChangeDestinationAccount,
  transferCurrenciesDiffer,
  transferRateInput,
  onChangeTransferRate,
  effectiveTransferFxSuggestion,
  transferBaseFxSuggestion,
  transferInverseFxLabel,
  transferDestinationEdited,
  syncExchangeRateIsPending,
  transferRateError,
  projectedSourceBalance,
  revertedOriginalSourceBalance,
  projectedDestBalance,
  revertedOriginalDestBalance,
  originalSourceAccount,
  originalDestinationAccount,
  baseCurrencyCode,
  frequentAmounts,
  onPickFrequentAmount,
  errors,
  warnings,
  onBack,
  onNext,
}: Props) {
  const isIncome = movementType === "income";
  const isTransfer = movementType === "transfer";

  return (
    <View style={styles.section}>
      {/* Source amount / account (for expense and transfer) */}
      {!isIncome ? (
        <>
          <CurrencyInput
            label={isTransfer ? "Monto origen" : "Monto"}
            value={sourceAmount}
            onChangeText={onChangeSourceAmount}
            currencyCode={sourceAccount?.currencyCode ?? baseCurrencyCode}
            error={errors.sourceAmount}
          />
          {frequentAmounts && onPickFrequentAmount ? (
            <FrequentAmountChips
              amounts={frequentAmounts}
              currencyCode={sourceAccount?.currencyCode ?? baseCurrencyCode}
              onPick={onPickFrequentAmount}
            />
          ) : null}
          {warnings.sourceAmount ? (
            <Text
              style={styles.warningHint}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {warnings.sourceAmount}
            </Text>
          ) : null}
          <AccountPicker
            label="Cuenta origen"
            accounts={activeAccountsSorted}
            selectedId={sourceAccountId}
            onSelect={onChangeSourceAccount}
            error={errors.sourceAccountId}
          />
        </>
      ) : null}

      {/* Destination account + amount (income, transfer) */}
      {(isIncome || isTransfer) ? (
        <>
          <AccountPicker
            label="Cuenta destino"
            accounts={destinationAccountsSorted}
            selectedId={destinationAccountId}
            onSelect={onChangeDestinationAccount}
            error={errors.destinationAccountId}
          />
          {isIncome ? (
            <>
              <CurrencyInput
                label="Monto"
                value={destinationAmount}
                onChangeText={onChangeDestinationAmount}
                currencyCode={destinationAccount?.currencyCode ?? baseCurrencyCode}
                error={errors.destinationAmount}
              />
              {frequentAmounts && onPickFrequentAmount ? (
                <FrequentAmountChips
                  amounts={frequentAmounts}
                  currencyCode={destinationAccount?.currencyCode ?? baseCurrencyCode}
                  onPick={onPickFrequentAmount}
                />
              ) : null}
            </>
          ) : null}
          {isTransfer && transferCurrenciesDiffer ? (
            <CurrencyInput
              label={`Monto destino (${destinationAccount?.currencyCode ?? ""})`}
              value={destinationAmount}
              onChangeText={onChangeTransferDestinationAmount}
              currencyCode={destinationAccount?.currencyCode ?? baseCurrencyCode}
              error={errors.destinationAmount}
            />
          ) : null}
          {isTransfer && transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
            <Input
              label={`Tipo de cambio (${sourceAccount.currencyCode} → ${destinationAccount.currencyCode})`}
              value={transferRateInput}
              onChangeText={onChangeTransferRate}
              placeholder="0.0000"
              keyboardType="decimal-pad"
              hint={
                syncExchangeRateIsPending
                  ? "Actualizando desde la API..."
                  : effectiveTransferFxSuggestion?.source === "api"
                    ? `Actualizado con ${effectiveTransferFxSuggestion.provider ?? "API"}${effectiveTransferFxSuggestion.effectiveAt ? ` · ${formatShortDate(effectiveTransferFxSuggestion.effectiveAt)}` : ""}`
                    : effectiveTransferFxSuggestion?.source === "manual"
                      ? "Usaremos esta tasa solo para este movimiento."
                      : transferRateError && transferBaseFxSuggestion
                        ? "No se pudo actualizar en línea; usamos el tipo de cambio guardado."
                        : undefined
              }
            />
          ) : null}
          {isTransfer && transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
            <View style={[styles.fxRateNote, !effectiveTransferFxSuggestion && styles.fxRateNoteMissing]}>
              <Text style={[styles.fxRateNoteText, !effectiveTransferFxSuggestion && styles.fxRateNoteTextMissing]}>
                {effectiveTransferFxSuggestion
                  ? `${transferDestinationEdited ? "Tipo de cambio recalculado con los montos" : "Monto destino calculado con"} ${effectiveTransferFxSuggestion.label}${transferInverseFxLabel ? `. Referencia inversa: ${transferInverseFxLabel}` : ""}.`
                  : transferRateError
                    ? `No pude obtener tipo de cambio ${sourceAccount.currencyCode} → ${destinationAccount.currencyCode}. Ingresa la tasa o el monto destino manualmente.`
                    : `Buscando tipo de cambio ${sourceAccount.currencyCode} → ${destinationAccount.currencyCode}...`}
              </Text>
            </View>
          ) : null}
          {isTransfer && !transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
            <View style={styles.sameCurrencyNote}>
              <Text style={styles.sameCurrencyText}>
                Misma moneda ({sourceAccount.currencyCode}) · el monto se transfiere igual.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Balance impact preview */}
      {sourceAccount && projectedSourceBalance !== null ? (
        <BalanceImpactPreview
          label={
            isEditing && originalSourceAccount && originalSourceAccount.id !== sourceAccount.id
              ? `Cuenta seleccionada: ${sourceAccount.name}`
              : sourceAccount.name
          }
          currentBalance={sourceAccount.currentBalance}
          projectedBalance={projectedSourceBalance}
          currencyCode={sourceAccount.currencyCode}
        />
      ) : null}
      {originalSourceAccount && revertedOriginalSourceBalance !== null ? (
        <BalanceImpactPreview
          label={`Cuenta anterior: ${originalSourceAccount.name}`}
          currentBalance={originalSourceAccount.currentBalance}
          projectedBalance={revertedOriginalSourceBalance}
          currencyCode={originalSourceAccount.currencyCode}
        />
      ) : null}
      {destinationAccount && projectedDestBalance !== null ? (
        <BalanceImpactPreview
          label={
            isEditing && originalDestinationAccount && originalDestinationAccount.id !== destinationAccount.id
              ? `Cuenta seleccionada: ${destinationAccount.name}`
              : destinationAccount.name
          }
          currentBalance={destinationAccount.currentBalance}
          projectedBalance={projectedDestBalance}
          currencyCode={destinationAccount.currencyCode}
        />
      ) : null}
      {originalDestinationAccount && revertedOriginalDestBalance !== null ? (
        <BalanceImpactPreview
          label={`Cuenta anterior: ${originalDestinationAccount.name}`}
          currentBalance={originalDestinationAccount.currentBalance}
          projectedBalance={revertedOriginalDestBalance}
          currencyCode={originalDestinationAccount.currencyCode}
        />
      ) : null}

      <View style={styles.navRow}>
        <Button label="← Atrás" variant="ghost" onPress={onBack} style={styles.btnHalf} />
        <Button label="Siguiente →" onPress={onNext} style={styles.btnHalf} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frequentRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: -SPACING.xs,
  },
  frequentLabel: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
  },
  frequentChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.softBorder,
    backgroundColor: SURFACE.card,
  },
  frequentChipText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  section: { gap: SPACING.md },
  warningHint: {
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  fxRateNote: {
    marginTop: -SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "2E",
  },
  fxRateNoteMissing: {
    backgroundColor: COLORS.gold + "14",
    borderColor: COLORS.gold + "3D",
  },
  fxRateNoteText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  fxRateNoteTextMissing: { color: COLORS.ink },
  sameCurrencyNote: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  sameCurrencyText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  navRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  btnHalf: { flex: 1 },
});
