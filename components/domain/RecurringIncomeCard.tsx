import { StyleSheet, Text, View } from "react-native";
import { BarChart3, CalendarClock, Pause, Play, TrendingUp } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
  ResourceCardMetaText,
} from "../ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import type { RecurringIncomeSummary } from "../../types/domain";

type Props = {
  item: RecurringIncomeSummary;
  monthlyAmount: number;
  onPress: () => void;
  onAnalytics: () => void;
  onToggleStatus: () => void;
};

const STATUS_LABEL = {
  active: "Activo",
  paused: "Pausado",
  cancelled: "Cancelado",
} as const;

function getStatusColor(status: RecurringIncomeSummary["status"]) {
  if (status === "active") return COLORS.income;
  if (status === "paused") return COLORS.gold;
  return COLORS.storm;
}

function formatYmdLocal(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM", { locale: es });
}

export function RecurringIncomeCard({
  item,
  monthlyAmount,
  onPress,
  onAnalytics,
  onToggleStatus,
}: Props) {
  const statusColor = getStatusColor(item.status);
  const canToggleStatus = item.status === "active" || item.status === "paused";

  return (
    <ResourceCard
      title={item.name}
      subtitle={item.payer?.trim() ? item.payer : "Sin pagador"}
      archived={item.status === "cancelled"}
      onPress={onPress}
      leading={<ResourceCardIcon icon={TrendingUp} color={statusColor} />}
      actions={[
        ...(canToggleStatus ? [{
          key: "toggle-status",
          icon: item.status === "active" ? Pause : Play,
          onPress: onToggleStatus,
          color: item.status === "active" ? COLORS.gold : COLORS.primary,
          accessibilityLabel: item.status === "active" ? "Pausar ingreso fijo" : "Reactivar ingreso fijo",
        }] : []),
        {
          key: "analytics",
          icon: BarChart3,
          onPress: onAnalytics,
          accessibilityLabel: "Ver analítica del ingreso fijo",
        },
      ]}
      trailing={
        <View style={styles.trailing}>
          <Text style={[styles.amount, item.status !== "active" && styles.amountMuted]}>
            {formatCurrency(item.amount, item.currencyCode)}
          </Text>
          <Text style={styles.frequency}>{item.frequencyLabel}</Text>
        </View>
      }
      meta={
        <>
          <ResourceCardBadge label={STATUS_LABEL[item.status]} color={statusColor} />
          {item.accountName ? <ResourceCardMetaText>{item.accountName}</ResourceCardMetaText> : null}
          {item.categoryName ? <ResourceCardMetaText>{item.categoryName}</ResourceCardMetaText> : null}
        </>
      }
      footer={
        <View style={styles.footer}>
          <ResourceCardMetaText>
            Próximo: {formatYmdLocal(item.nextExpectedDate)}
          </ResourceCardMetaText>
          <View style={styles.footerMetric}>
            <CalendarClock size={11} color={COLORS.storm} strokeWidth={2} />
            <Text style={styles.monthly}>
              ~{formatCurrency(monthlyAmount, item.currencyCode)}/mes
            </Text>
          </View>
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
  amount: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.income,
  },
  amountMuted: {
    color: COLORS.storm,
  },
  frequency: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  footerMetric: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  monthly: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
});
