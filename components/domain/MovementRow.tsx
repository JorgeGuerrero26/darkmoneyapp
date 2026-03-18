import { Pressable, StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import { AmountDisplay } from "../ui/AmountDisplay";
import type { MovementRecord } from "../../types/domain";

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  onPress?: () => void;
};

const TYPE_ICONS: Record<string, string> = {
  income: "↑",
  expense: "↓",
  transfer: "⇄",
  subscription_payment: "↓",
  obligation_payment: "↓",
  refund: "↑",
  adjustment: "◦",
  obligation_opening: "◦",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Planificado",
  pending: "Pendiente",
  posted: "",
  voided: "Anulado",
};

export function MovementRow({ movement, baseCurrencyCode, onPress }: Props) {
  const icon = TYPE_ICONS[movement.movementType] ?? "◦";
  const statusLabel = STATUS_LABELS[movement.status] ?? "";
  const amount =
    movement.movementType === "income" || movement.movementType === "refund"
      ? movement.destinationAmount ?? movement.sourceAmount ?? 0
      : movement.sourceAmount ?? movement.destinationAmount ?? 0;
  const currencyCode =
    movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={1}>
          {movement.description || "Sin descripción"}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {movement.category ? `${movement.category} · ` : ""}
          {format(new Date(movement.occurredAt), "d MMM", { locale: es })}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </Text>
      </View>
      <AmountDisplay
        amount={amount}
        currencyCode={currencyCode}
        movementType={movement.movementType}
        size="sm"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  pressed: {
    backgroundColor: COLORS.bgCard,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textMuted,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  description: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
  },
  meta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
});
