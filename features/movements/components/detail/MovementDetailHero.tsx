import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { AmountDisplay } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
import type { MovementRecord } from "../../../../types/domain";
import { MOVEMENT_LABELS } from "../../lib/labels";

const STATUS_COLOR: Record<string, string> = {
  posted: COLORS.income,
  pending: COLORS.warning,
  planned: COLORS.storm,
  voided: COLORS.textDisabled,
};

type Props = {
  movement: MovementRecord;
  isTransfer: boolean;
  isVoided: boolean;
  transferSourceCurrencyCode: string;
  baseCurrencyCode: string;
  onPressEdit: () => void;
};

export const MovementDetailHero = memo(function MovementDetailHero({
  movement,
  isTransfer,
  isVoided,
  transferSourceCurrencyCode,
  baseCurrencyCode,
  onPressEdit,
}: Props) {
  const typeLabel = MOVEMENT_LABELS.type[movement.movementType] ?? movement.movementType;
  const statusLabel = MOVEMENT_LABELS.status[movement.status] ?? movement.status;
  const statusColor = STATUS_COLOR[movement.status] ?? COLORS.storm;
  const currencyCode = isTransfer ? transferSourceCurrencyCode : baseCurrencyCode;
  const amount = isTransfer
    ? movement.sourceAmount ?? 0
    : movement.sourceAmount ?? movement.destinationAmount ?? 0;

  return (
    <TouchableOpacity
      onPress={!isVoided ? onPressEdit : undefined}
      activeOpacity={isVoided ? 1 : 0.75}
      accessibilityLabel={!isVoided ? "Tocar para editar" : undefined}
      accessibilityRole={!isVoided ? "button" : undefined}
    >
      <Card style={styles.heroCard}>
        <Text style={styles.typeLabel}>{typeLabel}</Text>
        <AmountDisplay
          amount={amount}
          currencyCode={currencyCode}
          movementType={movement.movementType}
          sourceAmount={movement.sourceAmount}
          destinationAmount={movement.destinationAmount}
          size="xl"
        />
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {!isVoided ? <Text style={styles.heroHint}>Toca para editar</Text> : null}
      </Card>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  heroHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.xs,
  },
});
