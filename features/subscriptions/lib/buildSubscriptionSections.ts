import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { SubscriptionSummary } from "../../../types/domain";

export type SubscriptionListSection = ResourceSection<SubscriptionSummary, "pinned" | "active" | "paused" | "cancelled">;

export function buildSubscriptionSections(subscriptions: SubscriptionSummary[]): SubscriptionListSection[] {
  const pinned = subscriptions.filter((subscription) => subscription.isPinned);
  const rest = subscriptions.filter((subscription) => !subscription.isPinned);
  const active = rest.filter((subscription) => subscription.status === "active");
  const paused = rest.filter((subscription) => subscription.status === "paused");
  const cancelled = rest.filter((subscription) => subscription.status === "cancelled");
  const hasPinned = pinned.length > 0;
  const visibleGroups = [active, paused, cancelled].filter((group) => group.length > 0).length;
  const sectionsBeforeOk = hasPinned;

  return [
    ...(hasPinned ? [{
      key: "pinned" as const,
      label: `Fijadas (${pinned.length})`,
      data: pinned,
      headerVariant: "default" as const,
    }] : []),
    ...(active.length > 0 ? [{
      key: "active" as const,
      label: `Activas (${active.length})`,
      data: active,
      headerVariant: sectionsBeforeOk || visibleGroups > 1 ? "default" as const : "hidden" as const,
    }] : []),
    ...(paused.length > 0 ? [{
      key: "paused" as const,
      label: `Pausadas (${paused.length})`,
      data: paused,
      headerVariant: sectionsBeforeOk || visibleGroups > 1 ? "default" as const : "hidden" as const,
    }] : []),
    ...(cancelled.length > 0 ? [{
      key: "cancelled" as const,
      label: `Canceladas (${cancelled.length})`,
      data: cancelled,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
