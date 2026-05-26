import { Text, TouchableOpacity, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { COLORS } from "../../../../constants/theme";
import type { DashboardChartDay } from "../../lib/types";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type MiniBarChartProps = {
  data: DashboardChartDay[];
  onSelectDay: (day: DashboardChartDay) => void;
};

export function MiniBarChart({ data, onSelectDay }: MiniBarChartProps) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const BAR_HEIGHT = 56;

  return (
    <Card>
      <SectionTitle>Últimos 7 días - flujo diario</SectionTitle>
      <Text style={subStyles.chronoHint}>
        Toca un día: verás ingresos, gastos, ahorro del día (neto) y cada movimiento que lo explica.
      </Text>
      <View style={subStyles.chartRow}>
        {data.map((d) => (
          <TouchableOpacity
            key={d.dateKey}
            style={subStyles.chartCol}
            onPress={() => onSelectDay(d)}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`${d.label}, ver detalle del día`}
          >
            <View style={[subStyles.chartBars, { height: BAR_HEIGHT }]}>
              <View
                style={[
                  subStyles.chartBar,
                  {
                    height: Math.max((d.income / maxVal) * BAR_HEIGHT, d.income > 0 ? 3 : 0),
                    backgroundColor: COLORS.income,
                  },
                ]}
              />
              <View
                style={[
                  subStyles.chartBar,
                  {
                    height: Math.max((d.expense / maxVal) * BAR_HEIGHT, d.expense > 0 ? 3 : 0),
                    backgroundColor: COLORS.expense,
                  },
                ]}
              />
            </View>
            <Text style={subStyles.chartLabel}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={subStyles.chartLegend}>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.income }]} />
          <Text style={subStyles.legendText}>Ingresos</Text>
        </View>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.expense }]} />
          <Text style={subStyles.legendText}>Gastos</Text>
        </View>
      </View>
    </Card>
  );
}
