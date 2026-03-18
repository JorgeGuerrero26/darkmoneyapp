import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useUpdateCategoryMutation,
} from "../services/queries/workspace-data";
import type { CategoryOverview } from "../types/domain";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { CategoryForm } from "../components/forms/CategoryForm";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";

const KIND_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Gasto",
  both: "Ambos",
};

const KIND_COLORS: Record<string, string> = {
  expense: COLORS.expense,
  income: COLORS.income,
  both: COLORS.primary,
};

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const updateMutation = useUpdateCategoryMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryOverview | null>(null);

  const categories = (snapshot?.categories ?? []) as CategoryOverview[];
  const userCategories = categories.filter((c) => !c.isSystem);
  const systemCategories = categories.filter((c) => c.isSystem);

  function handleToggleActive(cat: CategoryOverview) {
    const newActive = !cat.isActive;
    updateMutation.mutate(
      { id: cat.id, input: { isActive: newActive } },
      {
        onSuccess: () => showToast(newActive ? "Categoría activada" : "Categoría desactivada", "success"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }

  function renderCategory(cat: CategoryOverview) {
    const color = cat.color ?? KIND_COLORS[cat.kind] ?? COLORS.primary;
    return (
      <Card key={cat.id} style={[styles.card, !cat.isActive && styles.cardInactive]}>
        <View style={styles.cardRow}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <View style={styles.cardInfo}>
            <Text style={[styles.name, !cat.isActive && styles.nameMuted]}>
              {cat.icon ? `${cat.icon} ` : ""}{cat.name}
            </Text>
            <Text style={styles.kind}>{KIND_LABELS[cat.kind] ?? cat.kind}
              {cat.parentName ? ` · ${cat.parentName}` : ""}
              {cat.movementCount > 0 ? ` · ${cat.movementCount} movimientos` : ""}
            </Text>
          </View>
          {!cat.isSystem ? (
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => setEditCategory(cat)}
              >
                <Text style={styles.iconActionText}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => handleToggleActive(cat)}
              >
                <Text style={[styles.iconActionText, { color: cat.isActive ? COLORS.textMuted : COLORS.income }]}>
                  {cat.isActive ? "✕" : "✓"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.systemBadge}>Sistema</Text>
          )}
        </View>
      </Card>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Categorías" />

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : categories.length === 0 ? (
          <EmptyState title="Sin categorías" description="Crea tu primera categoría con el botón +" action={{ label: "Nueva categoría", onPress: () => setCreateFormVisible(true) }} />
        ) : null}

        {userCategories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personalizadas</Text>
            {userCategories.map(renderCategory)}
          </View>
        ) : null}

        {systemCategories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Del sistema</Text>
            {systemCategories.map(renderCategory)}
          </View>
        ) : null}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setCreateFormVisible(true)}
        accessibilityLabel="Nueva categoría"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <CategoryForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
      <CategoryForm
        visible={Boolean(editCategory)}
        onClose={() => setEditCategory(null)}
        onSuccess={() => setEditCategory(null)}
        editCategory={editCategory ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 100 },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: SPACING.xs,
  },
  card: { padding: SPACING.md },
  cardInactive: { opacity: 0.5 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  cardInfo: { flex: 1 },
  name: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  nameMuted: { color: COLORS.textMuted },
  kind: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  cardActions: { flexDirection: "row", gap: SPACING.xs },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionText: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  systemBadge: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: "#FFFFFF", fontSize: 28, fontWeight: "300", lineHeight: 32 },
});
