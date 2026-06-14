import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { useBcrpMacroIndicatorsQuery } from "../../../../services/queries/bcrp-data";
import { COLORS } from "../../../../constants/theme";
import { dashboardSimpleStyles as subStyles } from "./styles";

function formatPercentValue(value: number | null) {
  if (value === null) return "Sin dato";
  return `${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPeriod(value: string | undefined) {
  return value?.trim() || "Último dato";
}

type MacroContextCardProps = {
  initiallyExpanded?: boolean;
};

export function MacroContextCard({ initiallyExpanded = false }: MacroContextCardProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const { data, isLoading, error } = useBcrpMacroIndicatorsQuery();
  const inflation = data?.inflation12m;
  const referenceRate = data?.referenceRate;
  const compactCopy = error
    ? "Contexto BCRP no disponible ahora."
    : `Inflación ${formatPercentValue(inflation?.value ?? null)} · Tasa BCRP ${formatPercentValue(referenceRate?.value ?? null)}`;
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <View style={subStyles.macroCard}>
      <TouchableOpacity
        style={subStyles.macroHeader}
        onPress={() => setExpanded((current) => !current)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Ocultar contexto macro" : "Ver contexto macro"}
      >
        <View>
          <Text style={subStyles.macroEyebrow}>Contexto macro Perú</Text>
          <Text style={subStyles.macroTitle}>{expanded ? "Indicadores recientes" : "BCRP en breve"}</Text>
        </View>
        <View style={subStyles.macroHeaderRight}>
          <View style={subStyles.macroBadge}>
            <Text style={subStyles.macroBadgeText}>BCRP</Text>
          </View>
          <ChevronIcon size={18} color={COLORS.storm} />
        </View>
      </TouchableOpacity>

      {!expanded ? (
        <Text style={subStyles.macroHint}>
          {isLoading ? "Cargando indicadores oficiales..." : compactCopy}
        </Text>
      ) : null}

      {expanded ? (
        <>
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
        </>
      ) : null}
    </View>
  );
}
