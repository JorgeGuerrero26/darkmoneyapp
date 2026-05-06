import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeListSection = ResourceSection<
  RecurringIncomeSummary,
  "active" | "paused" | "cancelled"
>;

export function buildRecurringIncomeSections(items: RecurringIncomeSummary[]): RecurringIncomeListSection[] {
  const active = items.filter((item) => item.status === "active");
  const paused = items.filter((item) => item.status === "paused");
  const cancelled = items.filter((item) => item.status === "cancelled");
  const visibleGroups = [active, paused, cancelled].filter((group) => group.length > 0).length;

  return [
    ...(active.length > 0 ? [{
      key: "active" as const,
      label: `Activos (${active.length})`,
      data: active,
      headerVariant: visibleGroups === 1 ? "hidden" as const : "default" as const,
    }] : []),
    ...(paused.length > 0 ? [{
      key: "paused" as const,
      label: `Pausados (${paused.length})`,
      data: paused,
      headerVariant: visibleGroups === 1 ? "hidden" as const : "default" as const,
    }] : []),
    ...(cancelled.length > 0 ? [{
      key: "cancelled" as const,
      label: `Cancelados (${cancelled.length})`,
      data: cancelled,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
