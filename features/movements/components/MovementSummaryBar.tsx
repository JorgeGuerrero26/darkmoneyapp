import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatAmountPlain, formatCurrency } from "../../../components/ui/AmountDisplay";
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

type MovementFilterSummary = {
  incomeTotal: number;
  expenseTotal: number;
  incomeCount: number;
  expenseCount: number;
  net: number;
};

type Props = {
  summary: MovementFilterSummary;
  baseCurrency: string;
  partial?: boolean;
  /** Currencies disponibles en el workspace (≥1). Solo se renderiza el selector si hay >1. */
  currencyOptions?: string[];
  /** Currency seleccionado actualmente para mostrar los totales. Default: baseCurrency. */
  displayCurrency?: string;
  /** Callback al cambiar el currency activo. */
  onCurrencyChange?: (code: string) => void;
};

export function MovementSummaryBar({
  summary,
  baseCurrency,
  partial,
  currencyOptions,
  displayCurrency,
  onCurrencyChange,
}: Props) {
  const activeCurrency = displayCurrency ?? baseCurrency;
  const showSelector = Boolean(currencyOptions && currencyOptions.length > 1 && onCurrencyChange);

  return (
    <View style={styles.root}>
      {showSelector ? (
        <View
          style={styles.currencyRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Moneda de visualización"
        >
          {currencyOptions!.map((code) => {
            const active = code === activeCurrency;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.currencyBtn, active && styles.currencyBtnActive]}
                onPress={() => onCurrencyChange!(code)}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityLabel={`Mostrar totales en ${code}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.currencyText, active && styles.currencyTextActive]}>{code}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <MetricSummaryBar
        label={`Neto ${activeCurrency}`}
        value={formatAmountPlain(summary.net, activeCurrency, true)}
        valueColor={summary.net >= 0 ? COLORS.income : COLORS.expense}
        support={[
          `Entró ${formatCurrency(summary.incomeTotal, activeCurrency)}`,
          `salió ${formatCurrency(summary.expenseTotal, activeCurrency)}`,
        ].join(" · ")}
        footnote={partial ? "Totales de los movimientos cargados hasta ahora. Sigue bajando para incluir el resto." : null}
        help={{
          title: "Neto del filtro",
          description: "Diferencia entre ingresos y gastos visibles. Si es positivo entró más dinero del que salió.",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
  },
  currencyRow: {
    flexDirection: "row",
    gap: SPACING.xs,
    alignSelf: "flex-end",
  },
  currencyBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  currencyBtnActive: {
    borderColor: COLORS.pine + "AA",
    backgroundColor: COLORS.pine + "1A",
  },
  currencyText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    letterSpacing: 0.5,
  },
  currencyTextActive: {
    color: COLORS.pine,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});
