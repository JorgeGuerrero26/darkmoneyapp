import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { CategoryKind, CategoryOverview } from "../../../types/domain";

export type CategoryFilter = "all" | "pinned" | CategoryKind;
export type CategoryListSection = ResourceSection<CategoryOverview, "pinned" | "custom" | "system" | "unused">;

export const CATEGORY_FILTERS: Array<{ label: string; value: CategoryFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Fijadas", value: "pinned" },
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
  const pinnedOnly = kindFilter === "pinned";

  return categories.filter((category) => {
    if (pinnedOnly && !category.isPinned) return false;
    if (kindFilter !== "all" && kindFilter !== "pinned" && category.kind !== kindFilter) return false;
    if (!showInactive && !category.isActive) return false;

    if (!query) return true;
    return (
      category.name.toLowerCase().includes(query) ||
      (category.parentName ?? "").toLowerCase().includes(query)
    );
  });
}

export function buildCategorySections(categories: CategoryOverview[]): CategoryListSection[] {
  // Más usada primero. Con el mismo uso, se conserva el orden que traía (alfabético), así el
  // resultado es estable entre renders en vez de bailar.
  const porUso = (a: CategoryOverview, b: CategoryOverview) => b.movementCount - a.movementCount;
  const sinUso = (category: CategoryOverview) => category.movementCount === 0;

  const pinned = categories.filter((category) => category.isPinned).sort(porUso);
  const rest = categories.filter((category) => !category.isPinned);
  const custom = rest.filter((category) => !category.isSystem && !sinUso(category)).sort(porUso);
  const system = rest.filter((category) => category.isSystem && !sinUso(category)).sort(porUso);
  // Las que no usas, juntas al final: no compiten con las que sí, y son las que vas a revisar.
  const unused = rest.filter(sinUso);
  const hasPinned = pinned.length > 0;
  const visibleGroups = [custom, system].filter((group) => group.length > 0).length;
  const sectionsBeforeOk = hasPinned;

  return [
    ...(hasPinned ? [{
      key: "pinned" as const,
      label: `Fijadas (${pinned.length})`,
      data: pinned,
      headerVariant: "default" as const,
    }] : []),
    ...(custom.length > 0 ? [{
      key: "custom" as const,
      label: `Personalizadas (${custom.length})`,
      data: custom,
      headerVariant: sectionsBeforeOk || visibleGroups > 1 ? "default" as const : "hidden" as const,
    }] : []),
    ...(system.length > 0 ? [{
      key: "system" as const,
      label: `Del sistema (${system.length})`,
      data: system,
      headerVariant: "divider" as const,
    }] : []),
    ...(unused.length > 0 ? [{
      key: "unused" as const,
      label: `Sin movimientos (${unused.length})`,
      data: unused,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
