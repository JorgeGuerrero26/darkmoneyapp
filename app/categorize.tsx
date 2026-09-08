import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles, Tag } from "lucide-react-native";

import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { MetricSummaryBar } from "../components/ui/MetricSummaryBar";
import { ResourceCard } from "../components/ui/ResourceCard";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../components/ui/ResourceSectionList";
import { SearchableSelectSheet, type SelectOption } from "../components/ui/SearchableSelectSheet";
import { SkeletonList, SkeletonMovementRow } from "../components/ui/Skeleton";
import { formatCurrency } from "../components/ui/AmountDisplay";
import {
  groupUncategorized,
  type UncategorizedGroup,
  type UncategorizedMovement,
} from "../features/movements/lib/groupUncategorized";
import {
  assignedToastTitle,
  hasConfidentSuggestion,
  inboxSupportPhrase,
  movementCountLabel,
  summarizeInbox,
} from "../features/movements/lib/uncategorizedInbox";
import { useAuth } from "../lib/auth-context";
import { relativeDateLabel } from "../lib/calendar";
import { isoToDateStr, todayPeru } from "../lib/date";
import { buildPatternMaps } from "../lib/movement-patterns";
import { useWorkspace } from "../lib/workspace-context";
import { useMovementPatternsQuery } from "../services/queries/movement-patterns";
import {
  useAssignCategoryToMovementsMutation,
  useCategorizeInboxAiMutation,
  useUncategorizedMovementsQuery,
  type InboxAiSuggestion,
  type UncategorizedRow,
} from "../services/queries/uncategorized-movements";
import { useDashboardEntitlement } from "../features/dashboard/hooks/useDashboardEntitlement";
import { useCategoriesOverviewQuery } from "../services/queries/workspace-data";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";
import { useToast } from "../hooks/useToast";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { useUiStore } from "../store/ui-store";

/** El gasto o el ingreso de la fila, en positivo: aquí lo que pesa es el tamaño, no el signo. */
function amountOf(row: UncategorizedRow): number {
  const raw = row.movement_type === "income" ? row.destination_amount : row.source_amount;
  return Math.abs(Number(raw) || 0);
}

type GroupSection = ResourceSection<UncategorizedGroup>;

/**
 * La bandeja de lo que está sin clasificar, por grupos.
 *
 * **Por qué una pantalla y no un filtro.** Filtrar movimientos por "sin categoría" ya se podía,
 * y no lo usaba nadie: salía la lista suelta y cada fila pedía abrir el detalle, elegir y
 * volver. Agrupadas por lo que son, las 118 sin categoría de hoy son 74 decisiones, y las
 * veinte de "Cuenta Principal" se resuelven de una vez.
 *
 * **Por qué las propuestas no llaman a la IA.** Salen de tus propios movimientos ya
 * clasificados: si has puesto "Moto" en Transporte veinte veces, no hace falta preguntarle a
 * nadie. Es instantáneo, gratis y funciona sin señal.
 */
