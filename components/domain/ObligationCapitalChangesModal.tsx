import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { ObligationEventSummary } from "../../types/domain";
import { parseDisplayDate } from "../../lib/date";
import { formatCurrency } from "../ui/AmountDisplay";
import { BottomSheet } from "../ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type CapitalChangeTab = "increase" | "decrease";

type Props = {
  visible: boolean;
  onClose: () => void;
  currencyCode: string;
  increases: ObligationEventSummary[];
  decreases: ObligationEventSummary[];
  initialTab?: CapitalChangeTab;
};

function firstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

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

  const currentItems = activeTab === "increase" ? increases : decreases;
  const currentTotal = useMemo(
    () => currentItems.reduce((sum, item) => sum + item.amount, 0),
    [currentItems],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Cambios de capital"
      snapHeight={0.72}
    >
      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>
          {activeTab === "increase" ? "Aumentos registrados" : "Reducciones registradas"}
        </Text>
        <Text style={styles.summaryValue}>
          {activeTab === "increase" ? "+" : "-"}
          {formatCurrency(currentTotal, currencyCode)}
        </Text>
        <Text style={styles.summaryMeta}>
          {currentItems.length} {currentItems.length === 1 ? "evento" : "eventos"} en total
        </Text>
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === "increase" && styles.tabChipActive]}
          onPress={() => setActiveTab("increase")}
          activeOpacity={0.86}
        >
          <Text style={[styles.tabChipText, activeTab === "increase" && styles.tabChipTextActive]}>
            Aumentos ({increases.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === "decrease" && styles.tabChipActive]}
          onPress={() => setActiveTab("decrease")}
          activeOpacity={0.86}
        >
          <Text style={[styles.tabChipText, activeTab === "decrease" && styles.tabChipTextActive]}>
            Reducciones ({decreases.length})
          </Text>
        </TouchableOpacity>
      </View>

      {currentItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {activeTab === "increase"
              ? "Todavia no hay aumentos de capital registrados."
              : "Todavia no hay reducciones de capital registradas."}
          </Text>
        </View>
      ) : (
        currentItems.map((event) => {
          const detail =
            firstMeaningfulText(event.description, event.reason, event.notes) ?? "Sin motivo registrado";
          return (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <View style={styles.eventHeaderInfo}>
                  <Text style={styles.eventDate}>
                    {format(parseDisplayDate(event.eventDate), "d MMM yyyy", { locale: es })}
                  </Text>
                  {event.installmentNo ? (
                    <Text style={styles.eventInstallment}>Cuota {event.installmentNo}</Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.eventAmount,
                    activeTab === "increase" ? styles.eventAmountPositive : styles.eventAmountNegative,
                  ]}
                >
                  {activeTab === "increase" ? "+" : "-"}
                  {formatCurrency(event.amount, currencyCode)}
                </Text>
              </View>
              <Text style={styles.eventReason}>{detail}</Text>
            </View>
          );
        })
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    padding: SPACING.md,
    gap: 4,
  },
  summaryEyebrow: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  summaryValue: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  summaryMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  tabChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  tabChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  tabChipTextActive: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  emptyCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    padding: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  eventCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  eventHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  eventDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  eventInstallment: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  eventAmount: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  eventAmountPositive: {
    color: COLORS.income,
  },
  eventAmountNegative: {
    color: COLORS.danger,
  },
  eventReason: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
});
