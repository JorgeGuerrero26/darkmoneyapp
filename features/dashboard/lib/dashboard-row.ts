import type {
  MovementAnalyticsSignal,
  MovementLearningFeedback,
  WorkspaceAnalyticsSnapshot,
} from "../../../types/domain";

/**
 * Pure (RN-free) types used by dashboard selectors / builders / tests.
 * Re-exported from services/queries/workspace-data.ts for backward
 * compatibility. Living here lets consumers import the shape without
 * dragging the Supabase/React Query layer through the resolver.
 */
export type DashboardMovementRow = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAmount: number;
  destinationAmount: number;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
};

export type DashboardAnalyticsBundle = {
  signals: MovementAnalyticsSignal[];
  learningFeedback: MovementLearningFeedback[];
  projectionSnapshot: WorkspaceAnalyticsSnapshot | null;
  available: boolean;
};
