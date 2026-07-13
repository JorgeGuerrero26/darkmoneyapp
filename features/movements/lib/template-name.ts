/** Normaliza el nombre de una plantilla: trim; null si queda vacío (inválido). */
export function normalizeTemplateName(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 ? name : null;
}
