/**
 * El color del donut de gasto por categoría. Lo que se protege: que el color del usuario mande,
 * y que dos tramos nunca salgan del mismo color — que es justo lo que pasa con los datos reales,
 * donde tres pares de categorías comparten color.
 */
import { CHART_PALETTE } from "../../../../constants/theme";
import { resolveCategorySliceColors } from "../categorySliceColors";

const PALETA = CHART_PALETTE.series as readonly string[];

describe("resolveCategorySliceColors", () => {
  it("respeta el color que el usuario eligió", () => {
    const colores = resolveCategorySliceColors([{ color: "#F59E0B" }, { color: "#2563EB" }]);

    expect(colores).toEqual(["#F59E0B", "#2563EB"]);
  });

  it("dos categorías con el mismo color no salen iguales: gana la que más pesa", () => {
    // Los tramos llegan de mayor a menor, así que el primero es el de más gasto.
    const colores = resolveCategorySliceColors([{ color: "#F59E0B" }, { color: "#F59E0B" }]);

    expect(colores[0]).toBe("#F59E0B");
    expect(colores[1]).not.toBe("#F59E0B");
    expect(PALETA).toContain(colores[1]);
  });

  it("el mismo color escrito distinto sigue siendo el mismo color", () => {
    const colores = resolveCategorySliceColors([{ color: "#f59e0b" }, { color: " #F59E0B " }]);

    expect(colores[0]).toBe("#f59e0b");
    expect(colores[1]?.toUpperCase()).not.toBe("#F59E0B");
  });

  it("una categoría sin color toma uno de la paleta", () => {
    const colores = resolveCategorySliceColors([{ color: null }, { color: undefined }, {}]);

    for (const color of colores) expect(PALETA).toContain(color);
    expect(new Set(colores).size).toBe(3);
  });

  it("nunca repite mientras queden colores libres", () => {
    // El caso real del donut: cinco categorías más el tramo "Otros".
    const colores = resolveCategorySliceColors([
      { color: "#F59E0B" },
      { color: "#F59E0B" },
      { color: null },
      { color: "#2563EB" },
      { color: "#2563EB" },
      { color: null },
    ]);

    expect(colores).toHaveLength(6);
    expect(new Set(colores.map((c) => c.toUpperCase())).size).toBe(6);
  });

  it("con más tramos que colores repite antes que dejar uno sin pintar", () => {
    const colores = resolveCategorySliceColors(Array.from({ length: 12 }, () => ({ color: null })));

    expect(colores).toHaveLength(12);
    for (const color of colores) expect(PALETA).toContain(color);
  });

  it("sin tramos devuelve nada, sin reventar", () => {
    expect(resolveCategorySliceColors([])).toEqual([]);
  });
});
