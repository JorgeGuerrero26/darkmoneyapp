import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tag, Trash2 } from "lucide-react-native";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { ResourceCard } from "../components/ui/ResourceCard";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../components/ui/ResourceSectionList";
import { SwipeActionRow } from "../components/ui/SwipeActionRow";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { FAB } from "../components/ui/FAB";
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
import { MetricSummaryBar } from "../components/ui/MetricSummaryBar";
import { useWorkspaceSnapshotQuery } from "../services/queries/workspace-data";
import { buildSpendTypesSummary } from "../features/spend-types/lib/spendTypesSummary";
import { ClassifyCategoriesSheet } from "../features/spend-types/components/ClassifyCategoriesSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";

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
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const gastoCategorias = useMemo(
    () => (snapshot?.categories ?? []).filter((category) => category.kind !== "income"),
    [snapshot?.categories],
  );
  const expenseCategories = gastoCategorias.length;

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
  const categoriesWithType = gastoCategorias.filter(
    (category) => category.defaultSpendTypeId != null,
  ).length;
  const createMutation = useCreateSpendTypeMutation(activeWorkspaceId, profile?.id);
  const deleteMutation = useDeleteSpendTypeMutation(activeWorkspaceId);

  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<SpendType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpendType | null>(null);
  const [classifyOpen, setClassifyOpen] = useState(false);

  const summary = useMemo(
    () => buildSpendTypesSummary(spendTypes.length, categoriesWithType, expenseCategories),
    [categoriesWithType, expenseCategories, spendTypes.length],
  );

  /** Cuántas categorías traen este tipo por defecto. Es lo que hace que el tipo sirva o no. */
  const categoriasPorTipo = useCallback(
    (spendTypeId: number) => {
      const n = gastoCategorias.filter((category) => category.defaultSpendTypeId === spendTypeId).length;
      return n === 1 ? "1 categoría" : `${n} categorías`;
    },
    [gastoCategorias],
  );

  const sections = useMemo<Section[]>(
    () => (spendTypes.length > 0
      ? [{ key: "all", label: "Tus tipos", data: spendTypes, headerVariant: "divider" as const }]
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
      summary={
        spendTypes.length > 0 ? (
          /* La cifra no es cuántos tipos hay —eso se ve contando las filas— sino cuánto de tu
             gasto van a poder explicar: un tipo que ninguna categoría usa no clasifica nada. */
          <MetricSummaryBar
            label="Categorías con tipo"
            value={`${summary.covered} de ${summary.total}`}
            support={summary.support}
            actions={[
              {
                key: "classify",
                label:
                  summary.covered === 0
                    ? "Clasificar categorías"
                    : summary.coverage < 1
                      ? "Seguir clasificando"
                      : "Revisar clasificación",
                onPress: () => setClassifyOpen(true),
              },
            ]}
            help={{
              title: "¿Para qué sirve el tipo?",
              description:
                "La categoría dice en qué se fue la plata: Alimentación, Transporte. El tipo dice si hacía falta: necesidad, deseo, ahorro. Son dos preguntas distintas, y por eso la misma categoría puede cambiar de tipo — el mercado es necesidad y la cena del viernes no.",
            }}
            footnote={
              summary.coverage < 1
                ? "Ponle su tipo a cada categoría y el inicio podrá decirte cuánto de tu gasto es necesidad."
                : undefined
            }
          />
        ) : null
      }
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
                /* Fila de lista de verdad: el mismo patrón que Categorías —ícono neutro en su
                   recuadro, lo que hay dentro, y chevron porque lleva a algún sitio—. Era una
                   línea con un punto de color y nada más: rompía el patrón y, encima, el punto
                   usaba la paleta reservada para dinero. Un tipo se distingue por su nombre. */
                <ResourceCard
                  variant="row"
                  title={item.name}
                  subtitle={categoriasPorTipo(item.id)}
                  leading={
                    <View style={styles.iconWrap}>
                      <Tag size={20} color={COLORS.storm} strokeWidth={2} />
                    </View>
                  }
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
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.card,
    alignItems: "center",
    justifyContent: "center",
  },
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
