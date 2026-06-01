import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import { getObligationStatusLabel } from "../../../../lib/obligation-labels";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type ObligationDetailInfoCardStyles = {
  detailInfoCard: StyleProp<ViewStyle>;
  detailInfoHeader: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  detailInfoBadge: StyleProp<TextStyle>;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={rowStyles.divider} />;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
    flex: 2,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.storm + "1F",
    marginVertical: 2,
  },
});

type Props = {
  styles: ObligationDetailInfoCardStyles;
  obligation: ObligationSummary | SharedObligationSummary;
};

export function ObligationDetailInfoCard({ styles, obligation }: Props) {
  return (
    <Card style={styles.detailInfoCard}>
      <View style={styles.detailInfoHeader}>
        <Text style={styles.sectionTitle}>Detalles</Text>
        <Text style={styles.detailInfoBadge}>{obligation.currencyCode}</Text>
      </View>
      <DetailRow label="Estado" value={getObligationStatusLabel(obligation.status)} />
      <Divider />
      <DetailRow
        label="Fecha inicio"
        value={format(parseDisplayDate(obligation.startDate), "d MMM yyyy", { locale: es })}
      />
      {obligation.dueDate ? (
        <>
          <Divider />
          <DetailRow
            label="Vencimiento"
            value={format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}
          />
        </>
      ) : null}
      {obligation.installmentAmount ? (
        <>
          <Divider />
          <DetailRow
            label="Cuota"
            value={`${formatCurrency(obligation.installmentAmount, obligation.currencyCode)}${obligation.installmentCount ? ` x ${obligation.installmentCount}` : ""}`}
          />
        </>
      ) : null}
      {obligation.interestRate ? (
        <>
          <Divider />
          <DetailRow label="Interes" value={`${obligation.interestRate}%`} />
        </>
      ) : null}
      {obligation.settlementAccountName ? (
        <>
          <Divider />
          <DetailRow label="Cuenta de liquidacion" value={obligation.settlementAccountName} />
        </>
      ) : null}
      {obligation.description?.trim() ? (
        <>
          <Divider />
          <DetailRow label="Descripcion" value={obligation.description.trim()} />
        </>
      ) : null}
      {obligation.notes?.trim() ? (
        <>
          <Divider />
          <DetailRow label="Notas" value={obligation.notes.trim()} />
        </>
      ) : null}
    </Card>
  );
}
