import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Share2, Eye, Mail } from "lucide-react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateObligationMutation,
  useUpdateObligationMutation,
  useCreateObligationShareInviteMutation,
  useObligationActiveShareQuery,
  useWorkspaceSnapshotQuery,
  type ObligationFormInput,
} from "../../services/queries/workspace-data";
import { shouldResendShareInvite } from "../../lib/obligation-share";
import { sortByLabel, sortByName } from "../../lib/sort-locale";
import type { ObligationSummary, SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const DIRECTION_OPTIONS = [
  { value: "receivable", label: "Por cobrar", emoji: "↑", color: COLORS.income },
  { value: "payable",    label: "Por pagar",  emoji: "↓", color: COLORS.expense },
];

const ORIGIN_OPTIONS = sortByLabel([
  { value: "cash_loan", label: "Préstamo en efectivo" },
  { value: "sale_financed", label: "Venta financiada" },
  { value: "purchase_financed", label: "Compra financiada" },
  { value: "manual", label: "Manual" },
]);

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editObligation?: ObligationSummary;
  onAdjust?: (obligation: ObligationSummary, mode: "increase" | "decrease") => void;
};

export function ObligationForm({ visible, onClose, onSuccess, editObligation, onAdjust }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const createMutation = useCreateObligationMutation(activeWorkspaceId);
  const updateMutation = useUpdateObligationMutation(activeWorkspaceId);
  const shareMutation = useCreateObligationShareInviteMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: activeShare, isLoading: shareLoading } = useObligationActiveShareQuery(
    activeWorkspaceId,
    editObligation?.id ?? null,
  );

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");

  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">("payable");
  const [originType, setOriginType] = useState<ObligationFormInput["originType"]>("manual");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [principalAmount, setPrincipalAmount] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [settlementAccountId, setSettlementAccountId] = useState<number | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [titleError, setTitleError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [reassignExpanded, setReassignExpanded] = useState(false);

  const isEditing = Boolean(editObligation);

  const sharedViewer =
    editObligation && "viewerMode" in editObligation && (editObligation as SharedObligationSummary).viewerMode === "shared_viewer"
      ? (editObligation as SharedObligationSummary)
      : null;

  function isOwnerObligation(ob: ObligationSummary): ob is Exclude<ObligationSummary, SharedObligationSummary> {
    return !("viewerMode" in ob && (ob as SharedObligationSummary).viewerMode === "shared_viewer");
  }

  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    if (editObligation) {
      setTitle(editObligation.title);
      setDirection(editObligation.direction);
      setOriginType(editObligation.originType);
      setCurrencyCode(editObligation.currencyCode);
      setPrincipalAmount(String(editObligation.principalAmount));
      setStartDate(editObligation.startDate);
      setDueDate(editObligation.dueDate ?? "");
      setCounterpartyId(editObligation.counterpartyId ?? null);
      setSettlementAccountId(editObligation.settlementAccountId ?? null);
      setInstallmentAmount(editObligation.installmentAmount ? String(editObligation.installmentAmount) : "");
      setInstallmentCount(editObligation.installmentCount ? String(editObligation.installmentCount) : "");
      setInterestRate(editObligation.interestRate ? String(editObligation.interestRate) : "");
      setDescription(editObligation.description ?? "");
      setNotes(editObligation.notes ?? "");
    } else {
      setTitle("");
      setDirection("payable");
      setOriginType("manual");
      setCurrencyCode(defaultCurrency);
      setPrincipalAmount("");
      setStartDate(today);
      setDueDate("");
      setCounterpartyId(null);
      setSettlementAccountId(null);
      setInstallmentAmount("");
      setInstallmentCount("");
      setInterestRate("");
      setDescription("");
      setNotes("");
    }
    setTitleError("");
    setAmountError("");
    setShareEmail("");
    setShareMessage("");
    setReassignExpanded(false);
  }, [visible, editObligation, defaultCurrency, today]);

  const activeShareSyncKey = activeShare
    ? `${activeShare.id}-${activeShare.status}-${activeShare.invitedEmail}-${(activeShare.message ?? "").slice(0, 80)}`
    : "none";

  useEffect(() => {
    if (!visible || !editObligation || !isOwnerObligation(editObligation)) return;
    if (shareLoading) return;
    setShareEmail(activeShare?.invitedEmail ?? "");
    setShareMessage(activeShare?.message ?? "");
    setReassignExpanded(activeShare?.status !== "accepted");
  }, [visible, editObligation?.id, shareLoading, activeShareSyncKey]);

  /** Diálogo “Compartir”: siempre envía si hay correo (como en web). */
  async function handleShareInvite() {
    if (!shareEmail.trim() || !activeWorkspaceId) return;
    const obligationId = editObligation?.id;
    if (!obligationId || !isOwnerObligation(editObligation!)) return;
    try {
      const result = await shareMutation.mutateAsync({
        workspaceId: activeWorkspaceId,
        obligationId,
        invitedEmail: shareEmail.trim().toLowerCase(),
        message: shareMessage.trim() || null,
      });
      showToast(
        result.emailSent
          ? `Invitación enviada a ${result.invitedEmail}`
          : "Invitación registrada",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  function handleClose() {
    const isDirty = isEditing
      ? (title !== (editObligation?.title ?? "") ||
         counterpartyId !== (editObligation?.counterpartyId ?? null) ||
         settlementAccountId !== (editObligation?.settlementAccountId ?? null) ||
         dueDate !== (editObligation?.dueDate ?? "") ||
         installmentAmount !== (editObligation?.installmentAmount ? String(editObligation.installmentAmount) : "") ||
         installmentCount !== (editObligation?.installmentCount ? String(editObligation.installmentCount) : "") ||
         interestRate !== (editObligation?.interestRate ? String(editObligation.interestRate) : "") ||
         description !== (editObligation?.description ?? "") ||
         notes !== (editObligation?.notes ?? "") ||
         shareEmail.trim() !== (activeShare?.invitedEmail ?? "").trim() ||
         shareMessage.trim() !== (activeShare?.message ?? "").trim())
      : Boolean(title.trim() || principalAmount || shareEmail.trim() || shareMessage.trim());
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setTitleError("");
    setAmountError("");
    let valid = true;
    if (!title.trim()) { setTitleError("El título es obligatorio"); valid = false; }
    const amount = parseFloat(principalAmount);
    if (!isEditing && (!principalAmount || isNaN(amount) || amount <= 0)) {
      setAmountError("Ingresa un monto válido"); valid = false;
    }
    if (!valid) {
      if (!title.trim()) titleRef.current?.focus();
      return;
    }

    if (isEditing && sharedViewer) {
      showToast("Solo lectura: no puedes guardar cambios.", "error");
      return;
    }

    try {
      if (isEditing && editObligation) {
        await updateMutation.mutateAsync({
          id: editObligation.id,
          input: {
            title: title.trim(),
            counterpartyId,
            settlementAccountId,
            dueDate: dueDate || null,
            installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
            installmentCount: installmentCount ? parseInt(installmentCount) : null,
            interestRate: interestRate ? parseFloat(interestRate) : null,
            description: description.trim() || null,
            notes: notes.trim() || null,
          },
        });
        const inviteForm = { invitedEmail: shareEmail, message: shareMessage };
        let successMsg = "Obligación actualizada";
        if (isOwnerObligation(editObligation) && shouldResendShareInvite(activeShare ?? null, inviteForm)) {
          const r = await shareMutation.mutateAsync({
            workspaceId: activeWorkspaceId!,
            obligationId: editObligation.id,
            invitedEmail: shareEmail.trim().toLowerCase(),
            message: shareMessage.trim() || null,
          });
          successMsg = r.emailSent
            ? `Obligación actualizada. Invitación enviada a ${r.invitedEmail}.`
            : "Obligación actualizada. Invitación registrada.";
        } else if (
          activeShare?.status === "accepted" &&
          shareEmail.trim().toLowerCase() === activeShare.invitedEmail.toLowerCase()
        ) {
          successMsg = "Obligación actualizada. La persona asociada se mantuvo sin cambios.";
        }
        showToast(successMsg, "success");
      } else {
        const created = await createMutation.mutateAsync({
          title: title.trim(),
          direction,
          originType,
          currencyCode,
          principalAmount: amount,
          startDate,
          dueDate: dueDate || null,
          counterpartyId,
          settlementAccountId,
          installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
          installmentCount: installmentCount ? parseInt(installmentCount) : null,
          interestRate: interestRate ? parseFloat(interestRate) : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
        });
        if (shareEmail.trim() && activeWorkspaceId) {
          const r = await shareMutation.mutateAsync({
            workspaceId: activeWorkspaceId,
            obligationId: created.id,
            invitedEmail: shareEmail.trim().toLowerCase(),
            message: shareMessage.trim() || null,
          });
          showToast(
            r.emailSent
              ? `Obligación creada. Invitación enviada a ${r.invitedEmail}.`
              : "Obligación creada. Invitación registrada.",
            "success",
          );
        } else {
          showToast("Obligación creada", "success");
        }
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const counterparties = snapshot?.counterparties ?? [];
  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const counterpartiesSorted = useMemo(() => sortByName(counterparties), [counterparties]);
  const activeAccountsSorted = useMemo(() => sortByName(activeAccounts), [activeAccounts]);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar obligación" : "Nueva obligación"}
        snapHeight={0.95}
      >
      {sharedViewer ? (
        <View style={styles.viewerBanner}>
          <Eye size={18} color={COLORS.pine} strokeWidth={2} />
          <Text style={styles.viewerBannerText}>
            Compartido contigo
            {sharedViewer.share.ownerDisplayName
              ? ` por ${sharedViewer.share.ownerDisplayName}`
              : ""}
            {" · "}
            solo lectura. No puedes enviar invitaciones.
          </Text>
        </View>
      ) : null}

      {/* Title */}
      <View>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          ref={titleRef}
          style={[styles.textInput, titleError ? styles.inputError : null]}
          value={title}
          onChangeText={(t) => { setTitle(t); setTitleError(""); }}
          placeholder="Ej. Préstamo a Juan, Deuda tarjeta"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()}
        />
        {titleError ? <Text style={styles.fieldError}>{titleError}</Text> : null}
      </View>

      {/* Direction — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Dirección</Text>
          <View style={styles.directionRow}>
            {DIRECTION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.directionBtn,
                  direction === opt.value && { borderColor: opt.color, backgroundColor: opt.color + "22" },
                ]}
                onPress={() => setDirection(opt.value as "receivable" | "payable")}
              >
                <Text style={[styles.directionEmoji, { color: opt.color }]}>{opt.emoji}</Text>
                <Text style={[styles.directionLabel, direction === opt.value && { color: opt.color }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Origin type — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Tipo de origen</Text>
          <View style={styles.pillWrap}>
            {ORIGIN_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, originType === opt.value && styles.pillActive]}
                onPress={() => setOriginType(opt.value as ObligationFormInput["originType"])}
              >
                <Text style={[styles.pillText, originType === opt.value && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Currency — solo en creación */}
      {!isEditing ? (
        <View>
          <Text style={styles.label}>Moneda</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {POPULAR_CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, currencyCode === c && styles.pillActive]}
                  onPress={() => setCurrencyCode(c)}
                >
                  <Text style={[styles.pillText, currencyCode === c && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Principal amount — solo en creación */}
      {!isEditing ? (
        <CurrencyInput
          label="Monto principal *"
          value={principalAmount}
          onChangeText={(t) => { setPrincipalAmount(t); setAmountError(""); }}
          currencyCode={currencyCode}
          error={amountError}
        />
      ) : null}

      {/* Counterparty */}
      {counterparties.length > 0 ? (
        <View>
          <Text style={styles.label}>Contacto</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, counterpartyId === null && styles.pillActive]}
                onPress={() => setCounterpartyId(null)}
              >
                <Text style={[styles.pillText, counterpartyId === null && styles.pillTextActive]}>Ninguno</Text>
              </TouchableOpacity>
              {counterpartiesSorted.map((cp) => (
                <TouchableOpacity
                  key={cp.id}
                  style={[styles.pill, counterpartyId === cp.id && styles.pillActive]}
                  onPress={() => setCounterpartyId(cp.id)}
                >
                  <Text style={[styles.pillText, counterpartyId === cp.id && styles.pillTextActive]}>
                    {cp.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Settlement account */}
      {activeAccounts.length > 0 ? (
        <View>
          <Text style={styles.label}>Cuenta de liquidación</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, settlementAccountId === null && styles.pillActive]}
                onPress={() => setSettlementAccountId(null)}
              >
                <Text style={[styles.pillText, settlementAccountId === null && styles.pillTextActive]}>Ninguna</Text>
              </TouchableOpacity>
              {activeAccountsSorted.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.pill, settlementAccountId === acc.id && styles.pillActive]}
                  onPress={() => setSettlementAccountId(acc.id)}
                >
                  <Text style={[styles.pillText, settlementAccountId === acc.id && styles.pillTextActive]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Dates */}
      {!isEditing ? (
        <DatePickerInput
          label="Fecha de inicio"
          value={startDate}
          onChange={setStartDate}
        />
      ) : null}

      <DatePickerInput
        label="Fecha de vencimiento (opcional)"
        value={dueDate}
        onChange={setDueDate}
        optional
      />

      {/* Installments */}
      <View style={styles.twoCol}>
        <View style={styles.colHalf}>
          <Text style={styles.label}>Cuota</Text>
          <TextInput
            style={styles.textInput}
            value={installmentAmount}
            onChangeText={setInstallmentAmount}
            placeholder="0.00"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.colHalf}>
          <Text style={styles.label}># Cuotas</Text>
          <TextInput
            style={styles.textInput}
            value={installmentCount}
            onChangeText={setInstallmentCount}
            placeholder="0"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
        </View>
      </View>

      {/* Interest rate */}
      <View>
        <Text style={styles.label}>Tasa de interés % (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={interestRate}
          onChangeText={setInterestRate}
          placeholder="0.00"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Description */}
      <View>
        <Text style={styles.label}>Descripción (opcional)</Text>
        <TextInput
          ref={descriptionRef}
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Descripción breve"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => notesRef.current?.focus()}
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          ref={notesRef}
          style={[styles.textInput, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Observaciones adicionales"
          placeholderTextColor={COLORS.textDisabled}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          returnKeyType="done"
          blurOnSubmit
        />
      </View>

      {/* Compartir al crear (opcional) — se envía al guardar si hay correo */}
      {!isEditing ? (
        <View style={styles.shareSection}>
          <View style={styles.shareTitleRow}>
            <Mail size={16} color={COLORS.storm} strokeWidth={2} />
            <Text style={styles.shareTitle}>Invitar por correo (opcional)</Text>
          </View>
          <Text style={styles.shareHint}>
            Si completas el correo, al crear la obligación se enviará la invitación automáticamente.
          </Text>
          <Input
            label="Email del destinatario"
            value={shareEmail}
            onChangeText={setShareEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="correo@ejemplo.com"
          />
          <Input
            label="Mensaje (opcional)"
            value={shareMessage}
            onChangeText={setShareMessage}
            placeholder="Texto que verá el invitado en el correo"
            multiline
            numberOfLines={3}
            style={styles.shareMessageInput}
          />
        </View>
      ) : null}

      {/* Compartir — edición, solo dueño */}
      {isEditing && editObligation && isOwnerObligation(editObligation) ? (
        <View style={styles.shareSection}>
          <View style={styles.shareTitleRow}>
            <Share2 size={16} color={COLORS.income} strokeWidth={2} />
            <Text style={styles.shareTitle}>Compartir</Text>
          </View>
          {shareLoading ? (
            <Text style={styles.shareHint}>Cargando estado de compartición…</Text>
          ) : activeShare?.status === "accepted" ? (
            <>
              <View style={styles.shareStatusBadge}>
                <Text style={styles.shareStatusBadgeText}>
                  Ya compartido con{" "}
                  {activeShare.invitedDisplayName || activeShare.invitedEmail}
                </Text>
              </View>
              {!reassignExpanded ? (
                <TouchableOpacity
                  style={styles.reassignBtn}
                  onPress={() => setReassignExpanded(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.reassignBtnText}>Reasignar / cambiar correo</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.shareHint}>
                    Un solo acceso activo a la vez. Enviar con otro correo reasigna al nuevo destinatario.
                  </Text>
                  <Input
                    label="Email del destinatario"
                    value={shareEmail}
                    onChangeText={setShareEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="correo@ejemplo.com"
                  />
                  <Input
                    label="Mensaje (opcional)"
                    value={shareMessage}
                    onChangeText={setShareMessage}
                    placeholder="Mensaje para el invitado"
                    multiline
                    numberOfLines={3}
                    style={styles.shareMessageInput}
                  />
                  <Button
                    label="Enviar invitación"
                    variant="secondary"
                    onPress={handleShareInvite}
                    loading={shareMutation.isPending}
                    disabled={!shareEmail.trim()}
                    style={styles.shareBtn}
                  />
                </>
              )}
            </>
          ) : activeShare?.status === "pending" ? (
            <>
              <View style={[styles.shareStatusBadge, styles.shareStatusPending]}>
                <Text style={styles.shareStatusBadgeText}>
                  Invitación pendiente para {activeShare.invitedEmail}
                </Text>
              </View>
              <Text style={styles.shareHint}>
                Cambia el correo para reasignar. El botón envía siempre que haya correo (como el diálogo Compartir en web).
              </Text>
              <Input
                label="Email"
                value={shareEmail}
                onChangeText={setShareEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="correo@ejemplo.com"
              />
              <Input
                label="Mensaje (opcional)"
                value={shareMessage}
                onChangeText={setShareMessage}
                placeholder="Actualizar mensaje y reenviar"
                multiline
                numberOfLines={3}
                style={styles.shareMessageInput}
              />
              <Button
                label="Reenviar invitación"
                variant="secondary"
                onPress={handleShareInvite}
                loading={shareMutation.isPending}
                disabled={!shareEmail.trim()}
                style={styles.shareBtn}
              />
            </>
          ) : (
            <>
              <Text style={styles.shareHint}>
                Invita por correo para acceso en solo lectura (&quot;Compartida contigo&quot;). Al guardar con correo
                nuevo también se envía (misma lógica que la web).
              </Text>
              <Input
                label="Email del destinatario"
                value={shareEmail}
                onChangeText={setShareEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="correo@ejemplo.com"
              />
              <Input
                label="Mensaje (opcional)"
                value={shareMessage}
                onChangeText={setShareMessage}
                placeholder="Mensaje para el invitado"
                multiline
                numberOfLines={3}
                style={styles.shareMessageInput}
              />
              <Button
                label="Enviar invitación"
                variant="secondary"
                onPress={handleShareInvite}
                loading={shareMutation.isPending}
                disabled={!shareEmail.trim()}
                style={styles.shareBtn}
              />
            </>
          )}
        </View>
      ) : null}

      <Button
        label={
          sharedViewer
            ? "Solo lectura"
            : isEditing
              ? "Guardar cambios"
              : "Crear obligación"
        }
        onPress={handleSubmit}
        loading={isLoading || shareMutation.isPending}
        disabled={Boolean(sharedViewer)}
        style={styles.submitBtn}
      />

      {/* Principal adjustment — solo dueño */}
      {isEditing && onAdjust && editObligation && isOwnerObligation(editObligation) ? (
        <View style={styles.adjustRow}>
          <TouchableOpacity
            style={[styles.adjustBtn, styles.adjustBtnIncrease]}
            onPress={() => { onClose(); onAdjust(editObligation, "increase"); }}
          >
            <TrendingUp size={14} color={COLORS.income} strokeWidth={2} />
            <Text style={[styles.adjustBtnText, { color: COLORS.income }]}>Agregar monto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.adjustBtn, styles.adjustBtnDecrease]}
            onPress={() => { onClose(); onAdjust(editObligation, "decrease"); }}
          >
            <TrendingDown size={14} color={COLORS.expense} strokeWidth={2} />
            <Text style={[styles.adjustBtnText, { color: COLORS.expense }]}>Reducir monto</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </BottomSheet>

    <ConfirmDialog
      visible={showDiscard}
      title="¿Descartar cambios?"
      body="Se perderán los datos ingresados."
      confirmLabel="Descartar"
      cancelLabel="Continuar"
      onCancel={() => setShowDiscard(false)}
      onConfirm={() => { setShowDiscard(false); onClose(); }}
    />
  </>
  );
}

const styles = StyleSheet.create({
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
  textArea: { minHeight: 72 },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  directionRow: { flexDirection: "row", gap: SPACING.md },
  directionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
  },
  directionEmoji: { fontSize: FONT_SIZE.xl },
  directionLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.storm },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
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
  twoCol: { flexDirection: "row", gap: SPACING.md },
  colHalf: { flex: 1 },
  submitBtn: { marginTop: SPACING.sm },
  shareSection: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderLeftColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.06)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    gap: SPACING.sm,
  },
  shareTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  shareTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  shareHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  shareBtn: { marginTop: 0 },
  viewerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.pine + "22",
    borderWidth: 1,
    borderColor: COLORS.pine + "44",
  },
  viewerBannerText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 20,
  },
  shareStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.income + "22",
    borderWidth: 1,
    borderColor: COLORS.income + "44",
  },
  shareStatusPending: {
    backgroundColor: COLORS.storm + "18",
    borderColor: GLASS.cardBorder,
  },
  shareStatusBadgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  reassignBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    alignSelf: "flex-start",
  },
  reassignBtnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.pine,
  },
  shareMessageInput: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: SPACING.sm,
  },
  adjustRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.xs },
  adjustBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    backgroundColor: GLASS.card,
  },
  adjustBtnIncrease: { borderColor: COLORS.income + "44" },
  adjustBtnDecrease: { borderColor: COLORS.expense + "44" },
  adjustBtnText: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium },
});
