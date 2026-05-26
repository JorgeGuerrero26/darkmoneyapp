import { Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { SparkLine } from "../../../../components/ui/SparkLine";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type SavingsTrendCardProps = {
  monthlyPulse: { label: string; income: number; expense: number }[];
  currency: string;
};

export function SavingsTrendCard({ monthlyPulse, currency }: SavingsTrendCardProps) {
  const netValues = monthlyPulse.map((m) => m.income - m.expense);
  if (netValues.every((v) => v === 0)) return null;

  const lastNet = netValues[netValues.length - 1];
  const firstNet = netValues[0];
  const trendUp = lastNet >= firstNet;

  return (
    <Card>
      <View style={subStyles.trendHeader}>
        <SectionTitle>Ahorro mensual (6 meses)</SectionTitle>
        <Text style={[subStyles.trendBadge, { color: trendUp ? COLORS.pine : COLORS.rosewood }]}>
          {trendUp ? "^" : "v"} tendencia
        </Text>
      </View>
      <View style={subStyles.trendBody}>
        <SparkLine values={netValues} width={156} height={64} positiveColor={COLORS.pine} negativeColor={COLORS.rosewood} />
        <View style={subStyles.trendLegend}>
          {monthlyPulse.map((m, i) => {
            const net = m.income - m.expense;
            return (
              <View key={i} style={subStyles.trendRow}>
                <Text style={subStyles.trendLabel}>{m.label}</Text>
                <Text style={[subStyles.trendNet, { color: net >= 0 ? COLORS.pine : COLORS.rosewood }]}>
                  {net >= 0 ? "+" : ""}
                  {formatCurrency(net, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}
