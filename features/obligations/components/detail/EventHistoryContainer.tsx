import { type ReactNode } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { DatePickerInput } from "../../../../components/ui/DatePickerInput";
import type { HistoryPreset } from "../../../../hooks/useObligationNotificationDeepLink";
import { ymdToLocalDate } from "../../../../lib/obligation-date-range";
import type { ObligationEventSummary } from "../../../../types/domain";

export type EventHistoryContainerStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  dateRangeCaption: StyleProp<TextStyle>;
  historyLegendRow: StyleProp<ViewStyle>;
  historyLegendChip: StyleProp<ViewStyle>;
  historyLegendChipCash: StyleProp<ViewStyle>;
  historyLegendChipCapital: StyleProp<ViewStyle>;
  historyLegendChipText: StyleProp<TextStyle>;
  historyLegendChipTextCash: StyleProp<TextStyle>;
  historyLegendChipTextCapital: StyleProp<TextStyle>;
  historyPresetRow: StyleProp<ViewStyle>;
  historyHeaderRow: StyleProp<ViewStyle>;
  historyScopeLabel: StyleProp<TextStyle>;
  filterPill: StyleProp<ViewStyle>;
  filterPillActive: StyleProp<ViewStyle>;
  filterPillText: StyleProp<TextStyle>;
  filterPillTextActive: StyleProp<TextStyle>;
  customRange: StyleProp<ViewStyle>;
  eventFocusNotice: StyleProp<ViewStyle>;
  eventFocusNoticeSuccess: StyleProp<ViewStyle>;
  eventFocusNoticeInfo: StyleProp<ViewStyle>;
  eventFocusNoticeText: StyleProp<TextStyle>;
  eventFocusNoticeTextSuccess: StyleProp<TextStyle>;
  eventFocusNoticeTextInfo: StyleProp<TextStyle>;
  emptyHistory: StyleProp<TextStyle>;
};

/**
 * A partir de cuántos eventos aparecen los filtros.
 *
 * Con pocos, la lista se ve entera de un vistazo y el filtro solo ocupa sitio — misma regla que
 * el buscador de Cuentas.
 */
const FILTERS_MIN_EVENTS = 12;

const PRESET_LABELS: Record<HistoryPreset, string> = {
  month: "Mes actual",
  "3m": "3 meses",
  year: "Este año",
  all: "Todos",
  custom: "Rango",
};

const PRESET_OPTIONS = [
  { id: "month" as HistoryPreset, label: "Mes actual" },
  { id: "3m" as HistoryPreset, label: "3 meses" },
  { id: "year" as HistoryPreset, label: "Este año" },
  { id: "all" as HistoryPreset, label: "Todo" },
  { id: "custom" as HistoryPreset, label: "Rango..." },
] as const;

type Props = {
  styles: EventHistoryContainerStyles;
  paymentWordPlural: string;
  paymentWord: string;
  historyDateRangeNotice: string;
  historyPreset: HistoryPreset;
  historyFrom: string;
  historyTo: string;
  onApplyPreset: (preset: HistoryPreset) => void;
  onChangeHistoryFrom: (value: string) => void;
  onChangeHistoryTo: (value: string) => void;
  onSetCustomPreset: () => void;
  eventFocusNotice: { tone: "info" | "success"; text: string } | null;
  isSharedViewer: boolean;
  remoteEventsError: unknown;
  remoteEventsPending: boolean;
  eventsForDetail: ObligationEventSummary[];
  filteredHistoryEvents: ObligationEventSummary[];
  paymentHistoryEvents: ObligationEventSummary[];
  capitalHistoryEvents: ObligationEventSummary[];
  onSectionLayoutY: (y: number) => void;
  renderHistoryGroup: (params: {
    key: "payments" | "capital";
    title: string;
    subtitle: string;
    events: ObligationEventSummary[];
    emptyText: string;
  }) => ReactNode;
};

