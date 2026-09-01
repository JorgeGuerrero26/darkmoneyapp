import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { MovementForm } from "../../components/forms/MovementForm";

import {
  useMovementAttachmentsQuery,
  useMovementQuery,
} from "../../services/queries/movements";
import {
  useVoidMovementMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useLinkMovementToObligationMutation } from "../../services/queries/obligations";
import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { useUiStore } from "../../store/ui-store";
import { isoToDateStr } from "../../lib/date";
import { movementActsAsExpense, movementActsAsIncome } from "../../lib/movement-display";
import { useToast } from "../../hooks/useToast";
import { useCreateMovementTemplateMutation } from "../../services/queries/movement-templates";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { BookmarkPlus } from "lucide-react-native";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { COLORS, FONT_SIZE, SPACING } from "../../constants/theme";

import { movementAuditLine } from "../../features/movements/lib/audit-line";
import { MovementDetailHero } from "../../features/movements/components/detail/MovementDetailHero";
import { MovementDetailFields } from "../../features/movements/components/detail/MovementDetailFields";
import { MovementAttachmentsSheet } from "../../features/movements/components/detail/MovementAttachmentsSheet";
import { MovementDetailActions } from "../../features/movements/components/detail/MovementDetailActions";
import { LinkObligationModal } from "../../features/movements/components/detail/LinkObligationModal";
import {
  VoidMovementConfirm,
  type VoidAccountImpact,
} from "../../features/movements/components/detail/VoidMovementConfirm";

function readMovementLinkedEventId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const eventId = Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(eventId) && eventId > 0 ? eventId : null;
}

const LINKABLE_TYPES = new Set([
  "expense",
  "income",
  "refund",
  "obligation_payment",
  "subscription_payment",
]);

