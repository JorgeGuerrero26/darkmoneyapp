import { Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { RingChart, type RingSegment } from "../../../../components/ui/RingChart";
import { COLORS } from "../../../../constants/theme";
import { convertAmt } from "../../lib/aggregations";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type AccountsBreakdownProps = {
  accounts: {
    id: number;
    name: string;
    color: string;
    currentBalance: number;
    currentBalanceInBaseCurrency?: number | null;
    isArchived: boolean;
    includeInNetWorth: boolean;
  }[];
  displayCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
};

export function AccountsBreakdown({
  accounts,
  displayCurrency,
  baseCurrency,
  exchangeRateMap,
}: AccountsBreakdownProps) {
  const eligible = accounts.filter((a) => !a.isArchived && a.includeInNetWorth);
  if (eligible.length === 0) return null;

  const withBalances = eligible.map((a) => {
    const raw = a.currentBalanceInBaseCurrency ?? a.currentBalance;
    const converted = Math.max(convertAmt(raw, baseCurrency, displayCurrency, exchangeRateMap, baseCurrency) ?? 0, 0);
    return { ...a, converted };
  });

  const total = withBalances.reduce((s, a) => s + a.converted, 0);
  if (total <= 0) return null;

  const sorted = [...withBalances].sort((a, b) => b.converted - a.converted);
  const top5 = sorted.slice(0, 5).filter((a) => a.converted > 0);
  const otherTotal = sorted.slice(5).reduce((s, a) => s + a.converted, 0);

  const segments: RingSegment[] = top5.map((a) => ({
    key: String(a.id),
    value: a.converted,
    color: a.color,
  }));
  if (otherTotal > 0) {
    segments.push({ key: "other", value: otherTotal, color: COLORS.storm + "66" });
  }

  return (
    <Card>
      <SectionTitle>Distribución por cuenta</SectionTitle>
      <View style={subStyles.breakdownWrap}>
        <RingChart segments={segments} size={108} thickness={20} />
        <View style={subStyles.breakdownLegend}>
          {top5.map((a) => (
            <View key={a.id} style={subStyles.breakdownItem}>
              <View style={[subStyles.breakdownDot, { backgroundColor: a.color }]} />
              <Text style={subStyles.breakdownName} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={[subStyles.breakdownPct, { color: a.color }]}>
                {((a.converted / total) * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
          {otherTotal > 0 && (
            <View style={subStyles.breakdownItem}>
              <View style={[subStyles.breakdownDot, { backgroundColor: COLORS.storm }]} />
              <Text style={subStyles.breakdownName}>Otros</Text>
              <Text style={[subStyles.breakdownPct, { color: COLORS.storm }]}>
                {((otherTotal / total) * 100).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}
