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

const PRESET_OPTIONS = [
  { id: "month" as HistoryPreset, label: "Mes actual" },
  { id: "3m" as HistoryPreset, label: "3 meses" },
  { id: "year" as HistoryPreset, label: "Este ano" },
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
  return (
    <View
      style={styles.section}
      onLayout={(event) => onSectionLayoutY(event.nativeEvent.layout.y)}
    >
      <Text style={styles.sectionTitle}>Historial de eventos</Text>
      <Text style={styles.dateRangeCaption}>{historyDateRangeNotice}</Text>
      <View style={styles.historyLegendRow}>
        <View style={[styles.historyLegendChip, styles.historyLegendChipCash]}>
          <Text style={[styles.historyLegendChipText, styles.historyLegendChipTextCash]}>
            {paymentWordPlural} reducen el saldo pendiente
          </Text>
        </View>
        <View style={[styles.historyLegendChip, styles.historyLegendChipCapital]}>
          <Text style={[styles.historyLegendChipText, styles.historyLegendChipTextCapital]}>
            Capital cambia el monto prestado o debido
          </Text>
        </View>
      </View>
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
            ? "Sin eventos registrados aun."
            : "Ningun evento en este rango de fechas."}
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
