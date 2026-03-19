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
} from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { formatCurrency } from "../ui/AmountDisplay";
import type { MovementRecord } from "../../types/domain";

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  onPress?: () => void;
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

const isIncome = (type: string) => type === "income" || type === "refund";

export function MovementRow({ movement, baseCurrencyCode, onPress }: Props) {
  const config = TYPE_ICON[movement.movementType] ?? { Icon: Circle, color: COLORS.storm };
  const { Icon, color: iconColor } = config;

  const amount = isIncome(movement.movementType)
    ? (movement.destinationAmount ?? movement.sourceAmount ?? 0)
    : (movement.sourceAmount ?? movement.destinationAmount ?? 0);

  const currencyCode = movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode;
  const amountColor = isIncome(movement.movementType)
    ? COLORS.pine
    : movement.movementType === "transfer"
      ? COLORS.ember
      : COLORS.ink;

  const prefix = isIncome(movement.movementType) ? "+" : movement.movementType === "transfer" ? "" : "-";
  const statusBadge = STATUS_BADGE[movement.status];
  const typeLabel = TYPE_LABEL[movement.movementType] ?? movement.movementType;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      {/* Category / type icon */}
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Icon size={18} color={iconColor} />
      </View>

      {/* Description + meta */}
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={1}>
          {movement.description || "Sin descripción"}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: iconColor + "18" }]}>
            <Text style={[styles.typeLabel, { color: iconColor }]}>{typeLabel}</Text>
          </View>
          {movement.category ? (
            <Text style={styles.meta} numberOfLines={1}>· {movement.category}</Text>
          ) : null}
          <Text style={styles.meta}>
            · {format(new Date(movement.occurredAt), "d MMM", { locale: es })}
          </Text>
          {statusBadge ? (
            <Text style={[styles.meta, { color: statusBadge.color }]}>· {statusBadge.label}</Text>
          ) : null}
        </View>
      </View>

      {/* Amount */}
      <Text style={[styles.amount, { color: amountColor }]}>
        {prefix}{formatCurrency(amount, currencyCode)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.separator,
  },
  pressed: {
    backgroundColor: GLASS.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  description: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  typeBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  meta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  amount: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
});
