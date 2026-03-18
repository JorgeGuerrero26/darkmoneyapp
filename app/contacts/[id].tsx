import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import type { CounterpartyOverview } from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ContactForm } from "../../components/forms/ContactForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const TYPE_LABEL: Record<string, string> = {
  person: "Persona", company: "Empresa", merchant: "Comercio",
  service: "Servicio", bank: "Banco", other: "Otro",
};

export default function ContactDetailScreen() {
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
          </Card>

          {/* Contact info */}
          {contact.phone || contact.email || contact.documentNumber ? (
            <Card>
              {contact.phone ? <><DetailRow label="Teléfono" value={contact.phone} /><Divider /></> : null}
              {contact.email ? <><DetailRow label="Email" value={contact.email} /><Divider /></> : null}
              {contact.documentNumber ? <DetailRow label="Doc." value={contact.documentNumber} /> : null}
            </Card>
          ) : null}

          {/* Financial summary */}
          {(contact.receivableCount > 0 || contact.payableCount > 0 || contact.movementCount > 0) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen financiero</Text>
              <View style={styles.statsGrid}>
                {contact.receivableCount > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.income }]}>
                      {formatCurrency(contact.receivablePendingTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>{contact.receivableCount} por cobrar</Text>
                  </View>
                ) : null}
                {contact.payableCount > 0 ? (
                  <View style={styles.statCard}>
                    <Text style={[styles.statAmount, { color: COLORS.expense }]}>
                      {formatCurrency(contact.payablePendingTotal, baseCurrency)}
                    </Text>
                    <Text style={styles.statLabel}>{contact.payableCount} por pagar</Text>
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
          {(contact.inflowTotal > 0 || contact.outflowTotal > 0) ? (
            <Card>
              <Text style={styles.sectionTitle}>Flujo total</Text>
              <View style={styles.flowRow}>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Ingresos</Text>
                  <Text style={[styles.flowAmount, { color: COLORS.income }]}>
                    {formatCurrency(contact.inflowTotal, baseCurrency)}
                  </Text>
                </View>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Egresos</Text>
                  <Text style={[styles.flowAmount, { color: COLORS.expense }]}>
                    {formatCurrency(contact.outflowTotal, baseCurrency)}
                  </Text>
                </View>
                <View style={styles.flowItem}>
                  <Text style={styles.flowLabel}>Neto</Text>
                  <Text style={[styles.flowAmount, { color: contact.netFlowAmount >= 0 ? COLORS.income : COLORS.expense }]}>
                    {formatCurrency(contact.netFlowAmount, baseCurrency)}
                  </Text>
                </View>
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
  archivedBadge: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: SPACING.xs,
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
  notes: { fontSize: FONT_SIZE.sm, color: COLORS.text, lineHeight: 20 },
});
