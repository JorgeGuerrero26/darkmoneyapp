import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mic, Send, Sparkles } from "lucide-react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { MovementForm, type MovementDuplicateSource } from "../components/forms/MovementForm";
import { AssistantDraftCard } from "../features/assistant/components/AssistantDraftCard";
import { draftToMovementInput, draftDedupeKey, type ResolvedIds } from "../features/assistant/lib/draft-to-input";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import {
  askAssistant,
  type AssistantChatMessage,
  type AssistantDraft,
  type AssistantEvidence,
} from "../services/queries/assistant";
import {
  useCreateMovementMutation,
  useWorkspaceSnapshotQuery,
  type WorkspaceSnapshot,
} from "../services/queries/workspace-data";
import { useMarkSubscriptionPaidMutation } from "../services/queries/subscriptions-recurring-income";
import { useCreateObligationPaymentMutation } from "../services/queries/obligations-impl";
import { parseBoldSegments } from "../lib/assistant-text";
import { humanizeError } from "../lib/errors";
import { formatCurrency } from "../lib/format-currency";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: AssistantEvidence[];
  error?: boolean;
  draft?: AssistantDraft;
  draftStatus?: "pending" | "saved" | "discarded";
  savedMovementId?: number;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function findByName<T extends { name?: string | null }>(items: T[], name: string | null): T | undefined {
  if (!name) return undefined;
  const n = normalize(name);
  return items.find((item) => item.name && normalize(item.name).includes(n));
}

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

const WELCOME =
  "Hola, soy tu asistente. Pregúntame lo que quieras sobre tus movimientos — o toca una sugerencia para empezar:";

const SUGGESTIONS = [
  "¿Cuánto gasté este mes?",
  "¿Cuál fue mi mayor gasto del mes?",
  "¿Cuánto gasté en comida el mes pasado?",
  "¿Gasté más que el mes anterior?",
];

