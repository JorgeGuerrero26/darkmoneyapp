import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWorkspace, useWorkspaceListStore } from "../../lib/workspace-context";
import type { Workspace } from "../../types/domain";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

export function WorkspaceSelector() {
  const { activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const { workspaces } = useWorkspaceListStore();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  if (!activeWorkspace) return null;

  // Don't show selector if there's only one workspace
  if (workspaces.length <= 1) {
    return (
      <Text style={styles.wsName} numberOfLines={1}>
        {activeWorkspace.name}
      </Text>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.wsName} numberOfLines={1}>
          {activeWorkspace.name}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.sheetTitle}>Cambiar workspace</Text>
            <ScrollView>
              {workspaces.map((ws: Workspace) => (
                <TouchableOpacity
                  key={ws.id}
                  style={[
                    styles.wsItem,
                    ws.id === activeWorkspace.id && styles.wsItemActive,
                  ]}
                  onPress={() => {
                    setActiveWorkspaceId(ws.id);
                    setOpen(false);
                  }}
                >
                  <View style={styles.wsItemLeft}>
                    <Text style={styles.wsItemName}>{ws.name}</Text>
                    <Text style={styles.wsItemKind}>
                      {ws.kind === "personal" ? "Personal" : "Compartido"} · {ws.role}
                    </Text>
                  </View>
                  {ws.id === activeWorkspace.id ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wsName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
    maxWidth: 160,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 180,
  },
  chevron: { fontSize: 10, color: COLORS.textMuted },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: "60%",
  },
  sheetTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  wsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  wsItemActive: { backgroundColor: COLORS.primary + "22" },
  wsItemLeft: { flex: 1, gap: 2 },
  wsItemName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
  },
  wsItemKind: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  checkmark: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
});
