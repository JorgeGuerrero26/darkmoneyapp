import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Send, Sparkles } from "lucide-react-native";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { useWorkspace } from "../lib/workspace-context";
import {
  askAssistant,
  type AssistantChatMessage,
  type AssistantEvidence,
} from "../services/queries/assistant";
import { parseBoldSegments } from "../lib/assistant-text";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: AssistantEvidence[];
  error?: boolean;
};

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
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/dashboard" });
  const { activeWorkspaceId } = useWorkspace();

  const [items, setItems] = useState<ChatItem[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const idRef = useRef(0);

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

  const renderItem = useCallback(
    ({ item }: { item: ChatItem }) => {
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
    },
    [openEvidence],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Asistente"
        subtitle={remainingToday != null ? `${remainingToday} preguntas restantes hoy` : "Consulta tus movimientos"}
        onBack={handleBack}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        // "padding" en ambos: con edge-to-edge el teclado superpone la ventana y
        // el padding se restaura limpio al cerrarse ("height" dejaba un hueco
        // muerto bajo el input al ocultar el teclado).
        behavior="padding"
      >
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
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + SPACING.sm }]}>
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
            style={[styles.sendBtn, (!input.trim() || isThinking) ? styles.sendBtnDisabled : null]}
            onPress={() => void send(input)}
            disabled={!input.trim() || isThinking}
            accessibilityLabel="Enviar pregunta"
          >
            <Send size={18} color={COLORS.void} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
