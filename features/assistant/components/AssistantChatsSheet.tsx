import { Pressable, StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { StoredChat } from "../lib/chat-store";

type Props = {
  visible: boolean;
  chats: readonly StoredChat[];
  activeId: string;
  /** Mientras responde no se cambia de chat: la respuesta caería en la conversación equivocada. */
  locked: boolean;
  pendingDelete: StoredChat | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onClose: () => void;
};

function dayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

/**
 * Las conversaciones del asistente. Separar es todo lo que hace: cada una conserva sus mensajes y
 * solo esos le llegan al asistente cuando preguntas.
 */
export function AssistantChatsSheet({
  visible,
  chats,
  activeId,
  locked,
  pendingDelete,
  onSelect,
  onNew,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onClose,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Conversaciones"
      snapHeight={0.7}
      overlay={
        /* Dentro del mismo Modal: iOS solo presenta uno a la vez y un diálogo hermano no aparece. */
        <ConfirmDialog
          inline
          visible={pendingDelete != null}
          icon="🗑️"
          title="¿Borrar esta conversación?"
          body={`"${pendingDelete?.title ?? ""}" se borrará de este teléfono y no podrás recuperarla. Tus movimientos y tus datos no se tocan.`}
          confirmLabel="Borrar"
          cancelLabel="Cancelar"
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      }
    >
      <Button label="Nueva conversación" size="lg" onPress={onNew} disabled={locked} />

      {locked ? (
        <Text style={styles.hint} maxFontSizeMultiplier={1.4}>
          Espera a que termine de responder para cambiar de conversación.
        </Text>
      ) : null}

      {chats.length === 0 ? (
        <Text style={styles.hint} maxFontSizeMultiplier={1.4}>
          Aún no hay conversaciones guardadas. Se guardan solas en cuanto haces la primera pregunta.
        </Text>
      ) : (
        <View style={styles.list}>
          {chats.map((chat) => {
            const selected = chat.id === activeId;
            return (
              <View key={chat.id} style={[styles.row, selected && styles.rowSelected]}>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => onSelect(chat.id)}
                  disabled={locked}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: locked }}
                  accessibilityLabel={`Abrir conversación: ${chat.title}`}
                >
                  <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {chat.title}
                  </Text>
                  <Text style={styles.meta} maxFontSizeMultiplier={1.3}>
                    {dayLabel(chat.updatedAt)} · {chat.items.length} mensajes{selected ? " · abierta" : ""}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.delete}
                  onPress={() => onAskDelete(chat.id)}
                  disabled={locked && selected}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Borrar conversación: ${chat.title}`}
                >
                  <Trash2 size={16} color={COLORS.storm} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  rowSelected: { borderColor: COLORS.pro },
  rowMain: { flex: 1, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, gap: 2 },
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  delete: { padding: SPACING.md },
  hint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
