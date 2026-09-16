import { CHART_PALETTE } from "../../../constants/theme";

export type CategorySlice = {
  /** Color elegido por el usuario para esa categoría, si tiene uno. */
  color?: string | null;
};

/** Dos colores son el mismo aunque se hayan escrito distinto. */
function normalize(color: string | null | undefined): string | null {
  const trimmed = color?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/**
 * El color de cada tramo del donut de gasto por categoría.
 *
 * Existe porque el color que el usuario elige al crear una categoría **no se veía en ninguna
 * parte**: se guardaba en la base y ahí se quedaba. El donut pintaba con una paleta fija (que
 * además repetía su primer color dos veces, así que dos tramos salían idénticos).
 *
 * Manda el color del usuario, con una salvedad medida: en los datos reales hay **tres pares de
 * categorías que comparten color** —Diversión/Suscripciones, Educación/Impuestos,
 * Combustible/Tecnología—. Dos tramos del mismo color en un donut no se pueden distinguir, y el
 * gráfico existe justo para distinguirlos. Así que el primero en llegar se queda con el color
 * —los tramos vienen de mayor a menor, o sea que gana el que más pesa— y el segundo toma uno
 * libre de la paleta.
 *
 * "Otros" y "Sin categoría" no son categorías y nunca traen color: van siempre a la paleta.
 */
export function resolveCategorySliceColors(slices: CategorySlice[]): string[] {
  const palette = CHART_PALETTE.series;
  const used = new Set<string>();
  const out: string[] = [];

  const takeFromPalette = (index: number): string => {
    const free = palette.find((candidate) => !used.has(normalize(candidate)!));
    // Con más tramos que colores libres se repite antes que quedarse sin pintar: un donut con
    // dos tonos iguales al final se sigue leyendo; uno sin color, no.
    return free ?? palette[index % palette.length];
  };

  slices.forEach((slice, index) => {
    const own = normalize(slice.color);
    const chosen = own && !used.has(own) ? slice.color!.trim() : takeFromPalette(index);
    used.add(normalize(chosen)!);
    out.push(chosen);
  });

  return out;
}
