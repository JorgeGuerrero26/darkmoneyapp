import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { ObligationEventSummary } from "../../types/domain";
import { parseDisplayDate } from "../../lib/date";
import { firstMeaningfulText } from "../../lib/text-utils";
import { AnalyticsRow } from "../ui/AnalyticsRow";
import { formatCurrency } from "../ui/AmountDisplay";
import { BottomSheet } from "../ui/BottomSheet";
import { SegmentedControl } from "../ui/SegmentedControl";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

type CapitalChangeTab = "increase" | "decrease";

type Props = {
  visible: boolean;
  onClose: () => void;
  currencyCode: string;
  increases: ObligationEventSummary[];
  decreases: ObligationEventSummary[];
  initialTab?: CapitalChangeTab;
};

/**
 * Cambios de capital de una obligación, con el mismo lenguaje que las demás hojas de análisis: un control segmentado,
 * una cifra principal sin tarjeta y filas separadas por una línea fina (antes eran tarjetas con borde y cápsulas de
 * color, un estilo que ya no usa el resto de la app).
 */
export function ObligationCapitalChangesModal({
  visible,
  onClose,
  currencyCode,
  increases,
  decreases,
  initialTab = "increase",
}: Props) {
  const [activeTab, setActiveTab] = useState<CapitalChangeTab>(initialTab);

  useEffect(() => {
    if (!visible) return;
    setActiveTab(initialTab);
  }, [initialTab, visible]);

  const isIncrease = activeTab === "increase";
  const currentItems = isIncrease ? increases : decreases;
  const currentTotal = useMemo(
    () => currentItems.reduce((sum, item) => sum + item.amount, 0),
    [currentItems],
  );
  const sign = isIncrease ? "+" : "-";

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cambios de capital" snapHeight={0.72}>
      <SegmentedControl<CapitalChangeTab>
        options={[
          { value: "increase", label: `Aumentos (${increases.length})` },
          { value: "decrease", label: `Reducciones (${decreases.length})` },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <View style={styles.hero}>
        <Text style={styles.kicker}>{isIncrease ? "AUMENTOS REGISTRADOS" : "REDUCCIONES REGISTRADAS"}</Text>
        <Text
          style={[styles.amount, { color: isIncrease ? COLORS.income : COLORS.danger }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {sign}
          {formatCurrency(currentTotal, currencyCode)}
        </Text>
        <Text style={styles.caption}>
          {currentItems.length} {currentItems.length === 1 ? "evento" : "eventos"} en total
        </Text>
      </View>

      {currentItems.length === 0 ? (
        <Text style={styles.empty}>
          {isIncrease
            ? "Todavía no hay aumentos de capital registrados."
            : "Todavía no hay reducciones de capital registradas."}
        </Text>
      ) : (
        <View style={styles.rows}>
          {currentItems.map((event, index) => {
            const reason = firstMeaningfulText(event.description, event.reason, event.notes) ?? "Sin motivo registrado";
            return (
              <AnalyticsRow
                key={event.id}
                label={format(parseDisplayDate(event.eventDate), "d MMM yyyy", { locale: es })}
                detail={event.installmentNo ? `${reason} · Cuota ${event.installmentNo}` : reason}
                value={`${sign}${formatCurrency(event.amount, currencyCode)}`}
                valueColor={isIncrease ? COLORS.income : COLORS.danger}
                last={index === currentItems.length - 1}
              />
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1, color: COLORS.storm },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, marginTop: SPACING.sm },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  rows: { paddingTop: SPACING.sm },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20, paddingTop: SPACING.md },
});
