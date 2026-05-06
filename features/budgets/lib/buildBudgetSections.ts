import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { BudgetOverview } from "../../../types/domain";

export type BudgetListSection = ResourceSection<BudgetOverview, "attention" | "ok">;

export function buildBudgetSections(budgets: BudgetOverview[]): BudgetListSection[] {
  const attentionBudgets = budgets.filter((budget) => budget.isOverLimit || budget.isNearLimit);
  const okBudgets = budgets.filter((budget) => !budget.isOverLimit && !budget.isNearLimit);
  const hasAttention = attentionBudgets.length > 0;

  return [
    ...(hasAttention ? [{
      key: "attention" as const,
      label: "Requieren atención",
      data: attentionBudgets,
      headerVariant: "default" as const,
    }] : []),
    ...(okBudgets.length > 0 ? [{
      key: "ok" as const,
      label: hasAttention ? "En buen estado" : "Presupuestos",
      data: okBudgets,
      headerVariant: hasAttention ? "default" as const : "hidden" as const,
    }] : []),
  ];
}
