import { StyleSheet, Text, View } from "react-native";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { ResourceCard } from "../../../components/ui/ResourceCard";
import { ResourceSectionList, type ResourceSection } from "../../../components/ui/ResourceSectionList";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import { formatContactAmounts } from "../lib/contact-money";
import type { ContactAnalytics } from "../lib/useContactAnalytics";
import type { ContactActivityItem } from "../lib/contactActivitySections";

export function ContactDetailActivity({ analytics, movementCount, baseCurrency, sections, onOpen }: {
  analytics: ContactAnalytics;
  movementCount: number;
  baseCurrency: string;
  sections: ResourceSection<ContactActivityItem>[];
  onOpen: (item: ContactActivityItem) => void;
}) {
  return (
    <ResourceSectionList<ContactActivityItem>
      sections={sections}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
      contentContainerStyle={styles.list}
      loading={{ isLoading: false }}
      empty={null}
      listHeaderComponent={
        <View style={styles.summary}>
          <Text style={styles.title}>Con este contacto</Text>
          <DetailFieldRow label="Movimientos" value={String(movementCount)} />
          {analytics.exposureLoaded ? <>
            <DetailFieldRow label="Te debe" value={formatContactAmounts(analytics.receivable)} />
            <DetailFieldRow label="Le debes" value={formatContactAmounts(analytics.payable)} />
          </> : <Text style={styles.note}>Cargando créditos y deudas…</Text>}
          {movementCount > 0 ? analytics.flowLoaded ? <>
            <DetailFieldRow label="Entró" value={formatContactAmounts(analytics.inflow)} />
            <DetailFieldRow label="Salió" value={formatContactAmounts(analytics.outflow)} />
            {!analytics.unconvertedFlow ? <DetailFieldRow label="Te quedó" value={formatCurrency(analytics.netFlowAmount, baseCurrency)} /> : null}
          </> : <Text style={styles.note}>{analytics.flowError ?? "Cargando historial…"}</Text> : null}
          {analytics.exposureLoaded && !analytics.unconvertedExposure && analytics.receivableCount > 0 ? <DetailFieldRow label="Cobrado" value={`${analytics.collectionProgressPercent}%`} /> : null}
          {analytics.exposureLoaded && !analytics.unconvertedExposure && analytics.payableCount > 0 ? <DetailFieldRow label="Pagado" value={`${analytics.paymentProgressPercent}%`} /> : null}
          {analytics.unconvertedExposure || analytics.unconvertedFlow || analytics.unconvertedScheduled ? <Text style={styles.note}>Los importes sin tipo de cambio se muestran en su moneda original.</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <ResourceCard variant="row" title={item.title} subtitle={item.subtitle} onPress={() => onOpen(item)}
          trailing={<Text style={styles.amount}>{formatCurrency(item.amount, item.currencyCode)}</Text>} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 0, paddingBottom: SPACING.xxxl },
  summary: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink, marginBottom: SPACING.sm },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, paddingVertical: SPACING.md },
  amount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
});
