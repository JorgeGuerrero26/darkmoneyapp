import { memo } from "react";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BalanceImpactPreview } from "../../../../../components/domain/BalanceImpactPreview";
import { currencyPluralName } from "../../../../../constants/currencies";
import { CurrencyInput } from "../../../../../components/ui/CurrencyInput";
import { FormOptionRow } from "../../../../../components/ui/FormOptionRow";
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
  sourceAccount: AccountSummary | null;
  destinationAccount: AccountSummary | null;
  onOpenSourceAccount: () => void;
  onOpenDestinationAccount: () => void;

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
  sourceAccount,
  destinationAccount,
  onOpenSourceAccount,
  onOpenDestinationAccount,
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
}: Props) {
  const isIncome = movementType === "income";
  const isTransfer = movementType === "transfer";

  // Sin un solo saldo que enseñar la tarjeta quedaría vacía con su rótulo encima.
  const hasBalances =
    (sourceAccount !== null && projectedSourceBalance !== null) ||
    (originalSourceAccount !== null && revertedOriginalSourceBalance !== null) ||
    (destinationAccount !== null && projectedDestBalance !== null) ||
    (originalDestinationAccount !== null && revertedOriginalDestBalance !== null);

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

      {/* Monto: en un gasto y en una transferencia sale de la cuenta origen. */}
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
        </>
      ) : null}

      {/* Las cuentas son filas, no cápsulas: con seis cuentas las últimas se cortaban por el
          borde de un scroller horizontal y no había forma de saber que estaban ahí. Misma
          fila que categoría y contraparte en el paso 2. */}
      <View style={styles.group}>
        {!isIncome ? (
          <FormOptionRow
            grouped
            label={isTransfer ? "Sale de" : "Cuenta"}
            value={sourceAccount?.name ?? null}
            placeholder="Elegir cuenta"
            onPress={onOpenSourceAccount}
            last={!isTransfer}
          />
        ) : null}
        {isIncome || isTransfer ? (
          <FormOptionRow
            grouped
            label={isTransfer ? "Entra a" : "Cuenta"}
            value={destinationAccount?.name ?? null}
            placeholder="Elegir cuenta"
            onPress={onOpenDestinationAccount}
            last
          />
        ) : null}
      </View>
      {errors.sourceAccountId ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {errors.sourceAccountId}
        </Text>
      ) : null}
      {errors.destinationAccountId ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {errors.destinationAccountId}
        </Text>
      ) : null}

      {isIncome || isTransfer ? (
        <>
          {isIncome ? (
            <CurrencyInput
              label="Monto"
              value={destinationAmount}
              onChangeText={onChangeDestinationAmount}
              currencyCode={destinationAccount?.currencyCode ?? baseCurrencyCode}
              error={errors.destinationAmount}
            />
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
          se mueven las dos. El mockup lo dice así.

          Las dos cuentas y la frase del patrimonio van en UNA tarjeta: eran dos cajas con borde
          y un tercer recuadro suelto para la frase, tres cajas para una sola idea. */}
      {hasBalances ? (
        <View style={styles.balancesBlock}>
          <Text style={styles.balancesLabel}>{isTransfer ? "Saldos después" : "Saldo después"}</Text>
          <View style={styles.balancesCard}>
            {sourceAccount && projectedSourceBalance !== null ? (
              <BalanceImpactPreview
                grouped
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
                grouped
                label={`Cuenta anterior: ${originalSourceAccount.name}`}
                currentBalance={originalSourceAccount.currentBalance}
                projectedBalance={revertedOriginalSourceBalance}
                currencyCode={originalSourceAccount.currencyCode}
              />
            ) : null}
            {destinationAccount && projectedDestBalance !== null ? (
              <BalanceImpactPreview
                grouped
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
                grouped
                label={`Cuenta anterior: ${originalDestinationAccount.name}`}
                currentBalance={originalDestinationAccount.currentBalance}
                projectedBalance={revertedOriginalDestBalance}
                currencyCode={originalDestinationAccount.currencyCode}
              />
            ) : null}
            {isTransfer && !transferCurrenciesDiffer && sourceAccount && destinationAccount ? (
              <Text style={styles.sameCurrencyText}>
                Las dos cuentas son en {currencyPluralName(sourceAccount.currencyCode)}: se
                transfiere el mismo monto.
                Tu patrimonio no cambia.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* El enlace a detalles vive DEBAJO del botón Guardar, en la barra fija: aquí abajo el
          orden de lectura era "detalles primero, guardar después", al revés de lo que este
          paso decide. Deja sitio a esa barra para que no tape el final de la lista. */}
      <View style={styles.footerSpacer} />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  fieldError: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    marginTop: -SPACING.sm,
    marginLeft: SPACING.xs,
  },
  balancesBlock: { gap: SPACING.sm },
  balancesCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  balancesLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  sameCurrencyText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 17,
  },
  // La barra fija lleva ahora el botón Y el enlace a detalles, así que ocupa más alto.
  footerSpacer: { height: 140 },
});
