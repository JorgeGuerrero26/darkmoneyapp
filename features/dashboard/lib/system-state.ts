export const SYSTEM_CONFIDENT_THRESHOLD = 75;

export function buildSystemState(readinessScore: number, totalIssues: number, uncategorizedCount: number) {
  const score = Math.max(0, Math.min(100, readinessScore));
  const issues = Math.max(0, totalIssues);
  const uncategorized = Math.max(0, uncategorizedCount);

  return {
    score,
    status: score >= SYSTEM_CONFIDENT_THRESHOLD ? "Confiable" : issues > 0 ? "Por limpiar" : "Base media",
    threshold: SYSTEM_CONFIDENT_THRESHOLD,
    totalIssues: issues,
    uncategorizedCount: uncategorized,
    otherIssuesCount: Math.max(0, issues - uncategorized),
  };
}

export type SystemState = ReturnType<typeof buildSystemState>;
