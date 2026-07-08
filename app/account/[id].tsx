import { Archive, ArchiveRestore, ArrowLeftRight, Pencil, Plus } from "lucide-react-native";
import { FAB } from "../../components/ui/FAB";
import { DetailQuickActions } from "../../components/ui/DetailQuickActions";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../../components/ui/ResourceSectionList";
import { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
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
import { SkeletonAccountSummary } from "../../components/ui/Skeleton";
import { BalanceEvolutionChart } from "../../features/accounts/components/BalanceEvolutionChart";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { AccountForm } from "../../components/forms/AccountForm";
import { MovementForm } from "../../components/forms/MovementForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { humanizeError } from "../../lib/errors";
import { getAccountIcon } from "../../lib/account-icons";
import { findInstitution } from "../../lib/account-institutions";
import { parseDisplayDate } from "../../lib/date";
import { InstitutionAvatar } from "../../features/accounts/components/InstitutionAvatar";
import { useAccountsRealtimeSync } from "../../features/accounts/hooks/useAccountsRealtimeSync";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { buildRateMap, hasConversionRate, resolveConversion } from "../../lib/exchange-rate-map";
import { useDisplayCurrency } from "../../features/accounts/lib/display-currency-context";

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
  const { id } = useLocalSearchParams<{ id: string; from?: string }>();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      accounts: "/(app)/accounts",
      dashboard: "/(app)/dashboard",
    },
  });
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [movementFormVisible, setMovementFormVisible] = useState(false);
  const [movementFormType, setMovementFormType] = useState<"expense" | "transfer">("expense");
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [deleteMovementTarget, setDeleteMovementTarget] = useState<{ id: number; description?: string | null } | null>(null);

  const { showToast } = useToast();
  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);
  const deleteMovement = useDeleteMovementMutation(activeWorkspaceId);

  const accountId = id ? parseInt(id) : null;
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  useAccountsRealtimeSync({ workspaceId: activeWorkspaceId });
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
        router.back();
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
      setArchiveConfirmVisible(false);
    }
  }

  const baseCurrency = (activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN").toUpperCase();

  // ── Display currency (shared via DisplayCurrencyProvider) ───────────────────
  const { displayCurrency } = useDisplayCurrency();

  const exchangeRateMap = useMemo(
    () => buildRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );

  // Effective display currency: only use the stored preference if we can convert into it.
  const effectiveDisplayCurrency = useMemo(() => {
    if (!displayCurrency || !account) return account?.currencyCode ?? baseCurrency;
    return hasConversionRate(exchangeRateMap, account.currencyCode, displayCurrency)
      ? displayCurrency
      : account.currencyCode;
  }, [account, baseCurrency, displayCurrency, exchangeRateMap]);

  // Native balance converted to the effective display currency.
  const displayBalance = useMemo(() => {
    if (!account) return 0;
    if (effectiveDisplayCurrency === account.currencyCode) return account.currentBalance;
    return account.currentBalance * resolveConversion(
      exchangeRateMap,
      account.currencyCode,
      effectiveDisplayCurrency,
    );
  }, [account, effectiveDisplayCurrency, exchangeRateMap]);

  const showSecondaryBalance = Boolean(
    account && effectiveDisplayCurrency !== account.currencyCode,
  );

  // Header subtitle: type + relative last activity (no longer the redundant workspace name).
  const headerSubtitle = useMemo(() => {
    if (!account) return undefined;
    const typeLabel = ACCOUNT_TYPE_LABEL[account.type] ?? account.type;
    if (!account.lastActivity) return typeLabel;
    try {
      const rel = formatDistanceToNow(parseDisplayDate(account.lastActivity), {
        addSuffix: true,
        locale: es,
      });
      return `${typeLabel} · actividad ${rel}`;
    } catch {
      return typeLabel;
    }
  }, [account]);

  // Enriched archive-confirmation body: when the account contributes to net worth,
  // tell the user how much will disappear from it.
  const archiveConfirmBody = useMemo(() => {
    if (!account) return "";
    if (account.isArchived) {
      return "La cuenta volverá a aparecer en tu lista activa y en el patrimonio neto.";
    }
    const contributesToNetWorth =
      account.includeInNetWorth && Math.abs(account.currentBalance) > 0.0001;
    if (!contributesToNetWorth) {
      return "La cuenta quedará oculta de la vista principal. Sus movimientos se conservarán intactos.";
    }
    const baseAmount = account.currentBalanceInBaseCurrency ?? account.currentBalance;
    const formatted = formatCurrency(baseAmount, baseCurrency);
    const verb = baseAmount >= 0 ? "bajará" : "subirá";
    return `Esta cuenta aporta ${formatted} a tu patrimonio neto. Al archivarla, tu patrimonio ${verb} en esa cantidad. Sus movimientos se conservarán intactos.`;
  }, [account, baseCurrency]);

  const movementIds = useMemo(() => movements.map((m) => m.id), [movements]);
  const { data: movementAttachmentCounts = {} } = useMovementAttachmentCountsQuery(activeWorkspaceId, movementIds);

  const renderMovementItem = useCallback(({ item }: { item: Parameters<typeof SwipeableMovementRow>[0]["movement"] }) => (
    <SwipeableMovementRow
      movement={item}
      baseCurrencyCode={baseCurrency}
      perspectiveAccountId={accountId}
      perspectiveCurrencyCode={account?.currencyCode}
      attachmentCount={movementAttachmentCounts[item.id] ?? 0}
      onPress={() => router.push(`/movement/${item.id}`)}
      onDelete={() => setDeleteMovementTarget({ id: item.id, description: item.description })}
    />
  ), [account?.currencyCode, accountId, baseCurrency, movementAttachmentCounts, router]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={account?.name ?? "Cuenta"}
          subtitle={headerSubtitle}
          onBack={handleBack}
          rightAction={
            account ? (
              <HeaderActionGroup
                actions={[
                  {
                    key: account.isArchived ? "restore" : "archive",
                    icon: account.isArchived ? ArchiveRestore : Archive,
                    inactiveColor: account.isArchived ? COLORS.pine : COLORS.ember,
                    onPress: () => setArchiveConfirmVisible(true),
                    accessibilityLabel: account.isArchived ? "Restaurar cuenta" : "Archivar cuenta",
                  },
                  {
                    key: "edit",
                    icon: Pencil,
                    inactiveColor: COLORS.primary,
                    onPress: () => setEditFormVisible(true),
                    accessibilityLabel: "Editar cuenta",
                  },
                ]}
              />
            ) : null
          }
        />
      }
      summary={
        account ? (
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
                <View style={styles.metaRow}>
                  {findInstitution(account.institutionCode) ? (
                    <>
                      <InstitutionAvatar code={account.institutionCode} size={16} />
                      <Text style={styles.accountMeta}>
                        {findInstitution(account.institutionCode)!.label} ·{" "}
                      </Text>
                    </>
                  ) : null}
                  <Text style={styles.accountMeta}>
                    {ACCOUNT_TYPE_LABEL[account.type] ?? account.type} · {account.currencyCode}
                    {account.isArchived ? " · Archivada" : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.balanceContainer}>
                <Text style={styles.balanceLabel}>Saldo</Text>
                <Text style={[
                  styles.balanceAmount,
                  displayBalance < 0 ? styles.negative : styles.positive,
                ]}>
                  {formatCurrency(displayBalance, effectiveDisplayCurrency)}
                </Text>
                {showSecondaryBalance ? (
                  <Text style={styles.balanceNative}>
                    {formatCurrency(account.currentBalance, account.currencyCode)} nativo
                  </Text>
                ) : null}
              </View>
            </View>
            {!account.includeInNetWorth ? (
              <Text style={styles.notInNetWorthNote}>No incluida en patrimonio neto</Text>
            ) : null}
          </View>
        ) : (
          <SkeletonAccountSummary />
        )
      }
      list={
        <ResourceSectionList
          sections={[{ key: "movements", label: "Movimientos", data: movements, headerVariant: "hidden" }]}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMovementItem}
          listHeaderComponent={
            account ? (
              <>
                <DetailQuickActions
                  style={styles.quickActions}
                  actions={[
                    ...(!account.isArchived
                      ? [
                          {
                            key: "transfer",
                            label: "Transferir",
                            icon: ArrowLeftRight,
                            color: COLORS.pine,
                            onPress: () => {
                              setMovementFormType("transfer");
                              setMovementFormVisible(true);
                            },
                          },
                          {
                            key: "expense",
                            label: "Nuevo gasto",
                            icon: Plus,
                            color: COLORS.primary,
                            onPress: () => {
                              setMovementFormType("expense");
                              setMovementFormVisible(true);
                            },
                          },
                        ]
                      : []),
                    {
                      key: "edit",
                      label: "Editar",
                      icon: Pencil,
                      color: COLORS.primary,
                      onPress: () => setEditFormVisible(true),
                    },
                    {
                      key: account.isArchived ? "restore" : "archive",
                      label: account.isArchived ? "Restaurar" : "Archivar",
                      icon: account.isArchived ? ArchiveRestore : Archive,
                      color: account.isArchived ? COLORS.pine : COLORS.ember,
                      onPress: () => setArchiveConfirmVisible(true),
                    },
                  ]}
                />
                <BalanceEvolutionChart
                  accountId={account.id}
                  currentBalance={account.currentBalance}
                  currencyCode={account.currencyCode}
                  movements={movements}
                />
              </>
            ) : null
          }
          refreshing={isLoading && !isFetchingNextPage}
          onRefresh={onRefresh}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          loading={{ isLoading, fetchingMore: isFetchingNextPage, endReached: !hasNextPage }}
          empty={{ variant: "empty", title: "Sin movimientos", description: "Registra el primer movimiento con el botón +" }}
        />
      }
      fab={
        <FAB
          onPress={() => {
            setMovementFormType("expense");
            setMovementFormVisible(true);
          }}
          bottom={insets.bottom + 16}
        />
      }
      overlays={
        <>
          {/* Edit account form */}
          {account ? (
            <AccountForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => setEditFormVisible(false)}
              editAccount={account}
            />
          ) : null}

          {/* New movement form (pre-filtered to this account; type depends on which CTA opened it) */}
          <MovementForm
            visible={movementFormVisible}
            onClose={() => setMovementFormVisible(false)}
            onSuccess={() => {
              setMovementFormVisible(false);
              onRefresh();
            }}
            initialAccountId={accountId ?? undefined}
            defaultType={movementFormType}
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
          <ConfirmDialog
            visible={archiveConfirmVisible}
            icon={account?.isArchived ? "♻️" : "📦"}
            title={account?.isArchived ? "¿Restaurar cuenta?" : "¿Archivar cuenta?"}
            body={archiveConfirmBody}
            confirmLabel={account?.isArchived ? "Sí, restaurar" : "Sí, archivar"}
            cancelLabel="Cancelar"
            destructive={!account?.isArchived}
            confirmLoading={archiveAccount.isPending}
            confirmLoadingLabel="Procesando…"
            onConfirm={handleToggleArchive}
            onCancel={() => setArchiveConfirmVisible(false)}
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  accountName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  accountMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  balanceContainer: { alignItems: "flex-end", gap: 2 },
  balanceLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  balanceAmount: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  balanceNative: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  positive: { color: COLORS.text },
  negative: { color: COLORS.danger },
  notInNetWorthNote: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled },
  quickActions: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
});

export default function AccountDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountDetailScreen />
    </ErrorBoundary>
  );
}
