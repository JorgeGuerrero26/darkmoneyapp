import { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useMovementQuery } from "../../services/queries/movements";
import { useVoidMovementMutation } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Card } from "../../components/ui/Card";
import { AmountDisplay } from "../../components/ui/AmountDisplay";
import { MovementForm } from "../../components/forms/MovementForm";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const TYPE_LABEL: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
  subscription_payment: "Suscripción",
  obligation_opening: "Apertura obligación",
  obligation_payment: "Pago obligación",
  refund: "Devolución",
  adjustment: "Ajuste",
};

const STATUS_LABEL: Record<string, string> = {
  posted: "Confirmado",
  pending: "Pendiente",
  planned: "Planificado",
  voided: "Anulado",
};

const STATUS_COLOR: Record<string, string> = {
  posted: COLORS.income,
  pending: COLORS.warning,
  planned: COLORS.textMuted,
  voided: COLORS.textDisabled,
};

export default function MovementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const voidMutation = useVoidMovementMutation(activeWorkspaceId);
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [duplicateFormVisible, setDuplicateFormVisible] = useState(false);

  const { data: movement, isLoading, error } = useMovementQuery(id ? parseInt(id) : null);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const isTransfer = movement?.movementType === "transfer";
  const isExpense = movement?.movementType === "expense" || movement?.movementType === "subscription_payment" || movement?.movementType === "obligation_payment";
  const isVoided = movement?.status === "voided";

  function handleVoid() {
    if (!movement) return;
    Alert.alert(
      "Anular movimiento",
      "El movimiento quedará anulado y no afectará los balances. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Anular",
          style: "destructive",
          onPress: () => voidMutation.mutate(movement.id, {
            onSuccess: () => {
              showToast("Movimiento anulado", "success");
              void queryClient.invalidateQueries({ queryKey: ["movement", movement.id] });
            },
            onError: (e) => showToast(e.message, "error"),
          }),
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Movimiento"
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {movement && !isVoided ? (
              <>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)} accessibilityLabel="Editar movimiento">
                  <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.duplicateBtn}
                  onPress={() => setDuplicateFormVisible(true)}
                  accessibilityLabel="Duplicar movimiento"
                >
                  <Text style={styles.duplicateBtnText}>Duplicar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.voidBtn} onPress={handleVoid} accessibilityLabel="Anular movimiento">
                  <Text style={styles.voidBtnText}>Anular</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={() => router.replace("/(app)/movements")} accessibilityLabel="Volver">
              <Text style={styles.back}>‹ Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : error || !movement ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>No se encontró el movimiento</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Amount hero */}
          <Card style={styles.heroCard}>
            <Text style={styles.typeLabel}>{TYPE_LABEL[movement.movementType] ?? movement.movementType}</Text>
            <AmountDisplay
              amount={isTransfer ? (movement.sourceAmount ?? 0) : (movement.sourceAmount ?? movement.destinationAmount ?? 0)}
              currencyCode={baseCurrency}
              movementType={movement.movementType}
              size="xl"
            />
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[movement.status] ?? COLORS.textMuted }]} />
              <Text style={[styles.statusText, { color: STATUS_COLOR[movement.status] ?? COLORS.textMuted }]}>
                {STATUS_LABEL[movement.status] ?? movement.status}
              </Text>
            </View>
          </Card>

          {/* Details */}
          <Card>
            <DetailRow label="Descripción" value={movement.description || "—"} />
            <Divider />
            <DetailRow
              label="Fecha"
              value={format(new Date(movement.occurredAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
            />
            {movement.categoryId ? (
              <>
                <Divider />
                <DetailRow label="Categoría" value={movement.category || `ID ${movement.categoryId}`} />
              </>
            ) : null}
            {movement.counterpartyId ? (
              <>
                <Divider />
                <DetailRow label="Contacto" value={movement.counterparty || `ID ${movement.counterpartyId}`} />
              </>
            ) : null}
            {movement.notes ? (
              <>
                <Divider />
                <DetailRow label="Notas" value={movement.notes} />
              </>
            ) : null}
          </Card>

          {/* Accounts */}
          {isTransfer ? (
            <Card>
              <Text style={styles.sectionTitle}>Cuentas</Text>
              <DetailRow
                label="Origen"
                value={movement.sourceAccountName ?? `Cuenta #${movement.sourceAccountId}`}
              />
              {movement.destinationAccountId ? (
                <>
                  <Divider />
                  <DetailRow
                    label="Destino"
                    value={movement.destinationAccountName ?? `Cuenta #${movement.destinationAccountId}`}
                  />
                </>
              ) : null}
              {movement.fxRate && movement.fxRate !== 1 ? (
                <>
                  <Divider />
                  <DetailRow label="Tipo de cambio" value={movement.fxRate.toFixed(4)} />
                </>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Text style={styles.sectionTitle}>Cuenta</Text>
              <DetailRow
                label={isExpense ? "Desde" : "Hacia"}
                value={
                  (isExpense
                    ? movement.sourceAccountName ?? `Cuenta #${movement.sourceAccountId}`
                    : movement.destinationAccountName ?? `Cuenta #${movement.destinationAccountId}`) ?? "—"
                }
              />
            </Card>
          )}

          {/* IDs */}
          <Text style={styles.metaId}>ID: {movement.id}</Text>
        </ScrollView>
      )}

      {movement ? (
        <MovementForm
          visible={editFormVisible}
          onClose={() => setEditFormVisible(false)}
          onSuccess={() => {
            setEditFormVisible(false);
            void queryClient.invalidateQueries({ queryKey: ["movement", movement.id] });
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          }}
          editMovement={movement}
        />
      ) : null}
      {movement ? (
        <MovementForm
          visible={duplicateFormVisible}
          onClose={() => setDuplicateFormVisible(false)}
          onSuccess={() => {
            setDuplicateFormVisible(false);
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          }}
          defaultType={movement.movementType as any}
          initialAccountId={movement.sourceAccountId ?? movement.destinationAccountId ?? undefined}
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
  content: { padding: SPACING.lg, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.textMuted, fontSize: FONT_SIZE.md },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  heroCard: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl },
  typeLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  metaId: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, textAlign: "center", paddingBottom: SPACING.xl },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  editBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  voidBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.danger + "88",
  },
  voidBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.danger, fontWeight: FONT_WEIGHT.medium },
  duplicateBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.transfer + "88",
  },
  duplicateBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
});
