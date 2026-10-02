import { useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { AnalyticsRow } from "../../ui/AnalyticsRow";
import { formatCurrency } from "../../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import { ANALYTICS_EVENT_LABELS } from "../../../lib/obligation-analytics-helpers";
import { obligationHistoryEventAmountPrefix, obligationHistoryEventColor } from "../../../lib/obligation-viewer-labels";
import { firstMeaningfulText } from "../../../lib/text-utils";
import type { ObligationDirection, ObligationEventSummary } from "../../../types/domain";

type TimelineFilter = "all" | "payments" | "capital";

type Props = {
  timelineEvents: ObligationEventSummary[];
  filteredTimelineEvents: ObligationEventSummary[];
  timelineFilter: TimelineFilter;
  onChangeTimelineFilter: (filter: TimelineFilter) => void;
  analyticsDirection: ObligationDirection;
  isSharedViewer: boolean;
  currency: string;
  eventPaymentNoun: string;
  shouldUseCashPerspective: (eventId: number) => boolean;
  onEventTap?: (event: ObligationEventSummary) => void;
  onViewerEventTap: (event: ObligationEventSummary) => void;
};

const INITIAL_LIMIT = 8;
const PAGE_SIZE = 20;

export function AnalyticsTimeline({
  timelineEvents,
  filteredTimelineEvents,
  timelineFilter,
  onChangeTimelineFilter,
  analyticsDirection,
  isSharedViewer,
  currency,
  eventPaymentNoun,
  shouldUseCashPerspective,
  onEventTap,
  onViewerEventTap,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_LIMIT);
  const visible = filteredTimelineEvents.slice(0, visibleCount);
  const filters: { id: TimelineFilter; label: string }[] = [
    { id: "all", label: "Todo" },
    { id: "payments", label: `${eventPaymentNoun}s` },
    { id: "capital", label: "Capital" },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Actividad</Text>
      <Text style={styles.subtitle}>
        {filteredTimelineEvents.length} de {timelineEvents.length} eventos · toca uno para ver su detalle
      </Text>
      <View style={styles.selector}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.segment, timelineFilter === filter.id && styles.segmentSelected]}
            onPress={() => { setVisibleCount(INITIAL_LIMIT); onChangeTimelineFilter(filter.id); }}
            accessibilityRole="button"
            accessibilityState={{ selected: timelineFilter === filter.id }}
          >
            <Text style={[styles.segmentText, timelineFilter === filter.id && styles.segmentTextSelected]}>{filter.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {timelineEvents.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay actividad registrada.</Text>
      ) : filteredTimelineEvents.length === 0 ? (
        <Text style={styles.empty}>No hay eventos en este filtro.</Text>
      ) : (
        <>
          {visible.map((event, index) => {
            const useCash = shouldUseCashPerspective(event.id);
            const prefix = obligationHistoryEventAmountPrefix(event.eventType, analyticsDirection, isSharedViewer, useCash);
            const tint = obligationHistoryEventColor(event.eventType, analyticsDirection, isSharedViewer, useCash);
            const eventLabel = event.eventType === "payment"
              ? eventPaymentNoun
              : ANALYTICS_EVENT_LABELS[event.eventType]?.label ?? "Movimiento";
            const description = firstMeaningfulText(event.description, event.reason, event.notes);
            const onPress = onEventTap
              ? () => onEventTap(event)
              : isSharedViewer ? () => onViewerEventTap(event) : undefined;
            return (
              <AnalyticsRow
                key={event.id}
                label={description || eventLabel}
                detail={`${format(parseDisplayDate(event.eventDate), "d MMM yyyy", { locale: es })} · ${eventLabel}${event.installmentNo ? ` · cuota ${event.installmentNo}` : ""}`}
                value={`${prefix}${formatCurrency(event.amount, currency)}`}
                valueColor={tint === COLORS.income || tint === COLORS.expense ? tint : undefined}
                onPress={onPress}
                last={index === visible.length - 1 && visibleCount >= filteredTimelineEvents.length}
              />
            );
          })}
          {filteredTimelineEvents.length > INITIAL_LIMIT ? (
            <Pressable
              style={styles.expand}
              onPress={() => setVisibleCount((count) => count >= filteredTimelineEvents.length ? INITIAL_LIMIT : count + PAGE_SIZE)}
              accessibilityRole="button"
            >
              <Text style={styles.expandText}>
                {visibleCount >= filteredTimelineEvents.length
                  ? "Mostrar menos"
                  : `Ver ${Math.min(PAGE_SIZE, filteredTimelineEvents.length - visibleCount)} más`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.xxxl },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  selector: { flexDirection: "row", alignSelf: "flex-start", padding: SPACING.xs / 2, borderRadius: RADIUS.md, backgroundColor: SURFACE.card, marginTop: SPACING.md, marginBottom: SPACING.sm },
  segment: { minHeight: 36, paddingHorizontal: SPACING.md, justifyContent: "center", borderRadius: RADIUS.sm },
  segmentSelected: { backgroundColor: SURFACE.cardBorder },
  segmentText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  segmentTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.lg },
  expand: { minHeight: 48, justifyContent: "center" },
  expandText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
