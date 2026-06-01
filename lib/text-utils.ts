/**
 * Returns the first non-empty (after trim) value, or null if none are meaningful.
 *
 * Why: extracted because at least 5 places (history row, capital changes modal,
 * analytics modal, owner delete request list, viewer requests section) had the
 * exact same helper inline.
 */
export function firstMeaningfulText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
