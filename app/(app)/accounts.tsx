import { Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { AccountCard } from "../../components/domain/AccountCard";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { AccountForm } from "../../components/forms/AccountForm";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const { activeAccounts, archivedAccounts, totalNetWorth } = useMemo(() => {
    const accounts = snapshot?.accounts ?? [];
    const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
    const active = accounts.filter((a) => !a.isArchived);
    const archived = accounts.filter((a) => a.isArchived);
    const netWorth = active
      .filter((a) => a.includeInNetWorth)
      .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);
    return { activeAccounts: active, archivedAccounts: archived, totalNetWorth: netWorth };
  }, [snapshot, activeWorkspace]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Cuentas" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Net worth summary */}
        {activeAccounts.length > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Patrimonio neto</Text>
            <Text style={styles.summaryAmount}>
              {formatCurrency(totalNetWorth, baseCurrency)}
            </Text>
          </View>
        ) : null}

        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : activeAccounts.length === 0 ? (
          <EmptyState
            title="Sin cuentas"
            description="Agrega tu primera cuenta con el botón +"
            action={{ label: "Nueva cuenta", onPress: () => setFormVisible(true) }}
          />
        ) : (
          activeAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onPress={() => router.push(`/account/${account.id}`)}
            />
          ))
        )}

        {archivedAccounts.length > 0 ? (
          <View style={styles.archivedSection}>
            <Text style={styles.archivedLabel}>Archivadas ({archivedAccounts.length})</Text>
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setFormVisible(true)}
      >
        <Plus size={22} color="#FFF" />
      </TouchableOpacity>

      <AccountForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => setFormVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  summaryLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  summaryAmount: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  archivedSection: { marginTop: SPACING.md },
  archivedLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
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
