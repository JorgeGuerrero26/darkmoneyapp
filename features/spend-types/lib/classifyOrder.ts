export type ClassifiableCategory = {
  id: number;
  name: string;
};

export type ClassifyRow<T extends ClassifiableCategory> = {
  category: T;
  /** Parte del gasto del período que pasa por esta categoría, de 0 a 1. */
  share: number;
};

/**
 * Las categorías a clasificar, ordenadas por lo que de verdad pesan.
 *
 * **Medido antes de escribirlo**: de las 21 categorías de gasto, once tuvieron movimiento en los
 * últimos tres meses y **cinco se llevan el 90 %** —Tecnología 43 %, Otros 16 %, Servicios 16 %,
 * Alimentación 10 %, Salud 5 %—. Alfabéticamente, "Alimentación" abre la lista y "Tecnología"
 * queda decimoctava: se clasifican diez categorías que no mueven casi nada antes de llegar a la
 * que decide casi la mitad del resultado.
 *
 * Las que no tienen gasto en el período van al final, pero **van**: puede que este trimestre no
 * hayas usado "Educación" y el que viene sí.
 */
export function orderCategoriesToClassify<T extends ClassifiableCategory>(
  categories: T[],
  spendByCategory: Map<number, number>,
): ClassifyRow<T>[] {
  const total = [...spendByCategory.values()].reduce(
    (sum, amount) => sum + (Number.isFinite(amount) && amount > 0 ? amount : 0),
    0,
  );

  return categories
    .map((category) => {
      const amount = spendByCategory.get(category.id) ?? 0;
      return {
        category,
        share: total > 0 && amount > 0 ? amount / total : 0,
      };
    })
    .sort((a, b) => {
      if (b.share !== a.share) return b.share - a.share;
      return a.category.name.localeCompare(b.category.name, "es");
    });
}

/**
 * Cuánto pesa esta categoría, dicho solo cuando decir algo aporta.
 *
 * Por debajo del 5 % la cifra no cambia ninguna decisión —"1 % de tu gasto" al lado de una fila
 * es ruido— y además obliga a leer once porcentajes para encontrar los tres que importan.
 */
export function classifyRowNote(share: number): string | null {
  if (share < 0.05) return null;
  return `${Math.round(share * 100)}% de tu gasto`;
}
