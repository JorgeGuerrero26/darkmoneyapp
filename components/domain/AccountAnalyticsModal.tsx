import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "expo-router";

import { formatCurrency } from "../ui/AmountDisplay";
import { BottomSheet } from "../ui/BottomSheet";
import { ACCOUNT_ANALYTICS_LIMIT, useAccountAnalyticsQuery } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { buildAccountAnalytics } from "../../features/accounts/lib/account-analytics";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

type Props = {
  visible: boolean;
  account: AccountSummary | null;
  onClose: () => void;
};

function signedAmount(amount: number, currency: string) {
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatCurrency(Math.abs(amount), currency)}`;
}

export function AccountAnalyticsModal({ visible, account, onClose }: Props) {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const [calculationOpen, setCalculationOpen] = useState(false);
  const { data: movements = [], isLoading, isError, refetch } = useAccountAnalyticsQuery(
    activeWorkspaceId,
    visible ? (account?.id ?? null) : null,
  );
  const analysis = useMemo(
    () => account ? buildAccountAnalytics(account.id, movements, ACCOUNT_ANALYTICS_LIMIT) : null,
    [account?.id, movements],
  );
  if (!account) return null;

  const currency = account.currencyCode ?? "PEN";
  const period = analysis
    ? `${format(analysis.from, "d MMM", { locale: es })} – ${format(analysis.to, "d MMM yyyy", { locale: es })}`
    : null;

  function openMovements(uncategorized = false) {
    if (!account || !analysis) return;
    const params = new URLSearchParams({
      quickScope: "account",
      quickAccountId: String(account.id),
      quickDateFrom: format(analysis.from, "yyyy-MM-dd"),
      quickDateTo: format(analysis.to, "yyyy-MM-dd"),
      quickStatus: "posted",
      quickToken: String(Date.now()),
    });
    if (uncategorized) params.set("quickFilter", "uncategorized");
    onClose();
    router.push(`/(app)/movements?${params.toString()}`);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Análisis de cuenta"
      entranceAnimation="springFade"
      snapHeight={0.92}
      blurBackdrop={false}
      headerStyle={styles.header}
      contentStyle={styles.content}
      footer={analysis && !isError ? (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => openMovements()} activeOpacity={0.84} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Ver movimientos de esta cuenta</Text>
          </TouchableOpacity>
        </View>
      ) : undefined}
    >
      <Text style={styles.subtitle}>{account.name}</Text>
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator size="large" color={COLORS.fog} />
          <Text style={styles.stateText}>Calculando movimientos…</Text>
        </View>
      ) : isError ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>No se pudo cargar la analítica.</Text>
          <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button">
            <Text style={styles.retry}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : !analysis ? (
        <Text style={styles.empty}>Esta cuenta todavía no tiene movimientos registrados.</Text>
      ) : (
        <>
          <Text style={styles.kicker}>CAMBIO EN LA CUENTA</Text>
          <Text style={[styles.heroAmount, { color: analysis.netFlow > 0 ? COLORS.income : analysis.netFlow < 0 ? COLORS.expense : COLORS.ink }]} adjustsFontSizeToFit numberOfLines={1}>
            {signedAmount(analysis.netFlow, currency)}
          </Text>
          <Text style={styles.heroDetail}>
            {analysis.truncated ? `Últimos ${analysis.count} movimientos` : `${analysis.count} movimientos`} · {period}
          </Text>
          {analysis.truncated ? (
            <Text style={styles.limitNote}>Estas cifras cubren los movimientos más recientes; puede haber otros anteriores.</Text>
          ) : null}

          <View style={styles.flowSection}>
            <View style={styles.amountRow}>
              <Text style={styles.rowLabel}>Entró</Text>
              <Text style={[styles.amount, analysis.totalIn > 0 && styles.income]}>{signedAmount(analysis.totalIn, currency)}</Text>
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.rowLabel}>Salió</Text>
              <Text style={[styles.amount, analysis.totalOut > 0 && styles.expense]}>{signedAmount(-analysis.totalOut, currency)}</Text>
            </View>
            {analysis.transferOut > 0 ? (
              <View style={styles.amountRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Gasto real</Text>
                  <Text style={styles.rowMeta}>Excluye transferencias entre tus cuentas</Text>
                </View>
                <Text style={styles.amount}>{formatCurrency(analysis.spent, currency)}</Text>
              </View>
            ) : null}
          </View>

          {analysis.spent > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>En qué se gastó</Text>
              <Text style={styles.sectionSubtitle}>Gasto real · {formatCurrency(analysis.spent, currency)}</Text>
              {analysis.visibleCategories.map(([name, amount]) => (
                <View key={name} style={styles.categoryRow}>
                  <View style={styles.amountRowCompact}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{name}</Text>
                    <Text style={styles.amount}>{formatCurrency(amount, currency)}</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(100, amount / analysis.maxCategoryAmount * 100)}%` }]} />
                  </View>
                </View>
              ))}
              {analysis.remainingCategoryCount > 0 ? (
                <View style={styles.amountRow}>
                  <Text style={styles.rowLabel}>Otras {analysis.remainingCategoryCount} categorías</Text>
                  <Text style={styles.amount}>{formatCurrency(analysis.remainingCategoryTotal, currency)}</Text>
                </View>
              ) : null}
              {analysis.uncategorizedCount > 0 ? (
                <TouchableOpacity style={styles.amountRow} onPress={() => openMovements(true)} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Ver movimientos sin categoría de esta cuenta">
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>Sin categoría</Text>
                    <Text style={[styles.rowMeta, styles.expense]}>{analysis.uncategorizedCount} por revisar</Text>
                  </View>
                  <Text style={[styles.amount, styles.expense]}>{formatCurrency(analysis.uncategorized, currency)}</Text>
                  <ChevronRight size={16} color={COLORS.textDisabled} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mes a mes</Text>
            <Text style={styles.sectionSubtitle}>Cambio en la cuenta · últimos meses con movimientos</Text>
            {analysis.months.map((month) => (
              <View key={month.key} style={styles.monthRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>{month.label.charAt(0).toUpperCase() + month.label.slice(1)}</Text>
                  <Text style={styles.rowMeta}>Entró {formatCurrency(month.income, currency)} · salió {formatCurrency(month.expense, currency)}</Text>
                </View>
                <Text style={[styles.amount, { color: month.net > 0 ? COLORS.income : month.net < 0 ? COLORS.expense : COLORS.ink }]}>
                  {signedAmount(month.net, currency)}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.calculationRow} onPress={() => setCalculationOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: calculationOpen }}>
            <Text style={styles.calculationTitle}>Cómo se calcula</Text>
            <ChevronDown size={16} color={COLORS.textDisabled} style={calculationOpen && styles.chevronOpen} />
          </TouchableOpacity>
          {calculationOpen ? (
            <Text style={styles.calculationCopy}>
              Se suman los movimientos confirmados de esta cuenta en el período indicado. El cambio es lo que entró menos lo que salió; no es el saldo actual. El gasto real excluye las transferencias a tus otras cuentas. Las cifras están en la moneda de la cuenta{analysis.truncated ? ` y se limitan a los ${ACCOUNT_ANALYTICS_LIMIT} movimientos más recientes` : ""}.
            </Text>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl, borderBottomWidth: 0 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginBottom: SPACING.xl },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1.1, color: COLORS.storm },
  heroAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, letterSpacing: -1, marginTop: SPACING.sm },
  heroDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  limitNote: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, marginTop: SPACING.sm },
  flowSection: { marginTop: SPACING.xl },
  section: { marginTop: SPACING.xxxl },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  sectionSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  amountRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  amountRowCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  rowCopy: { flex: 1 },
  rowLabel: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 19, color: COLORS.storm, marginTop: SPACING.xs },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  income: { color: COLORS.income },
  expense: { color: COLORS.expense },
  categoryRow: { gap: SPACING.sm, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  track: { height: 4, backgroundColor: SURFACE.track, borderRadius: RADIUS.full, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  monthRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  calculationRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: SPACING.md, marginTop: SPACING.xxxl, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  calculationTitle: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  calculationCopy: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 21, color: COLORS.storm, paddingTop: SPACING.md },
  footer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  primaryButton: { minHeight: 50, borderRadius: RADIUS.xl, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.action },
  primaryButtonText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.actionText },
  state: { alignItems: "center", justifyContent: "center", minHeight: 220, gap: SPACING.md },
  stateText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
  retry: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.xxxl },
});
