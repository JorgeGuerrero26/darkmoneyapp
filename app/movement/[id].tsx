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
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { MovementForm } from "../../components/forms/MovementForm";

import {
  useMovementAttachmentsQuery,
  useMovementQuery,
  type MovementAttachmentFile,
} from "../../services/queries/movements";
import {
  useVoidMovementMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useLinkMovementToObligationMutation } from "../../services/queries/obligations";
import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { isoToDateStr } from "../../lib/date";
import { movementActsAsExpense, movementActsAsIncome } from "../../lib/movement-display";
import { useToast } from "../../hooks/useToast";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { COLORS, FONT_SIZE, SPACING } from "../../constants/theme";

import { MovementAuditLog } from "../../features/movements/components/detail/MovementAuditLog";
import { MovementDetailHero } from "../../features/movements/components/detail/MovementDetailHero";
import { MovementDetailFields } from "../../features/movements/components/detail/MovementDetailFields";
import { MovementAttachmentsGallery } from "../../features/movements/components/detail/MovementAttachmentsGallery";
import {
  MovementAccountBlock,
  MovementTransferBlock,
} from "../../features/movements/components/detail/MovementAccountBlocks";
import { MovementLinkedOriginCard } from "../../features/movements/components/detail/MovementLinkedOriginCard";
import { MovementBottomActionBar } from "../../features/movements/components/detail/MovementBottomActionBar";
import { LinkObligationModal } from "../../features/movements/components/detail/LinkObligationModal";
import {
  VoidMovementConfirm,
  type VoidAccountImpact,
} from "../../features/movements/components/detail/VoidMovementConfirm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";

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
  const [previewAttachment, setPreviewAttachment] = useState<MovementAttachmentFile | null>(null);
  const [deletingAttachmentPath, setDeletingAttachmentPath] = useState<string | null>(null);
  const [selectedAttachmentPaths, setSelectedAttachmentPaths] = useState<string[]>([]);
  const [deleteSelectedVisible, setDeleteSelectedVisible] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [voidConfirmVisible, setVoidConfirmVisible] = useState(false);
  const longPressAttachmentPathRef = useRef<string | null>(null);
  const autoOpenedEditMovementIdRef = useRef<number | null>(null);

  const { data: movement, isLoading, error } = useMovementQuery(id ? parseInt(id) : null);
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

  const linkedEventId = useMemo(
    () => readMovementLinkedEventId(movement?.metadata),
    [movement?.metadata],
  );
  const selectedAttachments = useMemo(
    () => movementAttachments.filter((attachment) => selectedAttachmentPaths.includes(attachment.filePath)),
    [movementAttachments, selectedAttachmentPaths],
  );

  useEffect(() => {
    setSelectedAttachmentPaths((current) => {
      const next = current.filter((filePath) =>
        movementAttachments.some((attachment) => attachment.filePath === filePath),
      );
      if (
        next.length === current.length &&
        next.every((filePath, index) => filePath === current[index])
      ) {
        return current;
      }
      return next;
    });
  }, [movementAttachments]);

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

  function toggleAttachmentSelection(filePath: string) {
    if (!filePath) return;
    setSelectedAttachmentPaths((current) =>
      current.includes(filePath)
        ? current.filter((path) => path !== filePath)
        : [...current, filePath],
    );
  }

  async function handleDeleteAttachment(attachment: MovementAttachmentFile) {
    if (!movement) return;
    try {
      setDeletingAttachmentPath(attachment.filePath);
      await removeAttachmentFile({
        filePath: attachment.filePath,
        mirrorTargets: attachmentMirrorTargets(),
      });
      invalidateAttachmentQueries();
      showToast("Comprobante eliminado", "success");
      if (previewAttachment?.filePath === attachment.filePath) {
        const remaining = movementAttachments.filter((item) => item.filePath !== attachment.filePath);
        setPreviewAttachment(remaining[0] ?? null);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No pudimos eliminar el comprobante.", "error");
    } finally {
      setDeletingAttachmentPath(null);
    }
  }

  async function handleDeleteSelectedAttachments() {
    if (!movement || selectedAttachments.length === 0 || deletingSelected) return;
    try {
      setDeletingSelected(true);
      const mirrorTargets = attachmentMirrorTargets();
      await Promise.all(
        selectedAttachments.map((attachment) =>
          removeAttachmentFile({
            filePath: attachment.filePath,
            mirrorTargets,
          }),
        ),
      );
      invalidateAttachmentQueries();
      if (
        previewAttachment &&
        selectedAttachments.some((attachment) => attachment.filePath === previewAttachment.filePath)
      ) {
        setPreviewAttachment(null);
      }
      setSelectedAttachmentPaths([]);
      setDeleteSelectedVisible(false);
      showToast(
        selectedAttachments.length === 1
          ? "Comprobante eliminado"
          : `${selectedAttachments.length} comprobantes eliminados`,
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No pudimos eliminar los comprobantes.", "error");
    } finally {
      setDeletingSelected(false);
    }
  }

  const linkedObligationTitle = movement?.obligationId
    ? snapshot?.obligations.find((o) => o.id === movement.obligationId)?.title ?? null
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
          subtitle={activeWorkspace?.name}
          onBack={handleBack}
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
        <>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: isVoided ? SPACING.xl : 100 }]}>
            <MovementDetailHero
              movement={movement}
              isTransfer={Boolean(isTransfer)}
              isVoided={Boolean(isVoided)}
              transferSourceCurrencyCode={transferSourceCurrencyCode}
              baseCurrencyCode={baseCurrency}
              onPressEdit={() => setEditFormVisible(true)}
            />

            <MovementDetailFields movement={movement} />

            <MovementAttachmentsGallery
              attachments={movementAttachments}
              loading={attachmentsLoading}
              selectedPaths={selectedAttachmentPaths}
              deletingSelected={deletingSelected}
              onTogglePath={toggleAttachmentSelection}
              onClearSelection={() => setSelectedAttachmentPaths([])}
              onPreview={setPreviewAttachment}
              onRequestDeleteSelected={() => setDeleteSelectedVisible(true)}
              onLongPressBegin={(path) => {
                longPressAttachmentPathRef.current = path || null;
              }}
              isLongPressActive={(path) => longPressAttachmentPathRef.current === path}
            />

            {isTransfer ? (
              <MovementTransferBlock
                movement={movement}
                sourceCurrencyCode={transferSourceCurrencyCode}
                destinationCurrencyCode={transferDestinationCurrencyCode}
                fxRate={transferFxRate}
              />
            ) : (
              <MovementAccountBlock movement={movement} isExpense={isExpense} />
            )}

            <MovementLinkedOriginCard
              obligationId={movement.obligationId}
              obligationTitle={linkedObligationTitle}
              subscriptionId={movement.subscriptionId}
              subscriptionName={linkedSubscriptionName}
              canLink={canLink}
              linking={linkMutation.isPending}
              onOpenObligation={(oid) => router.push(`/obligation/${oid}`)}
              onOpenSubscription={(sid) => router.push(`/subscription/${sid}`)}
              onRequestLink={() => setLinkModalVisible(true)}
            />

            <MovementAuditLog
              createdAt={movement.createdAt}
              updatedAt={movement.updatedAt}
              createdByUserId={movement.createdByUserId}
              updatedByUserId={movement.updatedByUserId}
              status={movement.status}
            />

            <Text style={styles.metaId}>ID: {movement.id}</Text>
          </ScrollView>

          {!isVoided ? (
            <MovementBottomActionBar
              bottomInset={insets.bottom}
              onEdit={() => setEditFormVisible(true)}
              onDuplicate={() => setDuplicateFormVisible(true)}
              onVoid={() => setVoidConfirmVisible(true)}
            />
          ) : null}
        </>
      )}
      overlays={
        <>
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

      <AttachmentPreviewModal
        visible={Boolean(previewAttachment)}
        attachments={movementAttachments}
        initialPath={previewAttachment?.filePath ?? null}
        onClose={() => setPreviewAttachment(null)}
        onDeleteAttachment={handleDeleteAttachment}
        deletingAttachmentPath={deletingAttachmentPath}
        insets={insets}
        title="Comprobantes del movimiento"
      />

      <VoidMovementConfirm
        visible={voidConfirmVisible}
        impacts={voidAccountImpacts}
        onCancel={() => setVoidConfirmVisible(false)}
        onConfirm={confirmVoid}
      />

      <ConfirmDialog
        visible={deleteSelectedVisible}
        title="Eliminar comprobantes"
        body={
          selectedAttachmentPaths.length === 1
            ? "Este comprobante se eliminará del movimiento."
            : `Se eliminarán ${selectedAttachmentPaths.length} comprobantes del movimiento.`
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteSelectedVisible(false)}
        onConfirm={() => {
          void handleDeleteSelectedAttachments();
        }}
      />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.storm, fontSize: FONT_SIZE.md },
  metaId: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    textAlign: "center",
    paddingBottom: SPACING.xl,
  },
});

export default function MovementDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <MovementDetailScreen />
    </ErrorBoundary>
  );
}
