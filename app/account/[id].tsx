import { Plus, CreditCard, Wallet, Landmark, PiggyBank, TrendingUp, Banknote } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { usePaginatedMovements } from "../../services/queries/movements";
import { MovementRow } from "../../components/domain/MovementRow";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { AccountForm } from "../../components/forms/AccountForm";
import { MovementForm } from "../../components/forms/MovementForm";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

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

const ACCOUNT_TYPE_ICON: Record<string, typeof CreditCard> = {
  credit_card: CreditCard,
  cash: Banknote,
  savings: PiggyBank,
  investment: TrendingUp,
  bank: Landmark,
  loan: Wallet,
  loan_wallet: Wallet,
  other: Wallet,
};

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [movementFormVisible, setMovementFormVisible] = useState(false);

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
  } = usePaginatedMovements(activeWorkspaceId, accountId ? { accountId } : {});

  const movements = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["movements", activeWorkspaceId, { accountId }] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient, activeWorkspaceId, accountId]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={account?.name ?? "Cuenta"}
        subtitle={activeWorkspace?.name}
        rightAction={
          <View style={styles.headerActions}>
            {account ? (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditFormVisible(true)}>
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => router.replace("/(app)/accounts")}>
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
              {(() => { const Icon = ACCOUNT_TYPE_ICON[account.type] ?? Wallet; return <Icon size={22} color={account.color} />; })()}
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
        renderItem={({ item }) => (
          <MovementRow
            movement={item}
            baseCurrencyCode={baseCurrency}
            onPress={() => router.push(`/movement/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
        contentContainerStyle={movements.length === 0 ? styles.emptyContainer : undefined}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setMovementFormVisible(true)}
      >
        <Plus size={22} color="#FFF" />
      </TouchableOpacity>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
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
  emptyContainer: { flexGrow: 1 },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
