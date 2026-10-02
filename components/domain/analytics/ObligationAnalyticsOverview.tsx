import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { AnalyticsRow } from "../../ui/AnalyticsRow";
import { formatCurrency } from "../../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { formatSignedCurrencyValue } from "../../../lib/obligation-analytics-helpers";
import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  currentPrincipal: number;
  paidAmount: number;
  paymentCount: number;
  progressPercent: number;
  paidLabel: string;
  isSharedViewer: boolean;
  cashPerspective: boolean;
  cashNet: number;
  cashIn: number;
  cashOut: number;
  linkedCount: number;
  unlinkedCount: number;
  onChangePerspective: (cash: boolean) => void;
};

export function ObligationAnalyticsOverview({
  obligation,
  currentPrincipal,
  paidAmount,
  paymentCount,
  progressPercent,
  paidLabel,
  isSharedViewer,
  cashPerspective,
  cashNet,
  cashIn,
  cashOut,
  linkedCount,
  unlinkedCount,
  onChangePerspective,
}: Props) {
  const currency = obligation.currencyCode;
  const date = obligation.dueDate
    ? format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })
    : null;

  return (
    <View>
      {isSharedViewer ? (
        <View style={styles.selector}>
          <PerspectiveButton label="La deuda" selected={!cashPerspective} onPress={() => onChangePerspective(false)} />
          <PerspectiveButton label="Mis cuentas" selected={cashPerspective} onPress={() => onChangePerspective(true)} />
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.kicker}>{cashPerspective ? "CAMBIO EN MIS CUENTAS" : "PENDIENTE"}</Text>
        <Text
          style={[styles.amount, cashPerspective && cashNet !== 0 && { color: cashNet > 0 ? COLORS.income : COLORS.expense }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {cashPerspective ? formatSignedCurrencyValue(cashNet, currency) : formatCurrency(obligation.pendingAmount, currency)}
        </Text>
        <Text style={styles.caption}>
          {cashPerspective
            ? `${linkedCount} ${linkedCount === 1 ? "movimiento asociado" : "movimientos asociados"} a tus cuentas`
            : `${Math.round(progressPercent)}% cubierto${date ? ` · vence ${date}` : ""}`}
        </Text>
        {!cashPerspective ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
          </View>
        ) : null}
        {cashPerspective && unlinkedCount > 0 ? (
          <Text style={styles.note}>{unlinkedCount} sin cuenta asociada quedan fuera de esta cifra.</Text>
        ) : null}
      </View>

      <View style={styles.rows}>
        {cashPerspective ? (
          <>
            <AnalyticsRow label="Entró" value={formatCurrency(cashIn, currency)} valueColor={cashIn > 0 ? COLORS.income : undefined} />
            <AnalyticsRow label="Salió" value={formatCurrency(cashOut, currency)} valueColor={cashOut > 0 ? COLORS.expense : undefined} last />
          </>
        ) : (
          <>
            <AnalyticsRow label="Monto acordado" value={formatCurrency(currentPrincipal, currency)} />
            <AnalyticsRow label={paidLabel} value={formatCurrency(Math.max(0, paidAmount), currency)} />
            <AnalyticsRow label="Pagos registrados" value={String(paymentCount)} last={!obligation.installmentCount} />
            {obligation.installmentCount ? (
              <AnalyticsRow
                label="Cuotas pactadas"
                detail={obligation.installmentAmount != null ? `${formatCurrency(obligation.installmentAmount, currency)} por cuota` : undefined}
                value={String(obligation.installmentCount)}
                last
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function PerspectiveButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.segment, selected && styles.segmentSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: "row", alignSelf: "flex-start", padding: SPACING.xs / 2, borderRadius: RADIUS.md, backgroundColor: SURFACE.card, marginBottom: SPACING.lg },
  segment: { minHeight: 36, paddingHorizontal: SPACING.md, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm },
  segmentSelected: { backgroundColor: SURFACE.cardBorder },
  segmentText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  hero: { paddingBottom: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1, color: COLORS.storm },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, marginTop: SPACING.sm },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  track: { height: 5, borderRadius: RADIUS.full, backgroundColor: SURFACE.track, overflow: "hidden", marginTop: SPACING.md },
  fill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.sm },
  rows: { paddingTop: SPACING.sm },
});
