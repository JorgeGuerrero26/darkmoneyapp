import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AmountDisplay, formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../../constants/theme";
import type { MovementRecord } from "../../../../types/domain";
import { MOVEMENT_LABELS } from "../../lib/labels";

type Props = {
  movement: MovementRecord;
  isTransfer: boolean;
  isVoided: boolean;
  transferSourceCurrencyCode: string;
  baseCurrencyCode: string;
  /** La cuenta que se movió y con cuánto quedó. `null` si no se pudo resolver. */
  accountName: string | null;
  accountBalance: number | null;
  accountCurrencyCode: string;
};

/**
 * La cifra del movimiento, con sus dos rótulos y la cuenta que la sintió.
 *
 * Tres cosas que se fueron (Revisión 17):
 *
 * - **La tarjeta.** El dato principal de la pantalla no está dentro de nada.
 * - **"Confirmado" en menta**, cuarta aparición del mismo caso tras las revisiones 07, 08 y 16:
 *   un estado pintado con el color de la plata que entra, a treinta píxeles de un monto en clay
 *   que dice gasto. Va en gris y en la misma línea que "Gasto", porque son dos rótulos del mismo
 *   movimiento y ninguno es una cifra. **El color aquí lo lleva el monto, y nada más.**
 * - **"Toca para editar"**, que era la primera de tres maneras de abrir lo mismo. Ahora cada fila
 *   abre su propio campo, que es lo que uno quiere cuando entra a corregir la categoría.
 *
 * Y algo que llegó: **con cuánto quedó la cuenta**, que es lo que uno mira después de un gasto y
 * estaba tres tarjetas más abajo, dicho como "CUENTA / Desde: Cuenta Principal".
 */
export const MovementDetailHero = memo(function MovementDetailHero({
  movement,
  isTransfer,
  isVoided,
  transferSourceCurrencyCode,
  baseCurrencyCode,
  accountName,
  accountBalance,
  accountCurrencyCode,
}: Props) {
  const typeLabel = MOVEMENT_LABELS.type[movement.movementType] ?? movement.movementType;
  const statusLabel = MOVEMENT_LABELS.status[movement.status] ?? movement.status;
  const currencyCode = isTransfer ? transferSourceCurrencyCode : baseCurrencyCode;
  const amount = isTransfer
    ? movement.sourceAmount ?? 0
    : movement.sourceAmount ?? movement.destinationAmount ?? 0;

  const accountLine = accountName
    ? accountBalance != null && !isVoided
      ? `${accountName} · queda ${formatCurrency(accountBalance, accountCurrencyCode)}`
      : accountName
    : null;

  return (
    <View style={styles.hero}>
      <Text style={styles.labels}>
        {typeLabel} · {statusLabel}
      </Text>
      <AmountDisplay
        flat
        amount={amount}
        currencyCode={currencyCode}
        movementType={movement.movementType}
        sourceAmount={movement.sourceAmount}
        destinationAmount={movement.destinationAmount}
        size="xl"
        color={isVoided ? COLORS.storm : undefined}
      />
      {accountLine ? <Text style={styles.account}>{accountLine}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: SPACING.xs,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  labels: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  account: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
});