function MovementDetailScreen() {
  // Fuerza el re-render de la pantalla al alternar modo privacidad (la máscara
  // vive en formatCurrency, que lee el store imperativamente).
  useUiStore((state) => state.privacyMode);
  const { id, edit } = useLocalSearchParams<{ id: string; from?: string; edit?: string }>();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: {
      movements: "/(app)/movements",
      dashboard: "/(app)/dashboard",
    },
  });
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const voidMutation = useVoidMovementMutation(activeWorkspaceId);
  const linkMutation = useLinkMovementToObligationMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [duplicateFormVisible, setDuplicateFormVisible] = useState(false);
  const [voidConfirmVisible, setVoidConfirmVisible] = useState(false);
  /** Los comprobantes tienen su propia hoja: adjuntar una foto no es editar el movimiento. */
  const [attachmentsSheetOpen, setAttachmentsSheetOpen] = useState(false);
  const autoOpenedEditMovementIdRef = useRef<number | null>(null);

  const { data: movement, isLoading, error } = useMovementQuery(id ? parseInt(id) : null);
  const createTemplate = useCreateMovementTemplateMutation(activeWorkspaceId, profile?.id);
  const canTemplate =
    movement?.movementType === "expense" ||
    movement?.movementType === "income" ||
    movement?.movementType === "transfer";
  function saveAsTemplate() {
    if (!movement || createTemplate.isPending) return;
    createTemplate.mutate(
      {
        name: (movement.description ?? "").trim() || "Plantilla sin nombre",
        movementType: movement.movementType,
        sourceAccountId: movement.sourceAccountId ?? null,
        destinationAccountId: movement.destinationAccountId ?? null,
        sourceAmount: movement.sourceAmount ?? null,
        destinationAmount: movement.destinationAmount ?? null,
        categoryId: movement.categoryId ?? null,
        counterpartyId: movement.counterpartyId ?? null,
        description: movement.description ?? "",
        notes: movement.notes ?? null,
      },
      {
        onSuccess: () => showToast("Plantilla guardada. Úsala desde el botón + (mantener presionado).", "success"),
        onError: (err) => showToast(err instanceof Error ? err.message : "No se pudo guardar la plantilla", "error"),
      },
    );
  }
  const {
    data: movementAttachments = [],
    isLoading: attachmentsLoading,
  } = useMovementAttachmentsQuery(movement?.workspaceId, movement?.id);

  useEffect(() => {
    if (edit !== "1" || !movement) return;
    if (autoOpenedEditMovementIdRef.current === movement.id) return;
    autoOpenedEditMovementIdRef.current = movement.id;
    setEditFormVisible(true);
  }, [edit, movement?.id]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const isTransfer = movement?.movementType === "transfer";
  const isExpense = movement ? movementActsAsExpense(movement) : false;
  const isVoided = movement?.status === "voided";
  const sourceAccount = useMemo(
    () => snapshot?.accounts.find((item) => item.id === movement?.sourceAccountId) ?? null,
    [movement?.sourceAccountId, snapshot?.accounts],
  );
  const destinationAccount = useMemo(
    () => snapshot?.accounts.find((item) => item.id === movement?.destinationAccountId) ?? null,
    [movement?.destinationAccountId, snapshot?.accounts],
  );
  const transferSourceCurrencyCode =
    movement?.sourceCurrencyCode ?? sourceAccount?.currencyCode ?? baseCurrency;
  const transferDestinationCurrencyCode =
    movement?.destinationCurrencyCode ?? destinationAccount?.currencyCode ?? baseCurrency;
  const transferFxRate = useMemo(() => {
    if (!movement || !isTransfer) return null;
    const savedRate = Number(movement.fxRate ?? 0);
    if (Number.isFinite(savedRate) && savedRate > 0) return savedRate;
    const sourceAmount = Number(movement.sourceAmount ?? 0);
    const destinationAmount = Number(movement.destinationAmount ?? 0);
    if (sourceAmount > 0 && destinationAmount > 0) return destinationAmount / sourceAmount;
    return null;
  }, [isTransfer, movement?.destinationAmount, movement?.fxRate, movement?.sourceAmount]);

  /**
   * La cuenta que sintió el movimiento y con cuánto quedó.
   *
   * El saldo resultante es lo que uno mira después de un gasto, y estaba tres tarjetas más abajo
   * dicho como "CUENTA / Desde: Cuenta Principal": un rótulo de sección, una etiqueta de fila y
   * un valor, tres niveles de jerarquía para un dato.
   */
  const heroAccount = isExpense || isTransfer ? sourceAccount : destinationAccount;

  const linkedEventId = useMemo(
    () => readMovementLinkedEventId(movement?.metadata),
    [movement?.metadata],
  );
  const compatibleObligations = useMemo(() => {
    if (!movement || !snapshot) return [];
    const isIncome = movementActsAsIncome(movement);
    const targetDir = isIncome ? "receivable" : "payable";
    return (snapshot.obligations ?? []).filter(
      (o) => o.direction === targetDir && o.status === "active",
    );
  }, [movement, snapshot]);

  const canLink = Boolean(
    movement &&
      !movement.obligationId &&
      !isTransfer &&
      LINKABLE_TYPES.has(movement.movementType),
  );

  const voidAccountImpacts = useMemo<VoidAccountImpact[]>(() => {
    if (!movement) return [];
    const accounts = snapshot?.accounts ?? [];
    const impacts: VoidAccountImpact[] = [];

    if (movement.sourceAccountId != null && movement.sourceAmount != null && movement.sourceAmount > 0) {
      const account = accounts.find((item) => item.id === movement.sourceAccountId);
      if (account) {
        impacts.push({
          key: `source-${account.id}`,
          name: account.name,
          currencyCode: account.currencyCode,
          currentBalance: account.currentBalance,
          delta: movement.sourceAmount,
          projectedBalance: account.currentBalance + movement.sourceAmount,
        });
      }
    }

    if (movement.destinationAccountId != null && movement.destinationAmount != null && movement.destinationAmount > 0) {
      const account = accounts.find((item) => item.id === movement.destinationAccountId);
      if (account) {
        impacts.push({
          key: `destination-${account.id}`,
          name: account.name,
          currencyCode: account.currencyCode,
          currentBalance: account.currentBalance,
          delta: -movement.destinationAmount,
          projectedBalance: account.currentBalance - movement.destinationAmount,
        });
      }
    }

    return impacts;
  }, [movement, snapshot?.accounts]);

  function handleLink(obligationId: number) {
    if (!movement) return;
    const obligation = compatibleObligations.find((o) => o.id === obligationId);
    const maxInstallment = obligation?.events.reduce(
      (max, e) => (e.installmentNo != null ? Math.max(max, e.installmentNo) : max),
      0,
    ) ?? 0;
    const nextInstallment = maxInstallment > 0
      ? maxInstallment + 1
      : (obligation?.paymentCount ?? 0) + 1;
    const amount = isExpense
      ? (movement.sourceAmount ?? 0)
      : (movement.destinationAmount ?? 0);
    const paymentDate = isoToDateStr(movement.occurredAt);
    setLinkModalVisible(false);
    linkMutation.mutate(
      {
        movementId: movement.id,
        obligationId,
        amount,
        paymentDate,
        description: movement.description,
        installmentNo: nextInstallment,
      },
      {
        onSuccess: () => showToast("Vinculado a obligacion OK", "success"),
        onError: (e) => showToast((e as Error).message, "error"),
      },
    );
  }

  function confirmVoid() {
    if (!movement) return;
    setVoidConfirmVisible(false);
    voidMutation.mutate(movement.id, {
      onSuccess: () => {
        showToast("Movimiento anulado", "success");
        void queryClient.invalidateQueries({ queryKey: ["movement", movement.id] });
      },
      onError: (e) => showToast(e.message, "error"),
    });
  }

  function attachmentMirrorTargets() {
    if (!movement || !linkedEventId) return undefined;
    return [{ workspaceId: movement.workspaceId, entityType: "obligation-event" as const, entityId: linkedEventId }];
  }

  function invalidateAttachmentQueries() {
    if (!movement) return;
    void queryClient.invalidateQueries({ queryKey: ["movement-attachments", movement.workspaceId, movement.id] });
    if (linkedEventId) {
      void queryClient.invalidateQueries({
        queryKey: ["entity-attachments", movement.workspaceId, "obligation-event", linkedEventId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["entity-attachment-counts", movement.workspaceId, "obligation-event"],
      });
    }
  }

  const linkedObligationTitle = movement?.obligationId
    ? snapshot?.obligations?.find((o) => o.id === movement.obligationId)?.title ?? null
    : null;
  const linkedSubscriptionName = movement?.subscriptionId
    ? snapshot?.subscriptions.find((s) => s.id === movement.subscriptionId)?.name ?? null
    : null;

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title="Movimiento"
          /* El nombre que iba aquí es el del dueño de la cuenta, el único que ve esta pantalla:
             no distingue nada de nada. */
          onBack={handleBack}
          rightAction={
            canTemplate ? (
              <HeaderActionGroup
                actions={[{
                  key: "template",
                  icon: BookmarkPlus,
                  onPress: saveAsTemplate,
                  disabled: createTemplate.isPending,
                  accessibilityLabel: "Guardar como plantilla",
                }]}
              />
            ) : null
          }
        />
      }
      list={
        isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : error || !movement ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>No se encontró el movimiento</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <MovementDetailHero
              movement={movement}
              isTransfer={Boolean(isTransfer)}
              isVoided={Boolean(isVoided)}
              transferSourceCurrencyCode={transferSourceCurrencyCode}
              baseCurrencyCode={baseCurrency}
              accountName={heroAccount?.name ?? null}
              accountBalance={heroAccount?.currentBalance ?? null}
              accountCurrencyCode={heroAccount?.currencyCode ?? baseCurrency}
            />

            <MovementDetailFields
              movement={movement}
              isTransfer={Boolean(isTransfer)}
              isExpense={isExpense}
              transferSourceCurrencyCode={transferSourceCurrencyCode}
              transferDestinationCurrencyCode={transferDestinationCurrencyCode}
              fxRate={transferFxRate}
              attachmentsCount={movementAttachments.length}
              attachmentsLoading={attachmentsLoading}
              onPressAttachments={() => setAttachmentsSheetOpen(true)}
              obligationId={movement.obligationId}
              obligationTitle={linkedObligationTitle}
              subscriptionId={movement.subscriptionId}
              subscriptionName={linkedSubscriptionName}
              canLink={canLink}
              onPressObligation={(oid) => router.push(`/obligation/${oid}`)}
              onPressSubscription={(sid) => router.push(`/subscription/${sid}`)}
              onRequestLink={() => setLinkModalVisible(true)}
            />

          </ScrollView>
        )}
      fab={
        movement && !isLoading ? (
          <MovementDetailActions
            bottomInset={insets.bottom}
            auditLine={movementAuditLine({
              createdAt: movement.createdAt,
              updatedAt: movement.updatedAt,
              createdByUserId: movement.createdByUserId,
              status: movement.status,
              currentUserId: profile?.id,
            })}
            onPressEdit={!isVoided ? () => setEditFormVisible(true) : undefined}
            onPressDuplicate={!isVoided ? () => setDuplicateFormVisible(true) : undefined}
            onPressVoid={!isVoided ? () => setVoidConfirmVisible(true) : undefined}
          />
        ) : null
      }
      overlays={
        <>
          {movement ? (
            <MovementAttachmentsSheet
              visible={attachmentsSheetOpen}
              onClose={() => setAttachmentsSheetOpen(false)}
              movementId={movement.id}
              workspaceId={movement.workspaceId}
              existing={movementAttachments}
              loading={attachmentsLoading}
              onRemoveStoragePath={async (filePath) => {
                await removeAttachmentFile({ filePath, mirrorTargets: attachmentMirrorTargets() });
                invalidateAttachmentQueries();
              }}
            />
          ) : null}
          {movement ? (
            <MovementForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => {
                setEditFormVisible(false);
                void queryClient.invalidateQueries({ queryKey: ["movement", movement.id] });
                void queryClient.invalidateQueries({ queryKey: ["movement-attachments", movement.workspaceId, movement.id] });
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

          <LinkObligationModal
            visible={linkModalVisible}
            isIncome={movement ? movementActsAsIncome(movement) : false}
            obligations={compatibleObligations}
            bottomInset={insets.bottom}
            onClose={() => setLinkModalVisible(false)}
            onPick={handleLink}
          />

          <VoidMovementConfirm
            visible={voidConfirmVisible}
            impacts={voidAccountImpacts}
            onCancel={() => setVoidConfirmVisible(false)}
            onConfirm={confirmVoid}
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

export default function MovementDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <MovementDetailScreen />
    </ErrorBoundary>
  );
}
