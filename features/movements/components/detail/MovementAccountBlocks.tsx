import { memo } from "react";
import { StyleSheet, Text } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from "../../../../constants/theme";
import type { MovementRecord } from "../../../../types/domain";
import { MovementDetailRow, MovementDetailDivider } from "./MovementDetailRow";

function formatAccountLabel(
  name: string | null | undefined,
  id: number | null | undefined,
  currencyCode: string,
) {
  const accountName = name ?? (id != null ? `Cuenta #${id}` : "-");
  return `${accountName} · ${currencyCode}`;
}

function formatExchangeRateLabel(
  fromCurrencyCode: string,
  toCurrencyCode: string,
  rate: number,
) {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  if (!from || !to || !Number.isFinite(rate) || rate <= 0) return "";
  return `1 ${from} = ${rate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${to}`;
}

type TransferProps = {
  movement: MovementRecord;
  sourceCurrencyCode: string;
  destinationCurrencyCode: string;
  fxRate: number | null;
};

export const MovementTransferBlock = memo(function MovementTransferBlock({
  movement,
  sourceCurrencyCode,
  destinationCurrencyCode,
  fxRate,
}: TransferProps) {
  const currenciesDiffer =
    sourceCurrencyCode.toUpperCase() !== destinationCurrencyCode.toUpperCase();
  const directFxLabel =
    currenciesDiffer && fxRate
      ? formatExchangeRateLabel(sourceCurrencyCode, destinationCurrencyCode, fxRate)
      : "";
  const inverseFxLabel =
    currenciesDiffer && fxRate
      ? formatExchangeRateLabel(destinationCurrencyCode, sourceCurrencyCode, 1 / fxRate)
      : "";

  return (
    <Card>
      <Text style={styles.sectionTitle}>Transferencia</Text>
      <MovementDetailRow
        label="Cuenta origen"
        value={formatAccountLabel(
          movement.sourceAccountName,
          movement.sourceAccountId,
          sourceCurrencyCode,
        )}
      />
      <MovementDetailDivider />
      <MovementDetailRow
        label="Salió"
        value={formatCurrency(movement.sourceAmount ?? 0, sourceCurrencyCode)}
      />
      {movement.destinationAccountId ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow
            label="Cuenta destino"
            value={formatAccountLabel(
              movement.destinationAccountName,
              movement.destinationAccountId,
              destinationCurrencyCode,
            )}
          />
          <MovementDetailDivider />
          <MovementDetailRow
            label="Llegó"
            value={formatCurrency(movement.destinationAmount ?? 0, destinationCurrencyCode)}
          />
        </>
      ) : null}
      {directFxLabel ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow label="Tipo guardado" value={directFxLabel} />
        </>
      ) : null}
      {inverseFxLabel ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow label="Tipo inverso" value={inverseFxLabel} />
        </>
      ) : null}
    </Card>
  );
});

type AccountProps = {
  movement: MovementRecord;
  isExpense: boolean;
};

export const MovementAccountBlock = memo(function MovementAccountBlock({
  movement,
  isExpense,
}: AccountProps) {
  const value =
    (isExpense
      ? movement.sourceAccountName ?? `Cuenta #${movement.sourceAccountId}`
      : movement.destinationAccountName ?? `Cuenta #${movement.destinationAccountId}`) ?? "-";

  return (
    <Card>
      <Text style={styles.sectionTitle}>Cuenta</Text>
      <MovementDetailRow label={isExpense ? "Desde" : "Hacia"} value={value} />
    </Card>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
});
