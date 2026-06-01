import type { ReactNode } from "react";
import {
  LayoutAnimation,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Minus, Plus } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { eventDatePillLabel } from "../../../../lib/obligation-event-presentation";
import { todayPeru } from "../../../../lib/date";
import { StaggeredItem } from "../../../../components/ui/StaggeredItem";
import type { ObligationEventSummary } from "../../../../types/domain";

export type EventHistoryGroupKey = "payments" | "capital";

export type EventHistoryGroupStyles = {
  historyGroupCard: StyleProp<ViewStyle>;
  historyGroupHeader: StyleProp<ViewStyle>;
  historyGroupHeaderLeft: StyleProp<ViewStyle>;
  historyGroupTitle: StyleProp<TextStyle>;
  historyGroupToggle: StyleProp<ViewStyle>;
  historyGroupBadge: StyleProp<ViewStyle>;
  historyGroupBadgeText: StyleProp<TextStyle>;
  historyGroupBody: StyleProp<ViewStyle>;
  historyGroupEmpty: StyleProp<TextStyle>;
  dateSeparator: StyleProp<ViewStyle>;
  dateSepLine: StyleProp<ViewStyle>;
  datePill: StyleProp<ViewStyle>;
  datePillText: StyleProp<TextStyle>;
  dateDayTotal: StyleProp<TextStyle>;
  dateGroup: StyleProp<ViewStyle>;
};

type CardPosition = "single" | "first" | "middle" | "last";

function groupEventsByDate(events: ObligationEventSummary[]): Array<{ date: string; events: ObligationEventSummary[] }> {
  const map = new Map<string, ObligationEventSummary[]>();
  for (const e of events) {
    const date = e.eventDate.slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, evs]) => ({ date, events: evs }));
}

type Props = {
  groupKey: EventHistoryGroupKey;
  title: string;
  subtitle: string;
  events: ObligationEventSummary[];
  emptyText: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  currencyCode: string;
  styles: EventHistoryGroupStyles;
  renderEventRow: (event: ObligationEventSummary, position: CardPosition) => ReactNode;
};

export function EventHistoryGroup({
  groupKey,
  title,
  events,
  emptyText,
  collapsed,
  onToggleCollapsed,
  currencyCode,
  styles,
  renderEventRow,
}: Props) {
  const dateGroups = groupEventsByDate(events);
  const todayStr = todayPeru();

  return (
    <View key={groupKey} style={styles.historyGroupCard}>
      <TouchableOpacity
        style={styles.historyGroupHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggleCollapsed();
        }}
        activeOpacity={0.8}
      >
        <View style={styles.historyGroupHeaderLeft}>
          <Text style={styles.historyGroupTitle}>{title}</Text>
        </View>
        <View style={styles.historyGroupToggle}>
          <View style={styles.historyGroupBadge}>
            <Text style={styles.historyGroupBadgeText}>{events.length}</Text>
          </View>
          {collapsed ? (
            <Plus size={13} color={COLORS.storm} strokeWidth={2.5} />
          ) : (
            <Minus size={13} color={COLORS.storm} strokeWidth={2.5} />
          )}
        </View>
      </TouchableOpacity>

      {!collapsed ? (
        <View style={styles.historyGroupBody}>
          {events.length === 0 ? (
            <Text style={styles.historyGroupEmpty}>{emptyText}</Text>
          ) : (
            dateGroups.map(({ date, events: dayEvents }) => {
              const pillLabel = eventDatePillLabel(date, todayStr);
              const dayTotal = dayEvents.reduce((sum, e) => sum + e.amount, 0);
              return (
                <View key={date}>
                  <View style={styles.dateSeparator}>
                    <View style={styles.dateSepLine} />
                    <View style={styles.datePill}>
                      <Text style={styles.datePillText}>{pillLabel}</Text>
                    </View>
                    <View style={styles.dateSepLine} />
                    <Text style={[
                      styles.dateDayTotal,
                      { color: dayTotal >= 0 ? COLORS.income : COLORS.danger },
                    ]}>
                      {dayTotal >= 0 ? "+" : ""}{formatCurrency(Math.abs(dayTotal), currencyCode)}
                    </Text>
                  </View>

                  <View style={styles.dateGroup}>
                    {dayEvents.map((event, idx) => {
                      const position: CardPosition =
                        dayEvents.length === 1
                          ? "single"
                          : idx === 0
                            ? "first"
                            : idx === dayEvents.length - 1
                              ? "last"
                              : "middle";
                      return (
                        <StaggeredItem key={event.id} index={idx} maxStagger={6}>
                          {renderEventRow(event, position)}
                        </StaggeredItem>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}