export function EventHistoryContainer({
  styles,
  paymentWordPlural,
  paymentWord,
  historyDateRangeNotice,
  historyPreset,
  historyFrom,
  historyTo,
  onApplyPreset,
  onChangeHistoryFrom,
  onChangeHistoryTo,
  onSetCustomPreset,
  eventFocusNotice,
  isSharedViewer,
  remoteEventsError,
  remoteEventsPending,
  eventsForDetail,
  filteredHistoryEvents,
  paymentHistoryEvents,
  capitalHistoryEvents,
  onSectionLayoutY,
  renderHistoryGroup,
}: Props) {
  const showFilters = eventsForDetail.length >= FILTERS_MIN_EVENTS;

  return (
    <View
      style={styles.section}
      onLayout={(event) => onSectionLayoutY(event.nativeEvent.layout.y)}
    >
      {/* El rótulo dice qué se está viendo —"Todos · 21"—, que es lo que un filtro debe decir.
          Las dos cápsulas que estaban aquí ("Los cobros reducen el saldo pendiente", "Capital
          cambia el monto prestado o debido") eran notas al pie disfrazadas de filtro: enseñaban
          vocabulario interno. La lista lo explica sola mostrando el saldo que quedó tras cada
          movimiento. */}
      <View style={styles.historyHeaderRow}>
        <Text style={styles.sectionTitle}>Movimientos</Text>
        <Text style={styles.historyScopeLabel}>
          {PRESET_LABELS[historyPreset]} · {filteredHistoryEvents.length}
        </Text>
      </View>
      {showFilters ? (
        <>
          <Text style={styles.dateRangeCaption}>{historyDateRangeNotice}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyPresetRow}>
            {PRESET_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.filterPill, historyPreset === opt.id && styles.filterPillActive]}
                onPress={() => onApplyPreset(opt.id)}
              >
                <Text style={[styles.filterPillText, historyPreset === opt.id && styles.filterPillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : null}
      {historyPreset === "custom" ? (
        <View style={styles.customRange}>
          <DatePickerInput
            label="Desde"
            value={historyFrom}
            onChange={(value) => { onChangeHistoryFrom(value); onSetCustomPreset(); }}
            hideLabel
            variant="formRow"
          />
          <DatePickerInput
            label="Hasta"
            value={historyTo}
            onChange={(value) => { onChangeHistoryTo(value); onSetCustomPreset(); }}
            hideLabel
            variant="formRow"
            minimumDate={historyFrom ? ymdToLocalDate(historyFrom) : undefined}
          />
        </View>
      ) : null}
      {eventFocusNotice ? (
        <View
          style={[
            styles.eventFocusNotice,
            eventFocusNotice.tone === "success"
              ? styles.eventFocusNoticeSuccess
              : styles.eventFocusNoticeInfo,
          ]}
        >
          <Text
            style={[
              styles.eventFocusNoticeText,
              eventFocusNotice.tone === "success"
                ? styles.eventFocusNoticeTextSuccess
                : styles.eventFocusNoticeTextInfo,
            ]}
          >
            {eventFocusNotice.text}
          </Text>
        </View>
      ) : null}
      {isSharedViewer && remoteEventsError && eventsForDetail.length === 0 ? (
        <Text style={styles.emptyHistory}>No pudimos cargar el historial.</Text>
      ) : isSharedViewer && remoteEventsPending && eventsForDetail.length === 0 ? (
        <Text style={styles.emptyHistory}>Cargando historial...</Text>
      ) : filteredHistoryEvents.length === 0 ? (
        <Text style={styles.emptyHistory}>
          {eventsForDetail.length === 0
            ? "Sin movimientos registrados aún."
            : "Ningún movimiento en este rango de fechas."}
        </Text>
      ) : (
        <>
          {renderHistoryGroup({
            key: "payments",
            title: paymentWordPlural,
            subtitle: `Eventos que registran ${paymentWord.toLowerCase()}s y reducen el saldo pendiente.`,
            events: paymentHistoryEvents,
            emptyText: `Sin ${paymentWord.toLowerCase()}s en este rango.`,
          })}
          {renderHistoryGroup({
            key: "capital",
            title: "Capital",
            subtitle: "Apertura, aumentos, reducciones y otros ajustes del principal.",
            events: capitalHistoryEvents,
            emptyText: "Sin cambios de capital en este rango.",
          })}
        </>
      )}
    </View>
  );
}
