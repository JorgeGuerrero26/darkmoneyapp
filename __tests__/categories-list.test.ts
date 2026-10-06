import { buildCategorySections, categoryCanDelete, filterCategories } from "../features/categories/lib/categoryFilters";
import type { CategoryOverview } from "../types/domain";

const category = (id: number, props: Partial<CategoryOverview> = {}): CategoryOverview => ({
  id, workspaceId: 1, name: `Categoría ${id}`, kind: "expense", isActive: true,
  sortOrder: 0, isSystem: false, movementCount: 0, subscriptionCount: 0, ...props,
});

it("combina tipos alternativos con fijados, búsqueda y estado", () => {
  const input = [category(1, { isPinned: true }), category(2, { kind: "income", isPinned: true }), category(3), category(4, { isPinned: true, isActive: false })];
  expect(filterCategories(input, ["expense", "income", "pinned"], "", false).map((item) => item.id)).toEqual([1, 2]);
  expect(filterCategories(input, ["pinned"], "4", true).map((item) => item.id)).toEqual([4]);
});

it("agrupa por tipo y coloca inactivas al final sin duplicar ni mutar", () => {
  const input = [category(1), category(2, { kind: "income" }), category(3, { kind: "both" }), category(4, { isActive: false })];
  const sections = buildCategorySections(input);
  expect(sections.map((item) => item.key)).toEqual(["expense", "income", "both", "inactive"]);
  expect(sections.every((item) => item.headerVariant === "divider")).toBe(true);
  expect(sections.flatMap((item) => item.data.map((row) => row.id))).toEqual([1, 2, 3, 4]);
  expect(input.map((item) => item.id)).toEqual([1, 2, 3, 4]);
});

it("protege categorías del sistema o con registros y subcategorías", () => {
  expect(categoryCanDelete(category(1, { isSystem: true }), [])).toBe(false);
  expect(categoryCanDelete(category(1, { movementCount: 1 }), [])).toBe(false);
  expect(categoryCanDelete(category(1, { subscriptionCount: 1 }), [])).toBe(false);
  expect(categoryCanDelete(category(1), [category(2, { parentId: 1 })])).toBe(false);
  expect(categoryCanDelete(category(1), [])).toBe(true);
});

it("combina estado, origen y fijadas sin confundir inactivas con todas", () => {
  const input = [
    category(1, { isSystem: true, isPinned: true }),
    category(2, { isSystem: true, isPinned: true, isActive: false }),
    category(3, { isPinned: true, isActive: false }),
    category(4, { isActive: false }),
  ];
  expect(filterCategories(input, ["pinned"], "", "inactive", "system").map((item) => item.id)).toEqual([2]);
  expect(filterCategories(input, [], "", "inactive", "custom").map((item) => item.id)).toEqual([3, 4]);
  expect(filterCategories(input, [], "", "active", "custom")).toEqual([]);
  expect(filterCategories(input, [], "", "all", "system").map((item) => item.id)).toEqual([1, 2]);
});
