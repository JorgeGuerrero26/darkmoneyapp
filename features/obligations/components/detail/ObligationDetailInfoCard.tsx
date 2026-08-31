import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { currencyPluralTitle } from "../../../../constants/currencies";
import { Card } from "../../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
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

/**
 * Lo que se escribió a mano y no cabe en ninguna otra parte de la pantalla.
 *
 * La tarjeta abría con "Estado · Activa" y "Fecha inicio · 15 mar 2026", que es palabra por
 * palabra lo que ya dice la línea del pie —"Activa desde el 15 de marzo"—. En una obligación sin
 * interés, sin cuenta, sin descripción y sin notas la tarjeta entera era esa repetición, así que
 * cuando no queda nada propio que decir, no se dibuja.
 */
export function ObligationDetailInfoCard({ styles, obligation }: Props) {
  const rows: { label: string; value: string }[] = [];
  if (obligation.interestRate) {
    rows.push({ label: "Interés", value: `${obligation.interestRate}%` });
  }
  if (obligation.settlementAccountName) {
    rows.push({ label: "Cuenta de liquidación", value: obligation.settlementAccountName });
  }
  if (obligation.description?.trim()) {
    rows.push({ label: "Descripción", value: obligation.description.trim() });
  }
  if (obligation.notes?.trim()) {
    rows.push({ label: "Notas", value: obligation.notes.trim() });
  }
  if (rows.length === 0) return null;

  return (
    <Card style={styles.detailInfoCard}>
      <View style={styles.detailInfoHeader}>
        <Text style={styles.sectionTitle}>Detalles</Text>
        <Text style={styles.detailInfoBadge}>{currencyPluralTitle(obligation.currencyCode)}</Text>
      </View>
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <Divider /> : null}
          <DetailRow label={row.label} value={row.value} />
        </View>
      ))}
    </Card>
  );
}
