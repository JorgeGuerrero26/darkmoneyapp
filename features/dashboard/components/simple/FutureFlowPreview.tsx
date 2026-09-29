import { Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import type { FutureFlowWindow } from "../../lib/dashboard-builders";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type FutureFlowPreviewProps = {
  /**
   * Las ventanas ya calculadas. Antes las calculaba aquí con la lectura vieja de compromisos,
   * que no veía cuotas; ahora salen del motor de proyección, como todo el dashboard avanzado.
   */
  windows: FutureFlowWindow[];
  displayCurrency: string;
};

export function FutureFlowPreview({ windows, displayCurrency }: FutureFlowPreviewProps) {
  return (
    <Card>
      <SectionTitle>Flujo futuro</SectionTitle>
      <View style={subStyles.futureWindowList}>
        {windows.map((window) => (
          <View key={window.days} style={subStyles.futureWindowCard}>
            <View style={subStyles.futureWindowTop}>
              <Text style={subStyles.futureWindowLabel}>Proximos {window.days} dias</Text>
              <Text
                style={[
                  subStyles.futureWindowNet,
                  { color: window.expectedInflow >= window.expectedOutflow ? COLORS.income : COLORS.expense },
                ]}
              >
                {formatCurrency(window.expectedInflow - window.expectedOutflow, displayCurrency)}
              </Text>
            </View>
            <View style={subStyles.futureWindowStats}>
              <Text style={subStyles.futureWindowMeta}>Entra {formatCurrency(window.expectedInflow, displayCurrency)}</Text>
              <Text style={subStyles.futureWindowMeta}>Sale {formatCurrency(window.expectedOutflow, displayCurrency)}</Text>
            </View>
            <Text style={subStyles.futureWindowBalance}>
              Caja estimada: {formatCurrency(window.estimatedBalance, displayCurrency)}
            </Text>
            <Text style={subStyles.futureWindowHint}>
              {window.receivableCount} por recibir · {window.payableCount} por pagar · {window.scheduledCount} compromisos
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
