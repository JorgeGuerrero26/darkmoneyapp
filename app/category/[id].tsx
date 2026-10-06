import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart3, MoreVertical, Pencil } from "lucide-react-native";
import { CategoryAnalyticsModal } from "../../components/domain/CategoryAnalyticsModal";
import { CategoryForm } from "../../components/forms/CategoryForm";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DetailActionBar } from "../../components/ui/DetailActionBar";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { CategoryDetailContent } from "../../features/categories/components/CategoryDetailContent";
import { categoryCanDelete } from "../../features/categories/lib/categoryFilters";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToggleCategoryPinMutation } from "../../services/queries/categories-counterparties";
import { useSpendTypesQuery } from "../../services/queries/spend-types";
import { useCategoriesOverviewQuery, useDeleteCategoryMutation, useToggleCategoryMutation, useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import { useUiStore } from "../../store/ui-store";

function CategoryDetailScreen() {
  useUiStore((state) => state.privacyMode);
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/categories?from=more", originRoutes: { categories: "/(app)/categories?from=more" } });
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();
  const overview = useCategoriesOverviewQuery(profile, activeWorkspaceId);
  const snapshotQuery = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const snapshot = snapshotQuery.data;
  const { data: spendTypes = [] } = useSpendTypesQuery(activeWorkspaceId);
  const categories = overview.data ?? [];
  const category = Number.isInteger(categoryId) && categoryId > 0 ? categories.find((item) => item.id === categoryId) : undefined;
  const toggle = useToggleCategoryMutation(activeWorkspaceId);
  const pin = useToggleCategoryPinMutation(activeWorkspaceId);
  const remove = useDeleteCategoryMutation(activeWorkspaceId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete = Boolean(category && categoryCanDelete(category, categories));
  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  function toggleActive() {
    if (!category || category.isSystem || toggle.isPending) return;
    toggle.mutate({ id: category.id, isActive: !category.isActive }, {
      onSuccess: () => showToast(category.isActive ? "Categoría desactivada" : "Categoría activada", "success"),
      onError: (error) => showErrorToast("No se pudo cambiar el estado", error),
    });
  }

  function togglePinned() {
    if (!category || pin.isPending) return;
    pin.mutate({ id: category.id, isPinned: !category.isPinned }, {
      onError: (error) => showErrorToast("No se pudo cambiar el fijado", error),
    });
  }

  async function deleteCategory() {
    if (!category || !canDelete || remove.isPending) return;
    try {
      await remove.mutateAsync(category.id);
      setDeleteOpen(false);
      showToast("Categoría eliminada", "success", category.name);
      handleBack();
    } catch (error) { showErrorToast("No se pudo eliminar la categoría", error); }
  }

  return <ResourceModuleTemplate topInset={insets.top}
    header={<ScreenHeader title="Categoría" onBack={handleBack} rightAction={category ? <HeaderActionGroup actions={[{
      key: "menu", icon: MoreVertical, accessibilityLabel: "Más acciones", onPress: () => setMenuOpen(true),
    }]} /> : null} />}
    list={overview.isLoading ? <SkeletonList><SkeletonCard /><SkeletonCard /></SkeletonList>
      : !category ? <View style={styles.center}>
        <Text style={styles.message}>{overview.isError ? "No se pudo cargar la categoría" : "Categoría no encontrada"}</Text>
        {overview.isError ? <Button label="Reintentar" onPress={() => void overview.refetch()} /> : null}
      </View> : <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <CategoryDetailContent category={category} spendTypeName={spendTypes.find((type) => type.id === category.defaultSpendTypeId)?.name} />
      </ScrollView>}
    fab={category ? <DetailActionBar bottomInset={insets.bottom}
      primary={{ label: "Editar", accessibilityLabel: "Editar categoría", icon: Pencil, onPress: () => setEditing(true), disabled: category.isSystem }}
      secondary={{ label: "Ver analítica", accessibilityLabel: "Ver analítica de la categoría", icon: BarChart3, onPress: () => setAnalyticsOpen(true) }}
      footNote={category.isSystem ? "Las categorías del sistema no se pueden editar." : undefined} /> : null}
    overlays={<>
      {category ? <>
        <EntityActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} sheetTitle="Más acciones" summaryTitle={category.name}
          actions={[
            { key: "pin", label: category.isPinned ? "Quitar de fijadas" : "Fijar en la lista", variant: "ghost", disabled: pin.isPending, onPress: () => { setMenuOpen(false); togglePinned(); } },
            ...(!category.isSystem ? [{ key: "state", label: category.isActive ? "Desactivar categoría" : "Activar categoría", variant: "ghost" as const, disabled: toggle.isPending, onPress: () => { setMenuOpen(false); toggleActive(); } }] : []),
            ...(canDelete ? [{ key: "delete", label: "Eliminar categoría", variant: "danger" as const, onPress: () => { setMenuOpen(false); setDeleteOpen(true); } }] : []),
          ]} />
        <CategoryForm visible={editing && !category.isSystem} editCategory={category} onClose={() => setEditing(false)} onSuccess={() => setEditing(false)} />
        <CategoryAnalyticsModal visible={analyticsOpen} onClose={() => setAnalyticsOpen(false)} category={category}
          movements={snapshot?.categoryPostedMovements ?? []} baseCurrencyCode={baseCurrency}
          loading={!snapshot && snapshotQuery.isLoading}
          historyError={snapshot?.catalogHistoryErrors?.categories ?? (!snapshot && snapshotQuery.isError ? "No se pudo cargar el historial." : undefined)} />
      </> : null}
      <ConfirmDialog visible={deleteOpen} title="Eliminar categoría" body={`Se eliminará «${category?.name ?? ""}». Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar" cancelLabel="Cancelar" destructive confirmLoading={remove.isPending}
        onCancel={() => { if (!remove.isPending) setDeleteOpen(false); }} onConfirm={() => void deleteCategory()} />
    </>} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.lg },
  message: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, textAlign: "center" },
});

export default function CategoryDetailScreenRoot() {
  return <ErrorBoundary><CategoryDetailScreen /></ErrorBoundary>;
}
