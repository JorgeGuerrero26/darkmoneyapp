import { View, type SectionListRenderItem } from "react-native";
import { Archive, HandCoins, SlidersHorizontal } from "lucide-react-native";

import { ResourceSectionList } from "../../../components/ui/ResourceSectionList";
import { SkeletonObligationRow } from "../../../components/ui/Skeleton";
import type {
  ObligationListItem,
  ObligationListSection,
} from "../lib/buildObligationSections";
import type { ObligationFilterValue } from "../lib/obligationFilters";

type Props = {
  sections: ObligationListSection[];
  activeFilters: ObligationFilterValue[];
  loading: boolean;
  sharedLoading: boolean;
  hasActiveSharedItems: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onCreateFirst: () => void;
  renderItem: SectionListRenderItem<ObligationListItem, ObligationListSection>;
};

export function ObligationList({
  sections,
  activeFilters,
  loading,
  sharedLoading,
  hasActiveSharedItems,
  refreshing,
  onRefresh,
  onCreateFirst,
  renderItem,
}: Props) {
  const visibleDataSectionCount = sections.filter((section) => section.key !== "archived-divider" && section.data.length > 0).length;
  const sectionsWithPresentation = sections.map((section) => {
    if (section.key === "archived-divider") {
      return { ...section, headerVariant: "divider" as const, headerIcon: Archive };
    }
    if (visibleDataSectionCount === 1 && section.key === "workspace") {
      return { ...section, headerVariant: "hidden" as const };
    }
    return section;
  });
  const hasFilters = activeFilters.length > 0;

  return (
    <ResourceSectionList
      sections={sectionsWithPresentation}
      renderItem={renderItem}
      keyExtractor={(item) => `${item.workspaceId}-${item.id}`}
      loading={{
        isLoading: loading,
        skeleton: (
          <View style={{ gap: 10 }}>
            <SkeletonObligationRow />
            <SkeletonObligationRow />
            <SkeletonObligationRow />
          </View>
        ),
        secondaryLoading: sharedLoading && !hasActiveSharedItems,
        secondaryMessage: "Cargando compartidos contigo...",
      }}
      empty={{
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
      }}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}
