import { Text, TouchableOpacity, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import type { DaySheetMode } from "../../../../components/dashboard/DayMovementsSheet";
import type { DashboardChartDay } from "../../lib/types";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type ChronologyStripProps = {
  title: string;
  hint: string;
  mode: DaySheetMode;
  data: DashboardChartDay[];
  barColor: string;
  currency: string;
  getValue: (d: DashboardChartDay) => number;
  onSelectDay: (day: DashboardChartDay, sheetMode: DaySheetMode) => void;
};

export function ChronologyStrip({
  title,
  hint,
  mode,
  data,
  barColor,
  currency,
  getValue,
  onSelectDay,
}: ChronologyStripProps) {
  const vals = data.map(getValue);
  const maxVal = Math.max(...vals, 1);
  const total = vals.reduce((a, b) => a + b, 0);
  const BAR_HEIGHT = 56;

  return (
    <Card>
      <View style={subStyles.chronoHeader}>
        <SectionTitle>{title}</SectionTitle>
        {total > 0 ? (
          <Text style={[subStyles.chronoTotal, { color: barColor }]}>{formatCurrency(total, currency)}</Text>
        ) : null}
      </View>
      <Text style={subStyles.chronoHint}>{hint}</Text>
      <View style={subStyles.chartRow}>
        {data.map((d) => {
          const v = getValue(d);
          return (
            <TouchableOpacity
              key={d.dateKey}
              style={subStyles.chartCol}
              onPress={() => onSelectDay(d, mode)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}, ${title}`}
            >
              <View style={[subStyles.chartBars, { height: BAR_HEIGHT, justifyContent: "flex-end" }]}>
                <View
                  style={{
                    width: "100%",
                    height: Math.max((v / maxVal) * BAR_HEIGHT, v > 0 ? 3 : 0),
                    backgroundColor: barColor,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                  }}
                />
              </View>
              <Text style={subStyles.chartLabel}>{d.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}
