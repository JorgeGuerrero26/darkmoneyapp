import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import type { ExchangeRateRecord } from "../../../services/queries/exchange-rates";

export function ExchangeRateDetailContent({ rate }: { rate: ExchangeRateRecord }) {
  const date = new Date(rate.effectiveAt);
  return <>
    <View style={styles.hero}>
      <Text style={styles.name}>{rate.fromCurrencyCode} → {rate.toCurrencyCode}</Text>
      <Text style={styles.value}>{rate.rate.toFixed(4)} {rate.toCurrencyCode}</Text>
      <Text style={styles.caption}>Por cada 1 {rate.fromCurrencyCode}</Text>
    </View>
    <View>
      <DetailFieldRow label="Moneda de origen" value={rate.fromCurrencyCode} />
      <DetailFieldRow label="Moneda de destino" value={rate.toCurrencyCode} />
      <DetailFieldRow label="Actualizado" value={Number.isNaN(date.getTime()) ? "Sin fecha" : format(date, "d MMM yyyy, HH:mm", { locale: es })} />
      <DetailFieldRow label="Fuente" value={rate.source === "manual" ? "Manual" : rate.source ?? "Sin fuente"} />
      <DetailFieldRow label="Fijado" value={rate.isPinned ? "Sí" : "No"} />
      <DetailFieldRow label="Notas" value={rate.notes || "Sin notas"} muted={!rate.notes} valueLines={0} last />
    </View>
  </>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  name: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, textAlign: "center" },
  value: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxxl, color: COLORS.ink, textAlign: "center" },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
