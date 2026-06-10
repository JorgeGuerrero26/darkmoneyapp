import { StyleSheet, Text, View } from "react-native";
import { ArrowRight, Pin, PinOff, RefreshCw } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import type { ExchangeRateRecord } from "../../services/queries/workspace-data";

type Props = {
  rate: ExchangeRateRecord;
  onPress: () => void;
  onLongPress?: () => void;
  onTogglePin?: () => void;
  selected?: boolean;
};

function formatEffectiveAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "d MMM yyyy, HH:mm", { locale: es });
}

export function ExchangeRateCard({ rate, onPress, onLongPress, onTogglePin, selected = false }: Props) {
  const title = `${rate.fromCurrencyCode} → ${rate.toCurrencyCode}`;

  return (
    <ResourceCard
      title={title}
      subtitle={formatEffectiveAt(rate.effectiveAt)}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={<ResourceCardIcon icon={RefreshCw} color={COLORS.pine} />}
      actions={onTogglePin ? [{
        key: "pin",
        icon: rate.isPinned ? PinOff : Pin,
        onPress: onTogglePin,
        color: rate.isPinned ? COLORS.primary : COLORS.storm,
        accessibilityLabel: rate.isPinned ? "Desfijar par" : "Fijar par",
      }] : []}
      meta={
        <>
          <ResourceCardBadge label={rate.source === "manual" ? "Manual" : "Sincronizado"} color={rate.source === "manual" ? COLORS.gold : COLORS.primary} />
          {rate.notes ? <ResourceCardMetaText>{rate.notes}</ResourceCardMetaText> : null}
        </>
      }
      trailing={
        <View style={styles.trailing}>
          <View style={styles.rateLine}>
            <Text style={styles.rateBase}>1 {rate.fromCurrencyCode}</Text>
            <ArrowRight size={11} color={COLORS.storm} strokeWidth={2} />
          </View>
          <Text style={styles.rateValue}>
            {rate.rate.toFixed(4)} {rate.toCurrencyCode}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    alignItems: "flex-end",
    gap: SPACING.xs / 2,
  },
  rateLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  rateBase: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  rateValue: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
});
