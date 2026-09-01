import { ArrowDown, ArrowLeftRight, MoreVertical } from "lucide-react-native";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../../components/ui/ResourceSectionList";
import { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useUiStore } from "../../store/ui-store";
import { useWorkspaceSnapshotQuery, useArchiveAccountMutation, useDeleteMovementMutation } from "../../services/queries/workspace-data";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { usePaginatedMovements } from "../../services/queries/movements";
import { AccountMovementRow } from "../../features/accounts/components/AccountMovementRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SkeletonAccountSummary } from "../../components/ui/Skeleton";
import { BalanceEvolutionChart } from "../../features/accounts/components/BalanceEvolutionChart";
import { AccountAnalyticsModal } from "../../components/domain/AccountAnalyticsModal";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { currencyPluralTitle } from "../../constants/currencies";
import type { MovementRecord } from "../../types/domain";
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { AccountForm } from "../../components/forms/AccountForm";
import { MovementForm } from "../../components/forms/MovementForm";
import { AmountDisplay, formatCurrency } from "../../components/ui/AmountDisplay";
import { useToast } from "../../hooks/useToast";
import { humanizeError } from "../../lib/errors";
import { findInstitution } from "../../lib/account-institutions";
import { parseDisplayDate } from "../../lib/date";
import { useAccountsRealtimeSync } from "../../features/accounts/hooks/useAccountsRealtimeSync";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
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
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string; from?: string }>();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      accounts: "/(app)/accounts",
      dashboard: "/(app)/dashboard",
      notifications: "/notifications",
    },
  });
  const { reason: notificationReason, dismiss: dismissNotificationReason } = useNotificationReason();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  /**
   * Lo que identifica la cuenta: banco, tipo y moneda. "BCP · Banco · soles".
   *
   * Decía además "actividad hace 3 meses" sobre una cuenta con un movimiento de hoy cuatrocientos
   * píxeles más abajo. Una de las dos cosas era falsa y no había manera de saber cuál: si el dato
   * medía otra cosa estaba mal etiquetado, y si medía actividad estaba mal calculado. En cualquier
   * caso no puede convivir con una lista que lo contradice — **la actividad la cuenta la lista**.
   *
   * Y la moneda va en palabras, como en el resto de la app, no en código ISO.
   */
  const headerSubtitle = useMemo(() => {
    if (!account) return undefined;
    const institution = findInstitution(account.institutionCode)?.label ?? null;
    const typeLabel = ACCOUNT_TYPE_LABEL[account.type] ?? account.type;
    return [institution, typeLabel, currencyPluralTitle(account.currencyCode).toLowerCase()]
      .filter(Boolean)
      .join(" · ");
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

  const renderMovementItem = useCallback(({ item }: { item: MovementRecord }) => (
    <AccountMovementRow
      movement={item}
      baseCurrencyCode={baseCurrency}
      accountId={accountId ?? 0}
      accountCurrencyCode={account?.currencyCode}
      onPress={() => router.push(`/movement/${item.id}`)}
      onDelete={() => setDeleteMovementTarget({ id: item.id, description: item.description })}
    />
  ), [account?.currencyCode, accountId, baseCurrency, router]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title={account?.name ?? "Cuenta"}
            subtitle={headerSubtitle}
            onBack={handleBack}
            /* Editar y archivar estaban aquí Y otra vez como botones grandes abajo. Lo
               administrativo vive en el menú, donde archivar —que retira la cuenta de la app—
               deja de estar al alcance del pulgar y del mismo tamaño que "Nuevo gasto". */
            rightAction={
              account ? (
                <HeaderActionGroup
                  actions={[{
                    key: "menu",
                    icon: MoreVertical,
                    onPress: () => setMenuOpen(true),
                    accessibilityLabel: "Más acciones",
                  }]}
                />
              ) : null
            }
          />
          <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
        </>
      }
      summary={
        account ? (
          <View style={styles.hero}>
            {/* La tarjeta de identidad repetía el nombre entero de la cuenta —que ya está en el
                título, dos centímetros más arriba— para añadir un solo dato nuevo, el banco. Ese
                dato subió al subtítulo del encabezado. */}
            <Text style={styles.balanceLabel}>Saldo</Text>
            <AmountDisplay
              flat
              amount={displayBalance}
              currencyCode={effectiveDisplayCurrency}
              size="display"
              color={displayBalance < 0 ? COLORS.expense : COLORS.ink}
              prefix=""
            />
            {showSecondaryBalance ? (
              <Text style={styles.balanceNative}>
                {formatCurrency(account.currentBalance, account.currencyCode)} nativo
              </Text>
            ) : null}
            {!account.includeInNetWorth ? (
              <Text style={styles.notInNetWorthNote}>No incluida en patrimonio neto</Text>
            ) : null}

            {!account.isArchived ? (
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={[styles.heroBtn, styles.heroBtnPrimary]}
                  onPress={() => { setMovementFormType("expense"); setMovementFormVisible(true); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <ArrowDown size={16} color={COLORS.actionText} />
                  <Text style={[styles.heroBtnText, styles.heroBtnTextPrimary]}>Nuevo gasto</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.heroBtn, styles.heroBtnSecondary]}
                  onPress={() => { setMovementFormType("transfer"); setMovementFormVisible(true); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <ArrowLeftRight size={16} color={COLORS.fog} />
                  <Text style={[styles.heroBtnText, styles.heroBtnTextSecondary]}>Transferir</Text>
                </TouchableOpacity>
              </View>
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
                <BalanceEvolutionChart
                  accountId={account.id}
                  currentBalance={account.currentBalance}
                  currencyCode={account.currencyCode}
                  movements={movements}
                />
                {/* La lista arrancaba sin rótulo justo después del gráfico, así que sus primeras
                    filas parecían parte de él. */}
                <View style={styles.listHeader}>
                  <Text style={styles.listHeaderLabel}>Movimientos</Text>
                  <TouchableOpacity
                    onPress={() => router.push(
                      `/(app)/movements?quickScope=account&quickAccountId=${account.id}&quickToken=${Date.now()}`,
                    )}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={styles.listHeaderLink}>Ver todos</Text>
                  </TouchableOpacity>
                </View>
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
      /* Sin botón flotante: tapaba el monto de la cuarta fila y media quinta, y lo que se crea
         desde una cuenta —un gasto, una transferencia— ya está arriba, a la vista y sin cubrir
         nada. */
      overlays={
        <>
          {account ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={account.name}
              meta={[headerSubtitle]}
              actions={[
                {
                  key: "edit",
                  label: "Editar cuenta",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); setEditFormVisible(true); },
                },
                {
                  key: "analytics",
                  label: "Analítica",
                  variant: "secondary",
                  onPress: () => { setMenuOpen(false); setAnalyticsVisible(true); },
                },
                {
                  key: account.isArchived ? "restore" : "archive",
                  label: account.isArchived ? "Restaurar cuenta" : "Archivar cuenta",
                  variant: "ghost",
                  onPress: () => { setMenuOpen(false); setArchiveConfirmVisible(true); },
                },
              ]}
            />
          ) : null}

          <AccountAnalyticsModal
            visible={analyticsVisible && Boolean(account)}
            account={account ?? null}
            onClose={() => setAnalyticsVisible(false)}
          />

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
  // La cifra con la que abre la pantalla, sin tarjeta, y debajo lo único que uno hace desde una
  // cuenta: registrar un gasto y transferir.
  hero: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  balanceLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  balanceNative: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  notInNetWorthNote: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  heroActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  heroBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  heroBtnPrimary: { backgroundColor: COLORS.action },
  heroBtnSecondary: { borderWidth: 1, borderColor: SURFACE.cardBorder, backgroundColor: SURFACE.card },
  heroBtnText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  heroBtnTextPrimary: { color: COLORS.actionText },
  heroBtnTextSecondary: { color: COLORS.fog },
  listHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  listHeaderLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  listHeaderLink: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});

export default function AccountDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountDetailScreen />
    </ErrorBoundary>
  );
}
