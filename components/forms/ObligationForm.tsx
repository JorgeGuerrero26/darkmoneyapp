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
import { es } from "date-fns/locale";
import { parseDisplayDate } from "../../lib/date";
import { formatCurrency } from "../ui/AmountDisplay";
import { Share2, Eye, AlertCircle } from "lucide-react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { newClientDedupeKey } from "../../lib/idempotency";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useCreateObligationMutation,
  useUpdateObligationMutation,
  useCreateObligationShareInviteMutation,
  useUnlinkObligationShareMutation,
  useObligationActiveShareQuery,
  type ObligationFormInput,
} from "../../services/queries/obligations";
import { shouldResendShareInvite } from "../../lib/obligation-share";
import { sortByName } from "../../lib/sort-locale";
import type { ObligationSummary, SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { FormOptionRow } from "../ui/FormOptionRow";
import { ObligationCreatedSheet } from "../../features/obligations/components/ObligationCreatedSheet";
import { ObligationDetailsSheet } from "../../features/obligations/components/ObligationDetailsSheet";
import { PaymentPlanSheet } from "../../features/obligations/components/PaymentPlanSheet";
import {
  describePlan,
  expandPaymentPlan,
  normalizePaymentPlan,
  parsePaymentPlan,
  type PaymentPlan,
} from "../../features/obligations/lib/payment-plan";
import { currencyPluralTitle } from "../../constants/currencies";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { CurrencySelectOverlay } from "./CurrencySelectOverlay";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BusinessDateNotice } from "../ui/BusinessDateNotice";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";


/**
 * "Por cobrar" y "por pagar" son términos de contabilidad: describen la deuda, no la relación.
 * Quien registra que le prestó S/ 200 a un amigo piensa "me deben".
 */
const DIRECTION_OPTIONS = [
  { value: "receivable", label: "Me deben" },
  { value: "payable",    label: "Yo debo" },
];

type OriginOption = {
  value: ObligationFormInput["originType"];
  label: string;
  /** La consecuencia en la cuenta, dicha en el propio subtítulo. */
  description: string;
  impact: "none" | "inflow" | "outflow";
};

/**
 * Los tres impactos posibles **son** los tres orígenes: entra dinero, sale dinero, o no se mueve
 * nada. Por eso no hay una segunda pregunta de "impacto inicial en cuenta" — el formulario la
 * hacía dos veces y dejaba contestar distinto en cada una.
 *
 * Y por eso tampoco hay "Manual": no describía un caso, era un permiso para contestar esa otra
 * pregunta. Su propio subtítulo lo admitía ("Tú decides si hay movimiento de cuenta").
 */
const RECEIVABLE_ORIGINS: OriginOption[] = [
  {
    value: "cash_loan",
    label: "Presté dinero",
    description: "Sale dinero de tu cuenta al crearla.",
    impact: "outflow",
  },
  {
    value: "sale_financed",
    label: "Vendí a cuotas",
    description: "No mueve dinero de tus cuentas al crearla.",
    impact: "none",
  },
];

const PAYABLE_ORIGINS: OriginOption[] = [
  {
    value: "cash_loan",
    label: "Me prestaron dinero",
    description: "Entra dinero a tu cuenta al crearla.",
    impact: "inflow",
  },
  {
    value: "purchase_financed",
    label: "Compré a cuotas",
    description: "No mueve dinero de tus cuentas al crearla.",
    impact: "none",
  },
  {
    value: "paid_for_other",
    label: "Pagué por alguien",
    description: "Sale dinero de tu cuenta al crearla.",
    impact: "outflow",
  },
];

/** Etiqueta de un origen que ya no se ofrece, para las obligaciones que lo tienen guardado. */
const LEGACY_ORIGIN_LABELS: Record<string, string> = { manual: "Manual" };

/**
 * El impacto lo decide el origen, y solo el origen.
 *
 * Las obligaciones viejas con origen `manual` no llevan impacto determinado: se quedan sin
 * movimiento de apertura, que es lo que hacía el valor por defecto de aquel bloque de radios.
 */
