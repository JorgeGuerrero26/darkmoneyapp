import { Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";
import { COLORS } from "../../../constants/theme";
import {
  ANALYTICS_EVENT_LABELS,
  groupAnalyticsEventsByDate,
} from "../../../lib/obligation-analytics-helpers";
import {
  obligationHistoryEventAmountPrefix,
  obligationHistoryEventColor,
} from "../../../lib/obligation-viewer-labels";
import { firstMeaningfulText } from "../../../lib/text-utils";
import type { ObligationDirection, ObligationEventSummary } from "../../../types/domain";
import { styles } from "../ObligationAnalyticsModal.styles";

type TimelineFilter = "all" | "payments" | "capital";
type TimelineToneFilter = "all" | "positive" | "negative";

const FILTER_OPTIONS: ReadonlyArray<{ id: TimelineFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "payments", label: "" },
  { id: "capital", label: "Capital" },
];

const TONE_OPTIONS: ReadonlyArray<{ id: TimelineToneFilter; label: string }> = [
  { id: "all", label: "Todo impacto" },
  { id: "positive", label: "Solo positivos" },
  { id: "negative", label: "Solo negativos" },
];

type Props = {
  timelineEvents: ObligationEventSummary[];
  filteredTimelineEvents: ObligationEventSummary[];
  timelineFilter: TimelineFilter;
  timelineToneFilter: TimelineToneFilter;
  onChangeTimelineFilter: (filter: TimelineFilter) => void;
  onChangeTimelineToneFilter: (filter: TimelineToneFilter) => void;
  analyticsDirection: ObligationDirection;
  isSharedViewer: boolean;
  currency: string;
  eventPaymentNoun: string;
  shouldUseCashPerspective: (eventId: number) => boolean;
  onEventTap?: (event: ObligationEventSummary) => void;
  onViewerEventTap: (event: ObligationEventSummary) => void;
};

export function AnalyticsTimeline({
  timelineEvents,
  filteredTimelineEvents,
  timelineFilter,
  timelineToneFilter,
  onChangeTimelineFilter,
  onChangeTimelineToneFilter,
  analyticsDirection,
  isSharedViewer,
  currency,
  eventPaymentNoun,
  shouldUseCashPerspective,
  onEventTap,
  onViewerEventTap,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Línea de tiempo</Text>

      <View style={styles.pillRowWrap}>
        {FILTER_OPTIONS.map((option) => {
          const label = option.id === "payments" ? `${eventPaymentNoun}s` : option.label;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.filterPill, timelineFilter === option.id && styles.filterPillActive]}
              onPress={() => onChangeTimelineFilter(option.id)}
            >
              <Text style={[styles.filterPillText, timelineFilter === option.id && styles.filterPillTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.pillRowWrap}>
        {TONE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.filterPill, timelineToneFilter === option.id && styles.filterPillActive]}
            onPress={() => onChangeTimelineToneFilter(option.id)}
          >
            <Text style={[styles.filterPillText, timelineToneFilter === option.id && styles.filterPillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {timelineEvents.length === 0 ? (
        <Text style={styles.emptyHistory}>Aun no hay eventos para construir la linea de tiempo.</Text>
      ) : filteredTimelineEvents.length === 0 ? (
        <Text style={styles.emptyHistory}>No hay eventos que coincidan con esos filtros.</Text>
      ) : (
        <View style={styles.tl2Container}>
          {groupAnalyticsEventsByDate(filteredTimelineEvents).map(({ date, events: dayEvents }) => {
            const dayTotal = dayEvents.reduce((sum, e) => {
              const useCash = shouldUseCashPerspective(e.id);
              const prefix = obligationHistoryEventAmountPrefix(e.eventType, analyticsDirection, isSharedViewer, useCash);
              return sum + (prefix === "+" ? e.amount : -e.amount);
            }, 0);
            const dayTotalColor = dayTotal >= 0 ? COLORS.income : COLORS.danger;
            return (
              <View key={date}>
                <View style={styles.tl2DateRow}>
                  <View style={styles.tl2NodeCol}>
                    <View style={styles.tl2DateDot} />
                  </View>
                  <Text style={styles.tl2DateLabel}>
                    {format(new Date(date + "T12:00:00"), "d MMM yyyy", { locale: es }).toUpperCase()}
                  </Text>
                  <View style={styles.tl2DateLine} />
                  <Text style={[styles.tl2DayTotal, { color: dayTotalColor }]}>
                    {dayTotal >= 0 ? "+" : ""}{formatCurrency(Math.abs(dayTotal), currency)}
                  </Text>
                </View>

                {dayEvents.map((event, i) => {
                  const useCashPerspective = shouldUseCashPerspective(event.id);
                  const eventTint = obligationHistoryEventColor(
                    event.eventType,
                    analyticsDirection,
                    isSharedViewer,
                    useCashPerspective,
                  );
                  const amountPrefix = obligationHistoryEventAmountPrefix(
                    event.eventType,
                    analyticsDirection,
                    isSharedViewer,
                    useCashPerspective,
                  );
                  const eventLabel =
                    event.eventType === "payment"
                      ? eventPaymentNoun
                      : ANALYTICS_EVENT_LABELS[event.eventType]?.label ?? event.eventType;
                  const eventDetail = firstMeaningfulText(event.description, event.reason, event.notes);
                  const impactLabel =
                    eventTint === COLORS.income
                      ? "Positivo"
                      : eventTint === COLORS.expense
                        ? "Negativo"
                        : "Neutro";
                  const isLastInDay = i === dayEvents.length - 1;

                  return (
                    <View key={event.id} style={styles.tl2EventRow}>
                      <View style={styles.tl2LineCol}>
                        <View style={styles.tl2LineSegment} />
                        <View style={[styles.tl2Dot, {
                          backgroundColor: eventTint,
                          shadowColor: eventTint,
                          shadowOpacity: 0.5,
                          shadowRadius: 3,
                          elevation: 3,
                        }]} />
                        {isLastInDay
                          ? <View style={styles.tl2LineEnd} />
                          : <View style={styles.tl2LineSegment} />}
                      </View>

                      <TouchableOpacity
                        style={styles.tl2Card}
                        onPress={() => {
                          if (onEventTap) { onEventTap(event); return; }
                          if (isSharedViewer) onViewerEventTap(event);
                        }}
                        activeOpacity={onEventTap || isSharedViewer ? 0.8 : 1}
                      >
                        <View style={styles.tl2CardBody}>
                          <Text style={[styles.tl2TypeLabel, { color: eventTint }]} numberOfLines={1}>
                            {eventLabel}
                          </Text>
                          <View style={styles.tl2CardSubRow}>
                            <View style={[styles.tl2Badge, { backgroundColor: eventTint + "18" }]}>
                              <Text style={[styles.tl2BadgeText, { color: eventTint }]}>{impactLabel}</Text>
                            </View>
                            {eventDetail ? (
                              <Text style={styles.tl2CardDesc} numberOfLines={1}>
                                {eventDetail}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={[styles.tl2Amount, { color: eventTint }]} numberOfLines={1}>
                          {amountPrefix}{formatCurrency(event.amount, currency)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
