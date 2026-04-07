import { Archive, ArchiveRestore } from "lucide-react-native";
import { FAB } from "../../components/ui/FAB";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery, useArchiveAccountMutation, useDeleteMovementMutation } from "../../services/queries/workspace-data";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { usePaginatedMovements } from "../../services/queries/movements";
import { useMovementAttachmentCountsQuery } from "../../services/queries/attachments";
import { SwipeableMovementRow } from "../../components/domain/SwipeableMovementRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { AccountForm } from "../../components/forms/AccountForm";
import { MovementForm } from "../../components/forms/MovementForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { humanizeError } from "../../lib/errors";
import { getAccountIcon } from "../../lib/account-icons";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, GLASS, RADIUS, SPACING } from "../../constants/theme";

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: "Efectivo",
  bank: "Banco",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  loan: "Préstamo",
  loan_wallet: "Cartera préstamos",
  other: "Otro",
};

function AccountDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();

  function handleBack() {
    if (from === "accounts") {
      router.replace("/(app)/accounts");
    } else {
      router.back();
    }
  }
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [movementFormVisible, setMovementFormVisible] = useState(false);
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [deleteMovementTarget, setDeleteMovementTarget] = useState<{ id: number; description?: string | null } | null>(null);

  const { showToast } = useToast();
  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);
  const deleteMovement = useDeleteMovementMutation(activeWorkspaceId);

  const accountId = id ? parseInt(id) : null;
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const account = useMemo(
    () => snapshot?.accounts.find((a) => a.id === accountId) ?? null,
    [snapshot, accountId],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedMovements(activeWorkspaceId, accountId ? { accountId } : {}, profile?.id);

  const movements = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["movements"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  async function handleToggleArchive() {
    if (!account) return;
    try {
      await archiveAccount.mutateAsync({ id: account.id, archived: !account.isArchived });
      showToast(account.isArchived ? "Cuenta restaurada ✓" : "Cuenta archivada ✓", "success");
      setArchiveConfirmVisible(false);
      if (!account.isArchived) {
        router.replace("/(app)/accounts");
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
      setArchiveConfirmVisible(false);
    }
  }

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const movementIds = useMemo(() => movements.map((m) => m.id), [movements]);
  const { data: movementAttachmentCounts = {} } = useMovementAttachmentCountsQuery(activeWorkspaceId, movementIds);

  const renderMovementItem = useCallback(({ item }: { item: Parameters<typeof SwipeableMovementRow>[0]["movement"] }) => (
    <SwipeableMovementRow
      movement={item}
      baseCurrencyCode={baseCurrency}
      attachmentCount={movementAttachmentCounts[item.id] ?? 0}
      onPress={() => router.push(`/movement/${item.id}`)}
      onDelete={() => setDeleteMovementTarget({ id: item.id, description: item.description })}
    />
  ), [baseCurrency, movementAttachmentCounts, router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={account?.name ?? "Cuenta"}
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {account ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, account.isArchived ? styles.actionBtnRestore : styles.actionBtnArchive]}
                  onPress={() => setArchiveConfirmVisible(true)}
                >
                  {account.isArchived
                    ? <ArchiveRestore size={13} color={COLORS.pine} strokeWidth={2} />
                    : <Archive size={13} color={COLORS.ember} strokeWidth={2} />
                  }
                  <Text style={[styles.actionBtnText, account.isArchived ? styles.actionBtnTextRestore : styles.actionBtnTextArchive]}>
                    {account.isArchived ? "Restaurar" : "Archivar"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)}>
                  <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={handleBack}>
              <Text style={styles.back}>‹ Volver</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Account summary card */}
      {account ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={[styles.iconContainer, { backgroundColor: account.color + "33" }]}>
              {(() => {
                const Icon = getAccountIcon(account.icon, account.type);
                return <Icon size={22} color={account.color} />;
              })()}
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.accountName}>{account.name}</Text>
              <Text style={styles.accountMeta}>
                {ACCOUNT_TYPE_LABEL[account.type] ?? account.type} · {account.currencyCode}
                {account.isArchived ? " · Archivada" : ""}
              </Text>
            </View>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Saldo</Text>
              <Text style={[
                styles.balanceAmount,
                account.currentBalance < 0 ? styles.negative : styles.positive,
              ]}>
                {formatCurrency(account.currentBalance, account.currencyCode)}
              </Text>
            </View>
          </View>
          {!account.includeInNetWorth ? (
            <Text style={styles.notInNetWorthNote}>No incluida en patrimonio neto</Text>
          ) : null}
        </View>
      ) : null}

      {/* Movements list */}
      <FlatList
        data={movements}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMovementItem}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={15}
        ItemSeparatorComponent={undefined}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && !isFetchingNextPage}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="Sin movimientos"
              description="Registra el primer movimiento con el botón +"
            />
          )
        }
        contentContainerStyle={movements.length === 0 ? styles.emptyContainer : styles.listContent}
      />

      <FAB onPress={() => setMovementFormVisible(true)} bottom={insets.bottom + 16} />

      {/* Edit account form */}
      {account ? (
        <AccountForm
          visible={editFormVisible}
          onClose={() => setEditFormVisible(false)}
          onSuccess={() => setEditFormVisible(false)}
          editAccount={account}
        />
      ) : null}

      {/* New movement form (pre-filtered to this account) */}
      <MovementForm
        visible={movementFormVisible}
        onClose={() => setMovementFormVisible(false)}
        onSuccess={() => {
          setMovementFormVisible(false);
          onRefresh();
        }}
        initialAccountId={accountId ?? undefined}
      />

      <ConfirmDialog
        visible={Boolean(deleteMovementTarget)}
        title="Eliminar movimiento"
        body={deleteMovementTarget ? `¿Eliminar "${deleteMovementTarget.description ?? "este movimiento"}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteMovementTarget(null)}
        onConfirm={() => {
          if (!deleteMovementTarget) return;
          deleteMovement.mutate(deleteMovementTarget.id, {
            onSuccess: () => showToast("Movimiento eliminado", "success"),
            onError: (e) => showToast(e.message, "error"),
          });
          setDeleteMovementTarget(null);
        }}
      />

      {/* Archive / restore confirmation */}
      <Modal
        transparent
        visible={archiveConfirmVisible}
        animationType="fade"
        onRequestClose={() => setArchiveConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIconWrap, account?.isArchived ? styles.confirmIconRestore : styles.confirmIconArchive]}>
              {account?.isArchived
                ? <ArchiveRestore size={24} color={COLORS.pine} />
                : <Archive size={24} color={COLORS.ember} />
              }
            </View>
            <Text style={styles.confirmTitle}>
              {account?.isArchived ? "¿Restaurar cuenta?" : "¿Archivar cuenta?"}
            </Text>
            <Text style={styles.confirmBody}>
              {account?.isArchived
                ? "La cuenta volverá a aparecer en tu lista activa y en el patrimonio neto."
                : "La cuenta quedará oculta de la vista principal. Sus movimientos se conservarán intactos."
              }
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, account?.isArchived ? styles.confirmBtnRestore : styles.confirmBtnArchive]}
              onPress={handleToggleArchive}
              disabled={archiveAccount.isPending}
            >
              <Text style={[styles.confirmBtnText, account?.isArchived ? styles.confirmBtnTextRestore : styles.confirmBtnTextArchive]}>
                {archiveAccount.isPending
                  ? "Procesando…"
                  : account?.isArchived ? "Sí, restaurar" : "Sí, archivar"
                }
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmCancelBtn}
              onPress={() => setArchiveConfirmVisible(false)}
            >
              <Text style={styles.confirmCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  actionBtnArchive: {
    borderColor: COLORS.ember + "99",
    backgroundColor: COLORS.ember + "15",
  },
  actionBtnRestore: {
    borderColor: COLORS.pine + "99",
    backgroundColor: COLORS.pine + "15",
  },
  actionBtnText: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium },
  actionBtnTextArchive: { color: COLORS.ember },
  actionBtnTextRestore: { color: COLORS.pine },
  editBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  summaryCard: {
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryInfo: { flex: 1, gap: 2 },
  accountName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  accountMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  balanceContainer: { alignItems: "flex-end", gap: 2 },
  balanceLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  balanceAmount: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  positive: { color: COLORS.text },
  negative: { color: COLORS.danger },
  notInNetWorthNote: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  separator: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.lg + 36 + SPACING.md },
  footer: { padding: SPACING.lg, alignItems: "center" },
  listContent: { paddingTop: SPACING.md },
  emptyContainer: { flexGrow: 1 },
  // Archive/restore confirmation modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  confirmCard: {
    width: "100%",
    backgroundColor: "rgba(7,11,20,0.96)",
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    borderLeftColor: "rgba(255,255,255,0.12)",
    borderRightColor: "rgba(255,255,255,0.12)",
    borderBottomColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    gap: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  confirmIconArchive: {
    backgroundColor: COLORS.ember + "18",
    borderWidth: 1,
    borderColor: COLORS.ember + "55",
  },
  confirmIconRestore: {
    backgroundColor: COLORS.pine + "18",
    borderWidth: 1,
    borderColor: COLORS.pine + "55",
  },
  confirmTitle: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  confirmBody: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  confirmBtn: {
    width: "100%",
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
  },
  confirmBtnArchive: {
    backgroundColor: COLORS.ember + "20",
    borderColor: COLORS.ember + "66",
    shadowColor: COLORS.ember,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
  },
  confirmBtnRestore: {
    backgroundColor: COLORS.pine + "20",
    borderColor: COLORS.pine + "66",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
  },
  confirmBtnText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  confirmBtnTextArchive: { color: COLORS.ember },
  confirmBtnTextRestore: { color: COLORS.pine },
  confirmCancelBtn: {
    width: "100%",
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  confirmCancelText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
});

export default function AccountDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountDetailScreen />
    </ErrorBoundary>
  );
}
