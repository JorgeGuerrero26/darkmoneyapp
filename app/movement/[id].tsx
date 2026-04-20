import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, ScrollView, ActivityIndicator, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Trash2, X } from "lucide-react-native";

import { useMovementAttachmentsQuery, useMovementQuery, type MovementAttachmentFile } from "../../services/queries/movements";
import { useVoidMovementMutation, useWorkspaceSnapshotQuery, useLinkMovementToObligationMutation } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { parseDisplayDate, isoToDateStr } from "../../lib/date";
import { movementActsAsExpense, movementActsAsIncome } from "../../lib/movement-display";
import { useToast } from "../../hooks/useToast";
import { removeAttachmentFile } from "../../lib/entity-attachments";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Card } from "../../components/ui/Card";
import { AmountDisplay, formatCurrency } from "../../components/ui/AmountDisplay";
import { AttachmentPreviewModal } from "../../components/domain/AttachmentPreviewModal";
import { MovementForm } from "../../components/forms/MovementForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useDismissibleSheet } from "../../components/ui/useDismissibleSheet";

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
  planned: COLORS.storm,
  voided: COLORS.textDisabled,
};

function readMovementLinkedEventId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  const eventId = Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(eventId) && eventId > 0 ? eventId : null;
}

function MovementDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
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
  const linkSheetDismiss = useDismissibleSheet({
    visible: linkModalVisible,
    onClose: () => setLinkModalVisible(false),
  });
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [duplicateFormVisible, setDuplicateFormVisible] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<MovementAttachmentFile | null>(null);
  const [deletingAttachmentPath, setDeletingAttachmentPath] = useState<string | null>(null);
  const [selectedAttachmentPaths, setSelectedAttachmentPaths] = useState<string[]>([]);
  const [deleteSelectedVisible, setDeleteSelectedVisible] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [voidConfirmVisible, setVoidConfirmVisible] = useState(false);
  const longPressAttachmentPathRef = useRef<string | null>(null);

  const { data: movement, isLoading, error } = useMovementQuery(id ? parseInt(id) : null);
  const {
    data: movementAttachments = [],
    isLoading: attachmentsLoading,
  } = useMovementAttachmentsQuery(movement?.workspaceId, movement?.id);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const isTransfer = movement?.movementType === "transfer";
  const isExpense = movement ? movementActsAsExpense(movement) : false;
  const isVoided = movement?.status === "voided";
  const linkedEventId = useMemo(() => readMovementLinkedEventId(movement?.metadata), [movement?.metadata]);
  const isSelectingAttachments = selectedAttachmentPaths.length > 0;
  const selectedAttachments = useMemo(
    () => movementAttachments.filter((attachment) => selectedAttachmentPaths.includes(attachment.filePath)),
    [movementAttachments, selectedAttachmentPaths],
  );

  useEffect(() => {
    setSelectedAttachmentPaths((current) => {
      const next = current.filter((filePath) =>
        movementAttachments.some((attachment) => attachment.filePath === filePath),
      );
      if (next.length === current.length && next.every((filePath, index) => filePath === current[index])) {
        return current;
      }
      return next;
    });
  }, [movementAttachments]);

  // Obligations compatible with this movement type for linking
  const compatibleObligations = useMemo(() => {
    if (!movement || !snapshot) return [];
    const isIncome = movementActsAsIncome(movement);
    const targetDir = isIncome ? "receivable" : "payable";
    return (snapshot.obligations ?? []).filter(
      (o) => o.direction === targetDir && o.status === "active",
    );
  }, [movement, snapshot]);

  const linkableMovementTypes = new Set(["expense", "income", "refund", "obligation_payment", "subscription_payment"]);
  const canLink = movement && !movement.obligationId && !isTransfer && linkableMovementTypes.has(movement.movementType);
  const voidAccountImpacts = useMemo(() => {
    if (!movement) return [];
    const accounts = snapshot?.accounts ?? [];
    const impacts: Array<{
      key: string;
      name: string;
      currencyCode: string;
      currentBalance: number;
      delta: number;
      projectedBalance: number;
    }> = [];

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

  function handleVoid() {
    if (!movement) return;
    setVoidConfirmVisible(true);
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Movimiento"
        subtitle={activeWorkspace?.name}
        rightAction={
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="Volver"
          >
            <Text style={styles.back}>Volver</Text>
          </TouchableOpacity>
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
        <>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: isVoided ? SPACING.xl : 100 }]}>
            {/* Amount hero - tap to edit */}
            <TouchableOpacity
              onPress={!isVoided ? () => setEditFormVisible(true) : undefined}
              activeOpacity={isVoided ? 1 : 0.75}
              accessibilityLabel={!isVoided ? "Tocar para editar" : undefined}
            >
              <Card style={styles.heroCard}>
                <Text style={styles.typeLabel}>{TYPE_LABEL[movement.movementType] ?? movement.movementType}</Text>
                <AmountDisplay
                  amount={isTransfer ? (movement.sourceAmount ?? 0) : (movement.sourceAmount ?? movement.destinationAmount ?? 0)}
                  currencyCode={baseCurrency}
                  movementType={movement.movementType}
                  sourceAmount={movement.sourceAmount}
                  destinationAmount={movement.destinationAmount}
                  size="xl"
                />
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[movement.status] ?? COLORS.storm }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLOR[movement.status] ?? COLORS.storm }]}>
                    {STATUS_LABEL[movement.status] ?? movement.status}
                  </Text>
                </View>
                {!isVoided && (
                  <Text style={styles.heroHint}>Toca para editar</Text>
                )}
              </Card>
            </TouchableOpacity>

            {/* Details */}
            <Card>
              <DetailRow label="Descripción" value={movement.description || "-"} />
              <Divider />
              <DetailRow
                label="Fecha"
                value={format(parseDisplayDate(movement.occurredAt), "d 'de' MMMM yyyy", { locale: es })}
              />
              {movement.categoryId ? (
                <>
                  <Divider />
                  <DetailRow label="Categoria" value={movement.category || `ID ${movement.categoryId}`} />
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

            <Card>
              <View style={styles.attachmentsHeader}>
                <Text style={styles.sectionTitle}>Comprobantes</Text>
                {isSelectingAttachments ? (
                  <View style={styles.attachmentsSelectionHeader}>
                    <Text style={styles.attachmentsSelectionCount}>
                      {selectedAttachmentPaths.length} seleccionado{selectedAttachmentPaths.length === 1 ? "" : "s"}
                    </Text>
                    <TouchableOpacity
                      style={styles.attachmentsSelectionClear}
                      onPress={() => setSelectedAttachmentPaths([])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={14} color={COLORS.storm} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.attachmentsCount}>
                    {movementAttachments.length > 0
                      ? `${movementAttachments.length} adjunto${movementAttachments.length === 1 ? "" : "s"}`
                      : "Sin adjuntos"}
                  </Text>
                )}
              </View>
              {attachmentsLoading ? (
                <View style={styles.attachmentsLoading}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={styles.attachmentsEmptyText}>Cargando comprobantes...</Text>
                </View>
              ) : movementAttachments.length === 0 ? (
                <Text style={styles.attachmentsEmptyText}>
                  Este movimiento no tiene comprobantes visibles todavía.
                </Text>
              ) : (
                <>
                  {isSelectingAttachments ? (
                    <View style={styles.attachmentsSelectionBar}>
                      <Text style={styles.attachmentsHint}>
                        Toca para seleccionar o deseleccionar. Luego elimina en lote.
                      </Text>
                      <TouchableOpacity
                        style={[styles.attachmentsDeleteSelectedBtn, deletingSelected && styles.attachmentsDeleteSelectedBtnDisabled]}
                        onPress={() => setDeleteSelectedVisible(true)}
                        disabled={deletingSelected}
                        activeOpacity={0.86}
                      >
                        {deletingSelected ? (
                          <ActivityIndicator size="small" color={COLORS.ink} />
                        ) : (
                          <>
                            <Trash2 size={14} color={COLORS.ink} />
                            <Text style={styles.attachmentsDeleteSelectedText}>Eliminar</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.attachmentsHint}>
                      Toca una imagen para verla completa. Manten presionada para seleccionar varias.
                    </Text>
                  )}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.attachmentsRow}
                  >
                    {movementAttachments.map((attachment) => (
                      <TouchableOpacity
                        key={attachment.filePath}
                        style={[
                          styles.attachmentCard,
                          selectedAttachmentPaths.includes(attachment.filePath) && styles.attachmentCardSelected,
                        ]}
                        onPress={() => {
                          if (longPressAttachmentPathRef.current === attachment.filePath) {
                            longPressAttachmentPathRef.current = null;
                            return;
                          }
                          if (isSelectingAttachments) {
                            toggleAttachmentSelection(attachment.filePath);
                            return;
                          }
                          setPreviewAttachment(attachment);
                        }}
                        onLongPress={() => {
                          longPressAttachmentPathRef.current = attachment.filePath;
                          toggleAttachmentSelection(attachment.filePath);
                        }}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: attachment.signedUrl }} style={styles.attachmentImage} />
                        {isSelectingAttachments ? (
                          <View
                            style={[
                              styles.attachmentSelectionBadge,
                              selectedAttachmentPaths.includes(attachment.filePath) &&
                                styles.attachmentSelectionBadgeActive,
                            ]}
                          >
                            {selectedAttachmentPaths.includes(attachment.filePath) ? (
                              <Check size={14} color={COLORS.ink} />
                            ) : null}
                          </View>
                        ) : null}
                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentName} numberOfLines={1}>
                            {attachment.fileName}
                          </Text>
                          <Text style={styles.attachmentCta}>
                            {isSelectingAttachments
                              ? selectedAttachmentPaths.includes(attachment.filePath)
                                ? "Seleccionado"
                                : "Tocar para seleccionar"
                              : "Ver comprobante"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
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
                      : movement.destinationAccountName ?? `Cuenta #${movement.destinationAccountId}`) ?? "-"
                  }
                />
              </Card>
            )}

            {/* Linked origin */}
            {(movement.obligationId || movement.subscriptionId || canLink) ? (
              <Card>
                <Text style={styles.sectionTitle}>Origen</Text>
                {movement.obligationId ? (
                  <TouchableOpacity
                    style={styles.linkedRow}
                    onPress={() => router.push(`/obligation/${movement.obligationId}`)}
                  >
                    <Text style={styles.linkedLabel}>Credito / Deuda</Text>
                    <View style={styles.linkedRight}>
                      <Text style={styles.linkedValue} numberOfLines={1}>
                        {snapshot?.obligations.find((o) => o.id === movement.obligationId)?.title ?? `#${movement.obligationId}`}
                      </Text>
                      <Text style={styles.linkedChevron}>{">"}</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {movement.subscriptionId ? (
                  <TouchableOpacity
                    style={styles.linkedRow}
                    onPress={() => router.push(`/subscription/${movement.subscriptionId}`)}
                  >
                    <Text style={styles.linkedLabel}>Suscripcion</Text>
                    <View style={styles.linkedRight}>
                      <Text style={styles.linkedValue} numberOfLines={1}>
                        {snapshot?.subscriptions.find((s) => s.id === movement.subscriptionId)?.name ?? `#${movement.subscriptionId}`}
                      </Text>
                      <Text style={styles.linkedChevron}>{">"}</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {canLink ? (
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => setLinkModalVisible(true)}
                  >
                    <Text style={styles.linkBtnText}>
                      {linkMutation.isPending ? "Vinculando..." : "+ Asociar a credito / deuda"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </Card>
            ) : null}

            {/* IDs */}
            <Text style={styles.metaId}>ID: {movement.id}</Text>
          </ScrollView>

          {/* Bottom action bar */}
          {!isVoided && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + SPACING.sm }]}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setEditFormVisible(true)}>
                <Text style={styles.actionBtnPrimary}>Editar</Text>
              </TouchableOpacity>
              <View style={styles.actionSep} />
              <TouchableOpacity style={styles.actionBtn} onPress={() => setDuplicateFormVisible(true)}>
                <Text style={styles.actionBtnSecondary}>Duplicar</Text>
              </TouchableOpacity>
              <View style={styles.actionSep} />
              <TouchableOpacity style={styles.actionBtn} onPress={handleVoid}>
                <Text style={styles.actionBtnDanger}>Anular</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

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

      {/* Obligation link picker */}
      <Modal
        visible={linkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalVisible(false)}
      >
        <Animated.View style={[styles.overlay, linkSheetDismiss.backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLinkModalVisible(false)} />
          <Animated.View
            style={[styles.pickerSheet, { paddingBottom: insets.bottom + SPACING.lg }, linkSheetDismiss.sheetStyle]}
            onStartShouldSetResponder={() => true}
            {...linkSheetDismiss.panHandlers}
          >
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Asociar a credito / deuda</Text>
            <Text style={styles.pickerSub}>
              {(movement?.movementType === "income" || movement?.movementType === "refund")
                ? "Creditos activos (ingresos)"
                : "Deudas activas (egresos)"}
            </Text>
            {compatibleObligations.length === 0 ? (
              <Text style={styles.pickerEmpty}>No hay obligaciones activas compatibles</Text>
            ) : (
              <FlatList
                data={compatibleObligations}
                keyExtractor={(o) => String(o.id)}
                renderItem={({ item: o }) => (
                  <TouchableOpacity style={styles.pickerItem} onPress={() => handleLink(o.id)}>
                    <View style={styles.pickerItemLeft}>
                      <Text style={styles.pickerItemTitle}>{o.title}</Text>
                      <Text style={styles.pickerItemSub}>{o.counterparty || "Sin contacto"}</Text>
                    </View>
                    <Text style={styles.pickerItemAmount}>
                      {o.currencyCode} {o.pendingAmount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
              />
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

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

      <ConfirmDialog
        visible={voidConfirmVisible}
        title="Anular movimiento"
        body="El movimiento quedara anulado y se revertira su efecto en tus balances."
        confirmLabel="Anular"
        cancelLabel="Cancelar"
        onCancel={() => setVoidConfirmVisible(false)}
        onConfirm={confirmVoid}
      >
        {voidAccountImpacts.length > 0 ? (
          <View style={voidImpactStyles.container}>
            {voidAccountImpacts.map((impact) => (
              <View key={impact.key} style={voidImpactStyles.card}>
                <Text style={voidImpactStyles.title}>Cuenta afectada: {impact.name}</Text>
                <View style={voidImpactStyles.row}>
                  <Text style={voidImpactStyles.label}>Saldo actual</Text>
                  <Text style={voidImpactStyles.value}>
                    {formatCurrency(impact.currentBalance, impact.currencyCode)}
                  </Text>
                </View>
                <View style={voidImpactStyles.row}>
                  <Text style={voidImpactStyles.label}>Ajuste al anular</Text>
                  <Text
                    style={[
                      voidImpactStyles.value,
                      impact.delta >= 0 ? voidImpactStyles.positive : voidImpactStyles.negative,
                    ]}
                  >
                    {impact.delta >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(impact.delta), impact.currencyCode)}
                  </Text>
                </View>
                <View style={voidImpactStyles.row}>
                  <Text style={voidImpactStyles.label}>Quedara en</Text>
                  <Text style={voidImpactStyles.strong}>
                    {formatCurrency(impact.projectedBalance, impact.currencyCode)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ConfirmDialog>

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
  label: { fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },
  value: { fontSize: FONT_SIZE.sm, color: COLORS.ink, fontFamily: FONT_FAMILY.bodyMedium, flex: 2, textAlign: "right" },
  divider: { height: 1, backgroundColor: GLASS.separator, marginVertical: SPACING.sm },
});

const voidImpactStyles = StyleSheet.create({
  container: {
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  strong: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  positive: { color: COLORS.income },
  negative: { color: COLORS.danger },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.storm, fontSize: FONT_SIZE.md },
  back: { fontSize: FONT_SIZE.sm, color: COLORS.primary },
  heroCard: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl },
  typeLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textTransform: "uppercase", letterSpacing: 0.5 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  heroHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  metaId: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, textAlign: "center", paddingBottom: SPACING.xl },
  bottomBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
    backgroundColor: COLORS.shell,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  actionBtn: { flex: 1, alignItems: "center", paddingVertical: SPACING.sm },
  actionBtnPrimary: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  actionBtnSecondary: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  actionBtnDanger: { fontSize: FONT_SIZE.sm, color: COLORS.danger, fontFamily: FONT_FAMILY.bodyMedium },
  actionSep: { width: 1, backgroundColor: GLASS.separator, marginVertical: 4 },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
    gap: SPACING.md,
  },
  linkedLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm, flex: 1 },
  linkedRight: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, flex: 2, justifyContent: "flex-end" },
  linkedValue: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontFamily: FONT_FAMILY.bodyMedium, flexShrink: 1 },
  linkedChevron: { fontSize: FONT_SIZE.lg, color: COLORS.primary },
  linkBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    borderStyle: "dashed",
    alignItems: "center",
  },
  linkBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontFamily: FONT_FAMILY.bodyMedium },
  attachmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  attachmentsCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  attachmentsSelectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  attachmentsSelectionCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  attachmentsSelectionClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  attachmentsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  attachmentsEmptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  attachmentsHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
    flex: 1,
    lineHeight: 18,
  },
  attachmentsSelectionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  attachmentsDeleteSelectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger,
  },
  attachmentsDeleteSelectedBtnDisabled: {
    opacity: 0.7,
  },
  attachmentsDeleteSelectedText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  attachmentsRow: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  attachmentCard: {
    width: 144,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  attachmentCardSelected: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  attachmentImage: {
    width: "100%",
    height: 132,
    backgroundColor: COLORS.mist,
  },
  attachmentSelectionBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,11,20,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  attachmentSelectionBadgeActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  attachmentMeta: {
    padding: SPACING.sm,
    gap: 2,
  },
  attachmentName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  attachmentCta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: COLORS.shell,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    maxHeight: "70%",
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: SPACING.xs,
  },
  pickerTitle: { fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.heading, color: COLORS.ink, textAlign: "center" },
  pickerSub: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", marginBottom: SPACING.sm },
  pickerEmpty: { fontSize: FONT_SIZE.sm, color: COLORS.textDisabled, textAlign: "center", paddingVertical: SPACING.xl },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  pickerItemLeft: { flex: 1, gap: 2 },
  pickerItemTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  pickerItemSub: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  pickerItemAmount: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.warning },
  pickerSep: { height: 1, backgroundColor: GLASS.separator },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(3,5,8,0.94)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  previewHeader: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  previewTitle: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  previewCloseBtn: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  previewCloseText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  previewImage: {
    width: "100%",
    height: "70%",
    borderRadius: RADIUS.xl,
  },
});

export default function MovementDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <MovementDetailScreen />
    </ErrorBoundary>
  );
}

