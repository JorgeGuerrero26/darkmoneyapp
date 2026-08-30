import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Minus, Pencil, Plus } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { ProgressBar } from "../../../../components/ui/ProgressBar";
import { expandPaymentPlan, parsePaymentPlan } from "../../lib/payment-plan";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import {
  obligationPendingDirectionBadge,
  obligationProgressPaidAdjective,
} from "../../../../lib/obligation-viewer-labels";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type ObligationOverviewCardsStyles = {
  heroCard: StyleProp<ViewStyle>;
  directionBadge: StyleProp<TextStyle>;
  counterparty: StyleProp<TextStyle>;
  pendingAmount: StyleProp<TextStyle>;
  pendingLabel: StyleProp<TextStyle>;
  progress: StyleProp<ViewStyle>;
  progressLabel: StyleProp<TextStyle>;
  capitalSummaryCard: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  capitalSummaryGrid: StyleProp<ViewStyle>;
  capitalSummaryItem: StyleProp<ViewStyle>;
  capitalSummaryAction: StyleProp<ViewStyle>;
  capitalSummaryLabel: StyleProp<TextStyle>;
  capitalSummaryValue: StyleProp<TextStyle>;
  capitalSummaryPositive: StyleProp<TextStyle>;
  capitalSummaryNegative: StyleProp<TextStyle>;
  capitalSummaryMeta: StyleProp<TextStyle>;
  capitalSummaryLink: StyleProp<TextStyle>;
  detailActionsPanel: StyleProp<ViewStyle>;
  detailPrimaryAction: StyleProp<ViewStyle>;
  detailPrimaryIcon: StyleProp<ViewStyle>;
  detailActionCopy: StyleProp<ViewStyle>;
  detailPrimaryTitle: StyleProp<TextStyle>;
  detailActionMeta: StyleProp<TextStyle>;
  detailActionsRow: StyleProp<ViewStyle>;
  detailActionSecondaryBtn: StyleProp<ViewStyle>;
  detailActionIncreaseBtn: StyleProp<ViewStyle>;
  detailActionDangerBtn: StyleProp<ViewStyle>;
  detailActionIcon: StyleProp<ViewStyle>;
  detailActionIncreaseIcon: StyleProp<ViewStyle>;
  detailActionDangerIcon: StyleProp<ViewStyle>;
  detailActionSecondaryText: StyleProp<TextStyle>;
  detailActionIncreaseText: StyleProp<TextStyle>;
  detailActionDangerText: StyleProp<TextStyle>;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type CapitalOverview = {
  openingAmount: number;
  increaseTotal: number;
  increaseCount: number;
  decreaseTotal: number;
  decreaseCount: number;
  currentPrincipal: number;
  progressPercent: number;
};

type Props = {
  styles: ObligationOverviewCardsStyles;
  obligation: ObligationSummary | SharedObligationSummary;
  isSharedViewer: boolean;
  dirColor: string;
  directionPerspectiveLabel: string;
  capitalOverview: CapitalOverview;
  onPressEditObligation: () => void;
  onPressIncreaseCapital: () => void;
  onPressDecreaseCapital: () => void;
  onPressCapitalIncreaseDetail: () => void;
  onPressCapitalDecreaseDetail: () => void;
};

export function ObligationOverviewCards({
  styles,
  obligation,
  isSharedViewer,
  dirColor,
  directionPerspectiveLabel,
  capitalOverview,
  onPressEditObligation,
  onPressIncreaseCapital,
  onPressDecreaseCapital,
  onPressCapitalIncreaseDetail,
  onPressCapitalDecreaseDetail,
}: Props) {
  /** "3 de 6 pagos", cuando la obligación tiene plan. */
  const planProgressLabel = (() => {
    const plan = parsePaymentPlan(obligation.paymentPlan);
    if (!plan) return null;
    const scheduled = expandPaymentPlan({
      plan,
      principal: obligation.principalAmount,
      startDate: obligation.startDate,
    });
    if (scheduled.length === 0) return null;
    const paid = obligation.events.filter((event) => event.eventType === "payment").length;
    return `${Math.min(paid, scheduled.length)} de ${scheduled.length} pagos`;
  })();

  return (
    <>
      <Card style={styles.heroCard}>
        <Text style={[styles.directionBadge, { color: dirColor }]}>
          {directionPerspectiveLabel}
        </Text>
        <Text style={styles.counterparty}>{obligation.counterparty || "Sin contacto"}</Text>
        {/* La cifra grande es lo que FALTA, que es la pregunta con la que uno abre esta
            pantalla — no lo prestado. Y va en hueso: la barra de abajo es el único sitio donde
            la menta significa lo que debe significar, plata que entró. */}
        <Text style={styles.pendingLabel}>
          {obligationPendingDirectionBadge(obligation.direction, isSharedViewer)}
        </Text>
        <Text style={styles.pendingAmount}>
          {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
        </Text>
        <ProgressBar percent={capitalOverview.progressPercent} alertPercent={100} style={styles.progress} />
        <Text style={styles.progressLabel}>
          {capitalize(obligationProgressPaidAdjective(obligation.direction, isSharedViewer))}{" "}
          {formatCurrency(
            Math.max(0, capitalOverview.currentPrincipal - obligation.pendingAmount),
            obligation.currencyCode,
          )} de {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
          {planProgressLabel ? ` · ${planProgressLabel}` : ""}
        </Text>
      </Card>

      <Card style={styles.capitalSummaryCard}>
        <Text style={styles.sectionTitle}>Resumen de capital</Text>
        <View style={styles.capitalSummaryGrid}>
          <View style={styles.capitalSummaryItem}>
            <Text style={styles.capitalSummaryLabel}>Capital original</Text>
            <Text style={styles.capitalSummaryValue}>
              {formatCurrency(capitalOverview.openingAmount, obligation.currencyCode)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.capitalSummaryItem, styles.capitalSummaryAction]}
            activeOpacity={0.86}
            onPress={onPressCapitalIncreaseDetail}
          >
            <Text style={styles.capitalSummaryLabel}>Aumentos</Text>
            <Text style={[styles.capitalSummaryValue, styles.capitalSummaryPositive]}>
              +{formatCurrency(capitalOverview.increaseTotal, obligation.currencyCode)}
            </Text>
            <Text style={styles.capitalSummaryMeta}>
              {capitalOverview.increaseCount} {capitalOverview.increaseCount === 1 ? "evento" : "eventos"}
            </Text>
            <Text style={styles.capitalSummaryLink}>Ver detalle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.capitalSummaryItem, styles.capitalSummaryAction]}
            activeOpacity={0.86}
            onPress={onPressCapitalDecreaseDetail}
          >
            <Text style={styles.capitalSummaryLabel}>Reducciones</Text>
            <Text style={[styles.capitalSummaryValue, styles.capitalSummaryNegative]}>
              -{formatCurrency(capitalOverview.decreaseTotal, obligation.currencyCode)}
            </Text>
            <Text style={styles.capitalSummaryMeta}>
              {capitalOverview.decreaseCount} {capitalOverview.decreaseCount === 1 ? "evento" : "eventos"}
            </Text>
            <Text style={styles.capitalSummaryLink}>Ver detalle</Text>
          </TouchableOpacity>
          <View style={styles.capitalSummaryItem}>
            <Text style={styles.capitalSummaryLabel}>Capital vigente</Text>
            <Text style={styles.capitalSummaryValue}>
              {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
            </Text>
          </View>
        </View>
      </Card>

      {!isSharedViewer ? (
        <View style={styles.detailActionsPanel}>
          <TouchableOpacity
            style={styles.detailPrimaryAction}
            onPress={onPressEditObligation}
            activeOpacity={0.86}
          >
            <View style={styles.detailPrimaryIcon}>
              <Pencil size={16} color={COLORS.bgVoid} strokeWidth={2.4} />
            </View>
            <View style={styles.detailActionCopy}>
              <Text style={styles.detailPrimaryTitle}>Editar obligación</Text>
              <Text style={styles.detailActionMeta}>Datos, fechas y cuenta</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.detailActionsRow}>
            <TouchableOpacity
              style={[styles.detailActionSecondaryBtn, styles.detailActionIncreaseBtn]}
              activeOpacity={0.86}
              onPress={onPressIncreaseCapital}
            >
              <View style={[styles.detailActionIcon, styles.detailActionIncreaseIcon]}>
                <Plus size={15} color={COLORS.income} strokeWidth={2.4} />
              </View>
              <Text style={[styles.detailActionSecondaryText, styles.detailActionIncreaseText]}>
                Aumentar monto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailActionSecondaryBtn, styles.detailActionDangerBtn]}
              activeOpacity={0.86}
              onPress={onPressDecreaseCapital}
            >
              <View style={[styles.detailActionIcon, styles.detailActionDangerIcon]}>
                <Minus size={15} color={COLORS.danger} strokeWidth={2.4} />
              </View>
              <Text style={[styles.detailActionSecondaryText, styles.detailActionDangerText]}>
                Reducir monto
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
}
