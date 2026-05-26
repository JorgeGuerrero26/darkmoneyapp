import { Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type CategoryComparisonProps = {
  catTotals: Map<number | null, number>;
  prevCatTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  currency: string;
};

export function CategoryComparison({ catTotals, prevCatTotals, categories, currency }: CategoryComparisonProps) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const allKeys = new Set<number | null>([...catTotals.keys(), ...prevCatTotals.keys()]);
  const entries = Array.from(allKeys)
    .map((id) => ({
      name: catMap.get(id ?? -1) ?? "Sin categoría",
      current: catTotals.get(id) ?? 0,
      prev: prevCatTotals.get(id) ?? 0,
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5);

  if (entries.length === 0) return null;
  const maxVal = Math.max(...entries.flatMap((e) => [e.current, e.prev]), 1);

  return (
    <Card>
      <SectionTitle>Comparación de gastos por categoría</SectionTitle>
      <View style={subStyles.catCompLegend}>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.rosewood }]} />
          <Text style={subStyles.legendText}>Actual</Text>
        </View>
        <View style={subStyles.legendItem}>
          <View style={[subStyles.legendDot, { backgroundColor: COLORS.storm }]} />
          <Text style={subStyles.legendText}>Anterior</Text>
        </View>
      </View>
      {entries.map((e, i) => (
        <View key={i} style={subStyles.catCompRow}>
          <Text style={subStyles.catCompName} numberOfLines={1}>
            {e.name}
          </Text>
          <View style={subStyles.catCompBars}>
            <View style={subStyles.catCompBarTrack}>
              <View
                style={[
                  subStyles.catCompBarFill,
                  { width: `${(e.current / maxVal) * 100}%`, backgroundColor: COLORS.rosewood + "99" },
                ]}
              />
            </View>
            <View style={subStyles.catCompBarTrack}>
              <View
                style={[
                  subStyles.catCompBarFill,
                  { width: `${(e.prev / maxVal) * 100}%`, backgroundColor: COLORS.storm + "66" },
                ]}
              />
            </View>
          </View>
          <Text style={subStyles.catCompAmt}>{formatCurrency(e.current, currency)}</Text>
        </View>
      ))}
    </Card>
  );
}
