/** Orden alfabético en español (insensible a mayúsculas, números coherentes). */
const esCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => esCollator.compare(a.name, b.name));
}

export function sortByLabel<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => esCollator.compare(a.label, b.label));
}
