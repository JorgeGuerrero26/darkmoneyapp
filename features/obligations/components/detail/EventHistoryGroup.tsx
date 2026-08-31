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
import { signedNet } from "../../lib/describe-event";
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
  datePillText: StyleProp<TextStyle>;
  dateDayTotal: StyleProp<TextStyle>;
  dateGroup: StyleProp<ViewStyle>;
};

/**
 * Los movimientos se agrupan por **mes**, no por día.
 *
 * Eran siete cabeceras para ocho filas —cinco encabezando un solo movimiento, cada una con su
 * cápsula, su línea y su total— y la fecha se repetía dos renglones más abajo, dentro de la
 * fila. El día vive donde ya estaba: en el subtítulo.
 */
function groupEventsByMonth(events: ObligationEventSummary[]): Array<{ month: string; events: ObligationEventSummary[] }> {
  const map = new Map<string, ObligationEventSummary[]>();
  for (const e of events) {
    const month = e.eventDate.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, evs]) => ({ month, events: evs }));
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  const name = new Intl.DateTimeFormat("es-PE", { month: "long" }).format(new Date(year, m - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
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
  renderEventRow: (event: ObligationEventSummary) => ReactNode;
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
  const monthGroups = groupEventsByMonth(events);

  return (
    <View key={groupKey} style={styles.historyGroupCard}>
      {/* Sin título no hay cabecera: cuando la lista es una sola, el rótulo y el conteo ya
          están arriba y repetirlos aquí sería decir dos veces lo mismo. */}
      {title ? (
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
      ) : null}

      {!collapsed ? (
        <View style={styles.historyGroupBody}>
          {events.length === 0 ? (
            <Text style={styles.historyGroupEmpty}>{emptyText}</Text>
          ) : (
            monthGroups.map(({ month, events: monthEvents }) => {
              /**
               * El neto del mes, con signo. La cabecera sumaba magnitudes: un pago y dos
               * reducciones que bajaban la deuda salían como "+ S/ 35.00" mientras el saldo de
               * la derecha, en la misma fila, bajaba. El signo dice hacia dónde se movió.
               */
              const net = signedNet(monthEvents);
              return (
                <View key={month}>
                  <View style={styles.dateSeparator}>
                    <Text style={styles.datePillText}>{monthLabel(month)}</Text>
                    <View style={styles.dateSepLine} />
                    <Text style={styles.dateDayTotal}>
                      {net >= 0 ? "+ " : "− "}{formatCurrency(Math.abs(net), currencyCode)}
                    </Text>
                  </View>

                  <View style={styles.dateGroup}>
                    {monthEvents.map((event, idx) => (
                      <StaggeredItem key={event.id} index={idx} maxStagger={6}>
                        {renderEventRow(event)}
                      </StaggeredItem>
                    ))}
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
