import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Archive, BarChart2, Bell, CreditCard, Trash2, Users } from "lucide-react-native";

import { ProgressBar } from "../../../components/ui/ProgressBar";
import {
  ResourceCard,
  ResourceCardBadge,
} from "../../../components/ui/ResourceCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { AmountDisplay, formatCurrency } from "../../../components/ui/AmountDisplay";
import { dueDateColor } from "../../../lib/due-tone";
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

  // Tipo · avance · vencimiento en UNA línea. Antes eran tres cápsulas —"Me deben", "Activa",
  // "Compartida"— todas deducibles del filtro activo y del signo del monto.
  const supportLine = [
    obligation.title,
    !isPaid ? `${Math.round(obligation.progressPercent)}% pagado` : "Pagada",
    obligation.dueDate
      ? `vence ${format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (selectMode) {
    return (
      <ResourceCard
        variant="row"
        title={obligation.counterparty || obligation.title}
        subtitle={supportLine}
        selected={selected}
        onPress={onOpenDetail}
        onLongPress={onLongPress}
        trailing={
          <View style={styles.amountBlock}>
            <AmountDisplay
              amount={obligation.pendingAmount}
              currencyCode={obligation.currencyCode}
              size="lg"
              color={color}
              prefix=""
            />
            {!isPaid ? (
              <View style={styles.miniProgress}>
                <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={3} />
              </View>
            ) : null}
          </View>
        }
        meta={
          shareLabel ? <ResourceCardBadge label={shareLabel} color={shareColor} icon={Users} /> : null
        }
      />
    );
  }

  return (
    <SwipeActionRow
      revealWidth={REVEAL_W}
      borderRadius={0}
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
          variant="row"
          title={obligation.counterparty || obligation.title}
          subtitle={supportLine}
          onPress={() => {
            if (isOpen()) {
              close();
              return;
            }
            onOpenDetail();
          }}
          onLongPress={onLongPress}
          trailing={
            // La barra de 340px para decir 10% era desproporcionada. Baja a 56px y sube JUNTO al
            // monto, que es donde se compara: cuánto queda y cuánto llevas, de un vistazo.
            <View style={styles.amountBlock}>
              <AmountDisplay
                amount={obligation.pendingAmount}
                currencyCode={obligation.currencyCode}
                size="lg"
                color={color}
                prefix=""
              />
              {!isPaid ? (
                <View style={styles.miniProgress}>
                  <ProgressBar percent={obligation.progressPercent} alertPercent={100} height={3} />
                </View>
              ) : null}
            </View>
          }
          meta={
            // Solo lo EXCEPCIONAL. "Me deben" y "Activa" se deducen del filtro y del signo del
            // monto, así que repetirlos en cada fila no añade nada.
            pendingRequestCount > 0 || shareLabel || (isSharedWithMe && "share" in obligation) ? (
              <>
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
              </>
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
  amountBlock: { alignItems: "flex-end", gap: 4 },
  // 56px: lo justo para comparar avance entre filas. A 340px una barra para decir 10% era
  // desproporcionada y competia con el propio monto.
  miniProgress: { width: 56 },
  // El color NO va aqui: depende de la fecha y lo decide lib/due-tone.
  dueDate: { fontSize: FONT_SIZE.xs },
});
