import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
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

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../../constants/theme";
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
  perspectiveAccountId?: number | null;
  perspectiveCurrencyCode?: string | null;
  attachmentCount?: number;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

type IconConfig = { Icon: typeof Circle; color: string };

const TYPE_ICON: Record<string, IconConfig> = {
  income: { Icon: ArrowDownLeft, color: COLORS.pine },
  refund: { Icon: RotateCcw, color: COLORS.pine },
  expense: { Icon: ArrowUpRight, color: COLORS.rosewood },
  subscription_payment: { Icon: RefreshCw, color: COLORS.rosewood },
  obligation_payment: { Icon: Landmark, color: COLORS.rosewood },
  transfer: { Icon: ArrowLeftRight, color: COLORS.ember },
  adjustment: { Icon: SlidersHorizontal, color: COLORS.storm },
  obligation_opening: { Icon: Landmark, color: COLORS.storm },
};

const TYPE_LABEL: Record<string, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  subscription_payment: "Suscripción",
  obligation_payment: "Obligación",
  refund: "Reembolso",
  adjustment: "Ajuste",
  obligation_opening: "Apertura",
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  planned: { label: "Planificado", color: COLORS.storm },
  pending: { label: "Pendiente", color: COLORS.gold },
  voided: { label: "Anulado", color: COLORS.rosewood },
};

function transferDisplayForPerspective(
  movement: MovementRecord,
  baseCurrencyCode: string,
  perspectiveAccountId?: number | null,
  perspectiveCurrencyCode?: string | null,
) {
  const isSourcePerspective =
    perspectiveAccountId != null && movement.sourceAccountId === perspectiveAccountId;
  const isDestinationPerspective =
    perspectiveAccountId != null && movement.destinationAccountId === perspectiveAccountId;

  if (isDestinationPerspective) {
    return {
      amount: Math.abs(Number(movement.destinationAmount ?? movement.sourceAmount ?? 0)),
      currencyCode: perspectiveCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode,
      prefix: "+",
    };
  }

  if (isSourcePerspective) {
    return {
      amount: Math.abs(Number(movement.sourceAmount ?? movement.destinationAmount ?? 0)),
      currencyCode: perspectiveCurrencyCode ?? movement.sourceCurrencyCode ?? baseCurrencyCode,
      prefix: "−",
    };
  }

  return {
    amount: Math.abs(Number(movement.sourceAmount ?? movement.destinationAmount ?? 0)),
    currencyCode: movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode,
    prefix: "",
  };
}

export const MovementRow = memo(function MovementRow({
  movement,
  baseCurrencyCode,
  perspectiveAccountId,
  perspectiveCurrencyCode,
  attachmentCount = 0,
  selected,
  onPress,
  onLongPress,
}: Props) {
  const config = TYPE_ICON[movement.movementType] ?? { Icon: Circle, color: COLORS.storm };
  const { Icon } = config;
  const transferDisplay = movement.movementType === "transfer"
    ? transferDisplayForPerspective(
      movement,
      baseCurrencyCode,
      perspectiveAccountId,
      perspectiveCurrencyCode,
    )
    : null;
  const amount = transferDisplay?.amount ?? movementDisplayAmount(movement);
  const displayColor = movementDisplayColor(movement);
  const iconColor = movement.movementType === "obligation_payment" ? displayColor : config.color;

  const currencyCode = transferDisplay?.currencyCode ?? movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? baseCurrencyCode;
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
        ? transferDisplay?.prefix ?? ""
        : "-";
  const statusBadge = STATUS_BADGE[movement.status];
  const typeLabel = TYPE_LABEL[movement.movementType] ?? movement.movementType;

  return (
    <ResourceCard
      title={movement.description || "Sin descripción"}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={Icon} color={iconColor} />}
      meta={
        <>
          <ResourceCardBadge label={typeLabel} color={iconColor} />
          {movement.category ? <ResourceCardMetaText>{movement.category}</ResourceCardMetaText> : null}
          <ResourceCardMetaText>
            {format(parseDisplayDate(movement.occurredAt), "d MMM", { locale: es })}
          </ResourceCardMetaText>
          {statusBadge ? (
            <ResourceCardBadge label={statusBadge.label} color={statusBadge.color} />
          ) : null}
          {attachmentCount > 0 ? (
            <View style={styles.attachmentMeta}>
              <Paperclip size={9} color={COLORS.storm} />
              {attachmentCount > 1 ? (
                <Text style={styles.attachmentCount}>{attachmentCount}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      }
      trailing={
        <Text style={[styles.amount, { color: amountColor }]}>
          {prefix}{formatCurrency(amount, currencyCode)}
        </Text>
      }
    />
  );
});

const styles = StyleSheet.create({
  attachmentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  attachmentCount: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    color: COLORS.storm,
  },
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
  },
});
