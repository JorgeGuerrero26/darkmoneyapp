import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { Download, SlidersHorizontal } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { UndoBanner } from "../components/ui/UndoBanner";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { CategoryForm } from "../components/forms/CategoryForm";
import { CategoryAnalyticsModal } from "../components/domain/CategoryAnalyticsModal";
import { CategoryFilterSheet } from "../features/categories/components/CategoryFilterSheet";
import { CategorySummaryBar } from "../features/categories/components/CategorySummaryBar";
import { CategorySwipeRow } from "../features/categories/components/CategorySwipeRow";
import {
  buildCategorySections,
  categoryCanDelete,
  CATEGORY_FILTERS,
  CATEGORY_KIND_LABELS,
  filterCategories,
  type CategoryFilter,
  type CategoryListSection,
} from "../features/categories/lib/categoryFilters";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { buildCategoriesCsv } from "../lib/categories-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useCategoriesOverviewQuery,
  useDeleteCategoryMutation,
  useToggleCategoryMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import { COLORS } from "../constants/theme";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { CategoryOverview } from "../types/domain";

const KIND_COLORS = {
  expense: COLORS.expense,
  income: COLORS.income,
  both: COLORS.primary,
} as const;

function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: overviewList = [], isLoading } = useCategoriesOverviewQuery(profile, activeWorkspaceId);
  const toggleMutation = useToggleCategoryMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCategoryMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryOverview | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<CategoryOverview | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [kindFilter, setKindFilter] = useState<CategoryFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [pendingDeleteLabels, setPendingDeleteLabels] = useState<Record<number, string>>({});
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const categories = useMemo(
    () => overviewList.filter((category) => !pendingDeleteIds.has(category.id)),
    [overviewList, pendingDeleteIds],
  );
  const filteredCategories = useMemo(
    () => filterCategories(categories, kindFilter, searchText, showInactive),
    [categories, kindFilter, searchText, showInactive],
  );
  const sections = useMemo(() => buildCategorySections(filteredCategories), [filteredCategories]);
  const categoryPostedMovements = snapshot?.categoryPostedMovements ?? [];
  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const summary = useMemo(() => ({
    totalCount: filteredCategories.length,
    activeCount: filteredCategories.filter((category) => category.isActive).length,
    systemCount: filteredCategories.filter((category) => category.isSystem).length,
  }), [filteredCategories]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    if (kindFilter !== "all") {
      items.push({
        key: "kind",
        label: CATEGORY_FILTERS.find((filter) => filter.value === kindFilter)?.label ?? "Tipo",
        onRemove: () => setKindFilter("all"),
      });
    }
    if (showInactive) {
      items.push({
        key: "inactive",
        label: "Inactivas visibles",
        onRemove: () => setShowInactive(false),
      });
    }
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    return items;
  }, [kindFilter, searchText, showInactive]);

  const extraFiltersCount = showInactive ? 1 : 0;
  const hasFilters = kindFilter !== "all" || showInactive || Boolean(searchText.trim());
  const contextNote = hasFilters
    ? `Mostrando ${filteredCategories.length} de ${categories.length} categorías.`
    : "Toca una categoría para editarla. Desliza para activar, desactivar o eliminar cuando aplique.";

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
  }, []);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["categories-overview", activeWorkspaceId] });
  }, [activeWorkspaceId, queryClient]);

  const clearFilters = useCallback(() => {
    setKindFilter("all");
    setShowInactive(false);
    setSearchText("");
  }, []);

  const startUndoDelete = useCallback((category: CategoryOverview) => {
    setPendingDeleteIds((prev) => new Set(prev).add(category.id));
    setPendingDeleteLabels((prev) => ({ ...prev, [category.id]: category.name }));
    const timer = setTimeout(() => {
      deleteMutation.mutate(category.id, {
        onError: (error) => showToast(error.message, "error"),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
      deleteTimers.current.delete(category.id);
    }, 5000);
    deleteTimers.current.set(category.id, timer);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleToggleActive = useCallback((category: CategoryOverview) => {
    if (category.isSystem) return;
    const isActive = !category.isActive;
    toggleMutation.mutate(
      { id: category.id, isActive },
      {
        onSuccess: () => showToast(isActive ? "Categoría activada" : "Categoría desactivada", "success"),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }, [showToast, toggleMutation]);

  const exportCSV = useCallback(async () => {
    if (filteredCategories.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildCategoriesCsv(filteredCategories);
      await shareCsvAsFile(csv, `categorias-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Error al exportar", "error");
    }
  }, [activeWorkspace?.name, filteredCategories, showToast]);

  const renderCategory: SectionListRenderItem<CategoryOverview, CategoryListSection> = useCallback(({ item }) => {
    const color = item.color ?? KIND_COLORS[item.kind] ?? COLORS.primary;
    const kindLabel = CATEGORY_KIND_LABELS[item.kind] ?? item.kind;
    const canDelete = categoryCanDelete(item, overviewList);

    return (
      <CategorySwipeRow
        category={item}
        color={color}
        kindLabel={kindLabel}
        canDelete={canDelete}
        toggleDisabled={toggleMutation.isPending}
        onPress={() => (item.isSystem ? setAnalyticsTarget(item) : setEditCategory(item))}
        onToggle={() => handleToggleActive(item)}
        onAnalytics={() => setAnalyticsTarget(item)}
        onDelete={() => startUndoDelete(item)}
      />
    );
  }, [handleToggleActive, overviewList, startUndoDelete, toggleMutation.isPending]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title="Categorías"
          onBack={handleBack}
          rightAction={
            <HeaderActionGroup
              actions={[
                {
                  key: "export",
                  icon: Download,
                  onPress: () => void exportCSV(),
                  disabled: filteredCategories.length === 0,
                  accessibilityLabel: "Descargar categorías en CSV",
                },
                {
                  key: "filters",
                  icon: SlidersHorizontal,
                  label: extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros",
                  active: extraFiltersCount > 0,
                  onPress: () => setFilterSheetOpen(true),
                  accessibilityLabel: "Abrir filtros avanzados de categorías",
                },
              ]}
            />
          }
        />
      }
      toolbar={
        <FilterToolbar
          options={CATEGORY_FILTERS}
          value={kindFilter}
          onChange={setKindFilter}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar categorías..."
        />
      }
      activeFilters={<ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={categories.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        filteredCategories.length > 0 ? (
          <CategorySummaryBar
            totalCount={summary.totalCount}
            activeCount={summary.activeCount}
            systemCount={summary.systemCount}
          />
        ) : null
      }
      list={
        <ResourceSectionList
          sections={sections}
          keyExtractor={(category) => String(category.id)}
          renderItem={renderCategory}
          loading={{
            isLoading,
            skeleton: (
              <SkeletonList>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </SkeletonList>
            ),
          }}
          empty={{
            title: hasFilters ? "Sin resultados" : "Sin categorías",
            description: hasFilters
              ? "Prueba otros filtros o activa inactivas."
              : "Crea tu primera categoría con el botón +",
            action: !hasFilters ? { label: "Nueva categoría", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          refreshing={isLoading}
          onRefresh={onRefresh}
        />
      }
      fab={<FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />}
      overlays={
        <>
          <CategoryFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            showInactive={showInactive}
            onShowInactiveChange={setShowInactive}
          />
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
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={pendingDeleteIds.size === 1
              ? `Categoría "${Object.values(pendingDeleteLabels).at(-1) ?? ""}" eliminada`
              : `${pendingDeleteIds.size} categorías eliminadas`}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
          />
          <CategoryAnalyticsModal
            visible={Boolean(analyticsTarget)}
            onClose={() => setAnalyticsTarget(null)}
            category={analyticsTarget}
            movements={categoryPostedMovements}
            baseCurrencyCode={baseCurrencyCode}
          />
        </>
      }
    />
  );
}

export default function CategoriesScreenRoot() {
  return (
    <ErrorBoundary>
      <CategoriesScreen />
    </ErrorBoundary>
  );
}
