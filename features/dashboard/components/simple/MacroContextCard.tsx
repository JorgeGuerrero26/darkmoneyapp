import { Text, View } from "react-native";

import { useBcrpMacroIndicatorsQuery } from "../../../../services/queries/bcrp-data";
import { dashboardSimpleStyles as subStyles } from "./styles";

function formatPercentValue(value: number | null) {
  if (value === null) return "Sin dato";
  return `${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function MacroContextCard() {
  const { data, isLoading, error } = useBcrpMacroIndicatorsQuery();
  const inflation = data?.inflation12m;
  const referenceRate = data?.referenceRate;
  const period = inflation?.period || referenceRate?.period || "Último dato";

  return (
    <View style={subStyles.macroCard}>
      <View style={subStyles.macroHeader}>
        <View>
          <Text style={subStyles.macroEyebrow}>Contexto BCRP</Text>
          <Text style={subStyles.macroTitle}>{period}</Text>
        </View>
        <View style={subStyles.macroBadge}>
          <Text style={subStyles.macroBadgeText}>BCRPData</Text>
        </View>
      </View>

      <View style={subStyles.macroGrid}>
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Inflación 12m</Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(inflation?.value ?? null)}
          </Text>
        </View>
        <View style={subStyles.macroDivider} />
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Tasa ref.</Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(referenceRate?.value ?? null)}
          </Text>
        </View>
      </View>

      <Text style={subStyles.macroHint}>
        {error
          ? "No se pudo cargar el contexto macroeconómico."
          : "Indicadores oficiales usados como contexto; no modifican tus cálculos."}
      </Text>
    </View>
  );
}
