import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { History, Mic, RotateCcw, Send, Sparkles, Square, Volume2, VolumeX } from "lucide-react-native";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ExpoSpeechRecognitionModule,
  isDictationAvailable,
  useSpeechRecognitionEvent,
} from "../lib/speech-recognition-safe";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { TextField } from "../components/ui/TextField";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { AssistantChatsSheet } from "../features/assistant/components/AssistantChatsSheet";
import {
  MAX_STORED_ITEMS,
  chatFromLegacy,
  newChatId,
  parseChatStore,
  removeChat,
  renameChat,
  upsertChat,
  type StoredChat,
} from "../features/assistant/lib/chat-store";
import { annotateAssistantTurn } from "../features/assistant/lib/draft-memory";
import { cleanForSpeech, nextSpeakableChunk, unspokenRest } from "../features/assistant/lib/speech-chunks";
import { movementChangeLines, movementChangeToUpdate } from "../features/assistant/lib/change-to-input";
import { THINKING_DEFAULT, thinkingLabel, toolStatusLabel } from "../features/assistant/lib/thinking-label";
import { MovementForm, type MovementDuplicateSource } from "../components/forms/MovementForm";
import { AssistantDraftCard, type DraftAmountTone } from "../features/assistant/components/AssistantDraftCard";
import { draftToMovementInput, draftDedupeKey, draftMovementStatus, type ResolvedIds } from "../features/assistant/lib/draft-to-input";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import {
  streamAssistant,
  type AssistantChatMessage,
  type AssistantDraft,
  type AssistantEvidence,
  type BudgetDraft,
  type MovementChange,
  type ObligationDraft,
  type RecurringDraft,
} from "../services/queries/assistant";
import {
  useCreateMovementMutation,
  useDeleteMovementMutation,
  useUpdateMovementMutation,
  useWorkspaceSnapshotQuery,
  type WorkspaceSnapshot,
} from "../services/queries/workspace-data";
import {
  useMarkSubscriptionPaidMutation,
  useCreateSubscriptionMutation,
  useCreateRecurringIncomeMutation,
} from "../services/queries/subscriptions-recurring-income";
import { useCreateObligationPaymentMutation, useCreateObligationMutation } from "../services/queries/obligations-impl";
import { useCreateBudgetMutation } from "../services/queries/budgets";
import { closeDanglingBold, parseBoldSegments } from "../lib/assistant-text";
import { formatCurrency } from "../lib/format-currency";
import { humanizeError } from "../lib/errors";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: AssistantEvidence[];
  error?: boolean;
  draft?: AssistantDraft;
  budgetDraft?: BudgetDraft;
  obligationDraft?: ObligationDraft;
  recurringDraft?: RecurringDraft;
  /** Corregir o borrar un movimiento ya registrado (el asistente lo propone; el usuario confirma). */
  movementChange?: MovementChange;
  draftStatus?: "pending" | "saved" | "discarded";
  savedMovementId?: number;
  /** Preguntas para seguir; se muestran como botones solo bajo la última respuesta. */
  suggestions?: string[];
  /** El usuario tocó Detener: queda lo que alcanzó a escribir y no viaja como historial. */
  stopped?: boolean;
  /** En un error: la pregunta que falló y su burbuja, para el botón Reintentar. */
  retry?: { text: string; userItemId: string };
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

const LIQUID_TYPES = new Set(["bank", "cash", "savings"]);

/** Cuenta por defecto cuando el modelo no especifica una: líquida y en la moneda
 * del borrador si existe; si no, la primera cuenta activa. Evita guardar sin cuenta. */
function pickDefaultAccount(
  accounts: { id: number; name: string; currencyCode: string; type: string; isArchived: boolean }[],
  currency: string,
) {
  const active = accounts.filter((a) => !a.isArchived);
  return (
    active.find((a) => a.currencyCode === currency && LIQUID_TYPES.has(a.type)) ??
    active.find((a) => LIQUID_TYPES.has(a.type)) ??
    active[0]
  );
}

/** El chat único de antes. Se lee una vez para convertirlo en la primera conversación. */
const LEGACY_CHAT_KEY = "assistant/chat";
const CHATS_STORAGE_KEY = "assistant/chats/v1";

const WELCOME =
  "Hola, soy tu asistente. Pregúntame lo que quieras sobre tus movimientos — o toca una sugerencia para empezar:";

/**
 * Lo primero que ve alguien que abre el asistente sin saber qué preguntarle.
 *
 * Las cuatro anteriores eran variaciones de "cuánto gasté": enseñaban una sola de las cosas que
 * sabe hacer y dejaban invisibles las otras tres. Ahora hay una por capacidad —consultar,
 * proyectar, registrar hablando y revisar qué falta—, en el orden en que le sirven a alguien
 * nuevo.
 */
