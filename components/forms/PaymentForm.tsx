import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ArrowRight, Info, AlertCircle } from "lucide-react-native";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "../../lib/workspace-context";
import { mirrorObligationEventAttachmentsToMovement, promoteDraftAttachmentsToEvent } from "../../lib/entity-attachments";
import { todayPeru } from "../../lib/date";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { useUiStore } from "../../store/ui-store";
import {
  useCreateObligationPaymentMutation,
  useObligationEventsQuery,
  useUpdateObligationEventMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useMovementQuery } from "../../services/queries/movements";
import { useObligationEventAttachmentsQuery } from "../../services/queries/attachments";
import { obligationViewerActsAsCollector } from "../../lib/obligation-viewer-labels";
import type { ObligationEventSummary, ObligationSummary, SharedObligationSummary } from "../../types/domain";
import { AttachmentPicker, type Attachment } from "../domain/AttachmentPicker";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { formatCurrency } from "../ui/AmountDisplay";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  obligation: ObligationSummary | SharedObligationSummary | null;
  /** Presente cuando se edita un evento existente en lugar de crear uno nuevo */
  editEvent?: ObligationEventSummary;
};

export function PaymentForm({ visible, onClose, onSuccess, obligation, editEvent }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const { showActivityNotice, dismissActivityNotice } = useUiStore();
  const queryClient = useQueryClient();
  const paymentWorkspaceId = obligation?.workspaceId ?? activeWorkspaceId ?? null;
  const createPaymentMutation = useCreateObligationPaymentMutation(paymentWorkspaceId);
  const updateEventMutation = useUpdateObligationEventMutation();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: liveEvents = [] } = useObligationEventsQuery(obligation?.id, visible && Boolean(obligation));
  const { data: linkedMovement } = useMovementQuery(
    visible && Boolean(editEvent?.movementId) ? editEvent?.movementId ?? null : null,
  );
  const {
    data: editEventAttachments = [],
    isLoading: editEventAttachmentsLoading,
  } = useObligationEventAttachmentsQuery(
    visible && editEvent ? paymentWorkspaceId : null,
    visible && editEvent ? editEvent.id : null,
  );
  const isEditMode = Boolean(editEvent);
  const scrollRef = useRef<ScrollView>(null);
  const amountRef = useRef<TextInput>(null);
  const accountSectionYRef = useRef(0);
  const attachmentsHydratedRef = useRef<string | null>(null);
  const linkedMovementHydratedRef = useRef<string | null>(null);
  const lastMirroredAttachmentSignatureRef = useRef<string | null>(null);
  const initialAttachmentSignatureRef = useRef("::ready");
  const latestObligation = useMemo(() => {
    if (!obligation) return null;
    return snapshot?.obligations.find((item) => item.id === obligation.id) ?? obligation;
  }, [snapshot?.obligations, obligation]);

  const today = todayPeru();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [createMovement, setCreateMovement] = useState(true);
  const [installmentNo, setInstallmentNo] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const initialRef = useRef({
    amount: "",
    installmentNo: "",
    description: "",
    notes: "",
    createMovement: true,
    accountId: null as number | null,
  });
  const lastSuggestedInstallmentNoRef = useRef("");
  const suggestedInstallmentNo = useMemo(
    () => {
      const eventsForInstallment = [...(latestObligation?.events ?? []), ...liveEvents];
      const maxInstallment = eventsForInstallment.reduce((max, event) => {
        if (event.eventType !== "payment") return max;
        const installmentNo = event.installmentNo ?? 0;
        return installmentNo > max ? installmentNo : max;
      }, 0);
      return String(maxInstallment + 1);
    },
    [latestObligation?.events, liveEvents],
  );

  const attachmentSignature = useMemo(() => {
    const persisted = attachments
      .filter((attachment) => attachment.storagePath)
      .map((attachment) => attachment.storagePath as string)
      .sort()
      .join("|");
    return `${persisted}::${attachments.some((attachment) => attachment.isUploading) ? "uploading" : "ready"}`;
  }, [attachments]);

  useEffect(() => {
    if (!visible || !obligation) return;
    attachmentsHydratedRef.current = null;
    linkedMovementHydratedRef.current = null;
    lastMirroredAttachmentSignatureRef.current = null;
    if (editEvent) {
      const initInstallment = editEvent.installmentNo != null ? String(editEvent.installmentNo) : "";
      setAmount(String(editEvent.amount));
      setPaymentDate(editEvent.eventDate);
      setInstallmentNo(initInstallment);
      setDescription(editEvent.description ?? "");
      setNotes(editEvent.notes ?? "");
      setCreateMovement(Boolean(editEvent.movementId));
      setAccountId(null);
      setAmountError("");
      setAccountError("");
      setSubmitError("");
      initialRef.current = {
        amount: String(editEvent.amount),
        installmentNo: initInstallment,
        description: editEvent.description ?? "",
        notes: editEvent.notes ?? "",
        createMovement: Boolean(editEvent.movementId),
        accountId: null,
      };
      lastSuggestedInstallmentNoRef.current = initInstallment;
      initialAttachmentSignatureRef.current = "::ready";
      setAttachments([]);
    } else {
      setAmount("");
      setPaymentDate(today);
      setAccountId(obligation.settlementAccountId ?? null);
      setCreateMovement(true);
      setInstallmentNo(suggestedInstallmentNo);
      setDescription("");
      setNotes("");
      setAmountError("");
      setAccountError("");
      setSubmitError("");
      initialRef.current = {
        amount: "",
        installmentNo: suggestedInstallmentNo,
        description: "",
        notes: "",
        createMovement: true,
        accountId: obligation.settlementAccountId ?? null,
      };
      lastSuggestedInstallmentNoRef.current = suggestedInstallmentNo;
      initialAttachmentSignatureRef.current = "::ready";
      setAttachments([]);
    }
  }, [visible, obligation, editEvent, today]);

  useEffect(() => {
    if (!visible || !obligation || editEvent) return;
    setInstallmentNo((current) => {
      if (!current || current === lastSuggestedInstallmentNoRef.current) {
        lastSuggestedInstallmentNoRef.current = suggestedInstallmentNo;
        return suggestedInstallmentNo;
      }
      return current;
    });
  }, [visible, obligation, editEvent, suggestedInstallmentNo]);

  useEffect(() => {
    if (!visible || !isEditMode || !editEvent || editEventAttachmentsLoading) return;
    const sourceKey = `${editEvent.id}:${editEventAttachments.map((attachment) => attachment.filePath).join("|")}`;
    if (attachmentsHydratedRef.current === sourceKey) return;

    const hydratedAttachments = editEventAttachments.map((attachment) => ({
      uri: attachment.signedUrl,
      storagePath: attachment.filePath,
      isUploading: false,
    }));
    attachmentsHydratedRef.current = sourceKey;
    initialAttachmentSignatureRef.current = `${hydratedAttachments
      .map((attachment) => attachment.storagePath ?? "")
      .sort()
      .join("|")}::ready`;
    lastMirroredAttachmentSignatureRef.current = `${hydratedAttachments
      .map((attachment) => attachment.storagePath ?? "")
      .sort()
      .join("|")}::ready`;
    setAttachments(hydratedAttachments);
  }, [editEvent, editEventAttachments, editEventAttachmentsLoading, isEditMode, visible]);

  useEffect(() => {
    if (!visible || !isEditMode || !editEvent) return;
    const linkedAccountId =
      linkedMovement?.sourceAccountId ?? linkedMovement?.destinationAccountId ?? null;
    const sourceKey = `${editEvent.id}:${editEvent.movementId ?? "none"}:${linkedAccountId ?? "none"}`;
    if (linkedMovementHydratedRef.current === sourceKey) return;
    linkedMovementHydratedRef.current = sourceKey;

    const hasLinkedMovement = Boolean(editEvent.movementId);
    setCreateMovement(hasLinkedMovement);
    setAccountId(linkedAccountId);
    initialRef.current = {
      amount: String(editEvent.amount),
      installmentNo: editEvent.installmentNo != null ? String(editEvent.installmentNo) : "",
      description: editEvent.description ?? "",
      notes: editEvent.notes ?? "",
      createMovement: hasLinkedMovement,
      accountId: linkedAccountId,
    };
  }, [editEvent, isEditMode, linkedMovement, visible]);

  useEffect(() => {
    if (
      !visible ||
      !isEditMode ||
      !editEvent ||
      !editEvent.movementId ||
      !paymentWorkspaceId ||
      editEventAttachmentsLoading ||
      attachments.some((attachment) => attachment.isUploading)
    ) {
      return;
    }
    if (attachmentSignature === lastMirroredAttachmentSignatureRef.current) return;

    lastMirroredAttachmentSignatureRef.current = attachmentSignature;
    void mirrorObligationEventAttachmentsToMovement({
      workspaceId: paymentWorkspaceId,
      eventId: editEvent.id,
      movementId: editEvent.movementId,
    })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ["movement-attachments", paymentWorkspaceId, editEvent.movementId],
        });
      })
      .catch((error) => {
        lastMirroredAttachmentSignatureRef.current = null;
        showToast(
          error instanceof Error
            ? error.message
            : "No pudimos sincronizar el comprobante con el movimiento vinculado.",
          "error",
        );
      });
  }, [
    attachmentSignature,
    attachments,
    editEvent,
    editEventAttachmentsLoading,
    isEditMode,
    paymentWorkspaceId,
    queryClient,
    showToast,
    visible,
  ]);

  const isSharedViewer =
    obligation != null &&
    "viewerMode" in obligation &&
    (obligation as SharedObligationSummary).viewerMode === "shared_viewer";
  const actsAsCollector =
    obligation != null && obligationViewerActsAsCollector(obligation.direction, isSharedViewer);
  const actionTitle = isEditMode
    ? (actsAsCollector ? "Editar cobro" : "Editar pago")
    : (actsAsCollector ? "Registrar cobro" : "Registrar pago");
  const dateLabel = actsAsCollector ? "Fecha de cobro" : "Fecha de pago";
  const movementDesc = actsAsCollector
    ? "Registra también un ingreso en tu contabilidad"
    : "Registra también un egreso en tu contabilidad";
  const accountLabel = actsAsCollector ? "Cuenta de abono" : "Cuenta de débito";
  const discardBody = actsAsCollector
    ? "Se perderán los datos del cobro."
    : "Se perderán los datos del pago.";

  function handleClose() {
    const i = initialRef.current;
    const isDirty =
      amount.trim() !== i.amount ||
      description.trim() !== i.description ||
      notes.trim() !== i.notes ||
      installmentNo !== i.installmentNo ||
      createMovement !== i.createMovement ||
      accountId !== i.accountId ||
      attachmentSignature !== initialAttachmentSignatureRef.current;
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setAmountError("");
    setAccountError("");
    setSubmitError("");
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      haptics.error();
      setAmountError("Ingresa un monto válido");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => amountRef.current?.focus(), 250);
      return;
    }
    if (createMovement && activeAccounts.length > 0 && accountId == null) {
      haptics.error();
      setAccountError("Selecciona una cuenta o desactiva la creación del movimiento");
      scrollRef.current?.scrollTo({ y: Math.max(0, accountSectionYRef.current - 24), animated: true });
      return;
    }
    if (!obligation) return;

    try {
      let backgroundAttachmentSync: (() => void) | null = null;
      let createdPaymentResult: { id: number; movementId: number | null; workspaceId: number } | null = null;
      if (isEditMode && editEvent) {
        const updated = await updateEventMutation.mutateAsync({
          eventId: editEvent.id,
          obligationId: obligation.id,
          amount: parsed,
          eventDate: paymentDate,
          installmentNo: installmentNo ? parseInt(installmentNo) : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
          movementId: editEvent.movementId ?? null,
          accountId: createMovement ? accountId : null,
          createMovement,
          direction: obligation.direction,
          eventType: editEvent.eventType,
          currencyCode: obligation.currencyCode,
          obligationTitle: obligation.title,
        });
        createdPaymentResult = {
          id: editEvent.id,
          movementId: updated.movementId ?? null,
          workspaceId: updated.workspaceId,
        };
        showToast(actsAsCollector ? "Cobro actualizado ✓" : "Pago actualizado ✓", "success");
      } else {
        const created = await createPaymentMutation.mutateAsync({
          obligationId: obligation.id,
          amount: parsed,
          paymentDate,
          accountId: createMovement ? accountId : null,
          installmentNo: installmentNo ? parseInt(installmentNo) : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
          createMovement,
          direction: obligation.direction,
        });
        createdPaymentResult = created;
        showToast(actsAsCollector ? "Cobro registrado ✓" : "Pago registrado ✓", "success");
      }
      const attachmentsChangedFromInitial = attachmentSignature !== initialAttachmentSignatureRef.current;
      if (createdPaymentResult && attachments.length > 0 && (!isEditMode || attachmentsChangedFromInitial)) {
        backgroundAttachmentSync = () => {
          const noticeId = showActivityNotice(
            "Sincronizando comprobantes",
            "Puedes seguir usando la app mientras terminamos de copiar las imágenes del evento.",
          );
          void promoteDraftAttachmentsToEvent({
            attachments,
            workspaceId: createdPaymentResult.workspaceId,
            eventId: createdPaymentResult.id,
            movementId: createdPaymentResult.movementId,
          })
            .then(() => {
              void queryClient.invalidateQueries({
                queryKey: [
                  "entity-attachments",
                  createdPaymentResult.workspaceId,
                  "obligation-event",
                  createdPaymentResult.id,
                ],
              });
              void queryClient.invalidateQueries({
                queryKey: ["entity-attachment-counts", createdPaymentResult.workspaceId, "obligation-event"],
              });
              if (createdPaymentResult.movementId) {
                void queryClient.invalidateQueries({
                  queryKey: ["movement-attachments", createdPaymentResult.workspaceId, createdPaymentResult.movementId],
                });
              }
            })
            .catch((error) => {
              showToast(humanizeError(error), "error");
            })
            .finally(() => dismissActivityNotice(noticeId));
        };
      }
      haptics.success();
      onSuccess?.();
      onClose();
      backgroundAttachmentSync?.();
    } catch (err: unknown) {
      haptics.error();
      setSubmitError(humanizeError(err));
    }
  }

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const pendingAmount = obligation?.pendingAmount ?? 0;
  const currencyCode = obligation?.currencyCode ?? "PEN";
  const selectedAccount = useMemo(
    () => activeAccounts.find((account) => account.id === accountId) ?? null,
    [activeAccounts, accountId],
  );
  const parsedAmount = useMemo(() => {
    const parsed = Number.parseFloat(amount);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [amount]);

  const remainingAfter = useMemo(() => {
    if (parsedAmount == null) return null;
    return Math.max(0, pendingAmount - parsedAmount);
  }, [parsedAmount, pendingAmount]);
  const accountDelta = useMemo(() => {
    if (!createMovement || selectedAccount == null || parsedAmount == null) return null;
    return actsAsCollector ? parsedAmount : -parsedAmount;
  }, [actsAsCollector, createMovement, parsedAmount, selectedAccount]);
  const projectedAccountBalance = useMemo(() => {
    if (selectedAccount == null || accountDelta == null) return null;
    return selectedAccount.currentBalance + accountDelta;
  }, [accountDelta, selectedAccount]);

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={actionTitle}
        snapHeight={0.75}
        scrollRef={scrollRef}
      >
      {/* Obligation summary + balance preview — solo en modo crear */}
      {obligation && !isEditMode ? (
        <View style={styles.obligationInfo}>
          <Text style={styles.obligationTitle}>{obligation.title}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceBlock}>
              <Text style={styles.balanceLabel}>Pendiente</Text>
              <Text style={styles.balanceValue}>{formatCurrency(pendingAmount, currencyCode)}</Text>
            </View>
            <ArrowRight size={14} color={COLORS.storm} />
            <View style={styles.balanceBlock}>
              <Text style={styles.balanceLabel}>Quedará</Text>
              <Text style={[styles.balanceValue, remainingAfter !== null && { color: COLORS.pine }]}>
                {remainingAfter !== null ? formatCurrency(remainingAfter, currencyCode) : "—"}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Amount + Installment No in a row */}
      <View style={styles.twoCol}>
        <View style={{ flex: 2 }}>
          <CurrencyInput
            ref={amountRef}
            label="Monto *"
            value={amount}
            onChangeText={(t) => { setAmount(t); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>N° cuota</Text>
          <TextInput
            style={styles.textInput}
            value={installmentNo}
            onChangeText={(t) => setInstallmentNo(t.replace(/[^0-9]/g, ""))}
            placeholder="—"
            placeholderTextColor={COLORS.storm}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Payment date */}
      <DatePickerInput
        label={dateLabel}
        value={paymentDate}
        onChange={setPaymentDate}
      />

      {/* Create movement toggle + account selector — solo en modo crear */}
      <>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Crear movimiento en cuenta</Text>
              <Text style={styles.switchDesc}>{movementDesc}</Text>
            </View>
            <Switch
              value={createMovement}
              onValueChange={(value) => {
                setCreateMovement(value);
                if (!value) setAccountError("");
              }}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {createMovement && activeAccounts.length > 0 ? (
            <View onLayout={(event) => { accountSectionYRef.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.label}>{accountLabel}</Text>
              <View style={[styles.pillWrap, accountError ? styles.pillWrapError : null]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pillRow}>
                    {activeAccounts.map((acc) => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.pill, accountId === acc.id && styles.pillActive]}
                        onPress={() => { setAccountId(acc.id); setAccountError(""); }}
                      >
                        <Text style={[styles.pillText, accountId === acc.id && styles.pillTextActive]}>
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              {accountError ? <Text style={styles.fieldError}>{accountError}</Text> : null}
              {selectedAccount && projectedAccountBalance != null ? (
                <View style={styles.accountProjectionCard}>
                  <Text style={styles.accountProjectionTitle}>Así quedará {selectedAccount.name}</Text>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                    <Text style={styles.accountProjectionValue}>
                      {formatCurrency(selectedAccount.currentBalance, selectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Movimiento</Text>
                    <Text
                      style={[
                        styles.accountProjectionValue,
                        accountDelta != null && accountDelta >= 0
                          ? styles.accountProjectionPositive
                          : styles.accountProjectionNegative,
                      ]}
                    >
                      {accountDelta != null && accountDelta >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(accountDelta ?? 0), selectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Quedará en</Text>
                    <Text style={styles.accountProjectionStrong}>
                      {formatCurrency(projectedAccountBalance, selectedAccount.currencyCode)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
      </>

      {/* Description */}
      <View>
        <Text style={styles.label}>Descripción (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Ej. Cuota enero, transferencia bancaria..."
          placeholderTextColor={COLORS.storm}
          returnKeyType="next"
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Referencia, número de operación..."
          placeholderTextColor={COLORS.storm}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>

      <View style={styles.attachmentSection}>
        {isEditMode && editEventAttachmentsLoading ? (
          <Text style={styles.attachmentSyncNote}>Cargando comprobantes...</Text>
        ) : null}
        {!isEditMode && createMovement ? (
          <Text style={styles.attachmentSyncNote}>
            Si este evento crea un movimiento, el comprobante se copiara tambien a ese movimiento.
          </Text>
        ) : null}
        {isEditMode && editEvent?.movementId ? (
          <Text style={styles.attachmentSyncNote}>
            Los cambios en comprobantes se reflejaran tambien en el movimiento vinculado.
          </Text>
        ) : null}
        <AttachmentPicker
          entityType="obligation-event"
          entityId={isEditMode ? editEvent?.id : null}
          attachments={attachments}
          onChange={setAttachments}
          isHydratingExisting={isEditMode && editEventAttachmentsLoading}
        />
      </View>

      {/* Edit mode: show how pending will change */}
      {isEditMode && editEvent && obligation ? (
        <EditPaymentImpact
          currentPending={obligation.pendingAmount}
          oldAmount={editEvent.amount}
          newAmount={parseFloat(amount) || 0}
          currency={obligation.currencyCode}
        />
      ) : null}

      {submitError ? (
        <View style={styles.submitErrorBanner}>
          <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      <Button
        label={isEditMode ? "Guardar cambios" : actionTitle}
        onPress={handleSubmit}
        loading={createPaymentMutation.isPending || updateEventMutation.isPending}
        style={styles.submitBtn}
      />
    </BottomSheet>

    <ConfirmDialog
      visible={showDiscard}
      title="¿Descartar cambios?"
      body={discardBody}
      confirmLabel="Descartar"
      cancelLabel="Continuar"
      onCancel={() => setShowDiscard(false)}
      onConfirm={() => { setShowDiscard(false); onClose(); }}
    />
  </>
  );
}

const styles = StyleSheet.create({
  obligationInfo: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.sm,
  },
  obligationTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  balanceBlock: { flex: 1, alignItems: "center", gap: 2 },
  balanceLabel: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  balanceValue: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading, color: COLORS.ink },
  twoCol: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start" },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  pillWrap: { borderRadius: RADIUS.md },
  pillWrapError: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    padding: SPACING.xs,
  },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine, borderColor: COLORS.pine },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  pillTextActive: { color: COLORS.textInverse },
  fieldError: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    marginTop: 4,
  },
  accountProjectionCard: {
    marginTop: SPACING.sm,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  accountProjectionTitle: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  accountProjectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  accountProjectionLabel: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  accountProjectionValue: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  accountProjectionStrong: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
  },
  accountProjectionPositive: {
    color: COLORS.income,
  },
  accountProjectionNegative: {
    color: COLORS.danger,
  },
  submitBtn: { marginTop: SPACING.sm },
  attachmentSection: {
    gap: SPACING.sm,
  },
  attachmentSyncNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 18,
  },
  submitErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  submitErrorText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    lineHeight: 20,
  },
});

// ─── Edit impact preview ──────────────────────────────────────────────────────

function EditPaymentImpact({
  currentPending,
  oldAmount,
  newAmount,
  currency,
}: {
  currentPending: number;
  oldAmount: number;
  newAmount: number;
  currency: string;
}) {
  // current pending already has oldAmount subtracted; to project: add it back, subtract newAmount
  const projected = Math.max(0, currentPending + oldAmount - newAmount);
  const diff = projected - currentPending;
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const diffColor = diff > 0 ? COLORS.danger : diff < 0 ? COLORS.income : COLORS.storm;

  return (
    <View style={epStyles.container}>
      <View style={epStyles.header}>
        <Info size={13} color={COLORS.storm} strokeWidth={2} />
        <Text style={epStyles.headerText}>Impacto en obligación</Text>
      </View>
      <View style={epStyles.row}>
        <View style={epStyles.col}>
          <Text style={epStyles.colLabel}>Pendiente actual</Text>
          <Text style={epStyles.colValue}>{fmt(currentPending)}</Text>
        </View>
        <ArrowRight size={14} color={COLORS.storm} />
        <View style={epStyles.col}>
          <Text style={epStyles.colLabel}>Quedará en</Text>
          <Text style={[epStyles.colValue, { color: diffColor }]}>{fmt(projected)}</Text>
        </View>
      </View>
    </View>
  );
}

const epStyles = StyleSheet.create({
  container: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  headerText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  col: { flex: 1, gap: 2, alignItems: "center" },
  colLabel: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  colValue: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading, color: COLORS.ink },
});
