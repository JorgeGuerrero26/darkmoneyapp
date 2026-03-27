import { GestureDetector } from "react-native-gesture-handler";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Archive, ArchiveRestore, CheckSquare, Download,
  Search, Square, Trash2, X,
} from "lucide-react-native";
import { format } from "date-fns";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useArchiveAccountMutation,
} from "../../services/queries/workspace-data";
import { AccountCard } from "../../components/domain/AccountCard";
import { AccountAnalyticsModal } from "../../components/domain/AccountAnalyticsModal";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { FAB } from "../../components/ui/FAB";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { AccountForm } from "../../components/forms/AccountForm";
import { useToast } from "../../hooks/useToast";
import { humanizeError } from "../../lib/errors";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useSwipeTab } from "../../hooks/useSwipeTab";
import type { AccountSummary } from "../../types/domain";

const TYPE_FILTERS = [
  { label: "Todas", value: "all" },
  { label: "Banco",       value: "bank" },
  { label: "Efectivo",    value: "cash" },
  { label: "Ahorro",      value: "savings" },
  { label: "Tarjeta",     value: "credit_card" },
  { label: "Inversión",   value: "investment" },
  { label: "Préstamo",    value: "loan" },
  { label: "Otro",        value: "other" },
];

function buildAccountCSV(accounts: AccountSummary[]): string {
  const BOM = "\uFEFF";
  const headers = ["Nombre", "Tipo", "Moneda", "Saldo actual", "Saldo inicial", "En patrimonio", "Archivada", "Última actividad"];
  const rows = accounts.map((a) => [
    a.name, a.type, a.currencyCode,
    String(a.currentBalance), String(a.openingBalance),
    a.includeInNetWorth ? "Sí" : "No",
    a.isArchived ? "Sí" : "No",
    a.lastActivity ?? "",
  ].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
  return BOM + [headers.join(","), ...rows].join("\n");
}

export default function AccountsScreen() {
  const swipeGesture = useSwipeTab();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [formVisible, setFormVisible] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);
  const [analyticsAccount, setAnalyticsAccount] = useState<AccountSummary | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { allAccounts, totalNetWorth } = useMemo(() => {
    const accounts = snapshot?.accounts ?? [];
    const netWorth = accounts
      .filter((a) => !a.isArchived && a.includeInNetWorth)
      .reduce((sum, a) => sum + (a.currentBalanceInBaseCurrency ?? a.currentBalance), 0);
    return { allAccounts: accounts, totalNetWorth: netWorth };
  }, [snapshot]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return allAccounts.filter((a) => {
      if (!showArchived && a.isArchived) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.currencyCode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allAccounts, searchText, typeFilter, showArchived]);

  const activeFiltered = filtered.filter((a) => !a.isArchived);
  const archivedFiltered = filtered.filter((a) => a.isArchived);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  async function handleArchive(account: AccountSummary) {
    try {
      await archiveAccount.mutateAsync({ id: account.id, archived: !account.isArchived });
      showToast(account.isArchived ? "Cuenta restaurada ✓" : "Cuenta archivada ✓", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function executeBulkArchive() {
    for (const id of selectedIds) {
      const acc = allAccounts.find((a) => a.id === id);
      if (!acc) continue;
      await archiveAccount.mutateAsync({ id, archived: true });
    }
    exitSelectMode();
    setBulkArchiveConfirm(false);
    showToast("Cuentas archivadas", "success");
  }

  async function exportCSV(accounts: AccountSummary[]) {
    const csv = buildAccountCSV(accounts);
    const fileName = `cuentas_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }

  const selectedAccounts = allAccounts.filter((a) => selectedIds.has(a.id));

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <ScreenHeader
        title={selectMode ? `${selectedIds.size} seleccionadas` : "Cuentas"}
        rightAction={
          selectMode ? (
            <TouchableOpacity onPress={exitSelectMode} style={styles.headerBtn}>
              <X size={14} color={COLORS.storm} />
              <Text style={styles.headerBtnText}>Cancelar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => exportCSV(filtered)}
            >
              <Download size={14} color={COLORS.storm} />
            </TouchableOpacity>
          )
        }
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Buscar cuentas…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="search"
        />
        {searchText.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Type filter + archived toggle */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
          {TYPE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.pill, typeFilter === f.value && styles.pillActive]}
              onPress={() => setTypeFilter(f.value)}
            >
              <Text style={[styles.pillText, typeFilter === f.value && styles.pillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={[styles.archivedToggle, showArchived && styles.archivedToggleActive]}
          onPress={() => setShowArchived((v) => !v)}
        >
          <Archive size={13} color={showArchived ? COLORS.primary : COLORS.storm} />
        </TouchableOpacity>
      </View>

      {/* Bulk bar */}
      {selectMode && selectedIds.size > 0 ? (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={styles.bulkBtn}
            onPress={() => setSelectedIds(new Set(activeFiltered.map((a) => a.id)))}
          >
            <CheckSquare size={13} color={COLORS.storm} />
            <Text style={styles.bulkBtnText}>Sel. todas ({activeFiltered.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bulkBtn}
            onPress={() => exportCSV(selectedAccounts)}
          >
            <Download size={13} color={COLORS.primary} />
            <Text style={[styles.bulkBtnText, { color: COLORS.primary }]}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkBtn, { borderColor: COLORS.warning + "44" }]}
            onPress={() => setBulkArchiveConfirm(true)}
          >
            <Archive size={13} color={COLORS.warning} />
            <Text style={[styles.bulkBtnText, { color: COLORS.warning }]}>
              Archivar ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Net worth */}
        {!selectMode && activeFiltered.length > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Patrimonio neto</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(totalNetWorth, baseCurrency)}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : activeFiltered.length === 0 && !showArchived ? (
          <EmptyState
            title="Sin cuentas"
            description="Agrega tu primera cuenta con el botón +"
            action={{ label: "Nueva cuenta", onPress: () => setFormVisible(true) }}
          />
        ) : (
          activeFiltered.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              selected={selectedIds.has(account.id)}
              selectMode={selectMode}
              onPress={() => {
                if (selectMode) { toggleSelect(account.id); return; }
                router.push(`/account/${account.id}?from=accounts`);
              }}
              onArchive={() => handleArchive(account)}
              onAnalytics={() => setAnalyticsAccount(account)}
            />
          ))
        )}

        {/* Archived section */}
        {archivedFiltered.length > 0 ? (
          <>
            <View style={styles.archivedHeader}>
              <Archive size={13} color={COLORS.storm} strokeWidth={2} />
              <Text style={styles.archivedLabel}>Archivadas ({archivedFiltered.length})</Text>
            </View>
            {archivedFiltered.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                selected={selectedIds.has(account.id)}
                onPress={() => {
                  if (selectMode) { toggleSelect(account.id); return; }
                  setEditAccount(account);
                  setFormVisible(true);
                }}
                onRestore={() => handleArchive(account)}
                onAnalytics={() => setAnalyticsAccount(account)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      {!selectMode ? (
        <FAB onPress={() => { setEditAccount(null); setFormVisible(true); }} bottom={insets.bottom + 16} />
      ) : null}

      <AccountForm
        visible={formVisible}
        editAccount={editAccount ?? undefined}
        onClose={() => { setFormVisible(false); setEditAccount(null); }}
        onSuccess={() => { setFormVisible(false); setEditAccount(null); }}
      />

      <AccountAnalyticsModal
        visible={Boolean(analyticsAccount)}
        account={analyticsAccount}
        onClose={() => setAnalyticsAccount(null)}
      />

      <ConfirmDialog
        visible={bulkArchiveConfirm}
        title={`Archivar ${selectedIds.size} cuentas`}
        body="Las cuentas dejarán de aparecer en la lista principal. Podrás restaurarlas después."
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        onCancel={() => setBulkArchiveConfirm(false)}
        onConfirm={executeBulkArchive}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.sm + 2,
  },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: SPACING.md,
    marginBottom: SPACING.sm,
  },
  filterPills: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
    alignItems: "center",
  },
  pill: {
    height: 30,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, includeFontPadding: false },
  pillTextActive: { color: "#FFF", fontFamily: FONT_FAMILY.bodySemibold },

  archivedToggle: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  archivedToggleActive: { backgroundColor: COLORS.primary + "22" },

  headerBtn: {
    height: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  headerBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },

  bulkBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bulkBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.separator,
    marginBottom: SPACING.xs,
  },
  summaryLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  summaryAmount: { fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.heading, color: COLORS.ink },

  archivedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
  },
  archivedLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});
