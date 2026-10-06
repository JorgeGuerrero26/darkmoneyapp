import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoreVertical } from "lucide-react-native";

import { useQueryClient } from "@tanstack/react-query";
import { FilterToolbar } from "../components/ui/FilterToolbar";
import { ActiveFilterBar } from "../components/ui/ActiveFilterBar";
import { HeaderActionGroup } from "../components/ui/HeaderActionGroup";
import { EntityActionSheet } from "../components/ui/EntityActionSheet";
import { SpendTypeSwipeRow } from "../features/spend-types/components/SpendTypeSwipeRow";
import { SpendTypeDetailSheet } from "../features/spend-types/components/SpendTypeDetailSheet";
import { SpendTypeFilterSheet } from "../features/spend-types/components/SpendTypeFilterSheet";
import { buildSpendTypeSections, filterSpendTypes, SPEND_TYPE_STATUSES, type SpendTypeStatus } from "../features/spend-types/lib/spendTypeList";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { FAB } from "../components/ui/FAB";
import { SpendTypeForm } from "../components/forms/SpendTypeForm";
import {
  useCreateSpendTypeMutation,
  useDeleteSpendTypeMutation,
  useUpdateSpendTypeMutation,
  useSpendTypesQuery,
  type SpendType,
} from "../services/queries/spend-types";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { MetricSummaryBar } from "../components/ui/MetricSummaryBar";
import { useWorkspaceSnapshotQuery } from "../services/queries/workspace-data";
import { ClassifyCategoriesSheet } from "../features/spend-types/components/ClassifyCategoriesSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../constants/theme";

/** Los tres del modelo clásico. Se ofrecen; no se escriben sin que nadie los pida. */
const STARTERS = [
  { name: "Necesidades", color: COLORS.fog },
  { name: "Deseos", color: COLORS.gold },
  { name: "Ahorros", color: COLORS.income },
];

type Section = ResourceSection<SpendType>;

/**
 * La maestra de tipos de gasto.
 *
 * **Qué añade sobre la categoría.** "Alimentación" dice en qué se fue la plata; el tipo dice si
 * hacía falta. Son preguntas distintas y por eso no cabían en el mismo catálogo: de las 20
 * categorías de gasto reales, las dos con más movimientos —Alimentación y Transporte— son mixtas,
 * así que ninguna etiqueta sola servía para las dos cosas.
 *
 * La lista vacía **ofrece** los tres del modelo clásico en un toque, en vez de sembrarlos: un
 * catálogo que aparece lleno de cosas que nadie pidió es lo mismo que la categoría "Todas" puesta
 * por defecto.
 */
function SpendTypesScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/more" });
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast, showErrorToast } = useToast();

  const { data: spendTypes = [], isLoading } = useSpendTypesQuery(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const gastoCategorias = useMemo(
    () => (snapshot?.categories ?? []).filter((category) => category.kind !== "income"),
    [snapshot?.categories],
  );

  /* El peso real de cada categoría, de lo que la app ya tiene cargado para sus analíticas.
     Sirve para poner delante lo que decide el resultado: cinco categorías se llevan el 90 %. */
  const spendByCategory = useMemo(() => {
    const totals = new Map<number, number>();
    for (const movement of snapshot?.categoryPostedMovements ?? []) {
      const amount = movement.amountInBaseCurrency ?? movement.sourceAmount ?? 0;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      totals.set(movement.categoryId, (totals.get(movement.categoryId) ?? 0) + amount);
    }
    return totals;
  }, [snapshot?.categoryPostedMovements]);
  const createMutation = useCreateSpendTypeMutation(activeWorkspaceId, profile?.id);
  const deleteMutation = useDeleteSpendTypeMutation(activeWorkspaceId);

  const updateMutation = useUpdateSpendTypeMutation(activeWorkspaceId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SpendTypeStatus>("active");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const creatingRef = useRef(false);
  const [creatingStarters, setCreatingStarters] = useState(false);
  const visibleTypes = useMemo(() => filterSpendTypes(spendTypes, search, status), [spendTypes, search, status]);
  const detail = spendTypes.find((item) => item.id === detailId) ?? null;
  const hasFilters = search.trim().length > 0 || status !== "active";
  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<SpendType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpendType | null>(null);
  const [classifyOpen, setClassifyOpen] = useState(false);

  const sections = useMemo(() => buildSpendTypeSections(visibleTypes), [visibleTypes]);

  const createStarters = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true; setCreatingStarters(true);
    try {
      for (const [index, starter] of STARTERS.entries()) {
        if (spendTypes.some((item) => item.name.toLocaleLowerCase() === starter.name.toLocaleLowerCase())) continue;
        await createMutation.mutateAsync({ ...starter, sortOrder: index });
      }
      showToast("Tipos de gasto creados", "success", "Necesidades, deseos y ahorros");
    } catch (error) {
      showErrorToast("No se pudieron crear los tipos de gasto", error);
    } finally { creatingRef.current = false; setCreatingStarters(false); }
  }, [createMutation, showToast, showErrorToast, spendTypes]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteMutation.mutateAsync(target.id);
      showToast("Tipo de gasto eliminado", "success", target.name);
    } catch (error) {
      showErrorToast(`No se pudo eliminar «${target.name}»`, error);
    }
  }, [deleteMutation, deleteTarget, showToast]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={<ScreenHeader title="Tipos de gasto" onBack={handleBack} rightAction={<HeaderActionGroup actions={[{ key: "menu", icon: MoreVertical, accessibilityLabel: "Más acciones", onPress: () => setMenuOpen(true) }]} />} />}
      toolbar={<FilterToolbar options={[]} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Buscar tipos de gasto..."
        extraAction={{ label: status !== "active" ? "1 filtro" : "Filtros", active: status !== "active", onPress: () => setFiltersOpen(true) }} />}
      activeFilters={<ActiveFilterBar items={[
        ...(search.trim() ? [{ key: "search", label: search.trim(), onRemove: () => setSearch("") }] : []),
        ...(status !== "active" ? [{ key: "status", label: SPEND_TYPE_STATUSES.find((item) => item.value === status)?.label ?? "Estado", onRemove: () => setStatus("active") }] : []),
      ]} onClear={() => { setSearch(""); setStatus("active"); }} />}
      summary={spendTypes.length > 0 ? <MetricSummaryBar support={`${visibleTypes.length} tipos · ${gastoCategorias.filter((category) => visibleTypes.some((type) => type.id === category.defaultSpendTypeId)).length} categorías asignadas`} /> : null}
      list={
        <ResourceSectionList<SpendType, Section>
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <SpendTypeSwipeRow item={item}
            categoryCount={gastoCategorias.filter((category) => category.defaultSpendTypeId === item.id).length}
            onPress={() => setDetailId(item.id)} onDelete={() => setDeleteTarget(item)} />}
          contentContainerStyle={{ paddingHorizontal: 0 }}
          onRefresh={async () => { await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["spend-types", activeWorkspaceId] }),
            queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
          ]); }}
          loading={{
            isLoading,
            skeleton: (
              <SkeletonList>
                <SkeletonCard />
                <SkeletonCard />
              </SkeletonList>
            ),
          }}
          empty={{
            title: hasFilters ? "Sin resultados" : "Sin tipos de gasto",
            description: hasFilters ? "Prueba otros filtros." : "Organiza tus gastos en necesidades, deseos o ahorros.",
            action: hasFilters ? { label: "Limpiar filtros", onPress: () => { setSearch(""); setStatus("active"); } }
              : creatingStarters ? undefined : { label: "Crear necesidades, deseos y ahorros", onPress: () => void createStarters() },
          }}
          listFooterComponent={creatingStarters ? <Text style={styles.footnote}>Creando tipos de gasto...</Text> : null}

        />
      }
      fab={<FAB onPress={() => { setEditTarget(null); setFormVisible(true); }} bottom={insets.bottom + 16} />}
      overlays={
        <>
          <SpendTypeDetailSheet item={detail} categoryCount={gastoCategorias.filter((item) => item.defaultSpendTypeId === detailId).length}
            onClose={() => setDetailId(null)}
            onEdit={() => { setEditTarget(detail); setDetailId(null); setFormVisible(true); }}
            onClassify={() => { setDetailId(null); setClassifyOpen(true); }}
            onDelete={() => { setDeleteTarget(detail); setDetailId(null); }}
            onToggle={() => { if (detail) updateMutation.mutate({ id: detail.id, input: { isActive: !detail.isActive } }, {
              onError: (error) => showErrorToast("No se pudo cambiar el estado", error),
              onSuccess: () => showToast("Tipo de gasto actualizado", "success"),
            }); }} togglePending={updateMutation.isPending} />
          <SpendTypeFilterSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} status={status} onChange={setStatus} />
          <EntityActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} sheetTitle="Más acciones" summaryTitle="Tipos de gasto"
            actions={[{ key: "classify", label: "Clasificar categorías", variant: "secondary", disabled: spendTypes.length === 0,
              onPress: () => { setMenuOpen(false); setClassifyOpen(true); } }]} />
          <SpendTypeForm
            visible={formVisible}
            onClose={() => { setFormVisible(false); setEditTarget(null); }}
            editSpendType={editTarget}
          />
          <ClassifyCategoriesSheet
            visible={classifyOpen}
            onClose={() => setClassifyOpen(false)}
            categories={gastoCategorias}
            spendByCategory={spendByCategory}
            spendTypes={spendTypes}
            workspaceId={activeWorkspaceId}
          />
          <ConfirmDialog
            visible={deleteTarget !== null}
            title="¿Eliminar el tipo?"
            body={
              deleteTarget
                ? `Los movimientos que lo tengan pasan a heredar el de su categoría. No se borra ningún movimiento.`
                : undefined
            }
            confirmLabel="Eliminar"
            cancelLabel="Cancelar"
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void handleDelete()}
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  footnote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
});

export default function SpendTypesScreenRoot() {
  return (
    <ErrorBoundary>
      <SpendTypesScreen />
    </ErrorBoundary>
  );
}
