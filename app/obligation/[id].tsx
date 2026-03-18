import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import {
  useWorkspaceSnapshotQuery,
  useCreateObligationShareInviteMutation,
} from "../../services/queries/workspace-data";
import type { ObligationSummary } from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ObligationForm } from "../../components/forms/ObligationForm";
import { PaymentForm } from "../../components/forms/PaymentForm";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const EVENT_LABEL: Record<string, string> = {
  opening: "Apertura",
  payment: "Pago",
  principal_increase: "Aumento de capital",
  principal_decrease: "Reducción de capital",
  interest: "Interés",
  fee: "Cargo",
  discount: "Descuento",
  adjustment: "Ajuste",
  writeoff: "Castigo",
};

export default function ObligationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();

  const { showToast } = useToast();
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [paymentFormVisible, setPaymentFormVisible] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");

  const shareMutation = useCreateObligationShareInviteMutation(activeWorkspaceId);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  async function handleShare() {
    if (!shareEmail.trim() || !obligation || !activeWorkspaceId) return;
    try {
      const result = await shareMutation.mutateAsync({
        workspaceId: activeWorkspaceId,
        obligationId: obligation.id,
        invitedEmail: shareEmail.trim().toLowerCase(),
      });
      setShareSheetOpen(false);
      setShareEmail("");
      showToast(
        result.emailSent
          ? `Invitación enviada a ${result.invitedEmail}`
          : "Invitación creada",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const obligation: ObligationSummary | null = useMemo(
    () => snapshot?.obligations.find((o) => o.id === parseInt(id ?? "0")) ?? null,
    [snapshot, id],
  );

  const isReceivable = obligation?.direction === "receivable";
  const dirColor = isReceivable ? COLORS.income : COLORS.expense;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={obligation?.title ?? "Obligación"}
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {obligation ? (
              <>
                <TouchableOpacity style={styles.shareBtn} onPress={() => { setShareEmail(""); setShareSheetOpen(true); }}>
                  <Text style={styles.shareBtnText}>Compartir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)}>
                  <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.back}>‹ Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : !obligation ? (
        <View style={styles.center}><Text style={styles.errorText}>No encontrada</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero */}
          <Card style={styles.heroCard}>
            <Text style={[styles.directionBadge, { color: dirColor }]}>
              {isReceivable ? "↑ Por cobrar" : "↓ Por pagar"}
            </Text>
            <Text style={styles.counterparty}>{obligation.counterparty || "Sin contacto"}</Text>
            <Text style={[styles.pendingAmount, { color: dirColor }]}>
              {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
            </Text>
            <Text style={styles.pendingLabel}>pendiente</Text>
            <ProgressBar percent={obligation.progressPercent} alertPercent={100} style={styles.progress} />
            <Text style={styles.progressLabel}>
              {Math.round(obligation.progressPercent)}% pagado de{" "}
              {formatCurrency(obligation.principalAmount, obligation.currencyCode)}
            </Text>
          </Card>

          {/* Details */}
          <Card>
            <DetailRow label="Estado" value={obligation.status} />
            <Divider />
            <DetailRow label="Moneda" value={obligation.currencyCode} />
            <Divider />
            <DetailRow
              label="Fecha inicio"
              value={format(new Date(obligation.startDate), "d MMM yyyy", { locale: es })}
            />
            {obligation.dueDate ? (
              <>
                <Divider />
                <DetailRow
                  label="Vencimiento"
                  value={format(new Date(obligation.dueDate), "d MMM yyyy", { locale: es })}
                />
              </>
            ) : null}
            {obligation.installmentAmount ? (
              <>
                <Divider />
                <DetailRow
                  label="Cuota"
                  value={`${formatCurrency(obligation.installmentAmount, obligation.currencyCode)}${obligation.installmentCount ? ` × ${obligation.installmentCount}` : ""}`}
                />
              </>
            ) : null}
            {obligation.interestRate ? (
              <>
                <Divider />
                <DetailRow label="Interés" value={`${obligation.interestRate}%`} />
              </>
            ) : null}
            {obligation.settlementAccountName ? (
              <>
                <Divider />
                <DetailRow label="Cuenta de liquidación" value={obligation.settlementAccountName} />
              </>
            ) : null}
            {obligation.description ? (
              <>
                <Divider />
                <DetailRow label="Descripción" value={obligation.description} />
              </>
            ) : null}
          </Card>

          {/* Events history */}
          {obligation.events.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Historial de eventos</Text>
              {obligation.events.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventType}>{EVENT_LABEL[ev.eventType] ?? ev.eventType}</Text>
                    <Text style={styles.eventDate}>
                      {format(new Date(ev.eventDate), "d MMM yyyy", { locale: es })}
                    </Text>
                    {ev.notes ? <Text style={styles.eventNotes}>{ev.notes}</Text> : null}
                  </View>
                  <Text style={[styles.eventAmount, { color: ev.eventType === "payment" ? COLORS.income : COLORS.text }]}>
                    {ev.eventType === "payment" ? "+" : ""}{formatCurrency(ev.amount, obligation.currencyCode)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Register payment */}
          {obligation.status === "active" ? (
            <TouchableOpacity style={styles.payBtn} onPress={() => setPaymentFormVisible(true)}>
              <Text style={styles.payBtnText}>Registrar pago</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}

      <ObligationForm
        visible={editFormVisible}
        onClose={() => setEditFormVisible(false)}
        onSuccess={() => setEditFormVisible(false)}
        editObligation={obligation ?? undefined}
      />

      <PaymentForm
        visible={paymentFormVisible}
        onClose={() => setPaymentFormVisible(false)}
        onSuccess={() => setPaymentFormVisible(false)}
        obligation={obligation}
      />

      {/* Share obligation sheet */}
      <Modal
        visible={shareSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShareSheetOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShareSheetOpen(false)}>
          <View
            style={[styles.shareSheet, { paddingBottom: insets.bottom + SPACING.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.shareSheetTitle}>Compartir obligación</Text>
            <Text style={styles.shareSheetSub}>
              La otra parte podrá ver el estado y registrar pagos
            </Text>
            <Input
              label="Email del destinatario *"
              value={shareEmail}
              onChangeText={setShareEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="correo@ejemplo.com"
            />
            <Button
              label="Enviar invitación"
              onPress={handleShare}
              loading={shareMutation.isPending}
            />
          </View>
        </Pressable>
      </Modal>
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

function Divider() {
  return <View style={rowStyles.divider} />;
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.md },
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
  shareBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.income + "88",
  },
  shareBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.income, fontWeight: FONT_WEIGHT.medium },
  editBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primary,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  shareSheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  shareSheetTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, textAlign: "center" },
  shareSheetSub: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: "center", marginTop: -SPACING.sm },
  heroCard: { alignItems: "center", gap: SPACING.xs, paddingVertical: SPACING.xl },
  directionBadge: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textTransform: "uppercase", letterSpacing: 0.5 },
  counterparty: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  pendingAmount: { fontSize: 36, fontWeight: FONT_WEIGHT.bold, marginTop: SPACING.sm },
  pendingLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  progress: { width: "100%", marginTop: SPACING.md },
  progressLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5,
  },
  eventRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  eventInfo: { gap: 2, flex: 1 },
  eventType: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  eventDate: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  eventNotes: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  eventAmount: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  payBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  payBtnText: { color: "#FFFFFF", fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
