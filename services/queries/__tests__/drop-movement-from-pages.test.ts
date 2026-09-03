import { dropMovementFromPages } from "../drop-movement-from-pages";

describe("dropMovementFromPages", () => {
  const paginated = {
    pageParams: [null],
    pages: [
      { data: [{ id: 1 }, { id: 2 }] },
      { data: [{ id: 3 }] },
    ],
  };

  it("quita el movimiento de la pagina donde este", () => {
    const result = dropMovementFromPages(paginated, 2) as typeof paginated;
    expect(result.pages[0].data).toEqual([{ id: 1 }]);
    expect(result.pages[1].data).toEqual([{ id: 3 }]);
  });

  it("no toca el original", () => {
    dropMovementFromPages(paginated, 2);
    expect(paginated.pages[0].data).toHaveLength(2);
  });

  /**
   * El caso que rompio el borrado: bajo ["movements"] tambien cuelga el total del filtro, que
   * no es una lista paginada. Antes esto lanzaba dentro de onMutate y React Query abortaba la
   * mutacion, asi que el movimiento NO se borraba -- y en pantalla parecia que si.
   */
  it("devuelve intacto lo que no es una lista paginada", () => {
    const summary = { incomeTotal: 100, expenseTotal: 40, incomeCount: 2, expenseCount: 1 };
    expect(dropMovementFromPages(summary, 2)).toBe(summary);
  });

  it("aguanta null, undefined y formas raras sin lanzar", () => {
    expect(dropMovementFromPages(null, 1)).toBeNull();
    expect(dropMovementFromPages(undefined, 1)).toBeUndefined();
    expect(dropMovementFromPages({ pages: "no" }, 1)).toEqual({ pages: "no" });
    expect(dropMovementFromPages({ pages: [{}] }, 1)).toEqual({ pages: [{ data: undefined }] });
  });
});
