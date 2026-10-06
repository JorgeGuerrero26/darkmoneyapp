import { buildSpendTypeSections, filterSpendTypes } from "../features/spend-types/lib/spendTypeList";
import type { SpendType } from "../services/queries/spend-types";
const type = (id: number, props: Partial<SpendType> = {}): SpendType => ({
  id, workspaceId: 1, name: `Tipo ${id}`, color: null, icon: null, sortOrder: id, isActive: true, ...props,
});

it("combina búsqueda y estado sin perder inactivos", () => {
  const input = [type(1, { name: "Necesidades" }), type(2, { name: "Deseos", isActive: false })];
  expect(filterSpendTypes(input, "  DESEOS ", "inactive").map((item) => item.id)).toEqual([2]);
  expect(filterSpendTypes(input, "", "active").map((item) => item.id)).toEqual([1]);
  expect(filterSpendTypes(input, "", "all")).toHaveLength(2);
});

it("ordena por posición y agrupa sin cambiar la entrada", () => {
  const input = [type(1, { sortOrder: 3 }), type(2, { sortOrder: 1 }), type(3, { isActive: false })];
  const sections = buildSpendTypeSections(input);
  expect(sections.map((item) => item.key)).toEqual(["active", "inactive"]);
  expect(sections.flatMap((item) => item.data.map((row) => row.id))).toEqual([2, 1, 3]);
  expect(input.map((item) => item.id)).toEqual([1, 2, 3]);
  expect(buildSpendTypeSections([])).toEqual([]);
});
