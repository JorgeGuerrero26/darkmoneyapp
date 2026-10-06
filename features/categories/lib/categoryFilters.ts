import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { CategoryKind, CategoryOverview } from "../../../types/domain";

export type CategoryFilter = "all" | "pinned" | CategoryKind;
export type CategoryStatusFilter = "active" | "inactive" | "all";
export type CategoryOriginFilter = "all" | "custom" | "system";
export type CategoryListSection = ResourceSection<CategoryOverview, CategoryKind | "inactive">;

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
  kindFilter: CategoryFilter | CategoryFilter[],
  searchText: string,
  status: boolean | CategoryStatusFilter,
  origin: CategoryOriginFilter = "all",
) {
  const query = searchText.trim().toLowerCase();
  const filters = Array.isArray(kindFilter) ? kindFilter : [kindFilter];
  const pinnedOnly = filters.includes("pinned");
  const kinds = filters.filter((filter) => filter !== "all" && filter !== "pinned");
  const resolvedStatus = typeof status === "boolean" ? status ? "all" : "active" : status;

  return categories.filter((category) => {
    if (pinnedOnly && !category.isPinned) return false;
    if (kinds.length > 0 && !kinds.includes(category.kind)) return false;
    if (resolvedStatus !== "all" && category.isActive !== (resolvedStatus === "active")) return false;
    if (origin !== "all" && category.isSystem !== (origin === "system")) return false;

    if (!query) return true;
    return (
      category.name.toLowerCase().includes(query) ||
      (category.parentName ?? "").toLowerCase().includes(query)
    );
  });
}

export function buildCategorySections(categories: CategoryOverview[]): CategoryListSection[] {
  const groups: Array<{key: CategoryKind | "inactive"; label: string; data: CategoryOverview[]}> = [
    ...(["expense", "income", "both"] as const).map((kind) => ({
      key: kind, label: kind === "expense" ? "Gastos" : kind === "income" ? "Ingresos" : "Mixtas",
      data: categories.filter((item) => item.isActive && item.kind === kind),
    })),
    { key: "inactive", label: "Inactivas", data: categories.filter((item) => !item.isActive) },
  ];
  return groups.filter((group) => group.data.length > 0).map((group) => ({
    ...group,
    trailing: String(group.data.length),
    data: [...group.data].sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || b.movementCount - a.movementCount || a.name.localeCompare(b.name)),
    headerVariant: "divider",
  }));
}
