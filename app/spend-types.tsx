import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2 } from "lucide-react-native";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { ResourceCard } from "../components/ui/ResourceCard";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../components/ui/ResourceSectionList";
import { SwipeActionRow } from "../components/ui/SwipeActionRow";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { FAB } from "../components/ui/FAB";
import { Button } from "../components/ui/Button";
import { SpendTypeForm } from "../components/forms/SpendTypeForm";
import {
  useCreateSpendTypeMutation,
  useDeleteSpendTypeMutation,
  useSpendTypesQuery,
  type SpendType,
} from "../services/queries/spend-types";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../constants/theme";

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
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/more" });
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: spendTypes = [], isLoading } = useSpendTypesQuery(activeWorkspaceId);
  const createMutation = useCreateSpendTypeMutation(activeWorkspaceId, profile?.id);
  const deleteMutation = useDeleteSpendTypeMutation(activeWorkspaceId);

  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<SpendType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpendType | null>(null);

  const sections = useMemo<Section[]>(
    () => (spendTypes.length > 0
      ? [{ key: "all", label: "", data: spendTypes, headerVariant: "hidden" as const }]
      : []),
    [spendTypes],
  );

  const createStarters = useCallback(async () => {
    try {
      for (const [index, starter] of STARTERS.entries()) {
        await createMutation.mutateAsync({ ...starter, sortOrder: index });
      }
      showToast("Listo: necesidades, deseos y ahorros", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudieron crear", "error");
    }
  }, [createMutation, showToast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteMutation.mutateAsync(target.id);
      showToast(`Se eliminó «${target.name}»`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo eliminar", "error");
    }
  }, [deleteMutation, deleteTarget, showToast]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={<ScreenHeader title="Tipos de gasto" onBack={handleBack} />}
      list={
        <ResourceSectionList<SpendType, Section>
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SwipeActionRow
              revealWidth={88}
              borderRadius={0}
              rightAction={{
                label: "Eliminar",
                icon: Trash2,
                onPress: () => setDeleteTarget(item),
                color: COLORS.danger,
                backgroundColor: COLORS.danger + "30",
                haptic: "warning",
              }}
            >
              {() => (
                <ResourceCard
                  variant="line"
                  title={item.name}
                  leading={<View style={[styles.dot, { backgroundColor: item.color ?? COLORS.fog }]} />}
                  onPress={() => { setEditTarget(item); setFormVisible(true); }}
                />
              )}
            </SwipeActionRow>
          )}
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
            title: "Sin tipos de gasto",
            description:
              "La categoría dice en qué se fue la plata; el tipo dice si hacía falta. Con eso el inicio puede decirte cuánto de lo que gastas es necesidad y cuánto es gusto.",
            action: { label: "Crear necesidades, deseos y ahorros", onPress: () => void createStarters() },
          }}
          listFooterComponent={
            spendTypes.length > 0 ? (
              <Text style={styles.footnote}>
                Cada categoría puede tener su tipo por defecto, y un movimiento suelto puede
                cambiarlo cuando toque.
              </Text>
            ) : null
          }
        />
      }
      fab={<FAB onPress={() => { setEditTarget(null); setFormVisible(true); }} bottom={insets.bottom + 16} />}
      overlays={
        <>
          <SpendTypeForm
            visible={formVisible}
            onClose={() => { setFormVisible(false); setEditTarget(null); }}
            editSpendType={editTarget}
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
  dot: { width: 10, height: 10, borderRadius: RADIUS.full },
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
