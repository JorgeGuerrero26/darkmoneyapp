import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react-native";

import { AccountForm } from "../../components/forms/AccountForm";
import { MovementForm } from "../../components/forms/MovementForm";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { NotificationReasonBanner } from "../../components/ui/NotificationReasonBanner";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { COLORS, FONT_SIZE, SPACING } from "../../constants/theme";
import { AccountDetailActions } from "../../features/accounts/components/detail/AccountDetailActions";
import { AccountDetailFields } from "../../features/accounts/components/detail/AccountDetailFields";
import { AccountDetailHero } from "../../features/accounts/components/detail/AccountDetailHero";
import { accountDetailTypeLabel } from "../../features/accounts/lib/account-detail-labels";
import { useDisplayCurrency } from "../../features/accounts/lib/display-currency-context";
import { useNotificationReason } from "../../hooks/useNotificationReason";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useToast } from "../../hooks/useToast";
import { buildRateMap, hasConversionRate, resolveConversion } from "../../lib/exchange-rate-map";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useArchiveAccountMutation, useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { useUiStore } from "../../store/ui-store";

function AccountDetailScreen() {
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
  const { displayCurrency } = useDisplayCurrency();
  const { showToast, showErrorToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [movementFormVisible, setMovementFormVisible] = useState(false);
  const [movementFormType, setMovementFormType] = useState<"expense" | "transfer">("expense");
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);

  const archiveAccount = useArchiveAccountMutation(activeWorkspaceId);
  const accountId = id ? Number.parseInt(id, 10) : null;
  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const account = useMemo(
    () => snapshot?.accounts.find((item) => item.id === accountId) ?? null,
    [snapshot, accountId],
  );

  const baseCurrency = (activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN").toUpperCase();
  const exchangeRateMap = useMemo(
    () => buildRateMap(snapshot?.exchangeRates ?? []),
    [snapshot?.exchangeRates],
  );
  const effectiveDisplayCurrency = useMemo(() => {
    if (!displayCurrency || !account) return account?.currencyCode ?? baseCurrency;
    return hasConversionRate(exchangeRateMap, account.currencyCode, displayCurrency)
      ? displayCurrency
      : account.currencyCode;
  }, [account, baseCurrency, displayCurrency, exchangeRateMap]);
  const displayBalance = useMemo(() => {
    if (!account) return 0;
    if (effectiveDisplayCurrency === account.currencyCode) return account.currentBalance;
    return account.currentBalance * resolveConversion(
      exchangeRateMap,
      account.currencyCode,
      effectiveDisplayCurrency,
    );
  }, [account, effectiveDisplayCurrency, exchangeRateMap]);

  const archiveConfirmBody = useMemo(() => {
    if (!account) return "";
    if (account.isArchived) {
      return "La cuenta volverá a aparecer en tu lista activa y en el patrimonio neto.";
    }
    const contributesToNetWorth = account.includeInNetWorth && Math.abs(account.currentBalance) > 0.0001;
    if (!contributesToNetWorth) {
      return "La cuenta quedará oculta de la vista principal. Sus movimientos se conservarán intactos.";
    }
    const baseAmount = account.currentBalanceInBaseCurrency ?? account.currentBalance;
    const formatted = formatCurrency(baseAmount, baseCurrency);
    const verb = baseAmount >= 0 ? "bajará" : "subirá";
    return `Esta cuenta aporta ${formatted} a tu patrimonio neto. Al archivarla, tu patrimonio ${verb} en esa cantidad. Sus movimientos se conservarán intactos.`;
  }, [account, baseCurrency]);

  function openMovementForm(type: "expense" | "transfer") {
    setMovementFormType(type);
    setMovementFormVisible(true);
  }

  async function handleToggleArchive() {
    if (!account) return;
    try {
      await archiveAccount.mutateAsync({ id: account.id, archived: !account.isArchived });
      showToast(account.isArchived ? "Cuenta restaurada" : "Cuenta archivada", "success", account.name);
      setArchiveConfirmVisible(false);
      if (!account.isArchived) router.back();
    } catch (err: unknown) {
      showErrorToast(account.isArchived ? "No se pudo restaurar la cuenta" : "No se pudo archivar la cuenta", err);
      setArchiveConfirmVisible(false);
    }
  }

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
          <ScreenHeader
            title="Cuenta"
            onBack={handleBack}
            rightAction={account ? (
              <HeaderActionGroup
                actions={[{
                  key: "menu",
                  icon: MoreVertical,
                  onPress: () => setMenuOpen(true),
                  accessibilityLabel: "Más acciones",
                }]}
              />
            ) : null}
          />
          <NotificationReasonBanner reason={notificationReason} onDismiss={dismissNotificationReason} />
        </>
      }
      list={isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !account ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>No se encontró la cuenta</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <AccountDetailHero
            account={account}
            displayBalance={displayBalance}
            displayCurrency={effectiveDisplayCurrency}
          />
          <AccountDetailFields account={account} />
        </ScrollView>
      )}
      fab={account ? (
        <AccountDetailActions
          bottomInset={insets.bottom}
          isArchived={account.isArchived}
          onEdit={() => setEditFormVisible(true)}
          onNewExpense={() => openMovementForm("expense")}
        />
      ) : null}
      overlays={
        <>
          {account ? (
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={account.name}
              meta={[accountDetailTypeLabel(account.type)]}
              actions={[
                {
                  key: "movements-this-month",
                  label: "Ver movimientos de este mes",
                  variant: "secondary" as const,
                  onPress: () => {
                    setMenuOpen(false);
                    router.push(`/(app)/movements?quickScope=account&quickAccountId=${account.id}&quickToken=${Date.now()}`);
                  },
                },
                ...(!account.isArchived ? [{
                  key: "transfer",
                  label: "Transferir",
                  variant: "secondary" as const,
                  onPress: () => { setMenuOpen(false); openMovementForm("transfer"); },
                }] : []),
                {
                  key: account.isArchived ? "restore" : "archive",
                  label: account.isArchived ? "Restaurar cuenta" : "Archivar cuenta",
                  variant: "ghost" as const,
                  onPress: () => { setMenuOpen(false); setArchiveConfirmVisible(true); },
                },
              ]}
            />
          ) : null}

          {account ? (
            <AccountForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => {
                setEditFormVisible(false);
                void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
              }}
              editAccount={account}
            />
          ) : null}

          <MovementForm
            visible={movementFormVisible}
            onClose={() => setMovementFormVisible(false)}
            onSuccess={() => {
              setMovementFormVisible(false);
              void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
            }}
            initialAccountId={accountId ?? undefined}
            defaultType={movementFormType}
          />

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
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.storm, fontSize: FONT_SIZE.md },
});

export default function AccountDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <AccountDetailScreen />
    </ErrorBoundary>
  );
}
