import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Share2, Eye, Mail, AlertCircle } from "lucide-react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreateObligationMutation,
  useUpdateObligationMutation,
  useCreateObligationShareInviteMutation,
  useObligationActiveShareQuery,
  useWorkspaceSnapshotQuery,
  type ObligationFormInput,
} from "../../services/queries/workspace-data";
import { shouldResendShareInvite } from "../../lib/obligation-share";
import { sortByName } from "../../lib/sort-locale";
import type { ObligationSummary, SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BusinessDateNotice } from "../ui/BusinessDateNotice";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const DIRECTION_OPTIONS = [
  { value: "receivable", label: "Por cobrar", emoji: "↑", color: COLORS.income },
  { value: "payable",    label: "Por pagar",  emoji: "↓", color: COLORS.expense },
];

type OriginOption = {
  value: ObligationFormInput["originType"];
  label: string;
  description: string;
  impactLabel: string;
  impactColor: string;
};

const RECEIVABLE_ORIGINS: OriginOption[] = [
  {
    value: "cash_loan",
    label: "Presté dinero",
    description: "Entregaste efectivo. Sale dinero de tu cuenta al registrar.",
    impactLabel: "💸 Sale dinero al crear",
    impactColor: COLORS.expense,
  },
  {
    value: "sale_financed",
    label: "Vendí a cuotas",
    description: "Vendiste algo a crédito. El dinero llegará después, sin impacto inicial.",
    impactLabel: "⏳ Sin impacto en cuenta",
    impactColor: COLORS.storm,
  },
  {
    value: "manual",
    label: "Manual",
    description: "Define el caso manualmente. Tú decides si hay movimiento de cuenta.",
    impactLabel: "⚙️ Configurable",
    impactColor: COLORS.storm,
  },
];

const PAYABLE_ORIGINS: OriginOption[] = [
  {
    value: "cash_loan",
    label: "Me prestaron dinero",
    description: "Recibiste efectivo. Entra dinero a tu cuenta al registrar.",
    impactLabel: "💰 Entra dinero al crear",
    impactColor: COLORS.income,
  },
  {
    value: "purchase_financed",
    label: "Compré a cuotas",
    description: "Compraste sin pagar al inicio. Sin impacto en tu cuenta ahora.",
    impactLabel: "⏳ Sin impacto en cuenta",
    impactColor: COLORS.storm,
  },
  {
    value: "manual",
    label: "Manual",
    description: "Define el caso manualmente. Tú decides si hay movimiento de cuenta.",
    impactLabel: "⚙️ Configurable",
    impactColor: COLORS.storm,
  },
];

const MANUAL_IMPACT_OPTIONS = [
  { value: "none" as const,    label: "Sin impacto inicial",       desc: "No mueve dinero de ninguna cuenta al crear." },
  { value: "outflow" as const, label: "Sale dinero de mi cuenta",  desc: "Registra una salida desde tu cuenta al inicio." },
  { value: "inflow" as const,  label: "Entra dinero a mi cuenta",  desc: "Registra un ingreso hacia tu cuenta al inicio." },
];

function getAutoOpeningImpact(
  direction: "receivable" | "payable",
  originType: ObligationFormInput["originType"],
  manualImpact: "none" | "inflow" | "outflow",
): "none" | "inflow" | "outflow" {
  if (originType === "cash_loan") return direction === "receivable" ? "outflow" : "inflow";
  if (originType === "sale_financed" || originType === "purchase_financed") return "none";
  return manualImpact;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editObligation?: ObligationSummary;
  onAdjust?: (obligation: ObligationSummary, mode: "increase" | "decrease") => void;
};