function getAutoOpeningImpact(
  direction: "receivable" | "payable",
  originType: ObligationFormInput["originType"],
): "none" | "inflow" | "outflow" {
  const options = direction === "receivable" ? RECEIVABLE_ORIGINS : PAYABLE_ORIGINS;
  return options.find((option) => option.value === originType)?.impact ?? "none";
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
  const unlinkShareMutation = useUnlinkObligationShareMutation(activeWorkspaceId);
  // Guard anti-doble-tap: sin esto, tocar "Crear" varias veces (cuando la red tarda)
  // dispara múltiples mutateAsync y crea obligaciones duplicadas. Igual que MovementForm.
  const submittingRef = useRef(false);
  // Idempotencia: clave por intento de submit. Persiste en reintentos (mismo intento) y
  // se rota tras éxito o al reabrir el form. Un retry tras respuesta perdida NO duplica.
  const submitDedupeKeyRef = useRef<string | null>(null);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: activeShare, isLoading: shareLoading } = useObligationActiveShareQuery(
    activeWorkspaceId,
    editObligation?.id ?? null,
  );

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [counterpartyOpen, setCounterpartyOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [openingAccountOpen, setOpeningAccountOpen] = useState(false);
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
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [originOpen, setOriginOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  /** La obligación recién creada, mientras se ofrece invitar. */
  const [createdObligation, setCreatedObligation] = useState<{
    id: number;
    title: string;
    summary: string;
    counterpartyName: string;
  } | null>(null);
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
  const [unlinkShareConfirmVisible, setUnlinkShareConfirmVisible] = useState(false);

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
    submitDedupeKeyRef.current = null; // nueva sesión de registro → clave fresca
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
      setInstallmentAmount(editObligation.installmentAmount ? String(editObligation.installmentAmount) : "");
      setInstallmentCount(editObligation.installmentCount ? String(editObligation.installmentCount) : "");
      // El plan guardado manda; si la obligación es vieja, se reconstruye del número de cuotas.
      setPaymentPlan(
        parsePaymentPlan(editObligation.paymentPlan)
        ?? (editObligation.installmentCount ? { mode: "equal", count: editObligation.installmentCount } : null),
      );
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

  async function handleUnlinkShare() {
    if (!activeShare || !activeWorkspaceId || !editObligation) return;
    try {
      await unlinkShareMutation.mutateAsync({
        shareId: activeShare.id,
        workspaceId: activeWorkspaceId,
        obligationId: editObligation.id,
      });
      setShareEmail("");
      setShareMessage("");
      setReassignExpanded(false);
      showToast("Acceso compartido desvinculado", "success");
    } catch (err: unknown) {
      setSubmitError(humanizeError(err));
    }
  }

  function handleClose() {
    // Con la obligación ya creada, cerrar el sheet es irse sin invitar: no hay nada que descartar.
    if (createdObligation) {
      setCreatedObligation(null);
      onSuccess?.();
      onClose();
      return;
    }
    const isDirty = isEditing
      ? (title !== (editObligation?.title ?? "") ||
         counterpartyId !== (editObligation?.counterpartyId ?? null) ||
         settlementAccountId !== (editObligation?.settlementAccountId ?? null) ||
         dueDate !== (editObligation?.dueDate ?? "") ||
         installmentAmount !== (editObligation?.installmentAmount ? String(editObligation.installmentAmount) : "") ||
         installmentCount !== (editObligation?.installmentCount ? String(editObligation.installmentCount) : "") ||
         // El plan puede cambiar sin que cambien la cuota ni el número de cuotas: de seis
         // iguales a seis a medida que suman lo mismo.
         JSON.stringify(normalizePaymentPlan(paymentPlan)) !== JSON.stringify(parsePaymentPlan(editObligation?.paymentPlan)) ||
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
    if (submittingRef.current) return; // ya hay un guardado en curso: ignora taps repetidos
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

    submittingRef.current = true;
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
            paymentPlan: normalizePaymentPlan(paymentPlan),
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
        const resolvedImpact = getAutoOpeningImpact(direction, originType);
        if (!submitDedupeKeyRef.current) submitDedupeKeyRef.current = newClientDedupeKey("obligation");
        const created = await createMutation.mutateAsync({
          userId: profile?.id ?? "",
          clientDedupeKey: submitDedupeKeyRef.current,
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
          paymentPlan: normalizePaymentPlan(paymentPlan),
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
        submitDedupeKeyRef.current = null; // éxito → rotar la clave para el próximo registro
        haptics.success();
        // La obligación YA está guardada: invitar es una acción posterior y opcional. Si no hay
        // a quién invitar, no hay nada que ofrecer.
        if (counterpartyName) {
          setCreatedObligation({
            id: created.id,
            title: title.trim(),
            summary: [
              formatCurrency(principalNumber, currencyCode),
              planLabel ?? null,
            ].filter(Boolean).join(" · "),
            counterpartyName,
          });
          return;
        }
        onSuccess?.();
        onClose();
        return;
      }
      submitDedupeKeyRef.current = null; // éxito → rotar la clave para el próximo registro
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
    } finally {
      submittingRef.current = false;
    }
  }

  const counterparties = snapshot?.counterparties ?? [];
  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const counterpartiesSorted = useMemo(() => sortByName(counterparties), [counterparties]);
  const activeAccountsSorted = useMemo(() => sortByName(activeAccounts), [activeAccounts]);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const originOptions = direction === "receivable" ? RECEIVABLE_ORIGINS : PAYABLE_ORIGINS;
  const openingImpact = getAutoOpeningImpact(direction, originType);
  const selectedOrigin = originOptions.find((o) => o.value === originType) ?? null;
  const selectedOriginLabel = selectedOrigin?.label
    ?? LEGACY_ORIGIN_LABELS[originType]
    ?? null;

  const counterpartyName = counterpartiesSorted.find((cp) => cp.id === counterpartyId)?.name ?? null;
  const settlementAccountName = activeAccountsSorted.find((acc) => acc.id === settlementAccountId)?.name ?? null;
  /** La moneda solo se enseña cuando NO es la del patrimonio: si coincide, no distingue nada. */
  const showCurrencyRow = currencyCode.toUpperCase() !== defaultCurrency.toUpperCase();

  /**
   * La consecuencia de lo elegido, en una línea. Sale del propio origen, que es donde ya está
   * escrita: el formulario la preguntaba otra vez más abajo y dejaba contestar distinto.
   */
  const impactLine = selectedOrigin?.description ?? "No mueve dinero de tus cuentas al crearla.";

  const startDateLabel = (() => {
    const parsed = parseDisplayDate(startDate);
    if (Number.isNaN(parsed.getTime())) return startDate;
    const label = format(parsed, "d MMM", { locale: es });
    return startDate === today ? `Hoy, ${label}` : label;
  })();

  const principalNumber = Number(principalAmount) || 0;
  const planLabel = describePlan({
    plan: paymentPlan,
    principal: principalNumber,
    startDate,
    formatAmount: (amount) => formatCurrency(amount, currencyCode),
  });
  /** De dónde sale la cuota, para que la cifra no aparezca de la nada. */
  const planHint = (() => {
    if (!paymentPlan || paymentPlan.mode !== "equal" || principalNumber <= 0) return null;
    const payments = expandPaymentPlan({ plan: paymentPlan, principal: principalNumber, startDate });
    if (payments.length === 0) return null;
    return `${formatCurrency(principalNumber, currencyCode)} ÷ ${payments.length}. Se recalcula si cambias el monto.`;
  })();

  /**
   * Lo que falta para poder guardar, en palabras. Reemplaza a los asteriscos, que aparecían en
   * tres campos sin explicarse en ninguna parte.
   */
  const missingLabel = (() => {
    if (isEditing) return null;
    if (!title.trim()) return "Falta el título";
    if (principalNumber <= 0) return "Falta el monto";
    if (counterpartyId == null) return "Falta el contacto";
    return null;
  })();

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar obligación" : "Nueva obligación"}
        snapHeight={0.95}
        scrollRef={scrollRef}
        footer={
          <View style={styles.submitBar}>
            <Button
              label={
                sharedViewer
                  ? "Solo lectura"
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear obligación"
              }
              size="lg"
              onPress={handleSubmit}
              loading={isLoading || shareMutation.isPending || unlinkShareMutation.isPending}
              disabled={Boolean(sharedViewer) || Boolean(missingLabel)}
            />
            {missingLabel ? (
              <Text style={styles.submitNote}>{missingLabel}</Text>
            ) : !isEditing && counterpartyName ? (
              /* Invitar es una acción sobre algo que ya existe. Mientras tanto, se dice. */
              <Text style={styles.submitNote}>
                Podrás invitar a {counterpartyName.split(" ")[0]} cuando esté creada
              </Text>
            ) : null}
          </View>
        }
        // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermanos no aparecían.
        overlay={
          <>
            <ObligationCreatedSheet
              visible={Boolean(createdObligation)}
              title={createdObligation?.title ?? ""}
              summary={createdObligation?.summary ?? ""}
              counterpartyName={createdObligation?.counterpartyName ?? ""}
              email={shareEmail}
              onChangeEmail={setShareEmail}
              message={shareMessage}
              onChangeMessage={setShareMessage}
              sending={shareMutation.isPending}
              onSend={async () => {
                if (!createdObligation || !activeWorkspaceId) return;
                try {
                  const r = await shareMutation.mutateAsync({
                    workspaceId: activeWorkspaceId,
                    obligationId: createdObligation.id,
                    invitedEmail: shareEmail.trim().toLowerCase(),
                    message: shareMessage.trim() || null,
                  });
                  showToast(
                    r.emailSent ? `Invitación enviada a ${r.invitedEmail}` : "Invitación registrada",
                    "success",
                  );
                  setCreatedObligation(null);
                  onSuccess?.();
                  onClose();
                } catch (err: unknown) {
                  showToast(humanizeError(err), "error");
                }
              }}
              onDismiss={() => {
                setCreatedObligation(null);
                onSuccess?.();
                onClose();
              }}
            />
            {/* Las hojas van primero: los selectores que se abren DESDE ellas se pintan después
                y quedan por encima. */}
            <ObligationDetailsSheet
              visible={detailsOpen}
              planLabel={planLabel}
              planHint={planHint}
              onOpenPlan={() => setPlanOpen(true)}
              dueDate={dueDate}
              onChangeDueDate={setDueDate}
              interestRate={interestRate}
              onChangeInterestRate={setInterestRate}
              settlementAccountLabel={settlementAccountName}
              onOpenSettlementAccount={() => setSettlementOpen(true)}
              description={description}
              onChangeDescription={setDescription}
              notes={notes}
              onChangeNotes={setNotes}
              onClose={() => setDetailsOpen(false)}
              onDone={() => setDetailsOpen(false)}
            />
            <PaymentPlanSheet
              visible={planOpen}
              plan={paymentPlan}
              principal={principalNumber}
              currencyCode={currencyCode}
              startDate={startDate}
              onClose={() => setPlanOpen(false)}
              onSave={(plan) => {
                setPaymentPlan(plan);
                // Las dos columnas viejas se siguen escribiendo mientras haya obligaciones que
                // las lean: el número de cuotas sale del plan, y la cuota de dividir el monto.
                const payments = plan
                  ? expandPaymentPlan({ plan, principal: principalNumber, startDate })
                  : [];
                setInstallmentCount(payments.length > 0 ? String(payments.length) : "");
                setInstallmentAmount(payments.length > 0 ? String(payments[0].amount) : "");
              }}
            />
            <SearchableSelectSheet
              inline
              visible={originOpen}
              title="Cómo nació"
              options={originOptions.map((opt) => ({ value: opt.value as string, label: opt.label, meta: opt.description }))}
              value={originType as string}
              onChange={(value) => {
                setOriginType(value as ObligationFormInput["originType"]);
                setOpeningAccountId(null);
                setOriginError("");
              }}
              onClose={() => setOriginOpen(false)}
            />
            <SearchableSelectSheet
              inline
              visible={counterpartyOpen}
              title="Contacto"
              options={counterpartiesSorted.map((cp) => ({ value: cp.id as number | null, label: cp.name }))}
              value={counterpartyId}
              onChange={(id) => { setCounterpartyId(id); setCounterpartyError(""); }}
              onClose={() => setCounterpartyOpen(false)}
            />
            <SearchableSelectSheet
              inline
              visible={settlementOpen}
              title="Cuenta de liquidación"
              options={[
                { value: null as number | null, label: "Sin cuenta" },
                ...activeAccountsSorted.map((acc) => ({ value: acc.id as number | null, label: acc.name })),
              ]}
              value={settlementAccountId}
              onChange={(id) => { setSettlementAccountId(id); setSettlementAccountError(""); }}
              onClose={() => setSettlementOpen(false)}
            />
            <SearchableSelectSheet
              inline
              visible={openingAccountOpen}
              title="Cuenta de apertura"
              options={[
                { value: null as number | null, label: "Sin cuenta" },
                ...activeAccountsSorted.map((acc) => ({ value: acc.id as number | null, label: acc.name })),
              ]}
              value={openingAccountId}
              onChange={setOpeningAccountId}
              onClose={() => setOpeningAccountOpen(false)}
            />
            <CurrencySelectOverlay
              visible={currencyOpen}
              onClose={() => setCurrencyOpen(false)}
              value={currencyCode}
              onChange={(code) => { setCurrencyCode(code); setCurrencyError(""); }}
            />
            <ConfirmDialog
              inline
              visible={showDiscard}
              title="¿Descartar cambios?"
              body="Se perderán los datos ingresados."
              confirmLabel="Descartar"
              cancelLabel="Continuar"
              onCancel={() => setShowDiscard(false)}
              onConfirm={() => { setShowDiscard(false); onClose(); }}
            />
            <ConfirmDialog
              inline
              visible={unlinkShareConfirmVisible}
              title={activeShare?.status === "pending" ? "Cancelar invitación" : "Desvincular acceso compartido"}
              body={
                activeShare?.status === "pending"
                  ? "La invitación quedará cancelada y la otra persona ya no podrá aceptarla."
                  : "La otra persona dejará de ver este crédito o deuda en su módulo de obligaciones. Tu registro original se conservará."
              }
              confirmLabel={activeShare?.status === "pending" ? "Cancelar invitación" : "Desvincular"}
              cancelLabel="Volver"
              onCancel={() => setUnlinkShareConfirmVisible(false)}
              onConfirm={() => { setUnlinkShareConfirmVisible(false); void handleUnlinkShare(); }}
            />
          </>
        }
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

      {/* El título abre el formulario: es lo que el usuario ya sabe cuando lo abre. Sin
          asterisco — lo que falta lo nombra el botón. */}
      <View style={styles.field}>
        <Text style={styles.sectionLabel}>Título</Text>
        <TextField
          ref={titleRef}
          style={[styles.textInput, titleError ? styles.inputError : null]}
          value={title}
          onChangeText={(t) => { setTitle(t); setTitleError(""); }}
          placeholder="Préstamo a Juan, deuda tarjeta…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="next"
          accessibilityLabel="Título de la obligación"
        />
        {titleError ? <Text style={styles.fieldError}>{titleError}</Text> : null}
      </View>

      {/* "Por cobrar" y "Por pagar" son términos de contabilidad y describen la deuda, no la
          relación. Quien registra que le prestó S/ 200 a un amigo piensa "me deben". Y lo
          elegido va en hueso: el verde es plata que entra, no una selección. */}
      {!isEditing ? (
        <View style={styles.directionRow}>
          {DIRECTION_OPTIONS.map((opt) => {
            const isSelected = direction === opt.value;
            const Icon = opt.value === "receivable" ? ArrowUp : ArrowDown;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.directionBtn, isSelected && styles.directionBtnSelected]}
                onPress={() => setDirection(opt.value as "receivable" | "payable")}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Icon size={15} color={isSelected ? COLORS.ink : COLORS.storm} strokeWidth={2} />
                <Text style={[styles.directionLabel, isSelected && styles.directionLabelSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* El monto va como el de Registrar movimiento: hueso, tabular y con el símbolo delante.
          Era el segundo dato más importante y el que peor se veía. */}
      {!isEditing ? (
        <View style={styles.field}>
          <Text style={styles.sectionLabel}>Monto</Text>
          <CurrencyInput
            ref={principalAmountRef}
            value={principalAmount}
            onChangeText={(t) => { setPrincipalAmount(t); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
          />
        </View>
      ) : null}

      {/* Contacto y origen, como filas con su valor a la derecha. */}
      <View onLayout={(event) => { counterpartySectionYRef.current = event.nativeEvent.layout.y; }}>
        {counterpartiesSorted.length > 0 ? (
          <View style={[styles.group, counterpartyError ? styles.sectionErrorWrap : null]}>
            <FormOptionRow
              grouped
              label="Contacto"
              value={counterpartyName}
              placeholder="Elegir contacto"
              onPress={() => setCounterpartyOpen(true)}
              last={isEditing && !showCurrencyRow}
            />
            {!isEditing ? (
              <FormOptionRow
                grouped
                label="Cómo nació"
                value={selectedOriginLabel}
                onPress={() => setOriginOpen(true)}
                last={!showCurrencyRow}
              />
            ) : null}
            {/* La moneda solo cuando NO es la del patrimonio: si coincide, el dato no distingue
                nada. Y se dice en palabras, no con el código ISO. */}
            {showCurrencyRow ? (
              <FormOptionRow
                grouped
                last
                label="Moneda"
                value={currencyPluralTitle(currencyCode)}
                onPress={() => setCurrencyOpen(true)}
              />
            ) : null}
          </View>
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
        {counterpartyError ? <Text style={styles.fieldError}>{counterpartyError}</Text> : null}
      </View>

      {/* La consecuencia de lo elegido, en una línea. El formulario preguntaba dos veces lo
          mismo —el origen y el "impacto inicial en cuenta"— y dejaba contestar distinto en cada
          una. Los radios salen solo en Manual, que es el único caso sin respuesta determinada. */}
      {!isEditing ? (
        <View style={styles.impactNote}>
          <Text style={styles.impactNoteText}>{impactLine}</Text>
        </View>
      ) : null}

      {!isEditing && openingImpact !== "none" && activeAccounts.length > 0 ? (
        <FormOptionRow
          label={openingImpact === "outflow" ? "Sale de" : "Entra a"}
          value={activeAccountsSorted.find((acc) => acc.id === openingAccountId)?.name ?? null}
          placeholder="Sin cuenta"
          onPress={() => setOpeningAccountOpen(true)}
        />
      ) : null}

      {/* Desde, y la puerta a los catorce campos opcionales. */}
      <View style={styles.group} onLayout={(event) => { startDateSectionYRef.current = event.nativeEvent.layout.y; }}>
        {!isEditing ? (
          <FormOptionRow
            grouped
            label="Desde"
            value={startDateLabel}
            onPress={() => setStartDateOpen((open) => !open)}
          />
        ) : null}
        <FormOptionRow
          grouped
          last
          label="Más detalles"
          support="Cuotas, tasa, vencimiento, notas"
          value=""
          placeholder=""
          onPress={() => setDetailsOpen(true)}
        />
      </View>
      {startDateOpen && !isEditing ? (
        <DatePickerInput
          label="Desde"
          value={startDate}
          onChange={(value) => { setStartDate(value); setStartDateError(""); }}
        />
      ) : null}
      {startDateError ? <Text style={styles.fieldError}>{startDateError}</Text> : null}


      {/* Invitar por correo salía del formulario de creación: convertía el botón de guardar en
          un botón que además le escribe a alguien, sin previsualización. Es una acción sobre una
          obligación que ya existe, así que se ofrece al terminar. */}

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
              {/* Con quién está compartida es un estado, y estaba dibujado como una cápsula en
                  menta —el color de la plata que entra— con forma de botón. Es una fila más del
                  grupo, y al tocarla se cambia el correo. */}
              <View style={styles.group}>
                <FormOptionRow
                  grouped
                  last
                  label="Compartido con"
                  value={activeShare.invitedDisplayName || activeShare.invitedEmail}
                  support="Cambiar correo"
                  onPress={() => setReassignExpanded((open) => !open)}
                />
              </View>
              {reassignExpanded ? (
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
              ) : null}
              {/* Quitarle el acceso a alguien y cambiarle el correo tenían el mismo peso, uno al
                  lado del otro. La destructiva baja al final, en texto, separada del resto. */}
              <TouchableOpacity
                style={styles.unlinkLink}
                onPress={() => setUnlinkShareConfirmVisible(true)}
                activeOpacity={0.7}
                disabled={unlinkShareMutation.isPending}
              >
                <Text style={styles.unlinkLinkText}>
                  {unlinkShareMutation.isPending ? "Desvinculando..." : "Desvincular acceso"}
                </Text>
              </TouchableOpacity>
            </>
          ) : activeShare?.status === "pending" ? (
            <>
              <View style={styles.group}>
                <FormOptionRow
                  grouped
                  last
                  label="Invitación enviada a"
                  value={activeShare.invitedEmail}
                  support="Cambiar correo o reenviar"
                  onPress={() => setReassignExpanded((open) => !open)}
                />
              </View>
              {reassignExpanded ? (
                <>
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
              ) : null}
              <TouchableOpacity
                style={styles.unlinkLink}
                onPress={() => setUnlinkShareConfirmVisible(true)}
                activeOpacity={0.7}
                disabled={unlinkShareMutation.isPending}
              >
                <Text style={styles.unlinkLinkText}>
                  {unlinkShareMutation.isPending ? "Cancelando..." : "Cancelar invitación"}
                </Text>
              </TouchableOpacity>
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

      {/* Subir y bajar el monto son una sola hoja con un conmutador desde la Revisión 15, así que
          aquí son una sola fila: dos botones en menta y en rojo prometían dos formularios que ya
          no existen, y el color decía "plata que entra / plata que sale" sobre una acción que
          todavía no tiene monto. */}
      {isEditing && onAdjust && editObligation && isOwnerObligation(editObligation) ? (
        <View style={styles.group}>
          <FormOptionRow
            grouped
            last
            muted
            label="Ajustar monto"
            value={null}
            placeholder="Le debe más o menos"
            onPress={() => { onClose(); onAdjust(editObligation, "increase"); }}
          />
        </View>
      ) : null}
    </BottomSheet>
  </>
  );
}

const styles = StyleSheet.create({
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  sectionErrorWrap: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
  },
  directionLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.storm },
  shareSection: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: SPACING.sm,
  },
  field: { gap: SPACING.sm },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  // Estar elegido se ve igual en toda la app: borde y etiqueta en hueso, sin color. El verde es
  // plata que entra, y aquí marcaba una deuda que sale.
  directionBtnSelected: {
    borderColor: COLORS.ink,
    backgroundColor: SURFACE.cardActive,
  },
  directionLabelSelected: { color: COLORS.ink },
  impactNote: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  impactNoteText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  submitBar: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  submitNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
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
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
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
  unlinkLink: {
    alignSelf: "flex-start",
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  unlinkLinkText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
  },
  shareMessageInput: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: SPACING.sm,
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
  // ── Origin type section ──────────────────────────────────────────────────
  // ── Manual impact ────────────────────────────────────────────────────────
  // ── Opening account ──────────────────────────────────────────────────────
});
