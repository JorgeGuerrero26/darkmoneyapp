/** Correct a known legacy label at the presentation boundary; leave stored names untouched. */
export function displayCategoryName(name: string): string {
  const legacyName = name.trim().toLocaleLowerCase("es");
  if (legacyName === "tecnologia") return "Tecnología";
  if (legacyName === "alimentacion") return "Alimentación";
  if (legacyName === "diversion") return "Diversión";
  return name;
}
