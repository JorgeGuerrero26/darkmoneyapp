import { type SectionListRenderItem } from "react-native";
import { Archive, CloudOff, HandCoins, SlidersHorizontal } from "lucide-react-native";

import { ResourceSectionList } from "../../../components/ui/ResourceSectionList";
import { SkeletonList, SkeletonObligationRow } from "../../../components/ui/Skeleton";
import type {
  ObligationListItem,
  ObligationListSection,
} from "../lib/buildObligationSections";

type Props = {
  sections: ObligationListSection[];
  hasActiveFilters: boolean;
  loading: boolean;
  /** La consulta diferida se rindió sin datos: error con reintentar, no "no tienes nada". */
  failed: boolean;
  onRetry: () => void;
  sharedLoading: boolean;
  hasActiveSharedItems: boolean;
  onRefresh: () => void | Promise<unknown>;
  onCreateFirst: () => void;
  renderItem: SectionListRenderItem<ObligationListItem, ObligationListSection>;
};

export function ObligationList({
  sections,
  hasActiveFilters,
  loading,
  failed,
  onRetry,
  sharedLoading,
  hasActiveSharedItems,
  onRefresh,
  onCreateFirst,
  renderItem,
}: Props) {
  const visibleDataSectionCount = sections.filter((section) => section.key !== "archived-divider" && section.data.length > 0).length;
  const sectionsWithPresentation = sections.map((section) => {
    if (section.key === "archived-divider") {
      return { ...section, headerVariant: "divider" as const, headerIcon: Archive };
    }
    if (section.key === "receivable" || section.key === "payable") {
      return { ...section, headerVariant: "divider" as const };
    }
    if (visibleDataSectionCount === 1 && section.key === "workspace") {
      return { ...section, headerVariant: "hidden" as const };
    }
    return section;
  });
  const hasFilters = hasActiveFilters;

  return (
    <ResourceSectionList
      sections={sectionsWithPresentation}
      renderItem={renderItem}
      keyExtractor={(item) => `${item.workspaceId}-${item.id}`}
      loading={{
        isLoading: loading,
        skeleton: (
          <SkeletonList>
            <SkeletonObligationRow />
            <SkeletonObligationRow />
            <SkeletonObligationRow />
          </SkeletonList>
        ),
        secondaryLoading: sharedLoading && !hasActiveSharedItems,
        secondaryMessage: "Cargando compartidos contigo...",
      }}
      empty={
        /* Decir "Sin créditos ni deudas" cuando lo que pasó es que no se pudieron cargar sería
           mentir sobre dinero. Si la carga falló, eso es lo que se cuenta, con salida. */
        failed
          ? {
              icon: CloudOff,
              title: "No se pudieron cargar",
              description:
                "Tus créditos y deudas siguen guardados; es la conexión la que falló al traerlos.",
              action: { label: "Reintentar", onPress: onRetry },
            }
          : {
              icon: !hasFilters ? HandCoins : SlidersHorizontal,
              title: !hasFilters ? "Sin créditos ni deudas" : "Sin resultados",
              description:
                !hasFilters
                  ? "Registra lo que le prestas a alguien o lo que debes. Cuando alguien comparta un crédito contigo, también aparecerá aquí."
                  : "Ninguna obligación coincide con ese filtro. Prueba con «Todas» para ver todo.",
              action:
                !hasFilters
                  ? { label: "Registrar primera obligación", onPress: onCreateFirst }
                  : undefined,
            }
      }
      onRefresh={onRefresh}
    />
  );
}
