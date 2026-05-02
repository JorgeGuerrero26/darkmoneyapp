import { FAB } from "../../components/ui/FAB";
import { StaggeredItem } from "../../components/ui/StaggeredItem";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Animated,
  PanResponder,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
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
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
  const [formVisible, setFormVisible] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetOverview | null>(null);
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const deleteMutation = useDeleteBudgetMutation(activeWorkspaceId);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function startUndoDelete(budget: BudgetOverview) {
    setPendingDeleteIds((prev) => new Set(prev).add(budget.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [budget.id]: budget.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(budget.id, {
        onError: (e) => showToast(e.message, "error"),
      });
      setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(budget.id); return n; });
      deleteTimers.current.delete(budget.id);
    }, 5000);
    deleteTimers.current.set(budget.id, timer);
  }

  function undoDelete(id: number) {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  useEffect(() => () => { deleteTimers.current.forEach(clearTimeout); }, []);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const budgets = snapshot?.budgets ?? [];
  const alertBudgets = budgets.filter((b) => !pendingDeleteIds.has(b.id) && (b.isOverLimit || b.isNearLimit));
  const okBudgets = budgets.filter((b) => !pendingDeleteIds.has(b.id) && !b.isOverLimit && !b.isNearLimit);
  const isHandlingBackRef = useRef(false);

  const returnRoute = "/(app)/more";

  const handleBack = useCallback(() => {
    if (isHandlingBackRef.current) return;
    isHandlingBackRef.current = true;
    router.replace(returnRoute as any);
  }, [returnRoute, router]);

  useEffect(() => {
    isHandlingBackRef.current = false;
  }, []);

  const refreshTriggeredRef = useRef(false);
  const onRefresh = useCallback(() => {
    refreshTriggeredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  useEffect(() => {
    if (!isLoading && refreshTriggeredRef.current) {
      refreshTriggeredRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isLoading]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      const actionType = event.data.action.type;
      const isBackAction =
        actionType === "GO_BACK" ||
        actionType === "POP" ||
        actionType === "POP_TO_TOP";
      if (!isBackAction || isHandlingBackRef.current) return;
      event.preventDefault();
      handleBack();
    });

    return unsubscribe;
  }, [handleBack, navigation]);

  const handleDelete = useCallback((budget: BudgetOverview) => {
    startUndoDelete(budget);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const budgetSections = useMemo(() => {
    const sections: Array<{ key: string; title: string; data: BudgetOverview[] }> = [];
    if (alertBudgets.length > 0) {
      sections.push({ key: "alert", title: "⚠ Requieren atención", data: alertBudgets });
    }
    if (okBudgets.length > 0) {
      sections.push({
        key: "ok",
        title: alertBudgets.length > 0 ? "✓ En buen estado" : "",
        data: okBudgets,
      });
    }
    return sections;
  }, [alertBudgets, okBudgets]);

  const renderBudgetItem = useCallback(({ item, index }: { item: BudgetOverview; index: number }) => (
    <StaggeredItem index={index}>
      <SwipeableBudgetRow
        budget={item}
        onEdit={() => setEditBudget(item)}
        onDelete={() => handleDelete(item)}
      />
    </StaggeredItem>
  ), [handleDelete]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Presupuestos" onBack={handleBack} />

      <SectionList
        sections={budgetSections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderBudgetItem}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="Sin presupuestos"
              description="Crea un presupuesto para controlar tus gastos."
              action={{ label: "Nuevo presupuesto", onPress: () => setFormVisible(true) }}
            />
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        SectionSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={15}
        contentContainerStyle={styles.listContent}
      />

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
      <UndoBanner
        visible={pendingDeleteIds.size > 0}
        message={pendingDeleteIds.size === 1
          ? `Presupuesto "${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminado`
          : `${pendingDeleteIds.size} presupuestos eliminados`}
        onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
        durationMs={5000}
        bottomOffset={insets.bottom + 80}
      />
    </View>
  );

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
  listContent: { padding: SPACING.lg, paddingBottom: 100 },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

export default function BudgetsScreenRoot() {
  return (
    <ErrorBoundary>
      <BudgetsScreen />
    </ErrorBoundary>
  );
}