export function ObligationForm({ visible, onClose, onSuccess, editObligation, onAdjust }: Props) {
  const router = useRouter();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
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
  const [openingAccountId, setOpeningAccountId] = useState<number | null>(null);
  const [manualImpact, setManualImpact] = useState<"none" | "inflow" | "outflow">("none");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [titleError, setTitleError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [originError, setOriginError] = useState("");
  const [counterpartyError, setCounterpartyError] = useState("");
  const [settlementAccountError, setSettlementAccountError] = useState("");
  const [currencyError, setCurrencyError] = useState("");
  const [startDateError, setStartDateError] = useState("");
  const [submitError, setSubmitError] = useState("");
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
  const principalAmountRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const originSectionYRef = useRef(0);
  const counterpartySectionYRef = useRef(0);
  const settlementSectionYRef = useRef(0);
  const currencySectionYRef = useRef(0);
  const startDateSectionYRef = useRef(0);

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
      setOpeningAccountId(null);
      setManualImpact("none");
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
      setOpeningAccountId(null);
      setManualImpact("none");
      setInstallmentAmount("");
      setInstallmentCount("");
      setInterestRate("");
      setDescription("");
      setNotes("");
    }
    setTitleError("");
    setAmountError("");
    setOriginError("");
    setCounterpartyError("");
    setSettlementAccountError("");
    setCurrencyError("");
    setStartDateError("");
    setSubmitError("");
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
      setSubmitError(humanizeError(err));
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
    setOriginError("");
    setCounterpartyError("");
    setSettlementAccountError("");
    setCurrencyError("");
    setStartDateError("");
    setSubmitError("");
    if (!profile?.id) {
      setSubmitError("Tu sesión expiró. Vuelve a iniciar sesión");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!activeWorkspaceId) {
      setSubmitError("No se encontró el workspace activo");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    let valid = true;
    let firstValidationMessage = "";
    if (!title.trim()) {
      const message = "El título es obligatorio";
      setTitleError(message);
      firstValidationMessage = message;
      valid = false;
    }
    const amount = parseFloat(principalAmount);
    if (!isEditing && (!principalAmount || isNaN(amount) || amount <= 0)) {
      const message = "Ingresa un monto válido";
      setAmountError(message);
      if (!firstValidationMessage) firstValidationMessage = message;
      valid = false;
    }
    if (!isEditing && !currencyCode.trim()) {
      const message = "Selecciona una moneda";
      setCurrencyError(message);
      if (!firstValidationMessage) firstValidationMessage = message;
      valid = false;
    }
    if (!isEditing && !startDate.trim()) {
      const message = "Selecciona una fecha válida";
      setStartDateError(message);
      if (!firstValidationMessage) firstValidationMessage = message;
      valid = false;
    }
    if (counterpartyId == null) {
      const message =
        counterpartiesSorted.length === 0
          ? "Primero crea un contacto en el módulo Contactos"
          : "Selecciona un contacto";
      setCounterpartyError(message);
      if (!firstValidationMessage) firstValidationMessage = message;
      valid = false;
    }
    if (!valid) {
      haptics.error();
      setSubmitError(firstValidationMessage || "Revisa los campos marcados en rojo");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (!title.trim()) {
          titleRef.current?.focus();
        } else if (!isEditing && (!principalAmount || isNaN(amount) || amount <= 0)) {
          principalAmountRef.current?.focus();
        } else if (counterpartyId == null) {
          scrollRef.current?.scrollTo({ y: Math.max(0, counterpartySectionYRef.current - 24), animated: true });
        } else if (!isEditing && !originType.trim()) {
          scrollRef.current?.scrollTo({ y: Math.max(0, originSectionYRef.current - 24), animated: true });
        } else if (!isEditing && !currencyCode.trim()) {
          scrollRef.current?.scrollTo({ y: Math.max(0, currencySectionYRef.current - 24), animated: true });
        } else if (!isEditing && !startDate.trim()) {
          scrollRef.current?.scrollTo({ y: Math.max(0, startDateSectionYRef.current - 24), animated: true });
        }
      }, 350);
      return;
    }

    if (isEditing && sharedViewer) {
      setSubmitError("Solo lectura: no puedes guardar cambios.");
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
        const resolvedImpact = getAutoOpeningImpact(direction, originType, manualImpact);
        const created = await createMutation.mutateAsync({
          userId: profile?.id ?? "",
          title: title.trim(),
          direction,
          originType,
          openingImpact: resolvedImpact,
          openingAccountId: resolvedImpact !== "none" ? openingAccountId : null,
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
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      const friendly = humanizeError(err);
      if (friendly === "Selecciona cómo nació esta obligación") {
        setOriginError(friendly);
        scrollRef.current?.scrollTo({ y: Math.max(0, originSectionYRef.current - 24), animated: true });
      } else if (friendly === "Selecciona un contacto") {
        setCounterpartyError(friendly);
        scrollRef.current?.scrollTo({ y: Math.max(0, counterpartySectionYRef.current - 24), animated: true });
      } else if (friendly === "Selecciona una cuenta de liquidación") {
        setSettlementAccountError(friendly);
        scrollRef.current?.scrollTo({ y: Math.max(0, settlementSectionYRef.current - 24), animated: true });
      } else if (friendly === "Selecciona una moneda") {
        setCurrencyError(friendly);
        scrollRef.current?.scrollTo({ y: Math.max(0, currencySectionYRef.current - 24), animated: true });
      } else if (friendly === "Selecciona una fecha válida") {
        setStartDateError(friendly);
        scrollRef.current?.scrollTo({ y: Math.max(0, startDateSectionYRef.current - 24), animated: true });
      } else if (friendly === "El título es obligatorio") {
        setTitleError(friendly);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        setTimeout(() => titleRef.current?.focus(), 250);
      } else if (friendly === "Ingresa un monto válido") {
        setAmountError(friendly);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        setTimeout(() => principalAmountRef.current?.focus(), 250);
      } else {
        setSubmitError(friendly);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }
  }

  const counterparties = snapshot?.counterparties ?? [];
  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const counterpartiesSorted = useMemo(() => sortByName(counterparties), [counterparties]);
  const activeAccountsSorted = useMemo(() => sortByName(activeAccounts), [activeAccounts]);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const originOptions = direction === "receivable" ? RECEIVABLE_ORIGINS : PAYABLE_ORIGINS;
  const openingImpact = getAutoOpeningImpact(direction, originType, manualImpact);
  const selectedOrigin = originOptions.find((o) => o.value === originType) ?? originOptions[0];

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar obligación" : "Nueva obligación"}
        snapHeight={0.95}
        scrollRef={scrollRef}
      >
      {submitError ? (
        <View style={styles.submitErrorBanner}>
          <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

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
        <View style={styles.originSection} onLayout={(event) => { originSectionYRef.current = event.nativeEvent.layout.y; }}>
          <Text style={styles.label}>¿Cómo nació esta {direction === "receivable" ? "cuenta por cobrar" : "deuda"}?</Text>
          <View style={[styles.originList, originError ? styles.sectionErrorWrap : null]}>
            {originOptions.map((opt) => {
              const isSelected = originType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.originCard, isSelected && styles.originCardSelected]}
                  onPress={() => { setOriginType(opt.value); setOpeningAccountId(null); setManualImpact("none"); setOriginError(""); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.originCardHeader}>
                    <Text style={[styles.originCardLabel, isSelected && styles.originCardLabelSelected]}>
                      {opt.label}
                    </Text>
                    {isSelected ? (
                      <View style={styles.originCheckDot} />
                    ) : null}
                  </View>
                  <Text style={styles.originCardDesc}>{opt.description}</Text>
                  <View style={[styles.originImpactBadge, { borderColor: opt.impactColor + "55" }]}>
                    <Text style={[styles.originImpactText, { color: opt.impactColor }]}>{opt.impactLabel}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {originError ? <Text style={styles.fieldError}>{originError}</Text> : null}

          {/* Manual: impact selector */}
          {originType === "manual" ? (
            <View style={styles.manualImpactSection}>
              <Text style={styles.label}>Impacto inicial en cuenta</Text>
              {MANUAL_IMPACT_OPTIONS.map((opt) => {
                const isSel = manualImpact === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.manualImpactRow, isSel && styles.manualImpactRowSelected]}
                    onPress={() => { setManualImpact(opt.value); setOpeningAccountId(null); }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.manualImpactRadio}>
                      {isSel ? <View style={styles.manualImpactRadioInner} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.manualImpactLabel, isSel && styles.manualImpactLabelSelected]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.manualImpactDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {/* Opening account — when cash moves */}
          {openingImpact !== "none" && activeAccounts.length > 0 ? (
            <View style={styles.openingAccountSection}>
              <Text style={styles.label}>
                {openingImpact === "outflow" ? "Cuenta desde donde salió el dinero" : "Cuenta donde entró el dinero"}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[styles.pill, openingAccountId === null && styles.pillActive]}
                    onPress={() => setOpeningAccountId(null)}
                  >
                    <Text style={[styles.pillText, openingAccountId === null && styles.pillTextActive]}>Sin cuenta</Text>
                  </TouchableOpacity>
                  {activeAccountsSorted.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.pill, openingAccountId === acc.id && styles.pillActive]}
                      onPress={() => setOpeningAccountId(acc.id)}
                    >
                      <Text style={[styles.pillText, openingAccountId === acc.id && styles.pillTextActive]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Currency — solo en creación */}
      {!isEditing ? (
        <View onLayout={(event) => { currencySectionYRef.current = event.nativeEvent.layout.y; }}>
          <Text style={styles.label}>Moneda</Text>
          <View style={currencyError ? styles.sectionErrorWrap : null}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {POPULAR_CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pill, currencyCode === c && styles.pillActive]}
                    onPress={() => { setCurrencyCode(c); setCurrencyError(""); }}
                  >
                    <Text style={[styles.pillText, currencyCode === c && styles.pillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
          {currencyError ? <Text style={styles.fieldError}>{currencyError}</Text> : null}
        </View>
      ) : null}

      {/* Principal amount — solo en creación */}
      {!isEditing ? (
        <CurrencyInput
          ref={principalAmountRef}
          label="Monto principal *"
          value={principalAmount}
          onChangeText={(t) => { setPrincipalAmount(t); setAmountError(""); }}
          currencyCode={currencyCode}
          error={amountError}
        />
      ) : null}

      {/* Counterparty */}
      <View onLayout={(event) => { counterpartySectionYRef.current = event.nativeEvent.layout.y; }}>
        <Text style={styles.label}>Contacto *</Text>
        <View style={counterpartyError ? styles.sectionErrorWrap : null}>
          {counterpartiesSorted.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {counterpartiesSorted.map((cp) => (
                  <TouchableOpacity
                    key={cp.id}
                    style={[styles.pill, counterpartyId === cp.id && styles.pillActive]}
                    onPress={() => { setCounterpartyId(cp.id); setCounterpartyError(""); }}
                  >
                    <Text style={[styles.pillText, counterpartyId === cp.id && styles.pillTextActive]}>
                      {cp.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyRequirementBox}>
              <Text style={styles.emptyRequirementTitle}>No tienes contactos creados</Text>
              <Text style={styles.emptyRequirementText}>
                Necesitas crear al menos un contacto en el módulo Contactos antes de guardar esta obligación.
              </Text>
              <Button
                label="Ir a Contactos"
                variant="secondary"
                size="sm"
                style={styles.emptyRequirementButton}
                onPress={() => {
                  onClose();
                  router.push("/contacts");
                }}
              />
            </View>
          )}
        </View>
        {counterpartyError ? <Text style={styles.fieldError}>{counterpartyError}</Text> : null}
      </View>

      {/* Settlement account */}
      {activeAccounts.length > 0 ? (
        <View onLayout={(event) => { settlementSectionYRef.current = event.nativeEvent.layout.y; }}>
          <Text style={styles.label}>Cuenta de liquidación</Text>
          <View style={settlementAccountError ? styles.sectionErrorWrap : null}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                <TouchableOpacity
                  style={[styles.pill, settlementAccountId === null && styles.pillActive]}
                  onPress={() => { setSettlementAccountId(null); setSettlementAccountError(""); }}
                >
                  <Text style={[styles.pillText, settlementAccountId === null && styles.pillTextActive]}>Ninguna</Text>
                </TouchableOpacity>
                {activeAccountsSorted.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.pill, settlementAccountId === acc.id && styles.pillActive]}
                    onPress={() => { setSettlementAccountId(acc.id); setSettlementAccountError(""); }}
                  >
                    <Text style={[styles.pillText, settlementAccountId === acc.id && styles.pillTextActive]}>
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
          {settlementAccountError ? <Text style={styles.fieldError}>{settlementAccountError}</Text> : null}
        </View>
      ) : null}

      {/* Dates */}
      {!isEditing ? (
        <View onLayout={(event) => { startDateSectionYRef.current = event.nativeEvent.layout.y; }}>
          <View style={startDateError ? styles.sectionErrorWrap : null}>
            <DatePickerInput
              label="Fecha de inicio"
              value={startDate}
              onChange={(value) => { setStartDate(value); setStartDateError(""); }}
            />
          </View>
          {startDateError ? <Text style={styles.fieldError}>{startDateError}</Text> : null}
        </View>
      ) : null}

      <DatePickerInput
        label="Fecha de vencimiento (opcional)"
        value={dueDate}
        onChange={setDueDate}
        optional
      />
      <BusinessDateNotice dateValue={dueDate} onApplySuggestedDate={setDueDate} />

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
  sectionErrorWrap: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
  },
  emptyRequirementBox: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warning + "14",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
  },
  emptyRequirementTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  emptyRequirementText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 20,
  },
  emptyRequirementButton: {
    alignSelf: "flex-start",
  },
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
  // ── Origin type section ──────────────────────────────────────────────────
  originSection: { gap: SPACING.sm },
  originList: { gap: SPACING.sm },
  originCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    gap: SPACING.xs,
  },
  originCardSelected: {
    borderColor: COLORS.pine,
    backgroundColor: COLORS.pine + "18",
  },
  originCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  originCardLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  originCardLabelSelected: { color: COLORS.ink },
  originCheckDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.pine,
  },
  originCardDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  originImpactBadge: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  originImpactText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
  },
  // ── Manual impact ────────────────────────────────────────────────────────
  manualImpactSection: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  manualImpactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  manualImpactRowSelected: {
    borderColor: COLORS.pine + "55",
    backgroundColor: COLORS.pine + "10",
  },
  manualImpactRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.storm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  manualImpactRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.pine,
  },
  manualImpactLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  manualImpactLabelSelected: { color: COLORS.ink },
  manualImpactDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 16,
    marginTop: 2,
  },
  // ── Opening account ──────────────────────────────────────────────────────
  openingAccountSection: { gap: SPACING.xs },
});
