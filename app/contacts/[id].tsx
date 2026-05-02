import { useMemo, useState } from "react";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import type { CounterpartyOverview } from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ContactForm } from "../../components/forms/ContactForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const TYPE_LABEL: Record<string, string> = {
  person: "Persona", company: "Empresa", merchant: "Comercio",
  service: "Servicio", bank: "Banco", other: "Otro",
};

function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const [editFormVisible, setEditFormVisible] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const contact: CounterpartyOverview | null = useMemo(
    () => (snapshot?.counterparties ?? []).find((c) => c.id === parseInt(id ?? "0")) as CounterpartyOverview | null ?? null,
    [snapshot, id],
  );

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const analytics = useMemo(() => {
    if (!contact || !snapshot) return null;

    const contactObligations = (snapshot.obligations ?? []).filter(
      (obligation) => obligation.counterpartyId === contact.id && obligation.status !== "cancelled",
    );
    const relatedSubscriptions = (snapshot.subscriptions ?? []).filter((subscription) => subscription.vendorPartyId === contact.id);
    const relatedRecurringIncome = (snapshot.recurringIncome ?? []).filter((income) => income.payerPartyId === contact.id);

    const inflowTotal = contact.inflowTotal ?? 0;
    const outflowTotal = contact.outflowTotal ?? 0;
    let receivableCount = 0;
    let payableCount = 0;
    let receivablePendingTotal = 0;
    let payablePendingTotal = 0;
    let receivablePrincipalTotal = 0;
    let payablePrincipalTotal = 0;
    let latestObligationAt: string | null = null;

    for (const obligation of contactObligations) {
      const currentPrincipal = obligation.currentPrincipalAmount ?? obligation.principalAmount;
      if (obligation.direction === "receivable") {
        receivableCount += 1;
        receivablePendingTotal += obligation.pendingAmount;
        receivablePrincipalTotal += currentPrincipal;
      } else {
        payableCount += 1;
        payablePendingTotal += obligation.pendingAmount;
        payablePrincipalTotal += currentPrincipal;
      }
      const activityCandidate = obligation.lastPaymentDate ?? obligation.dueDate ?? obligation.startDate;
      if (activityCandidate && (!latestObligationAt || activityCandidate > latestObligationAt)) {
        latestObligationAt = activityCandidate;
      }
    }

    const netPendingAmount = receivablePendingTotal - payablePendingTotal;
    const netFlowAmount = inflowTotal - outflowTotal;
    const scheduledExpenseTotal = relatedSubscriptions
      .filter((subscription) => subscription.status === "active")
      .reduce(
        (sum, subscription) => sum + (subscription.amountInBaseCurrency ?? subscription.amount),
        0,
      );
    const scheduledIncomeTotal = relatedRecurringIncome
      .filter((income) => income.status === "active")
      .reduce(
        (sum, income) => sum + (income.amountInBaseCurrency ?? income.amount),
        0,
      );
    const lastActivityAt =
      [
        contact.lastActivityAt,
        latestObligationAt,
        ...relatedSubscriptions.map((subscription) => subscription.nextDueDate),
        ...relatedRecurringIncome.map((income) => income.nextExpectedDate),
      ]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    const averageOpenExposure =
      contactObligations.length > 0 ? (receivablePendingTotal + payablePendingTotal) / contactObligations.length : 0;
    const totalFlow = inflowTotal + outflowTotal;
    const flowBalancePercent = totalFlow > 0 ? Math.round((Math.max(inflowTotal, outflowTotal) / totalFlow) * 100) : 0;
    const collectionProgressPercent = receivablePrincipalTotal > 0
      ? Math.round(((receivablePrincipalTotal - receivablePendingTotal) / receivablePrincipalTotal) * 100)
      : 0;
    const paymentProgressPercent = payablePrincipalTotal > 0
      ? Math.round(((payablePrincipalTotal - payablePendingTotal) / payablePrincipalTotal) * 100)
      : 0;

    let relationshipHeadline = "Sin relación financiera activa";
    let relationshipTone = COLORS.storm;
    if (netPendingAmount > 0) {
      relationshipHeadline = `Te debe ${formatCurrency(netPendingAmount, baseCurrency)}`;
      relationshipTone = COLORS.income;
    } else if (netPendingAmount < 0) {
      relationshipHeadline = `Le debes ${formatCurrency(Math.abs(netPendingAmount), baseCurrency)}`;
      relationshipTone = COLORS.expense;
    } else if (scheduledIncomeTotal > 0 || scheduledExpenseTotal > 0) {
      relationshipHeadline = "Relación activa programada";
      relationshipTone = scheduledIncomeTotal >= scheduledExpenseTotal ? COLORS.income : COLORS.expense;
    } else if (totalFlow > 0) {
      relationshipHeadline = netFlowAmount >= 0
        ? "Relación con flujo favorable"
        : "Relación con flujo saliente";
      relationshipTone = netFlowAmount >= 0 ? COLORS.income : COLORS.expense;
    }

    const insightLines: string[] = [];
    if (receivableCount > 0 || payableCount > 0) {
      insightLines.push(
        receivableCount > payableCount
          ? "La relación se inclina más hacia montos por cobrar."
          : payableCount > receivableCount
            ? "La relación se inclina más hacia montos por pagar."
            : "La relación está repartida entre cobros y pagos.",
      );
    }
    if (inflowTotal > 0 || outflowTotal > 0) {
      insightLines.push(
        netFlowAmount >= 0
          ? `El flujo histórico con este contacto termina a tu favor en la moneda base (${baseCurrency}).`
          : `El flujo histórico con este contacto termina más del lado de egresos en la moneda base (${baseCurrency}).`,
      );
    }
    if (relatedSubscriptions.length > 0) {
      insightLines.push(`${relatedSubscriptions.length} suscripción${relatedSubscriptions.length === 1 ? "" : "es"} usa${relatedSubscriptions.length === 1 ? "" : "n"} este contacto como proveedor.`);
    }
    if (relatedRecurringIncome.length > 0) {
      insightLines.push(`${relatedRecurringIncome.length} ingreso${relatedRecurringIncome.length === 1 ? "" : "s"} fijo${relatedRecurringIncome.length === 1 ? "" : "s"} usa${relatedRecurringIncome.length === 1 ? "" : "n"} este contacto como pagador.`);
    }

    return {
      receivableCount,
      payableCount,
      receivablePendingTotal,
      payablePendingTotal,
      receivablePrincipalTotal,
      payablePrincipalTotal,
      inflowTotal,
      outflowTotal,
      netPendingAmount,
      netFlowAmount,
      lastActivityAt,
      relatedSubscriptions,
      relatedRecurringIncome,
      scheduledExpenseTotal,
      scheduledIncomeTotal,
      averageOpenExposure,
      flowBalancePercent,
      collectionProgressPercent,
      paymentProgressPercent,
      relationshipHeadline,
      relationshipTone,
      insightLines,
    };
  }, [contact, snapshot, baseCurrency]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={contact?.name ?? "Contacto"}
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {contact ? (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)}>
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>‹ Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View style={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : !contact ? (
        <View style={styles.center}><Text style={styles.errorText}>No encontrado</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header card */}
          <Card style={styles.heroCard}>
            <Text style={styles.heroName}>{contact.name}</Text>
            <Text style={styles.heroType}>{TYPE_LABEL[contact.type] ?? contact.type}</Text>
            {contact.isArchived ? <Text style={styles.archivedBadge}>Archivado</Text> : null}
            {analytics?.lastActivityAt ? (
              <Text style={styles.heroMeta}>
                Última actividad · {format(new Date(analytics.lastActivityAt), "d MMM yyyy", { locale: es })}
              </Text>
            ) : null}
          </Card>

          {analytics ? (
            <Card>
              <Text style={styles.sectionTitle}>Lectura rápida</Text>
              <Text style={styles.sectionSubtle}>Lecturas comparables expresadas en {baseCurrency}</Text>
              <Text style={[styles.relationshipHeadline, { color: analytics.relationshipTone }]}>
                {analytics.relationshipHeadline}
              </Text>
              <View style={styles.roleRow}>
                {analytics.receivableCount > 0 ? (
                  <View style={[styles.roleChip, styles.roleChipIncome]}>
                    <Text style={[styles.roleChipText, styles.roleChipTextIncome]}>Por cobrar</Text>
                  </View>
                ) : null}
                {analytics.payableCount > 0 ? (
                  <View style={[styles.roleChip, styles.roleChipExpense]}>
                    <Text style={[styles.roleChipText, styles.roleChipTextExpense]}>Por pagar</Text>
                  </View>
                ) : null}
                {contact.movementCount > 0 ? (
                  <View style={styles.roleChip}>
                    <Text style={styles.roleChipText}>{contact.movementCount} movimientos</Text>
                  </View>
                ) : null}
                {analytics.relatedSubscriptions.length > 0 ? (
                  <View style={styles.roleChip}>
                    <Text style={styles.roleChipText}>Proveedor recurrente</Text>
                  </View>
                ) : null}
                {analytics.relatedRecurringIncome.length > 0 ? (
                  <View style={styles.roleChip}>
                    <Text style={styles.roleChipText}>Pagador recurrente</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.insightList}>
                {analytics.insightLines.map((line) => (
                  <View key={line} style={styles.insightRow}>
                    <View style={styles.insightDot} />
                    <Text style={styles.insightText}>{line}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Datos de contacto */}
          <Card>
            <Text style={styles.sectionTitle}>Datos de contacto</Text>
            {(() => {
              const rows: { label: string; value: string }[] = [];
              if (contact.phone?.trim()) rows.push({ label: "Teléfono", value: contact.phone.trim() });
              if (contact.email?.trim()) rows.push({ label: "Correo", value: contact.email.trim() });
              if (contact.documentNumber?.trim()) {
                rows.push({ label: "DNI / RUC", value: contact.documentNumber.trim() });
              }
              if (rows.length === 0) {
                return (
                  <Text style={styles.emptyContactHint}>Sin teléfono, correo ni documento registrados.</Text>
                );
              }
              return rows.map((r, i) => (
                <View key={r.label}>
                  {i > 0 ? <Divider /> : null}
                  <DetailRow label={r.label} value={r.value} />
                </View>
              ));
            })()}
          </Card>

          {/* Financial summary */}
          {analytics && (analytics.receivableCount > 0 || analytics.payableCount > 0 || contact.movementCount > 0) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen financiero</Text>
              <Text style={styles.sectionSubtle}>Totales convertidos a {baseCurrency} para no mezclar monedas.</Text>
              <View style={styles.statsGrid}>
                {analytics.receivableCount > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.income }]}>
                      {formatCurrency(analytics.receivablePendingTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>{analytics.receivableCount} por cobrar</Text>
                  </View>
                ) : null}
                {analytics.payableCount > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.expense }]}>
                      {formatCurrency(analytics.payablePendingTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>{analytics.payableCount} por pagar</Text>
                  </View>
                ) : null}
                {contact.movementCount > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={styles.statAmount}>{contact.movementCount}</Text>
                    <Text style={styles.statLabel}>movimientos</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Net flow */}
          {analytics && (analytics.inflowTotal > 0 || analytics.outflowTotal > 0) ? (
            <Card>
              <Text style={styles.sectionTitle}>Flujo total</Text>
              <View style={styles.flowRow}>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Ingresos</Text>
                  <Text style={[styles.flowAmount, { color: COLORS.income }]}>
                    {formatCurrency(analytics.inflowTotal, baseCurrency)}
                  </Text>
                </View>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Egresos</Text>
                  <Text style={[styles.flowAmount, { color: COLORS.expense }]}>
                    {formatCurrency(analytics.outflowTotal, baseCurrency)}
                  </Text>
                </View>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Neto</Text>
                  <Text style={[styles.flowAmount, { color: analytics.netFlowAmount >= 0 ? COLORS.income : COLORS.expense }]}>
                    {formatCurrency(analytics.netFlowAmount, baseCurrency)}
                  </Text>
                </View>
              </View>
              <View style={styles.progressWrap}>
                <Text style={styles.progressCaption}>
                  {analytics.inflowTotal >= analytics.outflowTotal ? "Predominan ingresos" : "Predominan egresos"}
                </Text>
                <ProgressBar percent={analytics.flowBalancePercent} alertPercent={100} />
              </View>
            </Card>
          ) : null}

          {analytics && (analytics.relatedSubscriptions.length > 0 || analytics.relatedRecurringIncome.length > 0) ? (
            <Card>
              <Text style={styles.sectionTitle}>Relación programada</Text>
              <View style={styles.statsGrid}>
                {analytics.relatedSubscriptions.length > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.expense }]}>
                      {formatCurrency(analytics.scheduledExpenseTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>
                      {analytics.relatedSubscriptions.length} suscrip. activas
                    </Text>
                  </View>
                ) : null}
                {analytics.relatedRecurringIncome.length > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.income }]}>
                      {formatCurrency(analytics.scheduledIncomeTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>
                      {analytics.relatedRecurringIncome.length} ingresos activos
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>
          ) : null}

          {analytics && (analytics.receivableCount > 0 || analytics.payableCount > 0) ? (
            <Card>
              <Text style={styles.sectionTitle}>Salud de la relación</Text>
              {analytics.receivableCount > 0 ? (
                <View style={styles.healthBlock}>
                  <View style={styles.healthHeader}>
                    <Text style={styles.healthLabel}>Cobranza acumulada</Text>
                    <Text style={styles.healthPercent}>{analytics.collectionProgressPercent}%</Text>
                  </View>
                  <ProgressBar percent={analytics.collectionProgressPercent} alertPercent={100} />
                </View>
              ) : null}
              {analytics.payableCount > 0 ? (
                <View style={styles.healthBlock}>
                  <View style={styles.healthHeader}>
                    <Text style={styles.healthLabel}>Pagos ya cubiertos</Text>
                    <Text style={styles.healthPercent}>{analytics.paymentProgressPercent}%</Text>
                  </View>
                  <ProgressBar percent={analytics.paymentProgressPercent} alertPercent={100} />
                </View>
              ) : null}
              <View style={styles.miniGrid}>
                {analytics.averageOpenExposure > 0 ? (
                  <View style={styles.miniCard}>
                    <Text style={styles.miniCardLabel}>Exposición promedio</Text>
                    <Text style={styles.miniCardValue}>
                      {formatCurrency(analytics.averageOpenExposure, baseCurrency)}
                    </Text>
                  </View>
                ) : null}
                {analytics.lastActivityAt ? (
                  <View style={styles.miniCard}>
                    <Text style={styles.miniCardLabel}>Actividad más reciente</Text>
                    <Text style={styles.miniCardValue}>
                      {format(new Date(analytics.lastActivityAt), "d MMM yyyy", { locale: es })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* Notes */}
          {contact.notes ? (
            <Card>
              <Text style={styles.sectionTitle}>Notas</Text>
              <Text style={styles.notes}>{contact.notes}</Text>
            </Card>
          ) : null}
        </ScrollView>
      )}

      {contact ? (
        <ContactForm
          visible={editFormVisible}
          onClose={() => setEditFormVisible(false)}
          onSuccess={() => setEditFormVisible(false)}
          editContact={contact}
        />
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={rowStyles.divider} />; }
const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, flex: 1 },
  value: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: FONT_WEIGHT.medium, flex: 2, textAlign: "right" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.textMuted, fontSize: FONT_SIZE.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  editBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primary,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  heroCard: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl },
  heroName: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  heroType: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  heroMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  archivedBadge: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  sectionSubtle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textDisabled,
    marginBottom: SPACING.xs,
  },
  relationshipHeadline: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  roleChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  roleChipIncome: {
    backgroundColor: COLORS.income + "18",
  },
  roleChipExpense: {
    backgroundColor: COLORS.expense + "18",
  },
  roleChipText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
  roleChipTextIncome: {
    color: COLORS.income,
  },
  roleChipTextExpense: {
    color: COLORS.expense,
  },
  insightList: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 7,
  },
  insightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
  statsGrid: { flexDirection: "row", gap: SPACING.sm },
  statCard: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  statAmount: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  flowRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  flowItem: { flex: 1, gap: 4 },
  flowLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  flowAmount: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  progressWrap: { marginTop: SPACING.md, gap: SPACING.xs },
  progressCaption: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  healthBlock: { gap: SPACING.xs, marginTop: SPACING.sm },
  healthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  healthLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  healthPercent: { fontSize: FONT_SIZE.xs, color: COLORS.text, fontWeight: FONT_WEIGHT.semibold },
  miniGrid: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  miniCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  miniCardLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  miniCardValue: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: FONT_WEIGHT.semibold },
  notes: { fontSize: FONT_SIZE.sm, color: COLORS.text, lineHeight: 20 },
  emptyContactHint: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontStyle: "italic" },
});

export default function ContactDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <ContactDetailScreen />
    </ErrorBoundary>
  );
}