function CategorizeScreen() {
  // La máscara de privacidad vive dentro de formatCurrency y se lee del store imperativamente:
  // sin esta suscripción, la pantalla no se repinta al activarla.
  useUiStore((state) => state.privacyMode);
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/dashboard" });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showRichToast } = useToast();

  const { data: rows = [], isLoading } = useUncategorizedMovementsQuery(activeWorkspaceId);
  const { data: patternRows = [] } = useMovementPatternsQuery(activeWorkspaceId);
  const { data: categories = [] } = useCategoriesOverviewQuery(profile, activeWorkspaceId);
  const assignMutation = useAssignCategoryToMovementsMutation(activeWorkspaceId);

  const [pickerGroup, setPickerGroup] = useState<UncategorizedGroup | null>(null);
  /* Lo que propuso la IA, por clave de grupo. Vive en la pantalla y no en caché: es una opinión
     sobre lo que hay ahora, y en cuanto clasificas un grupo deja de aplicar. */
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, InboxAiSuggestion>>({});
  const entitlement = useDashboardEntitlement({ userId: profile?.id, email: profile?.email });
  const askAi = useCategorizeInboxAiMutation();

  const baseCurrencyCode = activeWorkspace?.baseCurrencyCode ?? profile?.baseCurrencyCode ?? "PEN";

  const patternMaps = useMemo(() => buildPatternMaps(patternRows), [patternRows]);
  const today = todayPeru();

  const groups = useMemo(() => {
    const movements: UncategorizedMovement[] = rows.map((row) => ({
      id: row.id,
      description: row.description,
      amount: amountOf(row),
      occurredAt: row.occurred_at,
    }));
    return groupUncategorized(movements, patternMaps);
  }, [rows, patternMaps]);

  const summary = useMemo(() => summarizeInbox(groups), [groups]);

  /* Solo lo que el teléfono no supo resolver: lo que ya está en tus patrones se propone gratis,
     al instante y sin señal. Preguntar por eso sería pagar por lo que ya sabemos. */
  const sinPropuesta = useMemo(
    () => groups.filter((group) => !hasConfidentSuggestion(group) && !aiSuggestions[group.key]),
    [groups, aiSuggestions],
  );

  const handleAskAi = useCallback(() => {
    if (!activeWorkspaceId || askAi.isPending || sinPropuesta.length === 0) return;
    askAi.mutate(
      {
        workspaceId: activeWorkspaceId,
        // Los más pesados primero: la lista ya viene ordenada por lo que suman.
        groups: sinPropuesta.slice(0, 25).map((group) => ({
          key: group.key,
          label: group.label,
          count: group.movements.length,
          total: group.total,
        })),
        categories: categories
          .filter((category) => category.isActive)
          .map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
      },
      {
        onSuccess: (suggestions) => {
          if (suggestions.length === 0) {
            showToast("La IA no supo proponer nada para estos grupos.", "info");
            return;
          }
          setAiSuggestions((previous) => {
            const next = { ...previous };
            for (const suggestion of suggestions) next[suggestion.key] = suggestion;
            return next;
          });
          showToast(
            suggestions.length === 1
              ? "1 propuesta nueva. Revísala antes de aplicarla."
              : `${suggestions.length} propuestas nuevas. Revísalas antes de aplicarlas.`,
            "success",
          );
        },
        onError: (error: Error) => showToast(error.message, "error"),
      },
    );
  }, [activeWorkspaceId, askAi, categories, showToast, sinPropuesta]);

  const categoryName = useCallback(
    (id: number | null) => categories.find((category) => category.id === id)?.name ?? null,
    [categories],
  );

  const categoryOptions = useMemo<SelectOption<number | null>[]>(
    () =>
      categories
        .filter((category) => category.isActive)
        .map((category) => ({
          value: category.id,
          label: category.name,
          // La propuesta se marca aquí también, incluida la que se quedó corta para el atajo de
          // un toque: verla no cuesta nada y ahorra buscarla entre veintitantas.
          meta:
            category.id === pickerGroup?.suggestedCategoryId
              ? "Se parece a lo que hiciste antes"
              : category.parentName ?? undefined,
        })),
    [categories, pickerGroup],
  );

  const assign = useCallback(
    (group: UncategorizedGroup, categoryId: number | null) => {
      const name = categoryName(categoryId);
      if (categoryId === null || !name) return;
      const ids = group.movements.map((movement) => movement.id);
      assignMutation.mutate(
        { ids, categoryId },
        {
          onSuccess: () => {
            showRichToast({
              type: "success",
              title: assignedToastTitle(name, ids.length),
              subtitle: `${group.label} · ${formatCurrency(group.total, baseCurrencyCode)}`,
              // Deshacer los devuelve a sin categoría, que es justo el estado del que venían: el
              // grupo vuelve a la bandeja entero, no a medias.
              onUndo: () => assignMutation.mutate({ ids, categoryId: null }),
            });
          },
          onError: (error: unknown) => {
            showToast(
              error instanceof Error ? error.message : "No se pudo guardar la categoría.",
              "error",
            );
          },
        },
      );
    },
    [assignMutation, baseCurrencyCode, categoryName, showRichToast, showToast],
  );

  const sections = useMemo<GroupSection[]>(
    () =>
      groups.length > 0
        ? [{ key: "all", label: "", data: groups, headerVariant: "hidden" as const }]
        : [],
    [groups],
  );

  const renderGroup = useCallback(
    ({ item }: { item: UncategorizedGroup }) => {
      const ai = aiSuggestions[item.key];
      /* La propuesta propia gana a la de la IA: sale de lo que TÚ ya clasificaste, así que no
         hay razón para preguntar ni para pintarla como opinión. */
      const local = hasConfidentSuggestion(item) ? categoryName(item.suggestedCategoryId) : null;
      const suggestion = local ?? (ai ? categoryName(ai.categoryId) : null);
      const suggestedId = local ? item.suggestedCategoryId : ai?.categoryId ?? null;
      /* Color propio para lo que dice la IA: es una opinión, y lo que dice un saldo es un hecho.
         Con el mismo color no se sabe qué se puede auditar. */
      const esIa = !local && Boolean(ai);
      // La fecha pasa por hora de Lima antes de recortarse: un gasto de las nueve de la noche
      // se guarda en el UTC del dia siguiente y se leia como "Hoy" siendo de ayer.
      const last = item.movements.reduce(
        (latest, movement) => (movement.occurredAt > latest ? movement.occurredAt : latest),
        item.movements[0]?.occurredAt ?? "",
      );
      const lastLabel = last ? relativeDateLabel(isoToDateStr(last), today) : "";

      return (
        <ResourceCard
          variant="line"
          title={item.label}
          subtitle={`${movementCountLabel(item.movements.length)}${lastLabel ? ` · último ${lastLabel}` : ""}`}
          onPress={() => setPickerGroup(item)}
          meta={
            suggestion ? (
              <Pressable
                style={({ pressed }) => [
                  styles.suggestion,
                  esIa && styles.suggestionAi,
                  pressed && styles.suggestionPressed,
                ]}
                onPress={(event) => {
                  event.stopPropagation();
                  assign(item, suggestedId);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${esIa ? "Propuesta de la IA: poner" : "Poner"} ${suggestion} a ${movementCountLabel(item.movements.length)} de ${item.label}`}
              >
                {esIa ? (
                  <Sparkles size={12} color={COLORS.pro} strokeWidth={2} />
                ) : (
                  <Tag size={12} color={COLORS.fog} strokeWidth={2} />
                )}
                <Text style={[styles.suggestionText, esIa && styles.suggestionTextAi]}>
                  Poner {suggestion}
                </Text>
              </Pressable>
            ) : null
          }
          trailing={<Text style={styles.amount}>{formatCurrency(item.total, baseCurrencyCode)}</Text>}
        />
      );
    },
    [aiSuggestions, assign, baseCurrencyCode, categoryName, today],
  );

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={<ScreenHeader title="Sin categoría" onBack={handleBack} />}
      summary={
        groups.length > 0 ? (
          <MetricSummaryBar
            label="Sin clasificar"
            value={formatCurrency(summary.total, baseCurrencyCode)}
            support={inboxSupportPhrase(summary)}
            footnote="Al elegir la categoría de un grupo se le pone a todos sus movimientos."
            /* Solo Pro y solo si queda algo que preguntar: cada llamada cuesta, y lo que los
               patrones ya resuelven no se pregunta. */
            actions={
              entitlement.features.aiInsights && sinPropuesta.length > 0
                ? [{
                    key: "ai",
                    label: askAi.isPending
                      ? "Preguntando…"
                      : `Proponer ${sinPropuesta.length > 25 ? 25 : sinPropuesta.length} con IA`,
                    disabled: askAi.isPending,
                    onPress: handleAskAi,
                  }]
                : undefined
            }
          />
        ) : null
      }
      list={
        <ResourceSectionList<UncategorizedGroup, GroupSection>
          sections={sections}
          keyExtractor={(group) => group.key}
          renderItem={renderGroup}
          loading={{
            isLoading,
            skeleton: (
              <SkeletonList>
                <SkeletonMovementRow />
                <SkeletonMovementRow />
                <SkeletonMovementRow />
                <SkeletonMovementRow />
                <SkeletonMovementRow />
                <SkeletonMovementRow />
              </SkeletonList>
            ),
          }}
          empty={{
            icon: Tag,
            title: "Nada por clasificar",
            description:
              "Todos tus gastos e ingresos tienen categoría. Los traspasos entre tus cuentas no llevan: es tu plata cambiando de bolsillo.",
          }}
        />
      }
      overlays={
        <SearchableSelectSheet
          visible={pickerGroup !== null}
          title={
            pickerGroup
              ? `${pickerGroup.label} · ${movementCountLabel(pickerGroup.movements.length)}`
              : ""
          }
          options={categoryOptions}
          /* Ninguna marcada: el grupo no TIENE categoría, y palomear la propuesta la haría
             pasar por elegida. Se señala con su nota al lado. */
          value={null}
          onChange={(value) => {
            const group = pickerGroup;
            setPickerGroup(null);
            if (group) assign(group, value);
          }}
          onClose={() => setPickerGroup(null)}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  /* La opinión de la IA lleva el color reservado para ella, el mismo de la app entera: lo que
     dice un modelo es una opinión; lo que dice un saldo es un hecho, y con el mismo color el
     usuario no sabe qué puede auditar. */
  suggestionAi: { borderColor: "rgba(192,166,216,0.32)", backgroundColor: COLORS.proMuted },
  suggestionPressed: { opacity: 0.7 },
  suggestionText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.fog,
  },
  suggestionTextAi: { color: COLORS.pro },
});

export default function CategorizeScreenWithBoundary() {
  return (
    <ErrorBoundary>
      <CategorizeScreen />
    </ErrorBoundary>
  );
}
