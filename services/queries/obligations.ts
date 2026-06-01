/**
 * Public API for obligation-related queries, mutations and inputs.
 *
 * Today this file re-exports from the monolithic `workspace-data.ts`. The
 * audit (Fase 4) called out that file as a 6,500-line "megafile" — but
 * lifting the obligation code out is risky because the mutations share
 * private helpers (`insertObligationPaymentEventWithFallback`,
 * `syncViewerLinkedMovementsForEvent`, `notifyAcceptedViewersObligationEventUpdated`,
 * etc.).
 *
 * The path forward is to make every caller import obligation symbols from
 * THIS file, so a later physical move of the underlying implementation can
 * happen without touching consumers. Anything that lives in
 * `workspace-data.ts` and is NOT an obligation concept should keep being
 * imported from there directly.
 */

export type {
  // Form inputs
  ObligationFormInput,
  ObligationPaymentInput,
  PrincipalAdjustmentInput,
  // Event inputs
  UpdateObligationEventInput,
  DeleteObligationEventInput,
  CreateObligationEventDeleteRequestInput,
  RejectObligationEventDeleteRequestInput,
  CreateObligationEventEditRequestInput,
  AcceptObligationEventEditRequestInput,
  RejectObligationEventEditRequestInput,
} from "./workspace-data";

// Share inputs — movidos a obligations-impl.ts en Fase 4.2-c.
// Payment request + viewer-link inputs — movidos en Fase 4.2-e.
export type {
  ObligationShareInviteInput,
  ObligationShareInviteResult,
  UnlinkObligationShareInput,
  PaymentRequestInput,
  AcceptPaymentRequestInput,
  LinkEventToAccountInput,
  DeleteViewerEventLinkInput,
} from "./obligations-impl";

export {
  // Obligation CRUD mutations
  useDeleteObligationMutation,
  useArchiveObligationMutation,
  useCreateObligationMutation,
  useUpdateObligationMutation,
  // Payment / adjustment mutations
  useCreateObligationPaymentMutation,
  useLinkMovementToObligationMutation,
  useCreatePrincipalAdjustmentMutation,
  // Event mutations
  useUpdateObligationEventMutation,
  useDeleteObligationEventMutation,
  // Delete-request mutations
  useCreateObligationEventDeleteRequestMutation,
  useRejectObligationEventDeleteRequestMutation,
  // Edit-request mutations
  useCreateObligationEventEditRequestMutation,
  useAcceptObligationEventEditRequestMutation,
  useRejectObligationEventEditRequestMutation,
  // Events
  useObligationEventsQuery,
} from "./workspace-data";

// Shares & invites — movidos a obligations-impl.ts en Fase 4.2-c.
// Shared obligations — movidos en Fase 4.2-d.
// Payment requests + Viewer event links — movidos en Fase 4.2-e.
export {
  useObligationActiveShareQuery,
  useObligationSharesQuery,
  useCreateObligationShareInviteMutation,
  useUnlinkObligationShareMutation,
  usePendingObligationShareInvitesQuery,
  useSharedObligationsQuery,
  mergeWorkspaceAndSharedObligations,
  useObligationPaymentRequestsQuery,
  useViewerPaymentRequestsQuery,
  usePendingPaymentRequestCountsQuery,
  useCreatePaymentRequestMutation,
  useAcceptPaymentRequestMutation,
  useRejectPaymentRequestMutation,
  useObligationEventViewerLinksQuery,
  useLinkEventToAccountMutation,
  useUpsertLinkEventToAccountMutation,
  useDeleteViewerEventLinkMutation,
} from "./obligations-impl";
