import { memo } from "react";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, ChevronRight } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AccountPicker } from "../../../../../components/domain/AccountPicker";
import { BalanceImpactPreview } from "../../../../../components/domain/BalanceImpactPreview";
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
import { SegmentedControl } from "../../../../../components/ui/SegmentedControl";
import { MOVEMENT_LABELS } from "../../../lib/labels";
import type { AccountSummary, MovementStatus, MovementType } from "../../../../../types/domain";

const TYPE_OPTIONS: { type: MovementType; label: string; Icon: typeof ArrowDownCircle; color: string }[] = [
  { type: "expense", label: MOVEMENT_LABELS.type.expense, Icon: ArrowDownCircle, color: COLORS.expense },
  { type: "income", label: MOVEMENT_LABELS.type.income, Icon: ArrowUpCircle, color: COLORS.income },
  { type: "transfer", label: MOVEMENT_LABELS.type.transfer, Icon: ArrowLeftRight, color: COLORS.transfer },
];

// Estado NO es plata. Se pintaba en menta —el color de lo que entra— a diez píxeles del tipo en
// clay, así que un gasto confirmado se veía por un instante como un ingreso. Tres opciones
// fijas y excluyentes son exactamente el caso del segmentado.
const STATUS_OPTIONS: { value: MovementStatus; label: string }[] = [
  { value: "posted", label: MOVEMENT_LABELS.status.posted },
  { value: "pending", label: MOVEMENT_LABELS.status.pending },
  { value: "planned", label: MOVEMENT_LABELS.status.planned },
];

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
  status: MovementStatus;
  onChangeType: (type: MovementType) => void;
  onChangeStatus: (status: MovementStatus) => void;
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


  // Defaults / shared
  baseCurrencyCode: string;
  errors: FormErrors;
  warnings: FormWarnings;

  // Nav
  onOpenDetails: () => void;
};

export const StepAccountsAndAmounts = memo(function StepAccountsAndAmounts({
  movementType,
  status,
  onChangeType,
  onChangeStatus,
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
  errors,
  warnings,
  onOpenDetails,
}: Props) {
  const isIncome = movementType === "income";
  const isTransfer = movementType === "transfer";

  return (
    <View style={styles.section}>
      {/* Tipo y estado eran una pantalla entera con dos controles de una línea. */}
      <View style={styles.typeGrid}>
        {TYPE_OPTIONS.map((opt) => {
          const isActive = movementType === opt.type;
          return (
            <TouchableOpacity
              key={opt.type}
              style={[styles.typeButton, isActive && { borderColor: opt.color }]}
              onPress={() => onChangeType(opt.type)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={`Tipo de movimiento: ${opt.label}`}
              accessibilityState={{ selected: isActive }}
            >
              <opt.Icon size={22} color={isActive ? opt.color : COLORS.storm} />
              {/* Antes esto llevaba borde, icono, etiqueta Y un punto, todo del mismo color:
                  cuatro marcas para decir una cosa. Queda el borde y el peso del texto. */}
              <Text style={[styles.typeLabel, isActive && { color: opt.color }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Source amount / account (for expense and transfer) */}
      {!isIncome ? (
        <>
          <CurrencyInput
            label="Monto"
            value={sourceAmount}
            onChangeText={onChangeSourceAmount}
            currencyCode={sourceAccount?.currencyCode ?? baseCurrencyCode}
            error={errors.sourceAmount}
          />
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
            label={isTransfer ? "Sale de" : "Cuenta"}
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
            label={isTransfer ? "Entra a" : "Cuenta"}
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
                Las dos cuentas son en {sourceAccount.currencyCode}: se transfiere el mismo monto.
                Tu patrimonio no cambia.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {!isTransfer ? (
        <SegmentedControl
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={onChangeStatus}
        />
      ) : null}

      {/* "Saldo después" en singular cuando hay una cuenta; plural en una transferencia, donde
          se mueven las dos. El mockup lo dice así. */}
      {sourceAccount || destinationAccount ? (
        <Text style={styles.balancesLabel}>{isTransfer ? "Saldos después" : "Saldo después"}</Text>
      ) : null}

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

      {/* Con el monto y la cuenta elegidos el movimiento YA es valido, asi que el boton es
          Guardar. Los detalles quedan como un destino al que se entra a proposito. */}
      <TouchableOpacity
        style={styles.detailsLink}
        onPress={onOpenDetails}
        activeOpacity={0.72}
        accessibilityRole="button"
      >
        <Text style={styles.detailsLinkText}>
          {isTransfer
            ? "Añadir nota o comprobante"
            : "Añadir categoría, nota o comprobante"}
        </Text>
        <ChevronRight size={15} color={COLORS.storm} />
      </TouchableOpacity>

      {/* Deja sitio a la barra anclada para que no tape el enlace. */}
      <View style={styles.footerSpacer} />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  balancesLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: -SPACING.xs,
  },
  typeGrid: { flexDirection: "row", gap: SPACING.sm },
  typeButton: {
    flex: 1,
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
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
  footerSpacer: { height: 72 },
  detailsLink: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  detailsLinkText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
});
