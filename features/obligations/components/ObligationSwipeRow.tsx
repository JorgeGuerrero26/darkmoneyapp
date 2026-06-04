import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Archive, BarChart2, Bell, CreditCard, Trash2, Users } from "lucide-react-native";

import { ProgressBar } from "../../../components/ui/ProgressBar";
import {
  ResourceCard,
  ResourceCardBadge,
  ResourceCardIcon,
} from "../../../components/ui/ResourceCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { getObligationStatusLabel, getShareStatusLabel } from "../../../lib/obligation-labels";
import {
  obligationPerspectiveDirectionLabel,
  obligationSwipeActionLabel,
  obligationViewerActsAsCollector,
} from "../../../lib/obligation-viewer-labels";
import type {
  ObligationShareSummary,
  ObligationStatus,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../types/domain";

const REVEAL_W = 90;

const STATUS_COLORS: Record<ObligationStatus, string> = {
  active: COLORS.primary,
  draft: COLORS.storm,
  paid: COLORS.income,
  cancelled: COLORS.storm,
  defaulted: COLORS.warning,
};

type RowIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export type ObligationSwipeRowProps = {
  obligation: ObligationSummary | SharedObligationSummary;
  obligationShare?: ObligationShareSummary | null;
  isSharedWithMe?: boolean;
  pendingRequestCount?: number;
  onOpenDetail: () => void;
  onPayment: () => void;
  onDelete: () => void;
  onAnalytics: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
  deleteActionLabel?: string;
  deleteActionColor?: string;
  deleteActionBg?: string;
  deleteActionIcon?: RowIcon;
};

export function ObligationSwipeRow({
  obligation,
  obligationShare,
  isSharedWithMe,
  pendingRequestCount = 0,
  onOpenDetail,
  onPayment,
  onDelete,
  onAnalytics,
  onLongPress,
  selected = false,
  selectMode = false,
  deleteActionLabel = "Eliminar",
  deleteActionColor = COLORS.danger,
  deleteActionBg = COLORS.danger + "28",
  deleteActionIcon: DeleteActionIcon = Trash2,
}: ObligationSwipeRowProps) {
  const isPaid = obligation.status === "paid" || obligation.status === "cancelled";
  const actsAsCollector = obligationViewerActsAsCollector(obligation.direction, Boolean(isSharedWithMe));
  const color = actsAsCollector ? COLORS.income : COLORS.expense;
  const directionColor = actsAsCollector ? COLORS.income : COLORS.expense;
  const obligationStatusColor = STATUS_COLORS[obligation.status] ?? STATUS_COLORS.active;
  const obligationStatusLabel = getObligationStatusLabel(obligation.status);
  const directionLabel = obligationPerspectiveDirectionLabel(obligation.direction, Boolean(isSharedWithMe));
  const shareLabel = obligationShare ? getShareStatusLabel(obligationShare.status) : null;
  const shareColor =
    obligationShare?.status === "pending"
      ? COLORS.warning
      : obligationShare?.status === "accepted"
        ? COLORS.income
        : COLORS.storm;
  const paySwipeLabel = obligationSwipeActionLabel(obligation.direction, Boolean(isSharedWithMe));

  if (selectMode) {
    return (
      <ResourceCard
        title={obligation.title}
        subtitle={obligation.counterparty}
        selected={selected}
        onPress={onOpenDetail}
        onLongPress={onLongPress}
        leading={<ResourceCardIcon icon={CreditCard} color={directionColor} />}
        trailing={
          <Text style={[styles.amount, { color }]}>
            {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
          </Text>
        }
        meta={
          <>
            <ResourceCardBadge label={directionLabel} color={directionColor} />
            <ResourceCardBadge label={obligationStatusLabel} color={obligationStatusColor} />
            {shareLabel ? (
              <ResourceCardBadge label={shareLabel} color={shareColor} icon={Users} />
            ) : null}
          </>
        }
        footer={
          !isPaid ? (
            <View style={styles.footer}>
              <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={5} />
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{Math.round(obligation.progressPercent)}% pagado</Text>
                {obligation.dueDate ? (
                  <Text style={styles.dueDate}>
                    Vence {format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={REVEAL_W}
      borderRadius={RADIUS.xl}
      leftAction={{
        label: paySwipeLabel,
        icon: CreditCard,
        color: COLORS.pine,
        backgroundColor: COLORS.pine + "30",
        haptic: "medium",
        onPress: onPayment,
      }}
      rightAction={
        isSharedWithMe
          ? null
          : {
              label: deleteActionLabel,
              icon: DeleteActionIcon,
              color: deleteActionColor,
              backgroundColor: deleteActionBg,
              haptic: "warning",
              onPress: onDelete,
            }
      }
    >
      {({ close, isOpen }) => (
        <ResourceCard
          title={obligation.title}
          subtitle={obligation.counterparty}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onOpenDetail();
          }}
          onLongPress={onLongPress}
          leading={<ResourceCardIcon icon={CreditCard} color={directionColor} />}
          actions={[
            {
              key: "analytics",
              icon: BarChart2,
              onPress: onAnalytics,
              accessibilityLabel: "Ver analítica de crédito o deuda",
            },
          ]}
          trailing={
            <Text style={[styles.amount, { color }]}>
              {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
            </Text>
          }
          meta={
            <>
              <ResourceCardBadge label={directionLabel} color={directionColor} />
              <ResourceCardBadge label={obligationStatusLabel} color={obligationStatusColor} />
              {pendingRequestCount > 0 ? (
                <ResourceCardBadge
                  label={`${pendingRequestCount} pendiente${pendingRequestCount === 1 ? "" : "s"}`}
                  color={COLORS.danger}
                  icon={Bell}
                  onPress={onAnalytics}
                  accessibilityLabel={`${pendingRequestCount} solicitudes pendientes`}
                />
              ) : null}
            {shareLabel ? (
              <ResourceCardBadge label={shareLabel} color={shareColor} icon={Users} />
            ) : null}
            {isSharedWithMe && "share" in obligation ? (
              <ResourceCardBadge
                label={`Compartido${
                  (obligation as SharedObligationSummary).share.ownerDisplayName?.trim()
                    ? ` · ${(obligation as SharedObligationSummary).share.ownerDisplayName!.trim()}`
                    : ""
                }`}
                color={COLORS.secondary}
                icon={Users}
              />
            ) : null}
            </>
          }
          footer={
            !isPaid ? (
              <View style={styles.footer}>
                <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={5} />
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>{Math.round(obligation.progressPercent)}% pagado</Text>
                  {obligation.dueDate ? (
                    <Text style={styles.dueDate}>
                      Vence {format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null
          }
        />
      )}
    </SwipeActionRow>
  );
}

export { Archive as ObligationArchiveIcon, Trash2 as ObligationTrashIcon };

const styles = StyleSheet.create({
  amount: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  footer: {
    gap: 4,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  progressText: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  dueDate: { fontSize: FONT_SIZE.xs, color: COLORS.warning },
});
