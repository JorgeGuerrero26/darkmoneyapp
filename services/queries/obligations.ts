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

// Todos los tipos y hooks de obligations viven ahora en obligations-impl.ts
// (refactor completado en Fase 4.2-f.4).
export type {
  ObligationFormInput,
  ObligationPaymentInput,
  PrincipalAdjustmentInput,
  UpdateObligationEventInput,
  DeleteObligationEventInput,
  CreateObligationEventDeleteRequestInput,
  RejectObligationEventDeleteRequestInput,
  CreateObligationEventEditRequestInput,
  AcceptObligationEventEditRequestInput,
  RejectObligationEventEditRequestInput,
  ObligationShareInviteInput,
  ObligationShareInviteResult,
  UnlinkObligationShareInput,
  PaymentRequestInput,
  AcceptPaymentRequestInput,
  LinkEventToAccountInput,
  DeleteViewerEventLinkInput,
} from "./obligations-impl";

export {
  useDeleteObligationMutation,
  useArchiveObligationMutation,
  useCreateObligationMutation,
  useUpdateObligationMutation,
  useCreateObligationPaymentMutation,
  useLinkMovementToObligationMutation,
  useCreatePrincipalAdjustmentMutation,
  useUpdateObligationEventMutation,
  useDeleteObligationEventMutation,
  useCreateObligationEventDeleteRequestMutation,
  useRejectObligationEventDeleteRequestMutation,
  useCreateObligationEventEditRequestMutation,
  useAcceptObligationEventEditRequestMutation,
  useRejectObligationEventEditRequestMutation,
  useObligationEventsQuery,
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
