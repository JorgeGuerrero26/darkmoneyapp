import type { ObligationSummary } from "../../../types/domain";

export function canDeleteObligation(obligation: ObligationSummary): boolean {
  return obligation.events.every((event) => event.eventType === "opening");
}