const SUGGESTIONS = [
  "¿Qué puedes hacer?",
  "¿Cuánto gasté este mes?",
  "¿Cuánto voy a tener en 6 meses?",
  "¿Qué me falta registrar?",
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
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeId, setActiveId] = useState(() => newChatId());
  const [chatsVisible, setChatsVisible] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState(THINKING_DEFAULT);
  /** La respuesta mientras se escribe. Vacía = aún no llega texto (se ve el aviso de arriba). */
  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");
  /** Detener: corta la conexión de la pregunta en curso. */
  const abortRef = useRef<AbortController | null>(null);
  /** Turno vigente: lo que llegue de una pregunta detenida se descarta aunque llegue tarde. */
  const turnRef = useRef(0);
  const listRef = useRef<FlatList<ChatItem>>(null);
  /** Seguir el final de la lista mientras se escribe, salvo que el usuario haya subido a leer. */
  const followRef = useRef(true);
  /** La pregunta en curso, para devolverla al campo si se detiene antes de escribir nada. */
  const questionRef = useRef("");
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const { profile } = useAuth();
  const { showToast, showErrorToast } = useToast();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const updateMovement = useUpdateMovementMutation(activeWorkspaceId);
  const deleteMovement = useDeleteMovementMutation(activeWorkspaceId);
  const markSubPaid = useMarkSubscriptionPaidMutation(activeWorkspaceId);
  const payObligation = useCreateObligationPaymentMutation(activeWorkspaceId);
  const createBudget = useCreateBudgetMutation(activeWorkspaceId);
  const createObligation = useCreateObligationMutation(activeWorkspaceId);
  const createSubscription = useCreateSubscriptionMutation(activeWorkspaceId);
  const createRecurringIncome = useCreateRecurringIncomeMutation(activeWorkspaceId);
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

  // Modo hablante: el asistente lee su respuesta en voz alta y, tras dictar, auto-envía.
  const [speakMode, setSpeakMode] = useState(false);
  const speakModeRef = useRef(false);
  speakModeRef.current = speakMode;
  const lastTranscriptRef = useRef("");
  const sendRef = useRef<((t: string) => void) | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem("assistant/speakMode").then((v) => {
      if (v === "1") setSpeakMode(true);
    });
    return () => { Speech.stop(); };
  }, []);

  /**
   * Las conversaciones viven en el teléfono, no en el servidor: son cifras personales y no hay
   * razón para que salgan de aquí. El servidor tampoco las necesita: en cada pregunta recibe el
   * historial de la conversación abierta, y ese es todo su "contexto".
   *
   * Solo texto y rol. Los borradores y la evidencia no se persisten a propósito: un borrador
   * restaurado tentaría a confirmar un movimiento cuyo contexto ya no existe.
   */
  const [chatLoaded, setChatLoaded] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const store = parseChatStore(await AsyncStorage.getItem(CHATS_STORAGE_KEY));
        let saved = store.chats;
        let active = store.chats.find((chat) => chat.id === store.activeId) ?? null;
        if (saved.length === 0) {
          // Primera vez con varias conversaciones: el chat de antes pasa a ser la primera.
          const legacy = chatFromLegacy(await AsyncStorage.getItem(LEGACY_CHAT_KEY));
          if (legacy) {
            saved = [legacy];
            active = legacy;
          }
        }
        setChats(saved);
        if (active) {
          setActiveId(active.id);
          setItems(active.items);
        }
      } catch {
        /* guardado corrupto: se empieza limpio, no vale romper la pantalla */
      } finally {
        setChatLoaded(true);
      }
    })();
  }, []);

  // La conversación abierta se refleja en la lista cada vez que cambia.
  useEffect(() => {
    if (!chatLoaded) return; // no pisar lo guardado con el saludo inicial antes de leerlo
    const toStore = items
      .filter((i) => i.id !== "welcome" && !i.error && !i.stopped)
      .slice(-MAX_STORED_ITEMS)
      .map(({ id, role, content }) => ({ id, role, content }));
    setChats((current) => upsertChat(current, activeId, toStore));
  }, [items, activeId, chatLoaded]);

  useEffect(() => {
    if (!chatLoaded) return;
    void AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify({ activeId, chats }));
    void AsyncStorage.removeItem(LEGACY_CHAT_KEY);
  }, [chats, activeId, chatLoaded]);

  const openChat = useCallback((id: string, nextItems: ChatItem[]) => {
    Speech.stop();
    setInput("");
    setActiveId(id);
    setItems(nextItems);
    setChatsVisible(false);
  }, []);

  const startNewChat = useCallback(() => {
    if (isThinking) return;
    const empty = items.every((item) => item.id === "welcome");
    // Ya está en una conversación vacía: otra igual solo ensuciaría la lista.
    if (empty) {
      setChatsVisible(false);
      return;
    }
    openChat(newChatId(), [{ id: "welcome", role: "assistant", content: WELCOME }]);
  }, [isThinking, items, openChat]);

  const selectChat = useCallback(
    (id: string) => {
      if (isThinking) return;
      if (id === activeId) {
        setChatsVisible(false);
        return;
      }
      const target = chats.find((chat) => chat.id === id);
      if (target) openChat(id, target.items);
    },
    [activeId, chats, isThinking, openChat],
  );

  const confirmDeleteChat = useCallback(() => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    setChats((current) => removeChat(current, id));
    // Borrar la que está abierta deja una conversación nueva, vacía.
    if (id === activeId) {
      Speech.stop();
      setActiveId(newChatId());
      setItems([{ id: "welcome", role: "assistant", content: WELCOME }]);
    }
    showToast("Conversación borrada", "success");
  }, [activeId, pendingDeleteId, showToast]);

  const toggleSpeakMode = useCallback(() => {
    setSpeakMode((prev) => {
      const next = !prev;
      void AsyncStorage.setItem("assistant/speakMode", next ? "1" : "0");
      if (!next) Speech.stop();
      showToast(next ? "Modo hablante activado 🔊" : "Modo hablante desactivado", "info");
      return next;
    });
  }, [showToast]);

  // Limpia markdown/emojis para que la voz suene natural.
  /** Encola un trozo para leer en voz alta, sin cortar lo que ya está leyendo. */
  const speakChunk = useCallback((text: string) => {
    const clean = cleanForSpeech(text);
    if (clean) Speech.speak(clean, { language: "es-PE" });
  }, []);

  // Voz: dictado on-device (expo-speech-recognition). El transcript va al input;
  // el resto del flujo (draft → tarjeta) es idéntico al de escribir.
  const [isListening, setIsListening] = useState(false);
  useSpeechRecognitionEvent("result", (e) => {
    const transcript = e.results?.[0]?.transcript;
    if (transcript) {
      setInput(transcript);
      lastTranscriptRef.current = transcript;
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    // Modo hablante: al terminar de dictar, enviar solo (manos libres).
    const t = lastTranscriptRef.current.trim();
    lastTranscriptRef.current = "";
    if (speakModeRef.current && t) sendRef.current?.(t);
  });
  useSpeechRecognitionEvent("error", () => setIsListening(false));

  const startDictation = useCallback(async () => {
    try {
      Speech.stop(); // no hablar encima de lo que el usuario va a dictar
      lastTranscriptRef.current = "";
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
    async (text: string, retryOf?: ChatItem) => {
      const message = text.trim();
      if (!message || isThinking || !activeWorkspaceId) return;
      /* Reintentar quita el error y la pregunta que falló, y la manda de nuevo como si fuera la
         primera vez: así no queda duplicada en pantalla ni en el historial que ve el modelo. */
      const dropIds = new Set(retryOf?.retry ? [retryOf.id, retryOf.retry.userItemId] : []);
      const baseItems = dropIds.size > 0 ? items.filter((item) => !dropIds.has(item.id)) : items;
      Speech.stop(); // corta cualquier respuesta hablada anterior al mandar una nueva
      idRef.current += 1;
      const userItem: ChatItem = { id: `u${idRef.current}`, role: "user", content: message };
      /* Historial para el server: solo turnos reales previos (sin welcome ni errores).
         A los turnos del asistente se les añade QUÉ propuso y en qué quedó. Antes solo viajaban
         `role` y `content`, así que el modelo no veía ni sus propios borradores ni si el usuario
         los había guardado: tras registrar un gasto y pedirle lo que faltaba, volvía a ofrecer la
         misma tarjeta. La anotación va solo aquí; lo que se ve en pantalla no cambia. */
      const history: AssistantChatMessage[] = baseItems
        .filter((item) => item.id !== "welcome" && !item.error && !item.stopped)
        .map((item) => ({
          role: item.role,
          content: item.role === "assistant" ? annotateAssistantTurn(item.content, item) : item.content,
        }));
      setItems((current) => [...current.filter((item) => !dropIds.has(item.id)), userItem]);
      setInput("");
      // Qué decir mientras responde: dictar un gasto no es buscar. Ver thinking-label. Después
      // manda el servidor: avisa en vivo qué consulta de verdad.
      setThinkingText(thinkingLabel(message));
      setIsThinking(true);
      liveTextRef.current = "";
      setLiveText("");
      followRef.current = true;
      questionRef.current = message;
      const controller = new AbortController();
      abortRef.current = controller;
      turnRef.current += 1;
      const turn = turnRef.current;
      const isCurrent = () => turnRef.current === turn;
      /* Modo hablante: cada frase se lee apenas termina de llegar. `spokenUpTo` marca hasta dónde
         del texto en vivo ya se mandó a la voz. */
      let spokenUpTo = 0;
      try {
        const response = await streamAssistant(
          { message, history, workspaceId: activeWorkspaceId },
          {
            onStatus: (tool) => {
              if (isCurrent()) setThinkingText(tool ? toolStatusLabel(tool) : thinkingLabel(message));
            },
            onDelta: (text) => {
              if (!isCurrent()) return;
              liveTextRef.current += text;
              setLiveText(liveTextRef.current);
              if (speakModeRef.current) {
                const { chunk, next } = nextSpeakableChunk(liveTextRef.current, spokenUpTo);
                if (chunk) {
                  speakChunk(chunk);
                  spokenUpTo = next;
                }
              }
            },
            onReset: () => {
              if (!isCurrent()) return;
              // Lo mostrado era un preámbulo descartado: callar lo que se estaba leyendo de él.
              if (spokenUpTo > 0) Speech.stop();
              spokenUpTo = 0;
              liveTextRef.current = "";
              setLiveText("");
            },
          },
          controller.signal,
        );
        if (!isCurrent()) return; // la detuvo: lo que alcanzó a escribir ya quedó en el chat
        /* Un turno puede traer VARIOS movimientos ("me dieron 5 y gasté 28.50"). Cada uno va en su
           propio mensaje para que tenga su propia tarjeta con Guardar, Editar y Cancelar: así se
           puede guardar uno y corregir el otro. El componente de tarjeta no cambia — sigue siendo
           un borrador por mensaje. */
        const [primerMovimiento, ...movimientosExtra] = response.drafts;
        idRef.current += 1;
        const nuevos: ChatItem[] = [
          {
            id: `a${idRef.current}`,
            role: "assistant",
            content: response.reply,
            evidence: response.evidence,
            ...(response.suggestions.length > 0 ? { suggestions: response.suggestions } : {}),
            ...(primerMovimiento ? { draft: primerMovimiento, draftStatus: "pending" as const } : {}),
            ...(response.budgetDraft ? { budgetDraft: response.budgetDraft, draftStatus: "pending" as const } : {}),
            ...(response.obligationDraft ? { obligationDraft: response.obligationDraft, draftStatus: "pending" as const } : {}),
            ...(response.recurringDraft ? { recurringDraft: response.recurringDraft, draftStatus: "pending" as const } : {}),
          },
        ];
        for (const movimiento of movimientosExtra) {
          idRef.current += 1;
          nuevos.push({
            id: `a${idRef.current}`,
            role: "assistant",
            // Sin texto: el turno ya lo dijo arriba y esta fila es solo la tarjeta.
            content: "",
            draft: movimiento,
            draftStatus: "pending",
          });
        }
        // Cada corrección o borrado lleva su propia tarjeta, igual que los movimientos de arriba.
        for (const change of response.movementChanges) {
          idRef.current += 1;
          nuevos.push({ id: `a${idRef.current}`, role: "assistant", content: "", movementChange: change, draftStatus: "pending" });
        }
        setItems((current) => [...current, ...nuevos]);
        setRemainingToday(response.remainingToday);
        if (speakModeRef.current) {
          speakChunk(unspokenRest(response.reply, liveTextRef.current.slice(0, spokenUpTo)));
        }
      } catch (error) {
        if (!isCurrent()) return; // error de la conexión que cortó Detener: no es un fallo
        idRef.current += 1;
        setItems((current) => [
          ...current,
          {
            id: `e${idRef.current}`,
            role: "assistant",
            content: humanizeError(error),
            error: true,
            retry: { text: message, userItemId: userItem.id },
          },
        ]);
        // Reponer el texto para reintentar sin reescribir.
        setInput(message);
      } finally {
        if (isCurrent()) {
          abortRef.current = null;
          liveTextRef.current = "";
          setLiveText("");
          setIsThinking(false);
        }
      }
    },
    [activeWorkspaceId, isThinking, items, speakChunk],
  );
  sendRef.current = send;

  /**
   * Detener: corta la conexión (el servidor deja de trabajar y no cobra la pregunta) y deja en
   * el chat lo que alcanzó a escribir. Si no había escrito nada, devuelve la pregunta al campo
   * para corregirla y volver a mandarla.
   */
  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    abortRef.current = null;
    turnRef.current += 1;
    controller.abort();
    Speech.stop();
    const partial = liveTextRef.current.trim();
    liveTextRef.current = "";
    setLiveText("");
    setIsThinking(false);
    if (!partial) setInput(questionRef.current);
    idRef.current += 1;
    setItems((current) => [...current, { id: `s${idRef.current}`, role: "assistant", content: partial, stopped: true }]);
  }, []);

  // Salir de la pantalla con una respuesta en curso también la corta: nadie la va a leer.
  useEffect(() => () => abortRef.current?.abort(), []);

  const trackFollow = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    followRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
  }, []);

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

  function resolveDraftAccount(draft: AssistantDraft, snap: WorkspaceSnapshot) {
    return findByName(snap.accounts, draft.accountName) ?? pickDefaultAccount(snap.accounts, draft.currency);
  }

  function resolveDraftIds(draft: AssistantDraft, snap: WorkspaceSnapshot): ResolvedIds {
    const account = resolveDraftAccount(draft, snap);
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
        const obligation = (snapshot.obligations ?? []).find((o) => o.id === draft.obligationId);
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
      showToast("Movimiento guardado", "success");
    } catch (error) {
      showErrorToast("No se pudo guardar el movimiento", error);
    } finally {
      setSavingDraftId(null);
    }
  }

  async function saveBudgetDraft(item: ChatItem) {
    const budget = item.budgetDraft;
    if (!budget || !snapshot || !activeWorkspaceId) return;
    const category = findByName(snapshot.categories, budget.categoryName);
    setSavingDraftId(item.id);
    try {
      await createBudget.mutateAsync({
        name: budget.name,
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
        limitAmount: budget.limitAmount,
        alertPercent: budget.alertPercent,
        currencyCode: budget.currency,
        categoryId: category?.id ?? null,
      });
      setDraftStatus(item.id, "saved");
      showToast("Presupuesto creado", "success");
    } catch (error) {
      showErrorToast("No se pudo crear el presupuesto", error);
    } finally {
      setSavingDraftId(null);
    }
  }

  async function saveObligationDraft(item: ChatItem) {
    const ob = item.obligationDraft;
    if (!ob || !snapshot || !activeWorkspaceId) return;
    if (!profile?.id) {
      showToast("No hay sesión para crear la deuda.", "error");
      return;
    }
    const counterparty = findByName(snapshot.counterparties, ob.counterpartyName);
    setSavingDraftId(item.id);
    try {
      await createObligation.mutateAsync({
        userId: profile.id,
        title: ob.title,
        direction: ob.direction,
        originType: "manual",
        openingImpact: "none", // solo registra la deuda; no mueve dinero de cuentas
        counterpartyId: counterparty?.id ?? null,
        currencyCode: ob.currency,
        principalAmount: ob.principalAmount,
        startDate: ob.startDate,
        dueDate: ob.dueDate,
        description: ob.description,
        // Sin plan la deuda queda muda para la proyección: no hay mes donde ponerla.
        paymentPlan: ob.paymentPlan,
      });
      setDraftStatus(item.id, "saved");
      showToast(ob.direction === "receivable" ? "Crédito registrado" : "Deuda registrada", "success");
    } catch (error) {
      showErrorToast(ob.direction === "receivable" ? "No se pudo registrar el crédito" : "No se pudo registrar la deuda", error);
    } finally {
      setSavingDraftId(null);
    }
  }

  async function saveRecurringDraft(item: ChatItem) {
    const r = item.recurringDraft;
    if (!r || !snapshot || !activeWorkspaceId) return;
    const category = findByName(snapshot.categories, r.categoryName);
    const account = findByName(snapshot.accounts, r.accountName);
    setSavingDraftId(item.id);
    try {
      if (r.kind === "subscription") {
        await createSubscription.mutateAsync({
          name: r.name,
          amount: r.amount,
          currencyCode: r.currency,
          frequency: r.frequency,
          intervalCount: 1,
          dayOfMonth: r.dayOfMonth,
          startDate: todayYmd(),
          nextDueDate: r.nextDate,
          remindDaysBefore: 1,
          autoCreateMovement: false, // no mueve dinero solo: el usuario paga/confirma cada mes
          categoryId: category?.id ?? null,
          accountId: account?.id ?? null,
          description: r.description,
        });
      } else {
        await createRecurringIncome.mutateAsync({
          name: r.name,
          amount: r.amount,
          currencyCode: r.currency,
          frequency: r.frequency,
          intervalCount: 1,
          dayOfMonth: r.dayOfMonth,
          startDate: todayYmd(),
          nextExpectedDate: r.nextDate,
          remindDaysBefore: 1,
          categoryId: category?.id ?? null,
          accountId: account?.id ?? null,
          description: r.description,
        });
      }
      setDraftStatus(item.id, "saved");
      showToast(r.kind === "subscription" ? "Suscripción creada" : "Ingreso fijo creado", "success");
    } catch (error) {
      showErrorToast(r.kind === "subscription" ? "No se pudo crear la suscripción" : "No se pudo crear el ingreso fijo", error);
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
    const resolvedAccount = snapshot ? resolveDraftAccount(draft, snapshot) : undefined;
    const accountName = resolvedAccount?.name ?? draft.accountName ?? "—";
    const lines: { label: string; value: string }[] = [];
    if (draft.operation === "transfer") {
      lines.push({ label: "De", value: accountName });
      const dest = snapshot ? findByName(snapshot.accounts, draft.destinationAccountName) : undefined;
      lines.push({ label: "A", value: dest?.name ?? draft.destinationAccountName ?? "—" });
    } else if (draft.operation === "pay_subscription") {
      if (draft.subscriptionName) lines.push({ label: "Suscripción", value: draft.subscriptionName });
      lines.push({ label: "Cuenta", value: accountName });
    } else if (draft.operation === "pay_debt") {
      if (draft.obligationCounterparty) lines.push({ label: "Deuda", value: draft.obligationCounterparty });
      lines.push({ label: "Cuenta", value: accountName });
    } else {
      lines.push({ label: "Cuenta", value: accountName });
      if (draft.categoryName) lines.push({ label: "Categoría", value: draft.categoryName });
    }
    if (draft.description) lines.push({ label: "Detalle", value: draft.description });
    lines.push({ label: "Fecha", value: draft.occurredAt ?? "hoy" });
    // Con fecha futura se guarda planificado: no mueve el saldo hoy y entra en la proyección del
    // mes que le toca. Sin decirlo, el usuario guarda y no ve el dinero salir de su cuenta.
    if (draftMovementStatus(draft, new Date().toISOString()) === "planned") {
      lines.push({ label: "Estado", value: "Planificado — aún no mueve tu saldo" });
    }
    const canEdit = draft.operation === "expense" || draft.operation === "income" || draft.operation === "transfer";
    /* El color de la cifra lo decide el dinero, no el tipo de tarjeta: una transferencia no
       gana ni pierde nada, así que va neutra. */
    const amountTone: DraftAmountTone =
      draft.operation === "income" ? "income" : draft.operation === "transfer" ? "neutral" : "expense";
    /* Lo que queda en pantalla una vez guardado: qué fue y de qué iba, en una línea. */
    const savedTitleByOp: Record<AssistantDraft["operation"], string> = {
      expense: "Gasto registrado",
      income: "Ingreso registrado",
      transfer: "Transferencia registrada",
      pay_subscription: "Pago registrado",
      pay_debt: "Abono registrado",
    };
    const savedSubtitle = [draft.description, draft.categoryName ?? draft.subscriptionName ?? draft.obligationCounterparty]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(" · ");
    return {
      title: titleByOp[draft.operation],
      amountLabel: `${sign} ${money}`.trim(),
      lines,
      canEdit,
      amountTone,
      savedTitle: savedTitleByOp[draft.operation],
      savedSubtitle: savedSubtitle || accountName,
    };
  }

  /**
   * Aplica la corrección o el borrado con la MISMA edición y el mismo borrado que la pantalla de
   * Movimientos (incluido el modo sin conexión). El servidor ya validó que es un gasto o ingreso
   * suelto y resolvió categoría, cuenta y contacto a ids del espacio.
   */
  async function applyMovementChange(item: ChatItem) {
    const change = item.movementChange;
    if (!change || !activeWorkspaceId) return;
    const kind = change.movementType === "expense" ? "Gasto" : "Ingreso";
    setSavingDraftId(item.id);
    try {
      if (change.action === "delete") {
        await deleteMovement.mutateAsync(change.movementId);
        showToast(`${kind} borrado`, "success");
      } else {
        await updateMovement.mutateAsync({ id: change.movementId, input: movementChangeToUpdate(change) });
        showToast(`${kind} corregido`, "success");
      }
      setDraftStatus(item.id, "saved");
    } catch (error) {
      showErrorToast(change.action === "delete" ? `No se pudo borrar el ${kind.toLowerCase()}` : `No se pudo corregir el ${kind.toLowerCase()}`, error);
    } finally {
      setSavingDraftId(null);
    }
  }

  function movementChangeCardProps(item: ChatItem) {
    const change = item.movementChange!;
    const kind = change.movementType === "expense" ? "gasto" : "ingreso";
    const money = (amount: number) => formatCurrency(amount, change.currency);
    const amount = change.after.amount ?? change.before.amount;
    const isDelete = change.action === "delete";
    return {
      title: isDelete ? `Borrar ${kind}` : `Corregir ${kind}`,
      amountLabel: money(amount),
      amountTone: (change.movementType === "expense" ? "expense" : "income") as DraftAmountTone,
      lines: movementChangeLines(change, money),
      saveLabel: isDelete ? "Borrar" : "Aplicar",
      savingLabel: isDelete ? "Borrando…" : "Aplicando…",
      savedTitle: isDelete ? `${kind[0].toUpperCase()}${kind.slice(1)} borrado` : `${kind[0].toUpperCase()}${kind.slice(1)} corregido`,
      savedSubtitle: change.after.description ?? change.before.description ?? change.before.date,
    };
  }

  function budgetCardProps(item: ChatItem) {
    const b = item.budgetDraft!;
    const money = formatCurrency(b.limitAmount, b.currency);
    const lines: { label: string; value: string }[] = [
      { label: "Categoría", value: b.categoryName ?? "General (todo el workspace)" },
      { label: "Período", value: `${b.periodStart} → ${b.periodEnd}` },
      { label: "Alerta", value: `${b.alertPercent}%` },
    ];
    return { title: "Crear presupuesto", amountLabel: `Límite ${money}`, lines };
  }

  function obligationCardProps(item: ChatItem) {
    const o = item.obligationDraft!;
    const money = formatCurrency(o.principalAmount, o.currency);
    const lines: { label: string; value: string }[] = [
      { label: "Tipo", value: o.direction === "receivable" ? "Te deben (crédito)" : "Tú debes (deuda)" },
      { label: "Contraparte", value: o.counterpartyName ?? "—" },
    ];
    if (o.dueDate) lines.push({ label: "Vence", value: o.dueDate });
    // El plan es lo que decide si esta deuda aparecerá en la proyección o no dirá nada. Se
    // muestra antes de guardar —incluida su ausencia— porque después hay que ir a buscarlo.
    lines.push({
      label: "Plan de pagos",
      value: o.planSummary ?? "Sin plan — no entrará en la proyección",
    });
    if (o.description) lines.push({ label: "Detalle", value: o.description });
    return {
      title: o.direction === "receivable" ? "Registrar crédito" : "Registrar deuda",
      amountLabel: money,
      lines,
    };
  }

  function recurringCardProps(item: ChatItem) {
    const r = item.recurringDraft!;
    const money = formatCurrency(r.amount, r.currency);
    const freqLabel = r.frequency === "weekly" ? "Semanal" : r.frequency === "yearly" ? "Anual" : "Mensual";
    const lines: { label: string; value: string }[] = [
      { label: "Frecuencia", value: freqLabel },
      { label: "Próximo", value: r.nextDate },
    ];
    if (r.categoryName) lines.push({ label: "Categoría", value: r.categoryName });
    if (r.accountName) lines.push({ label: "Cuenta", value: r.accountName });
    return {
      title: r.kind === "subscription" ? `Nueva suscripción · ${r.name}` : `Nuevo ingreso fijo · ${r.name}`,
      amountLabel: money,
      lines,
    };
  }

  /**
   * La respuesta y su tarjeta juntas. Antes una respuesta con tarjeta mostraba solo la tarjeta y su
   * texto se perdía; con la respuesta en vivo, además, aparecía escribiéndose para desaparecer.
   */
  const renderItem = ({ item }: { item: ChatItem }) => {
    const hasCard = Boolean(item.draft || item.budgetDraft || item.obligationDraft || item.recurringDraft || item.movementChange);
    if (!hasCard || !item.content.trim()) return renderTurn({ item });
    const textOnly: ChatItem = {
      ...item,
      draft: undefined,
      budgetDraft: undefined,
      obligationDraft: undefined,
      recurringDraft: undefined,
      movementChange: undefined,
    };
    return (
      <View style={styles.turnWithCard}>
        {renderTurn({ item: textOnly })}
        {renderTurn({ item })}
      </View>
    );
  };

  const renderTurn = ({ item }: { item: ChatItem }) => {
    {
      if (item.movementChange) {
        const props = movementChangeCardProps(item);
        const change = item.movementChange;
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              {...props}
              status={item.draftStatus ?? "pending"}
              isSaving={savingDraftId === item.id}
              destructive={change.action === "delete"}
              onSave={() => void applyMovementChange(item)}
              onCancel={() => setDraftStatus(item.id, "discarded")}
              onViewMovement={
                change.action === "update"
                  ? () => router.push(`/movement/${change.movementId}?from=assistant` as never)
                  : undefined
              }
            />
          </View>
        );
      }
      if (item.recurringDraft) {
        const { title, amountLabel, lines } = recurringCardProps(item);
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              title={title}
              amountLabel={amountLabel}
              lines={lines}
              status={item.draftStatus ?? "pending"}
              isSaving={savingDraftId === item.id}
              onSave={() => void saveRecurringDraft(item)}
              onEdit={() => showToast("Se crea o se cancela; ajústalo luego en Suscripciones / Ingresos fijos.", "info")}
              onCancel={() => setDraftStatus(item.id, "discarded")}
            />
          </View>
        );
      }
      if (item.obligationDraft) {
        const { title, amountLabel, lines } = obligationCardProps(item);
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              title={title}
              amountLabel={amountLabel}
              lines={lines}
              status={item.draftStatus ?? "pending"}
              isSaving={savingDraftId === item.id}
              onSave={() => void saveObligationDraft(item)}
              onEdit={() => showToast("La deuda se crea o se cancela; ajústala luego en Créditos y deudas.", "info")}
              onCancel={() => setDraftStatus(item.id, "discarded")}
            />
          </View>
        );
      }
      if (item.budgetDraft) {
        const { title, amountLabel, lines } = budgetCardProps(item);
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              title={title}
              amountLabel={amountLabel}
              lines={lines}
              status={item.draftStatus ?? "pending"}
              isSaving={savingDraftId === item.id}
              onSave={() => void saveBudgetDraft(item)}
              onEdit={() => showToast("El presupuesto se crea o se cancela; ajústalo luego en Presupuestos.", "info")}
              onCancel={() => setDraftStatus(item.id, "discarded")}
            />
          </View>
        );
      }
      if (item.draft) {
        const { title, amountLabel, lines, canEdit, amountTone, savedTitle, savedSubtitle } = draftCardProps(item);
        return (
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
            </View>
            <AssistantDraftCard
              title={title}
              amountLabel={amountLabel}
              amountTone={amountTone}
              lines={lines}
              savedTitle={savedTitle}
              savedSubtitle={savedSubtitle}
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
          {item.content ? (
            <Text style={styles.bubbleText}>
              {parseBoldSegments(item.content).map((segment, index) => (
                <Text key={index} style={segment.bold ? styles.bubbleTextBold : undefined}>
                  {segment.text}
                </Text>
              ))}
            </Text>
          ) : null}
          {item.stopped ? <Text style={styles.stoppedNote}>Detuviste la respuesta.</Text> : null}
          {item.retry && item.id === items[items.length - 1]?.id && !isThinking ? (
            <TouchableOpacity
              style={styles.retryChip}
              onPress={() => void send(item.retry!.text, item)}
              accessibilityLabel="Reintentar la pregunta"
            >
              <RotateCcw size={13} color={COLORS.pro} strokeWidth={2.2} />
              <Text style={styles.retryChipText}>Reintentar</Text>
            </TouchableOpacity>
          ) : null}
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
            <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
          </View>
          {bubble}
        </View>
      );
    }
  };

  // Las sugerencias de seguimiento solo van bajo la última respuesta, y no mientras piensa.
  const lastItem = items[items.length - 1];
  const followUps =
    !isThinking && lastItem?.role === "assistant" && !lastItem.error ? lastItem.suggestions ?? [] : [];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Asistente"
        subtitle={remainingToday != null ? `${remainingToday} preguntas restantes hoy` : "Consulta tus movimientos"}
        onBack={handleBack}
        withSafeArea
        rightAction={
          /* Las mismas pastillas que las otras 16 pantallas. Aquí eran iconos pelados de 20 px
             sin fondo ni háptica: la cabecera del asistente se leía como de otra app. El estado
             activo del modo hablante lo pinta el propio componente. */
          <HeaderActionGroup
            actions={[
              {
                key: "chats",
                icon: History,
                label: "Chats",
                accessibilityLabel: "Ver conversaciones",
                onPress: () => setChatsVisible(true),
              },
              {
                key: "speak",
                icon: speakMode ? Volume2 : VolumeX,
                active: speakMode,
                accessibilityLabel: speakMode ? "Desactivar modo hablante" : "Activar modo hablante",
                onPress: toggleSpeakMode,
              },
            ]}
          />
        }
      />
      <View style={styles.flex}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onScroll={trackFollow}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (isThinking && followRef.current) listRef.current?.scrollToEnd({ animated: true });
          }}
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
              {followUps.length > 0 ? (
                <View style={styles.suggestions}>
                  {followUps.map((suggestion) => (
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
                    <Sparkles size={13} color={COLORS.pro} strokeWidth={2.2} />
                  </View>
                  {liveText ? (
                    <View style={[styles.bubble, styles.bubbleAssistant]}>
                      <Text style={styles.bubbleText}>
                        {parseBoldSegments(closeDanglingBold(liveText)).map((segment, index) => (
                          <Text key={index} style={segment.bold ? styles.bubbleTextBold : undefined}>
                            {segment.text}
                          </Text>
                        ))}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingRow]}>
                      <ActivityIndicator size="small" color={COLORS.pro} />
                      <Text style={styles.thinkingText}>{thinkingText}</Text>
                    </View>
                  )}
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
          <TextField
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
          {isDictationAvailable ? (
            <TouchableOpacity
              style={[styles.micBtn, isListening ? styles.micBtnActive : null]}
              onPressIn={() => void startDictation()}
              onPressOut={stopDictation}
              disabled={isThinking}
              accessibilityLabel="Mantén presionado para dictar"
            >
              <Mic size={18} color={isListening ? COLORS.void : COLORS.pro} />
            </TouchableOpacity>
          ) : null}
          {isThinking ? (
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={stop}
              accessibilityLabel="Detener la respuesta"
            >
              <Square size={14} color={COLORS.pro} fill={COLORS.pro} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() ? styles.sendBtnDisabled : null]}
              onPress={() => void send(input)}
              disabled={!input.trim()}
              accessibilityLabel="Enviar pregunta"
            >
              <Send size={18} color={COLORS.void} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <MovementForm
        visible={editDuplicate != null}
        onClose={() => setEditDuplicate(null)}
        onSuccess={() => showToast("Movimiento guardado", "success")}
        duplicateMovement={editDuplicate}
      />

      <AssistantChatsSheet
        visible={chatsVisible}
        chats={chats}
        activeId={activeId}
        locked={isThinking}
        pendingDelete={chats.find((chat) => chat.id === pendingDeleteId) ?? null}
        onSelect={selectChat}
        onNew={startNewChat}
        onRename={(id, title) => setChats((current) => renameChat(current, id, title))}
        onAskDelete={setPendingDeleteId}
        onCancelDelete={() => setPendingDeleteId(null)}
        onConfirmDelete={confirmDeleteChat}
        onClose={() => {
          setChatsVisible(false);
          setPendingDeleteId(null);
        }}
      />
    </View>
  );
}

/** Lado del avatar del asistente. Nombrado porque la sangría de las sugerencias depende de él. */
const AVATAR_SIZE = 26;
/** Tope del campo de escribir: ~4 líneas antes de que empiece a desplazarse. */
const INPUT_MAX_HEIGHT = 110;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  listContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bubble: {
    maxWidth: "86%",
    /* xl, igual que Card y ResourceCard. Estaba en lg (10) y las burbujas salían más cuadradas
       que cualquier otra superficie de la app. */
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  /* Lo que escribe el usuario no es un ingreso: el tinte verde lo hacía leerse como dinero. */
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: SURFACE.card,
    borderColor: SURFACE.cardBorder,
    borderBottomRightRadius: RADIUS.sm,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    flexShrink: 1,
    backgroundColor: SURFACE.card,
    borderColor: SURFACE.cardBorder,
    borderTopLeftRadius: RADIUS.sm,
  },
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
    maxWidth: "94%",
  },
  /* El círculo del asistente es su marca: violeta. El relleno y el aro iban en verde menta
     (SURFACE.cardActive es rgba(134,206,150,…)), así que cambiar solo el ícono no bastaba. */
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.proMuted,
    borderWidth: 1,
    borderColor: COLORS.pro + "44",
    marginTop: SPACING.xs / 2,
  },
  suggestions: {
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    marginLeft: AVATAR_SIZE + SPACING.xs,
  },
  suggestionChip: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  suggestionChipText: {
    color: COLORS.fog,
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
    borderColor: SURFACE.cardBorder,
  },
  evidenceChipText: {
    color: COLORS.fog,
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
    maxHeight: INPUT_MAX_HEIGHT,
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
  /* Violeta, como el avatar y el enviar: son el mismo grupo de controles del asistente. */
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.pro,
    backgroundColor: "transparent",
  },
  micBtnActive: {
    backgroundColor: COLORS.pro,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.pro,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  /* Mismo tamaño que Enviar, en contorno como el micrófono: se lee como "parar", no "mandar". */
  turnWithCard: { gap: SPACING.sm },
  stopBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.pro,
  },
  retryChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.pro,
  },
  retryChipText: {
    color: COLORS.pro,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  stoppedNote: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    fontStyle: "italic",
  },
});

export default function AssistantScreenRoot() {
  return (
    <ErrorBoundary>
      <AssistantScreen />
    </ErrorBoundary>
  );
}
