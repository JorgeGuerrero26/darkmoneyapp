import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { SpendType } from "../../../services/queries/spend-types";

export type SpendTypeStatus = "active" | "inactive" | "all";
export const SPEND_TYPE_STATUSES: { value: SpendTypeStatus; label: string }[] = [
  { value: "active", label: "Activos" }, { value: "inactive", label: "Inactivos" }, { value: "all", label: "Todos" },
];

export function filterSpendTypes(types: SpendType[], search: string, status: SpendTypeStatus) {
  const query = search.trim().toLocaleLowerCase();
  return types.filter((type) => (status === "all" || type.isActive === (status === "active")) && type.name.toLocaleLowerCase().includes(query));
}

export function buildSpendTypeSections(types: SpendType[]): ResourceSection<SpendType>[] {
  return [true, false].map((active) => ({
    key: active ? "active" : "inactive", label: active ? "Activos" : "Inactivos",
    data: types.filter((type) => type.isActive === active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    headerVariant: "divider" as const,
  })).filter((section) => section.data.length > 0).map((section) => ({ ...section, trailing: String(section.data.length) }));
}
