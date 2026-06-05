import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { BudgetOverview } from "../../../types/domain";

export type BudgetListSection = ResourceSection<BudgetOverview, "pinned" | "attention" | "ok">;

export function buildBudgetSections(budgets: BudgetOverview[]): BudgetListSection[] {
  const pinnedBudgets = budgets.filter((budget) => budget.isPinned);
  const rest = budgets.filter((budget) => !budget.isPinned);
  const attentionBudgets = rest.filter((budget) => budget.isOverLimit || budget.isNearLimit);
  const okBudgets = rest.filter((budget) => !budget.isOverLimit && !budget.isNearLimit);
  const hasPinned = pinnedBudgets.length > 0;
  const hasAttention = attentionBudgets.length > 0;
  const sectionsBeforeOk = hasPinned || hasAttention;

  return [
    ...(hasPinned ? [{
      key: "pinned" as const,
      label: "Fijados",
      data: pinnedBudgets,
      headerVariant: "default" as const,
    }] : []),
    ...(hasAttention ? [{
      key: "attention" as const,
      label: "Requieren atención",
      data: attentionBudgets,
      headerVariant: "default" as const,
    }] : []),
    ...(okBudgets.length > 0 ? [{
      key: "ok" as const,
      label: sectionsBeforeOk ? "En buen estado" : "Presupuestos",
      data: okBudgets,
      headerVariant: sectionsBeforeOk ? "default" as const : "hidden" as const,
    }] : []),
  ];
}
