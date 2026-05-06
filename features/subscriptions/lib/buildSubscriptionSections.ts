import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { SubscriptionSummary } from "../../../types/domain";

export type SubscriptionListSection = ResourceSection<SubscriptionSummary, "active" | "paused" | "cancelled">;

export function buildSubscriptionSections(subscriptions: SubscriptionSummary[]): SubscriptionListSection[] {
  const active = subscriptions.filter((subscription) => subscription.status === "active");
  const paused = subscriptions.filter((subscription) => subscription.status === "paused");
  const cancelled = subscriptions.filter((subscription) => subscription.status === "cancelled");
  const visibleGroups = [active, paused, cancelled].filter((group) => group.length > 0).length;

  return [
    ...(active.length > 0 ? [{
      key: "active" as const,
      label: `Activas (${active.length})`,
      data: active,
      headerVariant: visibleGroups === 1 ? "hidden" as const : "default" as const,
    }] : []),
    ...(paused.length > 0 ? [{
      key: "paused" as const,
      label: `Pausadas (${paused.length})`,
      data: paused,
      headerVariant: visibleGroups === 1 ? "hidden" as const : "default" as const,
    }] : []),
    ...(cancelled.length > 0 ? [{
      key: "cancelled" as const,
      label: `Canceladas (${cancelled.length})`,
      data: cancelled,
      headerVariant: "divider" as const,
    }] : []),
  ];
}
