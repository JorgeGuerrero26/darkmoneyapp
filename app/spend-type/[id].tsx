import { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { List, MoreVertical, Pencil } from "lucide-react-native";
import { SpendTypeForm } from "../../components/forms/SpendTypeForm";
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
import { ClassifyCategoriesSheet } from "../../features/spend-types/components/ClassifyCategoriesSheet";
import { SpendTypeDetailContent } from "../../features/spend-types/components/SpendTypeDetailContent";
import { buildCategorySpendTotals } from "../../features/spend-types/lib/spendTypeList";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useDeleteSpendTypeMutation, useSpendTypesQuery, useUpdateSpendTypeMutation } from "../../services/queries/spend-types";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";

function SpendTypeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const typeId = Number(id);
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/spend-types?from=more", originRoutes: { "spend-types": "/(app)/spend-types?from=more" } });
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast, showErrorToast } = useToast();
  const typesQuery = useSpendTypesQuery(activeWorkspaceId);
  const snapshotQuery = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const snapshot = snapshotQuery.data;
  const types = typesQuery.data ?? [];
  const item = Number.isInteger(typeId) && typeId > 0 ? types.find((type) => type.id === typeId) : undefined;
  const categories = useMemo(() => (snapshot?.categories ?? []).filter((category) => category.kind !== "income"), [snapshot?.categories]);
  const spendByCategory = useMemo(() => buildCategorySpendTotals(snapshot?.categoryPostedMovements ?? []), [snapshot?.categoryPostedMovements]);
  const update = useUpdateSpendTypeMutation(activeWorkspaceId);
  const remove = useDeleteSpendTypeMutation(activeWorkspaceId);
  const mutationGuard = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function toggleActive() {
    if (!item || mutationGuard.current) return;
    mutationGuard.current = true;
    try {
      await update.mutateAsync({ id: item.id, input: { isActive: !item.isActive } });
      showToast(item.isActive ? "Tipo de gasto desactivado" : "Tipo de gasto activado", "success");
    } catch (error) { showErrorToast("No se pudo cambiar el estado", error); }
    finally { mutationGuard.current = false; }
  }

  async function deleteType() {
    if (!item || mutationGuard.current) return;
    mutationGuard.current = true;
    try {
      await remove.mutateAsync(item.id);
      setDeleteOpen(false);
      showToast("Tipo de gasto eliminado", "success", item.name);
      handleBack();
    } catch (error) { showErrorToast("No se pudo eliminar el tipo de gasto", error); }
    finally { mutationGuard.current = false; }
  }

  return <ResourceModuleTemplate topInset={insets.top}
    header={<ScreenHeader title="Tipo de gasto" onBack={handleBack} rightAction={item ? <HeaderActionGroup actions={[{
      key: "menu", icon: MoreVertical, accessibilityLabel: "Más acciones", onPress: () => setMenuOpen(true),
    }]} /> : null} />}
    list={typesQuery.isLoading ? <SkeletonList><SkeletonCard /><SkeletonCard /></SkeletonList>
      : !item ? <View style={styles.center}>
        <Text style={styles.message}>{typesQuery.isError ? "No se pudo cargar el tipo de gasto" : "Tipo de gasto no encontrado"}</Text>
        {typesQuery.isError ? <Button label="Reintentar" onPress={() => void typesQuery.refetch()} /> : null}
      </View> : <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SpendTypeDetailContent item={item} categoryCount={snapshot ? categories.filter((category) => category.defaultSpendTypeId === item.id).length : null} />
        {!snapshot && snapshotQuery.isLoading ? <SkeletonCard /> : null}
        {!snapshot && snapshotQuery.isError ? <Button label="Reintentar carga de categorías" variant="secondary" onPress={() => void snapshotQuery.refetch()} /> : null}
      </ScrollView>}
    fab={item ? <DetailActionBar bottomInset={insets.bottom}
      primary={{ label: "Editar", accessibilityLabel: "Editar tipo de gasto", icon: Pencil, onPress: () => setEditing(true), disabled: update.isPending || remove.isPending }}
      secondary={{ label: "Clasificar", accessibilityLabel: "Clasificar categorías", icon: List, onPress: () => setClassifying(true), disabled: !snapshot || remove.isPending }} /> : null}
    overlays={<>
      {item ? <>
        <EntityActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} sheetTitle="Más acciones" summaryTitle={item.name}
          actions={[
            { key: "state", label: item.isActive ? "Desactivar" : "Activar", variant: "ghost", disabled: update.isPending || remove.isPending, onPress: () => { setMenuOpen(false); void toggleActive(); } },
            { key: "delete", label: "Eliminar", variant: "danger", disabled: update.isPending || remove.isPending, onPress: () => { setMenuOpen(false); setDeleteOpen(true); } },
          ]} />
        <SpendTypeForm visible={editing} editSpendType={item} onClose={() => setEditing(false)} />
        <ClassifyCategoriesSheet visible={classifying} onClose={() => setClassifying(false)} categories={categories}
          spendByCategory={spendByCategory} spendTypes={types} workspaceId={activeWorkspaceId} />
      </> : null}
      <ConfirmDialog visible={deleteOpen} title="¿Eliminar el tipo?" body="Los movimientos que lo tengan pasan a heredar el de su categoría. No se borra ningún movimiento."
        confirmLabel="Eliminar" cancelLabel="Cancelar" destructive confirmLoading={remove.isPending}
        onCancel={() => { if (!remove.isPending) setDeleteOpen(false); }} onConfirm={() => void deleteType()} />
    </>} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.lg },
  message: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, textAlign: "center" },
});

export default function SpendTypeDetailScreenRoot() {
  return <ErrorBoundary><SpendTypeDetailScreen /></ErrorBoundary>;
}
