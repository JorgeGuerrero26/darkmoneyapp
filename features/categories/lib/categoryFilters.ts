import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { CategoryKind, CategoryOverview } from "../../../types/domain";

export type CategoryFilter = "all" | CategoryKind;
export type CategoryListSection = ResourceSection<CategoryOverview, "custom" | "system">;

export const CATEGORY_FILTERS: Array<{ label: string; value: CategoryFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Gastos", value: "expense" },
  { label: "Ingresos", value: "income" },
  { label: "Mixtas", value: "both" },
];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  both: "Mixta",
};

export function categoryCanDelete(category: CategoryOverview, allCategories: CategoryOverview[]) {
  if (category.isSystem) return false;
  if (category.movementCount > 0 || category.subscriptionCount > 0) return false;
  return !allCategories.some((candidate) => candidate.parentId === category.id);
}

export function filterCategories(
  categories: CategoryOverview[],
  kindFilter: CategoryFilter,
  searchText: string,
  showInactive: boolean,
) {
  const query = searchText.trim().toLowerCase();

  return categories.filter((category) => {
    if (kindFilter !== "all" && category.kind !== kindFilter) return false;
    if (!showInactive && !category.isActive) return false;

    if (!query) return true;
    return (
      category.name.toLowerCase().includes(query) ||
      (category.parentName ?? "").toLowerCase().includes(query)
    );
  });
}

export function buildCategorySections(categories: CategoryOverview[]): CategoryListSection[] {
  const custom = categories.filter((category) => !category.isSystem);
  const system = categories.filter((category) => category.isSystem);
  const visibleGroups = [custom, system].filter((group) => group.length > 0).length;

  return [
    ...(custom.length > 0 ? [{
      key: "custom" as const,
      label: `Personalizadas (${custom.length})`,
      data: custom,
      headerVariant: visibleGroups === 1 ? "hidden" as const : "default" as const,
    }] : []),
    ...(system.length > 0 ? [{
      key: "system" as const,
      label: `Del sistema (${system.length})`,
      data: system,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
