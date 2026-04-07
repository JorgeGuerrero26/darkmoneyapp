import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  RefreshCw,
  Landmark,
  RotateCcw,
  SlidersHorizontal,
  Circle,
  Paperclip,
} from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { formatCurrency } from "../ui/AmountDisplay";
import { parseDisplayDate } from "../../lib/date";
import type { MovementRecord } from "../../types/domain";
import {
  movementActsAsIncome,
  movementDisplayAmount,
  movementDisplayColor,
  movementDisplayPrefix,
} from "../../lib/movement-display";

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  attachmentCount?: number;
  onPress?: () => void;
  onLongPress?: () => void;
};

type IconConfig = { Icon: typeof Circle; color: string };

const TYPE_ICON: Record<string, IconConfig> = {
  income:               { Icon: ArrowDownLeft,    color: COLORS.pine },
  refund:               { Icon: RotateCcw,        color: COLORS.pine },
  expense:              { Icon: ArrowUpRight,      color: COLORS.rosewood },
  subscription_payment: { Icon: RefreshCw,         color: COLORS.rosewood },
  obligation_payment:   { Icon: Landmark,          color: COLORS.rosewood },
  transfer:             { Icon: ArrowLeftRight,    color: COLORS.ember },
  adjustment:           { Icon: SlidersHorizontal, color: COLORS.storm },
  obligation_opening:   { Icon: Landmark,          color: COLORS.storm },
};

const TYPE_LABEL: Record<string, string> = {
  income:               "Ingreso",
  expense:              "Gasto",
  transfer:             "Transferencia",
  subscription_payment: "Suscripción",
  obligation_payment:   "Obligación",
  refund:               "Reembolso",
  adjustment:           "Ajuste",
  obligation_opening:   "Apertura",
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  planned: { label: "Planificado", color: COLORS.storm },
  pending: { label: "Pendiente",   color: COLORS.gold },
  voided:  { label: "Anulado",     color: COLORS.rosewood },
};

export const MovementRow = memo(function MovementRow({ movement, baseCurrencyCode, attachmentCount = 0, onPress, onLongPress }: Props) {
  const config = TYPE_ICON[movement.movementType] ?? { Icon: Circle, color: COLORS.storm };
  const { Icon } = config;
  const amount = movementDisplayAmount(movement);
  const displayColor = movementDisplayColor(movement);
  const iconColor = movement.movementType === "obligation_payment" ? displayColor : config.color;

  const currencyCode = movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode;
  const amountColor = movement.movementType === "obligation_payment"
    ? displayColor
    : movementActsAsIncome(movement)
      ? COLORS.pine
      : movement.movementType === "transfer"
        ? COLORS.ember
        : COLORS.ink;

  const prefix = movement.movementType === "obligation_payment"
    ? movementDisplayPrefix(movement)
    : movementActsAsIncome(movement)
      ? "+"
      : movement.movementType === "transfer"
        ? ""
        : "-";
  const statusBadge = STATUS_BADGE[movement.status];
  const typeLabel = TYPE_LABEL[movement.movementType] ?? movement.movementType;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "15" }]}>
        <Icon size={17} color={iconColor} />
      </View>

      {/* Description + meta */}
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={1}>
          {movement.description || "Sin descripción"}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: iconColor + "15" }]}>
            <Text style={[styles.typeLabel, { color: iconColor }]}>{typeLabel}</Text>
          </View>
          {movement.category ? (
            <Text style={styles.meta} numberOfLines={1}>{movement.category}</Text>
          ) : null}
          <Text style={styles.meta}>
            {format(parseDisplayDate(movement.occurredAt), "d MMM", { locale: es })}
          </Text>
          {statusBadge ? (
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + "15" }]}>
              <Text style={[styles.statusLabel, { color: statusBadge.color }]}>{statusBadge.label}</Text>
            </View>
          ) : null}
          {attachmentCount > 0 ? (
            <View style={styles.attachmentBadge}>
              <Paperclip size={9} color={COLORS.storm} />
              {attachmentCount > 1 ? (
                <Text style={styles.attachmentBadgeText}>{attachmentCount}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Amount */}
      <Text style={[styles.amount, { color: amountColor }]}>
        {prefix}{formatCurrency(amount, currencyCode)}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    // Subtle glass surface — less pronounced than main cards
    backgroundColor: "rgba(255,255,255,0.018)",
    borderRadius: RADIUS.md,
    marginHorizontal: SPACING.sm,
    marginVertical: 2,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.10)",
    borderLeftColor: "rgba(255,255,255,0.06)",
    borderRightColor: "rgba(255,255,255,0.05)",
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  pressed: {
    backgroundColor: "rgba(255,255,255,0.055)",
    opacity: 0.88,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 5,
  },
  description: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  typeBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  meta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  attachmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  attachmentBadgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    color: COLORS.storm,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
  },
});

