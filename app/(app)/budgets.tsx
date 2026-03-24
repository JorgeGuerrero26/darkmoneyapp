import { FAB } from "../../components/ui/FAB";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteBudgetMutation,
} from "../../services/queries/workspace-data";
import type { BudgetOverview } from "../../types/domain";
import { BudgetCard } from "../../components/domain/BudgetCard";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { BudgetForm } from "../../components/forms/BudgetForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<BudgetOverview | null>(null);
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const budgets = snapshot?.budgets ?? [];
  const alertBudgets = budgets.filter((b) => b.isOverLimit || b.isNearLimit);
  const okBudgets = budgets.filter((b) => !b.isOverLimit && !b.isNearLimit);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Presupuestos" onBack={() => router.replace("/(app)/more")} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : budgets.length === 0 ? (
          <EmptyState
            title="Sin presupuestos"
            description="Crea un presupuesto para controlar tus gastos."
            action={{ label: "Nuevo presupuesto", onPress: () => setFormVisible(true) }}
          />
        ) : (
          <>
            {alertBudgets.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚠ Requieren atención</Text>
                {alertBudgets.map((b) => (
                  <SwipeableBudgetRow
                    key={b.id}
                    budget={b}
                    onEdit={() => setEditBudget(b)}
                    onDelete={() => handleDelete(b)}
                  />
                ))}
              </View>
            ) : null}

            {okBudgets.length > 0 ? (
              <View style={styles.section}>
                {alertBudgets.length > 0 ? (
                  <Text style={styles.sectionTitle}>✓ En buen estado</Text>
                ) : null}
                {okBudgets.map((b) => (
                  <SwipeableBudgetRow
                    key={b.id}
                    budget={b}
                    onEdit={() => setEditBudget(b)}
                    onDelete={() => handleDelete(b)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />

      <BudgetForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() => setFormVisible(false)}
      />
      <BudgetForm
        visible={Boolean(editBudget)}
        onClose={() => setEditBudget(null)}
        onSuccess={() => setEditBudget(null)}
        editBudget={editBudget ?? undefined}
      />
      <ConfirmDialog
        visible={Boolean(deleteBudget)}
        title="Eliminar presupuesto"
        body={deleteBudget ? `¿Eliminar "${deleteBudget.name}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteBudget(null)}
        onConfirm={() => {
          if (!deleteBudget) return;
          deleteMutation.mutate(deleteBudget.id, {
            onSuccess: () => showToast("Presupuesto eliminado", "success"),
            onError: (e) => showToast(e.message, "error"),
          });
          setDeleteBudget(null);
        }}
      />
    </View>
  );

  function handleDelete(budget: BudgetOverview) {
    setDeleteBudget(budget);
  }
}

const REVEAL_WIDTH = 82;

function SwipeableBudgetRow({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetOverview;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const actionOpacity = translateX.interpolate({
    inputRange: [-REVEAL_WIDTH, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    isOpen.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const next = Math.max(-REVEAL_WIDTH * 1.4, Math.min(0, base + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const finalX = base + dx;
        if (finalX < -REVEAL_WIDTH / 2 || vx < -0.4) {
          snapTo(-REVEAL_WIDTH);
        } else {
          snapTo(0);
        }
      },
    })
  ).current;

  function handleCardPress() {
    if (isOpen.current) { snapTo(0); return; }
    onEdit();
  }

  function handleDeletePress() {
    snapTo(0, onDelete);
  }

  return (
    <View style={swipeStyles.container}>
      <Animated.View style={[swipeStyles.actionBg, { opacity: actionOpacity }]}>
        <TouchableOpacity style={swipeStyles.actionBtn} onPress={handleDeletePress} activeOpacity={0.8}>
          <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
          <Text style={swipeStyles.actionLabel}>Eliminar</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <BudgetCard budget={budget} onPress={handleCardPress} />
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  actionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    backgroundColor: COLORS.danger + "30",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.danger,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
