import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import type { SectionListRenderItem } from "react-native";
import { CheckSquare, Download, MoreVertical, Power, Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { summarizeNames } from "../lib/summarize-names";
import { UndoBanner } from "../components/ui/UndoBanner";
import { BulkActionBar } from "../components/ui/BulkActionBar";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { EntityActionSheet } from "../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../components/ui/ActiveFilterBar";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList } from "../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { FAB } from "../components/ui/FAB";
import { CategoryForm } from "../components/forms/CategoryForm";
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
  type CategoryStatusFilter,
  type CategoryOriginFilter,
  type CategoryListSection,
} from "../features/categories/lib/categoryFilters";
import { buildCategoriesContextNote } from "../features/categories/lib/buildCategoriesContextNote";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { buildCategoriesCsv } from "../lib/categories-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useCategoriesOverviewQuery,
  useDeleteCategoryMutation,
  useToggleCategoryMutation,
} from "../services/queries/workspace-data";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import type { CategoryOverview } from "../types/domain";

function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();

  const { data: overviewList = [], isLoading, isError } = useCategoriesOverviewQuery(profile, activeWorkspaceId);
  const hasLoadError = isError && overviewList.length === 0;
  const toggleMutation = useToggleCategoryMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCategoryMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [kindFilter, setKindFilter] = useState<CategoryFilter[]>([]);
  const [statusFilter, setStatusFilter] = useState<CategoryStatusFilter>("active");
  const [originFilter, setOriginFilter] = useState<CategoryOriginFilter>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const pendingDeleteLabels = useRef<Map<number, string>>(new Map());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteRuns = useRef<Map<number, () => void>>(new Map());

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const categories = useMemo(
    () => overviewList.filter((category) => !pendingDeleteIds.has(category.id)),
    [overviewList, pendingDeleteIds],
  );
  const filteredCategories = useMemo(
    () => filterCategories(categories, [...kindFilter, ...(pinnedOnly ? ["pinned" as const] : [])], searchText, statusFilter, originFilter),
    [categories, kindFilter, pinnedOnly, searchText, statusFilter, originFilter],
  );
  const sections = useMemo(() => buildCategorySections(filteredCategories), [filteredCategories]);

  const summary = useMemo(() => ({
    totalCount: filteredCategories.length,
    activeCount: filteredCategories.filter((category) => category.isActive).length,
    systemCount: filteredCategories.filter((category) => category.isSystem).length,
  }), [filteredCategories]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    for (const filter of kindFilter) {
      items.push({ key: filter, label: CATEGORY_FILTERS.find((item) => item.value === filter)?.label ?? "Tipo",
        onRemove: () => setKindFilter((prev) => prev.filter((item) => item !== filter)) });
    }
    if (statusFilter !== "active") items.push({ key: "status", label: statusFilter === "all" ? "Todos los estados" : "Inactivas", onRemove: () => setStatusFilter("active") });
    if (originFilter !== "all") items.push({ key: "origin", label: originFilter === "system" ? "Del sistema" : "Personalizadas", onRemove: () => setOriginFilter("all") });
    if (pinnedOnly) items.push({ key: "pinned", label: "Fijadas", onRemove: () => setPinnedOnly(false) });
    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }
    return items;
  }, [kindFilter, originFilter, pinnedOnly, searchText, statusFilter]);

  const filtersCount = kindFilter.length + Number(statusFilter !== "active") + Number(originFilter !== "all") + Number(pinnedOnly);
  const hasFilters = filtersCount > 0 || Boolean(searchText.trim());
  const contextNote = buildCategoriesContextNote({
    visibleCount: filteredCategories.length,
    totalCount: categories.length,
    hasFilters,
  });

  useEffect(() => () => {
    deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    /* Salir de la pantalla CONFIRMA lo pendiente, no lo cancela: el usuario ya pidio
       borrar y el aviso solo ofrecia deshacerlo. Cancelarlo aqui hacia que la fila
       reapareciera sin que nadie dijera nada. */
    const pendingRuns = [...pendingDeleteRuns.current.values()];
    pendingDeleteRuns.current.clear();
    pendingRuns.forEach((run) => run());
    deleteTimers.current.clear();
    pendingDeleteLabels.current.clear();
  }, []);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["categories-overview", activeWorkspaceId] }),
    ]);
  }, [activeWorkspaceId, queryClient]);

  const clearFilters = useCallback(() => {
    setKindFilter([]);
    setStatusFilter("active");
    setOriginFilter("all");
    setPinnedOnly(false);
    setSearchText("");
  }, []);

  const startUndoDelete = useCallback((category: CategoryOverview) => {
    setPendingDeleteIds((prev) => new Set(prev).add(category.id));
    pendingDeleteLabels.current.set(category.id, category.name);
    const run = () => {
      deleteMutation.mutate(category.id, {
        onError: (error) => showErrorToast(`No se pudo eliminar «${category.name}»`, error),
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(category.id);
        return next;
      });
      pendingDeleteLabels.current.delete(category.id);
      deleteTimers.current.delete(category.id);
    };
    const timer = setTimeout(() => {
      // Al disparar, la accion deja de estar pendiente: si no, salir de la pantalla
      // la ejecutaria por segunda vez.
      pendingDeleteRuns.current.delete(category.id);
      run();
    }, 5000);
    deleteTimers.current.set(category.id, timer);
    pendingDeleteRuns.current.set(category.id, run);
  }, [deleteMutation, showToast]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteRuns.current.delete(id);
    pendingDeleteLabels.current.delete(id);
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
        onSuccess: () => showToast(isActive ? "Categoría activada" : "Categoría desactivada", "success", category.name),
        onError: (error) =>
          showErrorToast(isActive ? "No se pudo activar la categoría" : "No se pudo desactivar la categoría", error),
      },
    );
  }, [showErrorToast, showToast, toggleMutation]);

  const exportCSV = useCallback(async (rows: CategoryOverview[]) => {
    if (rows.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildCategoriesCsv(rows);
      await shareCsvAsFile(csv, `categorias-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (error: unknown) {
      showErrorToast("No se pudo exportar el CSV", error);
    }
  }, [activeWorkspace?.name, showErrorToast, showToast]);

  const selectedItems = useMemo(
    () => filteredCategories.filter((item) => selectedIds.has(item.id)),
    [filteredCategories, selectedIds],
  );

  const handleBulkToggleActive = useCallback(async () => {
    const toggled: string[] = [];
    for (const item of selectedItems) {
      if (item.isSystem) continue;
      try {
        await toggleMutation.mutateAsync({ id: item.id, isActive: !item.isActive });
        toggled.push(item.name);
      } catch (err: unknown) {
        showErrorToast(`No se pudo cambiar «${item.name}»`, err);
      }
    }
    exitSelectMode();
    if (toggled.length > 0) {
      showToast(
        toggled.length === 1 ? "1 categoría actualizada" : `${toggled.length} categorías actualizadas`,
        "success",
        summarizeNames(toggled),
      );
    }
  }, [exitSelectMode, selectedItems, showErrorToast, showToast, toggleMutation]);

  const handleBulkDelete = useCallback(() => {
    const deletable = selectedItems.filter((item) => categoryCanDelete(item, overviewList));
    const skipped = selectedItems.length - deletable.length;
    deletable.forEach(startUndoDelete);
    exitSelectMode();
    if (skipped > 0) {
      // Lo que bloquea el borrado, dicho con la regla real (categoryCanDelete).
      showToast(
        skipped === 1 ? "1 categoría no se puede eliminar" : `${skipped} categorías no se pueden eliminar`,
        "warning",
        "Son del sistema o tienen movimientos, suscripciones o subcategorías",
      );
    }
  }, [exitSelectMode, overviewList, selectedItems, showToast, startUndoDelete]);

  const renderCategory: SectionListRenderItem<CategoryOverview, CategoryListSection> = useCallback(({ item }) => {
    const kindLabel = CATEGORY_KIND_LABELS[item.kind] ?? item.kind;
    const canDelete = categoryCanDelete(item, overviewList);

    return (
      <CategorySwipeRow
        category={item}
        kindLabel={kindLabel}
        canDelete={canDelete}
        toggleDisabled={toggleMutation.isPending}
        onPress={() => {
          if (selectMode) {
            toggleSelect(item.id);
            return;
          }
          router.push(`/category/${item.id}?from=categories`);
        }}
        onLongPress={() => {
          if (!selectMode) setSelectMode(true);
          toggleSelect(item.id);
        }}
        onToggle={() => handleToggleActive(item)}
        onDelete={() => startUndoDelete(item)}
        selected={selectedIds.has(item.id)}
        selectMode={selectMode}
      />
    );
  }, [handleToggleActive, router, overviewList, selectMode, selectedIds, startUndoDelete, toggleMutation.isPending, toggleSelect]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionada${selectedIds.size === 1 ? "" : "s"}` : "Categorías"}
          onBack={selectMode ? exitSelectMode : handleBack}
          rightAction={
            selectMode ? null : (
                /* Exportar baja al menú con su nombre, y "seleccionar varios" deja de
                   depender de un mantener pulsado que nadie descubre. */
              <HeaderActionGroup
                actions={[{
                  key: "menu",
                  icon: MoreVertical,
                  onPress: () => setMenuOpen(true),
                  accessibilityLabel: "Más acciones",
                }]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={[]}
          searchValue={searchText}
          onSearchChange={setSearchText}
          extraAction={{
            label: filtersCount > 0 ? `${filtersCount} filtros` : "Filtros",
            active: filtersCount > 0,
            onPress: () => setFilterSheetOpen(true),
          }}
          searchPlaceholder="Buscar categorías..."
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearFilters} />}
      context={!selectMode && hasFilters && categories.length > 0 ? <ResourceContextNote>{contextNote}</ResourceContextNote> : null}
      summary={
        !selectMode && filteredCategories.length > 0 ? (
          <CategorySummaryBar
            totalCount={summary.totalCount}
            activeCount={summary.activeCount}
            systemCount={summary.systemCount}
          />
        ) : null
      }
      bulkActions={
        selectMode && selectedIds.size > 0 ? (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={exitSelectMode}
            actions={[
              {
                key: "select-all",
                label: `Sel. todas (${filteredCategories.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredCategories.map((item) => item.id))),
              },
              {
                key: "csv",
                label: "CSV",
                icon: Download,
                tone: "primary",
                onPress: () => void exportCSV(selectedItems),
              },
              {
                key: "toggle",
                label: `Activar/Desactivar (${selectedIds.size})`,
                icon: Power,
                tone: "neutral",
                onPress: () => void handleBulkToggleActive(),
              },
              {
                key: "delete",
                label: `Eliminar (${selectedIds.size})`,
                icon: Trash2,
                tone: "danger",
                onPress: handleBulkDelete,
              },
            ]}
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
            title: hasLoadError ? "No se pudieron cargar las categorías" : hasFilters ? "Sin resultados" : "Sin categorías",
            description: hasLoadError ? "Vuelve a intentarlo para cargar tu lista." : hasFilters
              ? "Prueba otros filtros o activa inactivas."
              : "Crea tu primera categoría con el botón +",
            action: hasLoadError ? { label: "Reintentar", onPress: () => void onRefresh() } : !hasFilters ? { label: "Nueva categoría", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          contentContainerStyle={{ paddingHorizontal: 0 }}
          onRefresh={onRefresh}
        />
      }
      fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} /> : null}
      overlays={
        <>
          <EntityActionSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            sheetTitle="Más acciones"
            summaryTitle="Categorías"
            actions={[
              {
                key: "export",
                label: "Exportar a CSV",
                variant: "secondary" as const,
                disabled: filteredCategories.length === 0,
                onPress: () => { setMenuOpen(false); void exportCSV(filteredCategories); },
              },
              {
                key: "select",
                label: "Seleccionar varios",
                variant: "ghost" as const,
                disabled: filteredCategories.length === 0,
                onPress: () => { setMenuOpen(false); setSelectMode(true); },
              },
            ]}
          />
          <CategoryFilterSheet
            visible={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            kinds={kindFilter} onKindsChange={setKindFilter}
            status={statusFilter} onStatusChange={setStatusFilter}
            origin={originFilter} onOriginChange={setOriginFilter}
            pinnedOnly={pinnedOnly} onPinnedOnlyChange={setPinnedOnly}
            onClear={clearFilters}
          />
          <CategoryForm
            visible={createFormVisible}
            onClose={() => setCreateFormVisible(false)}
            onSuccess={() => setCreateFormVisible(false)}
          />
          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={(() => {
              if (pendingDeleteIds.size === 0) return "";
              // El nombre va en la segunda línea (detail), no dentro del titular.
              if (pendingDeleteIds.size === 1) return "Categoría eliminada";
              return `${pendingDeleteIds.size} categorías eliminadas`;
            })()}
            detail={summarizeNames(
              [...pendingDeleteIds].map((id) => pendingDeleteLabels.current.get(id) ?? ""),
            )}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
            durationMs={5000}
            bottomOffset={insets.bottom + 80}
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
