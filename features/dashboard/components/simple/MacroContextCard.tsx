import { Text, View } from "react-native";

import { useBcrpMacroIndicatorsQuery } from "../../../../services/queries/bcrp-data";
import { dashboardSimpleStyles as subStyles } from "./styles";

function formatPercentValue(value: number | null) {
  if (value === null) return "Sin dato";
  return `${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPeriod(value: string | undefined) {
  return value?.trim() || "Último dato";
}

export function MacroContextCard() {
  const { data, isLoading, error } = useBcrpMacroIndicatorsQuery();
  const inflation = data?.inflation12m;
  const referenceRate = data?.referenceRate;

  return (
    <View style={subStyles.macroCard}>
      <View style={subStyles.macroHeader}>
        <View>
          <Text style={subStyles.macroEyebrow}>Contexto macro Perú</Text>
          <Text style={subStyles.macroTitle}>Indicadores recientes</Text>
        </View>
        <View style={subStyles.macroBadge}>
          <Text style={subStyles.macroBadgeText}>BCRP</Text>
        </View>
      </View>

      <View style={subStyles.macroGrid}>
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Inflación 12m</Text>
          <Text style={subStyles.macroMetricPeriod}>
            {isLoading ? "Cargando..." : formatPeriod(inflation?.period)}
          </Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(inflation?.value ?? null)}
          </Text>
        </View>
        <View style={subStyles.macroDivider} />
        <View style={subStyles.macroMetric}>
          <Text style={subStyles.macroMetricLabel}>Tasa BCRP</Text>
          <Text style={subStyles.macroMetricPeriod}>
            {isLoading ? "Cargando..." : formatPeriod(referenceRate?.period)}
          </Text>
          <Text style={subStyles.macroMetricValue}>
            {isLoading ? "..." : formatPercentValue(referenceRate?.value ?? null)}
          </Text>
        </View>
      </View>

      <Text style={subStyles.macroHint}>
        {error
          ? "BCRPData no respondió ahora. Tus cálculos siguen funcionando con tus movimientos."
          : "Úsalo como señal: inflación presiona precios; la tasa BCRP encarece créditos. No modifica tus cálculos."}
      </Text>
    </View>
  );
}
