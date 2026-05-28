import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TrendingDown, TrendingUp } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
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
        items={[
          {
            key: "income",
            icon: TrendingUp,
            value: formatCurrency(summary.incomeTotal, activeCurrency),
            label: `${summary.incomeCount} mov`,
            color: COLORS.income,
            helpTitle: "Ingresos filtrados",
            helpDescription: `Total de movimientos de ingreso que coinciden con la búsqueda y filtros actuales. Se muestra en ${activeCurrency}.`,
          },
          {
            key: "expense",
            icon: TrendingDown,
            value: formatCurrency(summary.expenseTotal, activeCurrency),
            label: `${summary.expenseCount} mov`,
            color: COLORS.expense,
            helpTitle: "Gastos filtrados",
            helpDescription: `Total de movimientos de gasto que coinciden con la búsqueda y filtros actuales. Se muestra en ${activeCurrency}.`,
          },
          {
            key: "net",
            value: `${summary.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(summary.net), activeCurrency)}`,
            label: "neto",
            color: summary.net >= 0 ? COLORS.income : COLORS.expense,
            strong: true,
            helpTitle: "Neto del filtro",
            helpDescription: "Diferencia entre ingresos y gastos visibles. Si es positivo entró más dinero; si es negativo salió más dinero.",
          },
        ]}
        trailingLabel={partial ? "parcial ↓" : null}
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
