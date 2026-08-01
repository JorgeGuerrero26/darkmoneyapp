export type DuplicateVerdict = "duplicate" | "distinct" | "unknown" | "skipped";
export type DuplicateAction = "register" | "close-duplicate" | "needs-review";

export type DuplicateAiResult = {
  verdict: DuplicateVerdict;
  reason: string | null;
};

const VERDICTS: readonly DuplicateVerdict[] = ["duplicate", "distinct", "unknown", "skipped"];

/** Contrato con la edge function: cualquier forma inesperada degrada a unknown. */
export function parseDuplicateVerdict(raw: unknown): DuplicateAiResult {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const verdict = (raw as Record<string, unknown>).verdict;
    if (typeof verdict === "string" && (VERDICTS as readonly string[]).includes(verdict)) {
      const reason = (raw as Record<string, unknown>).reason;
      return { verdict: verdict as DuplicateVerdict, reason: typeof reason === "string" && reason.trim() ? reason : null };
    }
  }
  return { verdict: "unknown", reason: null };
}

/**
 * distinct → registrar (el usuario ya pidió el registro); duplicate → cerrar como hoy;
 * skipped (no Pro) → comportamiento actual (cerrar); unknown (fallo IA) → revisión manual.
 */
export function resolveDuplicateAction(verdict: DuplicateVerdict): DuplicateAction {
  if (verdict === "distinct") return "register";
  if (verdict === "unknown") return "needs-review";
  return "close-duplicate";
}
