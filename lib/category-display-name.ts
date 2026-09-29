/** Correct a known legacy label at the presentation boundary; leave stored names untouched. */
export function displayCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("es") === "tecnologia" ? "Tecnología" : name;
}
