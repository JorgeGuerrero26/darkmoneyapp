import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeListSection = ResourceSection<
  RecurringIncomeSummary,
  "pinned" | "active" | "paused" | "cancelled"
>;

export function buildRecurringIncomeSections(items: RecurringIncomeSummary[]): RecurringIncomeListSection[] {
  const pinned = items.filter((item) => item.isPinned);
  const rest = items.filter((item) => !item.isPinned);
  const active = rest.filter((item) => item.status === "active");
  const paused = rest.filter((item) => item.status === "paused");
  const cancelled = rest.filter((item) => item.status === "cancelled");
  const hasPinned = pinned.length > 0;
  const visibleGroups = [active, paused, cancelled].filter((group) => group.length > 0).length;
  const sectionsBeforeOk = hasPinned;

  return [
    ...(hasPinned ? [{
      key: "pinned" as const,
      label: `Fijados (${pinned.length})`,
      data: pinned,
      headerVariant: "default" as const,
    }] : []),
    ...(active.length > 0 ? [{
      key: "active" as const,
      label: `Activos (${active.length})`,
      data: active,
      headerVariant: sectionsBeforeOk || visibleGroups > 1 ? "default" as const : "hidden" as const,
    }] : []),
    ...(paused.length > 0 ? [{
      key: "paused" as const,
      label: `Pausados (${paused.length})`,
      data: paused,
      headerVariant: sectionsBeforeOk || visibleGroups > 1 ? "default" as const : "hidden" as const,
    }] : []),
    ...(cancelled.length > 0 ? [{
      key: "cancelled" as const,
      label: `Cancelados (${cancelled.length})`,
      data: cancelled,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