function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ask?: string | string[]; askToken?: string | string[] }>();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/dashboard" });
  const { activeWorkspaceId } = useWorkspace();

  const [items, setItems] = useState<ChatItem[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const markSubPaid = useMarkSubscriptionPaidMutation(activeWorkspaceId);
  const payObligation = useCreateObligationPaymentMutation(activeWorkspaceId);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [editDuplicate, setEditDuplicate] = useState<MovementDuplicateSource | null>(null);
  // Control manual del teclado: KeyboardAvoidingView (height/padding) deja huecos
  // negros con edge-to-edge en Android. Medimos la altura del teclado y la
  // aplicamos como padding solo mientras está abierto → 0 al cerrar, sin gap.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const keyboardOpen = keyboardHeight > 0;
  const idRef = useRef(0);

  // Voz: dictado on-device (expo-speech-recognition). El transcript va al input;
  // el resto del flujo (draft → tarjeta) es idéntico al de escribir.
  const [isListening, setIsListening] = useState(false);
  useSpeechRecognitionEvent("result", (e) => {
    const transcript = e.results?.[0]?.transcript;
    if (transcript) setInput(transcript);
  });
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("error", () => setIsListening(false));

  const startDictation = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        showToast("Sin permiso de micrófono. Puedes usar el micrófono del teclado.", "warning");
        return;
      }
      setIsListening(true);
      ExpoSpeechRecognitionModule.start({ lang: "es-PE", interimResults: true });
    } catch {
      setIsListening(false);
    }
  }, [showToast]);

  const stopDictation = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* noop */
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || isThinking || !activeWorkspaceId) return;
      idRef.current += 1;
      const userItem: ChatItem = { id: `u${idRef.current}`, role: "user", content: message };
      // Historial para el server: solo turnos reales previos (sin welcome ni errores).
      const history: AssistantChatMessage[] = items
        .filter((item) => item.id !== "welcome" && !item.error)
        .map((item) => ({ role: item.role, content: item.content }));
      setItems((current) => [...current, userItem]);
      setInput("");
      setIsThinking(true);
      try {
        const response = await askAssistant({ message, history, workspaceId: activeWorkspaceId });
        idRef.current += 1;
        setItems((current) => [
          ...current,
          {
            id: `a${idRef.current}`,
            role: "assistant",
            content: response.reply,
            evidence: response.evidence,
            ...(response.draft ? { draft: response.draft, draftStatus: "pending" as const } : {}),
          },
        ]);
        setRemainingToday(response.remainingToday);
      } catch (error) {
        idRef.current += 1;
        setItems((current) => [
          ...current,
          {
            id: `e${idRef.current}`,
            role: "assistant",
            content: error instanceof Error ? error.message : "No se pudo responder. Inténtalo de nuevo.",
            error: true,
          },
        ]);
        // Reponer el texto para reintentar sin reescribir.
        setInput(message);
      } finally {
        setIsThinking(false);
      }
    },
    [activeWorkspaceId, isThinking, items],
  );

  // Insight proactivo: la notificación abre el chat con ?ask= y se auto-envía
  // una sola vez (askToken único por tap evita re-disparos por re-render).
  const autoAskTokenRef = useRef<string | null>(null);
  useEffect(() => {
    const ask = Array.isArray(params.ask) ? params.ask[0] : params.ask;
    const token = Array.isArray(params.askToken) ? params.askToken[0] : params.askToken;
    const key = token ?? ask ?? null;
    if (!ask || !activeWorkspaceId || autoAskTokenRef.current === key) return;
    autoAskTokenRef.current = key;
    void send(ask);
  }, [params.ask, params.askToken, activeWorkspaceId, send]);

  const openEvidence = useCallback(
    (evidence: AssistantEvidence) => {
      // quickScope activa el bloque de quick-filters en Movimientos y quickToken
      // (único por tap) fuerza el re-trigger — mismo contrato que las notificaciones.
      router.push(
        `/(app)/movements?quickScope=assistant&quickToken=${Date.now()}&quickMovementIds=${evidence.movementIds.join(",")}&quickLabel=${encodeURIComponent(evidence.label)}` as never,
      );
    },
    [router],
  );

  function resolveDraftIds(draft: AssistantDraft, snap: WorkspaceSnapshot): ResolvedIds {
    const account = findByName(snap.accounts, draft.accountName);
    const destination = findByName(snap.accounts, draft.destinationAccountName);
    const category = findByName(snap.categories, draft.categoryName);
    const counterparty = findByName(snap.counterparties, draft.counterpartyName);
    return {
      sourceAccountId: account?.id ?? null,
      destinationAccountId: destination?.id ?? null,
      categoryId: category?.id ?? null,
      counterpartyId: counterparty?.id ?? null,
      todayIso: new Date().toISOString(),
    };
  }

  function setDraftStatus(itemId: string, draftStatus: ChatItem["draftStatus"], savedMovementId?: number) {
    setItems((current) =>
      current.map((it) => (it.id === itemId ? { ...it, draftStatus, savedMovementId } : it)),
    );
  }

  async function saveDraft(item: ChatItem) {
    const draft = item.draft;
    if (!draft || !snapshot || !activeWorkspaceId) return;
    const ids = resolveDraftIds(draft, snapshot);
    setSavingDraftId(item.id);
    try {
      if (draft.operation === "pay_subscription") {
        const sub = snapshot.subscriptions.find((s) => s.id === draft.subscriptionId);
        if (!sub) throw new Error("No encontré la suscripción.");
        const accountId = ids.sourceAccountId ?? sub.accountId ?? snapshot.accounts[0]?.id;
        if (!accountId) throw new Error("No hay cuenta para el pago.");
        const res = await markSubPaid.mutateAsync({ subscription: sub, paidDate: todayYmd(), amount: draft.amount, accountId });
        setDraftStatus(item.id, "saved", res.movementId ?? undefined);
      } else if (draft.operation === "pay_debt") {
        if (!draft.obligationId) throw new Error("No encontré la deuda.");
        const obligation = snapshot.obligations.find((o) => o.id === draft.obligationId);
        await payObligation.mutateAsync({
          obligationId: draft.obligationId,
          amount: draft.amount,
          paymentDate: todayYmd(),
          accountId: ids.sourceAccountId,
          createMovement: true,
          direction: obligation?.direction,
        });
        setDraftStatus(item.id, "saved");
      } else {
        const created = await createMovement.mutateAsync(draftToMovementInput(draft, ids));
        setDraftStatus(item.id, "saved", created.id);
      }
      showToast("Movimiento guardado ✓", "success");
    } catch (error) {
      showToast(humanizeError(error), "error");
    } finally {
      setSavingDraftId(null);
    }
  }

  function editDraft(item: ChatItem) {
    const draft = item.draft;
    if (!draft || !snapshot) return;
    const ids = resolveDraftIds(draft, snapshot);
    // Editar reusa el MovementForm en modo "duplicar" (prellena y crea nuevo).
    // Solo para gasto/ingreso/transferencia; los pagos se guardan/cancelan directo.
    setEditDuplicate({
      movementType: draft.operation === "income" ? "income" : draft.operation === "transfer" ? "transfer" : "expense",
      sourceAccountId: draft.operation === "income" ? null : ids.sourceAccountId,
      destinationAccountId: draft.operation === "income" ? ids.sourceAccountId : ids.destinationAccountId ?? null,
      sourceAmount: draft.operation === "income" ? null : draft.amount,
      destinationAmount: draft.operation === "income" ? draft.amount : draft.operation === "transfer" ? draft.amount : null,
      description: draft.description ?? "",
      categoryId: ids.categoryId,
      counterpartyId: ids.counterpartyId,
      notes: null,
    });
    setDraftStatus(item.id, "discarded");
  }

  function draftCardProps(item: ChatItem) {
    const draft = item.draft!;
    const money = formatCurrency(draft.amount, draft.currency);
    const sign = draft.operation === "income" ? "+" : draft.operation === "transfer" ? "" : "−";
    const titleByOp: Record<AssistantDraft["operation"], string> = {
      expense: "Registrar gasto",
      income: "Registrar ingreso",
      transfer: "Transferencia",
      pay_subscription: "Pago de suscripción",
      pay_debt: "Abono a deuda",
    };
    const lines: { label: string; value: string }[] = [];
    if (draft.operation === "transfer") {
      if (draft.accountName) lines.push({ label: "De", value: draft.accountName });
      if (draft.destinationAccountName) lines.push({ label: "A", value: draft.destinationAccountName });
    } else if (draft.operation === "pay_subscription") {
      if (draft.subscriptionName) lines.push({ label: "Suscripción", value: draft.subscriptionName });
      if (draft.accountName) lines.push({ label: "Cuenta", value: draft.accountName });
    } else if (draft.operation === "pay_debt") {
      if (draft.obligationCounterparty) lines.push({ label: "Deuda", value: draft.obligationCounterparty });
      if (draft.accountName) lines.push({ label: "Cuenta", value: draft.accountName });
    } else {
      if (draft.accountName) lines.push({ label: "Cuenta", value: draft.accountName });
      if (draft.categoryName) lines.push({ label: "Categoría", value: draft.categoryName });
    }
    if (draft.description) lines.push({ label: "Detalle", value: draft.description });
    lines.push({ label: "Fecha", value: draft.occurredAt ?? "hoy" });
    const canEdit = draft.operation === "expense" || draft.operation === "income" || draft.operation === "transfer";
    return { title: titleByOp[draft.operation], amountLabel: `${sign} ${money}`.trim(), lines, canEdit };
  }

  const renderItem = ({ item }: { item: ChatItem }) => {
    {
      if (item.draft) {
        const { title, amountLabel, lines, canEdit } = draftCardProps(item);
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.primary} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              title={title}
              amountLabel={amountLabel}
              lines={lines}
              status={item.draftStatus ?? "pending"}
              isSaving={savingDraftId === item.id}
              onSave={() => void saveDraft(item)}
              onEdit={canEdit ? () => editDraft(item) : () => showToast("Este pago se guarda o se cancela directamente.", "info")}
              onCancel={() => setDraftStatus(item.id, "discarded")}
              onViewMovement={
                item.savedMovementId
                  ? () => router.push(`/movement/${item.savedMovementId}?from=assistant` as never)
                  : undefined
              }
            />
          </View>
        );
      }
      const bubble = (
        <View
          style={[
            styles.bubble,
            item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
            item.error ? styles.bubbleError : null,
          ]}
        >
          <Text style={styles.bubbleText}>
            {parseBoldSegments(item.content).map((segment, index) => (
              <Text key={index} style={segment.bold ? styles.bubbleTextBold : undefined}>
                {segment.text}
              </Text>
            ))}
          </Text>
          {item.evidence?.map((evidence) => (
            <TouchableOpacity
              key={`${item.id}-${evidence.label}`}
              style={styles.evidenceChip}
              onPress={() => openEvidence(evidence)}
              accessibilityLabel={`Ver ${evidence.movementIds.length} movimientos de evidencia`}
            >
              <Text style={styles.evidenceChipText}>
                {evidence.label} · ver {evidence.movementIds.length}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
      if (item.role === "user") return bubble;
      return (
        <View style={styles.assistantRow}>
          <View style={styles.avatar}>
            <Sparkles size={13} color={COLORS.primary} strokeWidth={2.2} />
          </View>
          {bubble}
        </View>
      );
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Asistente"
        subtitle={remainingToday != null ? `${remainingToday} preguntas restantes hoy` : "Consulta tus movimientos"}
        onBack={handleBack}
        withSafeArea
      />
      <View style={styles.flex}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <>
              {items.length === 1 && !isThinking ? (
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      style={styles.suggestionChip}
                      onPress={() => void send(suggestion)}
                      accessibilityLabel={`Preguntar: ${suggestion}`}
                    >
                      <Text style={styles.suggestionChipText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {isThinking ? (
                <View style={styles.assistantRow}>
                  <View style={styles.avatar}>
                    <Sparkles size={13} color={COLORS.primary} strokeWidth={2.2} />
                  </View>
                  <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingRow]}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.thinkingText}>Buscando en tus movimientos…</Text>
                  </View>
                </View>
              ) : null}
            </>
          }
        />
        <View
          style={[
            styles.inputRow,
            // Teclado abierto: pegado sobre el teclado (su altura ya cubre el nav bar).
            // Cerrado: respeta el safe-area inferior. Sin KAV → sin hueco negro.
            { paddingBottom: (keyboardOpen ? 0 : insets.bottom) + SPACING.sm, marginBottom: keyboardHeight },
          ]}
        >
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Pregunta por tus movimientos…"
            placeholderTextColor={COLORS.storm}
            multiline
            editable={!isThinking && remainingToday !== 0}
            onSubmitEditing={() => void send(input)}
            accessibilityLabel="Escribe tu pregunta"
          />
          <TouchableOpacity
            style={[styles.micBtn, isListening ? styles.micBtnActive : null]}
            onPressIn={() => void startDictation()}
            onPressOut={stopDictation}
            disabled={isThinking}
            accessibilityLabel="Mantén presionado para dictar"
          >
            <Mic size={18} color={isListening ? COLORS.void : COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isThinking) ? styles.sendBtnDisabled : null]}
            onPress={() => void send(input)}
            disabled={!input.trim() || isThinking}
            accessibilityLabel="Enviar pregunta"
          >
            <Send size={18} color={COLORS.void} />
          </TouchableOpacity>
        </View>
      </View>

      <MovementForm
        visible={editDuplicate != null}
        onClose={() => setEditDuplicate(null)}
        onSuccess={() => showToast("Movimiento guardado ✓", "success")}
        duplicateMovement={editDuplicate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  listContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: SURFACE.cardActive,
    borderColor: SURFACE.cardActiveBorder,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    flexShrink: 1,
    backgroundColor: SURFACE.card,
    borderColor: SURFACE.cardBorder,
    borderTopLeftRadius: 6,
  },
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
    maxWidth: "94%",
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.cardActive,
    borderWidth: 1,
    borderColor: SURFACE.cardActiveBorder,
    marginTop: 2,
  },
  suggestions: {
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    marginLeft: 26 + SPACING.xs,
  },
  suggestionChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardActiveBorder,
    backgroundColor: SURFACE.cardActive,
  },
  suggestionChipText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  bubbleError: {
    borderColor: COLORS.danger,
  },
  bubbleText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  bubbleTextBold: {
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  evidenceChip: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  evidenceChipText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  thinkingText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE.cardBorder,
    backgroundColor: COLORS.shell,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "transparent",
  },
  micBtnActive: {
    backgroundColor: COLORS.primary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});

export default function AssistantScreenRoot() {
  return (
    <ErrorBoundary>
      <AssistantScreen />
    </ErrorBoundary>
  );
}
