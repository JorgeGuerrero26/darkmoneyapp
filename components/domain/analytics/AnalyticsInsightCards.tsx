import { Text, View } from "react-native";
import { differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";
import { parseDisplayDate } from "../../../lib/date";
import { ymdToLocalDate } from "../../../lib/obligation-date-range";
import { formatSignedCurrencyValue } from "../../../lib/obligation-analytics-helpers";
import type { ObligationEventSummary } from "../../../types/domain";
import { styles } from "../ObligationAnalyticsModal.styles";

type AnalysisEvent = {
  event: ObligationEventSummary;
  signedAmount: number;
  displayAmount: number;
};

type Props = {
  analysisEvents: AnalysisEvent[];
  analyticsUsesCashPerspective: boolean;
  analysisAveragePaymentAmount: number;
  analysisLargestEvent: AnalysisEvent | null;
  analysisLastEvent: ObligationEventSummary | null;
  analysisFirstEvent: ObligationEventSummary | null;
  analysisAverageGapDays: number | null;
  analysisEventLabel: string;
  eventPaymentNoun: string;
  todayLocal: Date;
  currency: string;
};

export function AnalyticsInsightCards({
  analysisEvents,
  analyticsUsesCashPerspective,
  analysisAveragePaymentAmount,
  analysisLargestEvent,
  analysisLastEvent,
  analysisFirstEvent,
  analysisAverageGapDays,
  analysisEventLabel,
  eventPaymentNoun,
  todayLocal,
  currency,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ritmo reciente</Text>
      <View style={styles.insightGrid}>
        <View style={styles.insightCard}>
          <Text style={styles.insightValue}>
            {analysisEvents.length > 0
              ? analyticsUsesCashPerspective
                ? formatSignedCurrencyValue(analysisAveragePaymentAmount, currency)
                : formatCurrency(analysisAveragePaymentAmount, currency)
              : "Sin eventos"}
          </Text>
          <Text style={styles.insightLabel}>
            {analyticsUsesCashPerspective ? "Promedio por movimiento" : `Promedio por ${eventPaymentNoun}`}
          </Text>
          <Text style={styles.insightSub}>
            {analysisEvents.length > 0
              ? `${analysisEvents.length} ${analysisEventLabel} registrados`
              : "Aun no hay historial suficiente"}
          </Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightValue}>
            {analysisLargestEvent
              ? analyticsUsesCashPerspective
                ? formatSignedCurrencyValue(analysisLargestEvent.signedAmount, currency)
                : formatCurrency(analysisLargestEvent.displayAmount, currency)
              : "Sin eventos"}
          </Text>
          <Text style={styles.insightLabel}>
            {analyticsUsesCashPerspective ? "Mayor impacto en caja" : `Mayor ${eventPaymentNoun}`}
          </Text>
          <Text style={styles.insightSub}>
            {analysisLargestEvent
              ? format(parseDisplayDate(analysisLargestEvent.event.eventDate), "d MMM yyyy", { locale: es })
              : "Todavia no hay un pico registrado"}
          </Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightValue}>
            {analysisLastEvent
              ? `${Math.max(0, differenceInDays(todayLocal, ymdToLocalDate(analysisLastEvent.eventDate)))} d`
              : "Sin eventos"}
          </Text>
          <Text style={styles.insightLabel}>Tiempo desde el ultimo</Text>
          <Text style={styles.insightSub}>
            {analysisLastEvent
              ? format(parseDisplayDate(analysisLastEvent.eventDate), "d MMM yyyy", { locale: es })
              : "No hay movimientos recientes"}
          </Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightValue}>
            {analysisAverageGapDays != null ? `${Math.round(analysisAverageGapDays)} d` : "Sin serie"}
          </Text>
          <Text style={styles.insightLabel}>Separacion promedio</Text>
          <Text style={styles.insightSub}>
            {analysisFirstEvent && analysisLastEvent && analysisEvents.length > 1
              ? `Desde ${format(parseDisplayDate(analysisFirstEvent.eventDate), "d MMM", { locale: es })} hasta ${format(parseDisplayDate(analysisLastEvent.eventDate), "d MMM", { locale: es })}`
              : "Necesita al menos dos eventos"}
          </Text>
        </View>
      </View>
    </View>
  );
}
