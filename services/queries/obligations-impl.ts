/**
 * Implementación física del cluster de obligations.
 *
 * Fase 4.2-c: cluster de SHARES (active share, list shares, pending invites,
 * create invite, unlink).
 * Fase 4.2-d: cluster de SHARED-OBLIGATIONS (parsing remoto desde la edge
 * function list-shared-obligations).
 * Fase 4.2-e: cluster de VIEWER LINKS + PAYMENT REQUESTS.
 *
 * Pendiente: 4.2-f (mutations CORE).
 *
 * Los callers públicos deben importar desde `./obligations` (el shim),
 * no desde este archivo directamente.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { UNIVERSAL_LINK_HOST } from "../../constants/config";
import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { dateStrToISO } from "../../lib/date";
import { mirrorObligationEventAttachmentsToMovement } from "../../lib/entity-attachments";
import type {
  JsonValue,
  ObligationDirection,
  ObligationEventSummary,
  ObligationEventViewerLink,
  ObligationOriginType,
  ObligationPaymentRequest,
  ObligationShareSummary,
  ObligationStatus,
  ObligationSummary,
  PendingObligationShareInviteItem,
  SharedObligationSummary,
} from "../../types/domain";

import {
  attachMovementToObligationEvent,
  insertObligationPaymentEventWithFallback,
  invokeEdgeFunction,
  mapObligation,
  toNum,
  type ObligationEventRow,
  type ObligationSummaryRow,
  type ViewerEventLinkRow,
} from "./workspace-data";

type NumericLike = number | string | null;

// ─── Helpers compartidos con shared-obligations (4.2-d) ──────────────────────

export function copyIfMissing(target: Record<string, unknown>, snake: string, camel: string) {
  if (target[snake] === undefined && target[camel] !== undefined) target[snake] = target[camel];
}

export function mapObligationShareRow(r: Record<string, unknown>): ObligationShareSummary {
  return {
    id: Number(r.id),
    workspaceId: Number(r.workspace_id),
    obligationId: Number(r.obligation_id),
    ownerUserId: String(r.owner_user_id ?? ""),
    invitedByUserId: String(r.invited_by_user_id ?? ""),
    invitedUserId: String(r.invited_user_id ?? ""),
    ownerDisplayName: (r.owner_display_name as string) ?? null,
    invitedDisplayName: (r.invited_display_name as string) ?? null,
    invitedEmail: String(r.invited_email ?? ""),
    status: r.status as ObligationShareSummary["status"],
    token: String(r.token ?? ""),
    message: (r.message as string) ?? null,
    acceptedAt: (r.accepted_at as string) ?? null,
    respondedAt: (r.responded_at as string) ?? null,
    lastSentAt: (r.last_sent_at as string) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

/** Normaliza fila share snake_case si la edge devolvió camelCase. */
export function obligationShareRecordToSnake(input: Record<string, unknown>): Record<string, unknown> {
  const o = { ...input };
  copyIfMissing(o, "workspace_id", "workspaceId");
  copyIfMissing(o, "obligation_id", "obligationId");
  copyIfMissing(o, "owner_user_id", "ownerUserId");
  copyIfMissing(o, "invited_by_user_id", "invitedByUserId");
  copyIfMissing(o, "invited_user_id", "invitedUserId");
  copyIfMissing(o, "owner_display_name", "ownerDisplayName");
  copyIfMissing(o, "invited_display_name", "invitedDisplayName");
  copyIfMissing(o, "invited_email", "invitedEmail");
  copyIfMissing(o, "accepted_at", "acceptedAt");
  copyIfMissing(o, "responded_at", "respondedAt");
  copyIfMissing(o, "last_sent_at", "lastSentAt");
  copyIfMissing(o, "created_at", "createdAt");
  copyIfMissing(o, "updated_at", "updatedAt");
  return o;
}

// ─── Obligation active share (pending / accepted) ───────────────────────────

export function useObligationActiveShareQuery(
  workspaceId: number | null,
  obligationId: number | null,
) {
  return useQuery({
    queryKey: ["obligation-active-share", workspaceId, obligationId],
    enabled: Boolean(supabase && workspaceId && obligationId),
    queryFn: async (): Promise<ObligationShareSummary | null> => {
      if (!supabase || !workspaceId || !obligationId) return null;
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, owner_user_id, invited_by_user_id, invited_user_id, owner_display_name, invited_display_name, invited_email, status, token, message, accepted_at, responded_at, last_sent_at, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("obligation_id", obligationId)
        .in("status", ["pending", "accepted"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Error al cargar compartición");
      if (!data) return null;
      return mapObligationShareRow(data as Record<string, unknown>);
    },
  });
}

/** Todas las filas pending/accepted del workspace (p. ej. lista de tarjetas + badges). */
export function useObligationSharesQuery(workspaceId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-shares", workspaceId ?? null],
    enabled: Boolean(supabase && workspaceId),
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<ObligationShareSummary[]> => {
      if (!supabase || !workspaceId) return [];
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, owner_user_id, invited_by_user_id, invited_user_id, owner_display_name, invited_display_name, invited_email, status, token, message, accepted_at, responded_at, last_sent_at, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .in("status", ["pending", "accepted"])
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar comparticiones");
      return (data ?? []).map((row) => mapObligationShareRow(row as Record<string, unknown>));
    },
  });
}

/** Invitaciones pendientes donde el usuario actual es el invitado (correo o user id). */
export function usePendingObligationShareInvitesQuery(
  userId: string | null | undefined,
  email: string | null | undefined,
) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: ["pending-obligation-share-invites", userId ?? null, normalizedEmail],
    enabled: Boolean(supabase && userId && normalizedEmail),
    staleTime: STALE.short,
    queryFn: async (): Promise<PendingObligationShareInviteItem[]> => {
      if (!supabase || !userId || !normalizedEmail) return [];
      const { data, error } = await supabase
        .from("obligation_shares")
        .select(
          "id, workspace_id, obligation_id, token, owner_display_name, invited_email, message, updated_at",
        )
        .eq("status", "pending")
        .or(`invited_user_id.eq.${userId},invited_email.eq.${normalizedEmail}`)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar invitaciones");

      const rows = (data ?? []) as Record<string, unknown>[];
      const obligationIds = Array.from(
        new Set(rows.map((row) => Number(row.obligation_id)).filter((id) => Number.isFinite(id) && id > 0)),
      );
      const obligationMetaById = new Map<number, { title: string | null; direction: ObligationDirection | null }>();
      if (obligationIds.length > 0) {
        const { data: obligationRows } = await supabase
          .from("v_obligation_summary")
          .select("id, title, direction")
          .in("id", obligationIds);
        for (const obligationRow of obligationRows ?? []) {
          const row = obligationRow as Record<string, unknown>;
          const id = Number(row.id);
          if (!Number.isFinite(id)) continue;
          obligationMetaById.set(id, {
            title: typeof row.title === "string" ? row.title : null,
            direction: row.direction === "receivable" || row.direction === "payable"
              ? row.direction
              : null,
          });
        }
      }

      return rows.map((row: Record<string, unknown>) => {
        const obligationId = Number(row.obligation_id);
        const meta = obligationMetaById.get(obligationId);
        const inviteKindLabel = meta?.direction === "receivable"
          ? "deuda"
          : meta?.direction === "payable"
            ? "credito"
            : null;
        return {
          id: Number(row.id),
          workspaceId: Number(row.workspace_id),
          obligationId,
          token: String(row.token ?? ""),
          ownerDisplayName: (row.owner_display_name as string) ?? null,
          invitedEmail: String(row.invited_email ?? ""),
          message: (row.message as string) ?? null,
          updatedAt: String(row.updated_at ?? ""),
          obligationTitle: meta?.title ?? null,
          obligationDirection: meta?.direction ?? null,
          inviteKindLabel,
        };
      });
    },
  });
}

// ─── Obligation share invite ────────────────────────────────────────────────

export type ObligationShareInviteInput = {
  workspaceId: number;
  obligationId: number;
  invitedEmail: string;
  message?: string | null;
};

export type ObligationShareInviteResult = {
  shareId: number;
  shareUrl?: string | null;
  emailSent: boolean;
  invitedEmail: string;
  invitedDisplayName?: string | null;
};

export type UnlinkObligationShareInput = {
  shareId?: number | null;
  workspaceId?: number | null;
  obligationId?: number | null;
};

function buildHostedAppUrl(): string | null {
  const host = UNIVERSAL_LINK_HOST.trim();
  if (!host) return null;
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
  return `https://${host.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export function useCreateObligationShareInviteMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
  const appUrl = buildHostedAppUrl();
  return useMutation({
    mutationFn: async (input: ObligationShareInviteInput) => {
      const response = await invokeEdgeFunction<{
        ok: boolean; error?: string;
        shareId?: number; shareUrl?: string;
        emailSent?: boolean; invitedEmail?: string; invitedDisplayName?: string;
        status?: string;
      }>(
        "create-obligation-share-invite",
        {
          workspaceId: input.workspaceId,
          obligationId: input.obligationId,
          invitedEmail: input.invitedEmail,
          message: input.message ?? null,
          appUrl,
        },
      );
      if (!response.ok || !response.shareId || !response.invitedEmail) {
        throw new Error(response.error ?? "No se pudo compartir la obligación.");
      }
      return {
        shareId: response.shareId,
        shareUrl: response.shareUrl ?? null,
        emailSent: Boolean(response.emailSent),
        invitedEmail: response.invitedEmail,
        invitedDisplayName: response.invitedDisplayName ?? null,
      } satisfies ObligationShareInviteResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useUnlinkObligationShareMutation(workspaceId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnlinkObligationShareInput) => {
      const response = await invokeEdgeFunction<{
        ok: boolean;
        error?: string;
        shareId?: number;
        status?: string;
        alreadyInactive?: boolean;
      }>("unlink-obligation-share", {
        shareId: input.shareId ?? null,
        workspaceId: input.workspaceId ?? workspaceId ?? null,
        obligationId: input.obligationId ?? null,
      });
      if (!response.ok) {
        throw new Error(response.error ?? "No se pudo desvincular la relación compartida.");
      }
      return response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

// ─── Obligaciones compartidas contigo (edge list-shared-obligations) ─────────

function obligationRowFromUnknown(o: Record<string, unknown>): ObligationSummaryRow | null {
  const id = Number(o.id);
  if (!Number.isFinite(id)) return null;
  copyIfMissing(o, "workspace_id", "workspaceId");
  copyIfMissing(o, "origin_type", "originType");
  copyIfMissing(o, "counterparty_id", "counterpartyId");
  copyIfMissing(o, "settlement_account_id", "settlementAccountId");
  copyIfMissing(o, "currency_code", "currencyCode");
  copyIfMissing(o, "principal_initial_amount", "principalInitialAmount");
  copyIfMissing(o, "principal_increase_total", "principalIncreaseTotal");
  copyIfMissing(o, "principal_decrease_total", "principalDecreaseTotal");
  copyIfMissing(o, "principal_current_amount", "principalCurrentAmount");
  copyIfMissing(o, "interest_total", "interestTotal");
  copyIfMissing(o, "fee_total", "feeTotal");
  copyIfMissing(o, "adjustment_total", "adjustmentTotal");
  copyIfMissing(o, "discount_total", "discountTotal");
  copyIfMissing(o, "writeoff_total", "writeoffTotal");
  copyIfMissing(o, "payment_total", "paymentTotal");
  copyIfMissing(o, "pending_amount", "pendingAmount");
  copyIfMissing(o, "progress_percent", "progressPercent");
  copyIfMissing(o, "start_date", "startDate");
  copyIfMissing(o, "due_date", "dueDate");
  copyIfMissing(o, "installment_amount", "installmentAmount");
  copyIfMissing(o, "installment_count", "installmentCount");
  copyIfMissing(o, "interest_rate", "interestRate");
  copyIfMissing(o, "payment_count", "paymentCount");
  copyIfMissing(o, "last_payment_date", "lastPaymentDate");
  copyIfMissing(o, "last_event_date", "lastEventDate");
  copyIfMissing(o, "created_at", "createdAt");
  copyIfMissing(o, "updated_at", "updatedAt");

  return {
    id,
    workspace_id: Number(o.workspace_id),
    direction: o.direction as ObligationSummary["direction"],
    origin_type: (o.origin_type as ObligationOriginType) ?? "manual",
    status: o.status as ObligationStatus,
    title: String(o.title ?? ""),
    counterparty_id: o.counterparty_id != null ? Number(o.counterparty_id) : null,
    settlement_account_id: o.settlement_account_id != null ? Number(o.settlement_account_id) : null,
    currency_code: String(o.currency_code ?? "PEN"),
    principal_initial_amount: (o.principal_initial_amount as NumericLike) ?? 0,
    principal_increase_total: (o.principal_increase_total as NumericLike) ?? 0,
    principal_decrease_total: (o.principal_decrease_total as NumericLike) ?? 0,
    principal_current_amount: (o.principal_current_amount as NumericLike) ?? 0,
    interest_total: (o.interest_total as NumericLike) ?? 0,
    fee_total: (o.fee_total as NumericLike) ?? 0,
    adjustment_total: (o.adjustment_total as NumericLike) ?? 0,
    discount_total: (o.discount_total as NumericLike) ?? 0,
    writeoff_total: (o.writeoff_total as NumericLike) ?? 0,
    payment_total: (o.payment_total as NumericLike) ?? 0,
    pending_amount: (o.pending_amount as NumericLike) ?? 0,
    progress_percent: (o.progress_percent as NumericLike) ?? 0,
    start_date: String(o.start_date ?? ""),
    due_date: o.due_date != null ? String(o.due_date) : null,
    installment_amount: (o.installment_amount as NumericLike) ?? null,
    installment_count: o.installment_count != null ? Number(o.installment_count) : null,
    interest_rate: (o.interest_rate as NumericLike) ?? null,
    description: o.description != null ? String(o.description) : null,
    notes: o.notes != null ? String(o.notes) : null,
    payment_count: Number(o.payment_count ?? 0),
    last_payment_date: o.last_payment_date != null ? String(o.last_payment_date) : null,
    last_event_date: o.last_event_date != null ? String(o.last_event_date) : null,
    created_at: String(o.created_at ?? ""),
    updated_at: String(o.updated_at ?? ""),
  };
}

function eventRowFromUnknown(e: Record<string, unknown>): ObligationEventRow | null {
  const id = Number(e.id);
  if (!Number.isFinite(id)) return null;
  copyIfMissing(e, "obligation_id", "obligationId");
  copyIfMissing(e, "event_type", "eventType");
  copyIfMissing(e, "event_date", "eventDate");
  copyIfMissing(e, "created_at", "createdAt");
  copyIfMissing(e, "installment_no", "installmentNo");
  copyIfMissing(e, "movement_id", "movementId");
  copyIfMissing(e, "created_by_user_id", "createdByUserId");
  return {
    id,
    obligation_id: Number(e.obligation_id),
    event_type: e.event_type as ObligationEventSummary["eventType"],
    event_date: String(e.event_date ?? ""),
    created_at: e.created_at != null ? String(e.created_at) : null,
    amount: (e.amount as NumericLike) ?? 0,
    installment_no: e.installment_no != null ? Number(e.installment_no) : null,
    reason: e.reason != null ? String(e.reason) : null,
    description: e.description != null ? String(e.description) : null,
    notes: e.notes != null ? String(e.notes) : null,
    movement_id: e.movement_id != null ? Number(e.movement_id) : null,
    created_by_user_id: e.created_by_user_id != null ? String(e.created_by_user_id) : null,
    metadata: (e.metadata as JsonValue) ?? null,
  };
}

function parseSharedObligationItem(item: unknown): SharedObligationSummary | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const oblRaw =
    raw.obligation && typeof raw.obligation === "object"
      ? (raw.obligation as Record<string, unknown>)
      : raw;
  const shareRaw =
    raw.share && typeof raw.share === "object"
      ? (raw.share as Record<string, unknown>)
      : raw.obligation_share && typeof raw.obligation_share === "object"
        ? (raw.obligation_share as Record<string, unknown>)
        : null;
  if (!shareRaw) return null;

  const eventsSource = Array.isArray(raw.events)
    ? raw.events
    : Array.isArray(oblRaw.events)
      ? oblRaw.events
      : [];

  const row = obligationRowFromUnknown(oblRaw);
  if (!row) return null;

  const eventRows: ObligationEventRow[] = [];
  for (const ev of eventsSource) {
    if (ev && typeof ev === "object") {
      const er = eventRowFromUnknown(ev as Record<string, unknown>);
      if (er) eventRows.push(er);
    }
  }

  const counterpartyMap = new Map<number, string>();
  if (row.counterparty_id != null) {
    const label =
      (typeof oblRaw.counterparty === "string" && oblRaw.counterparty) ||
      (typeof oblRaw.counterparty_name === "string" && oblRaw.counterparty_name) ||
      (typeof oblRaw.counterpartyName === "string" && oblRaw.counterpartyName);
    if (label) counterpartyMap.set(row.counterparty_id, label);
  }

  const base = mapObligation(row, eventRows, counterpartyMap);
  const share = mapObligationShareRow(obligationShareRecordToSnake(shareRaw));
  if (share.status !== "accepted") return null;

  return { ...base, viewerMode: "shared_viewer", share };
}

async function fetchSharedObligations(): Promise<SharedObligationSummary[]> {
  if (!supabase) return [];
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message ?? "No se pudo validar tu sesión.");
  }
  if (!sessionData.session?.user?.id) {
    return [];
  }

  const response = (await invokeEdgeFunction<Record<string, unknown>>("list-shared-obligations", {})) ?? {};

  if (response.ok === false) {
    throw new Error(String(response.error ?? "No se pudieron cargar las obligaciones compartidas."));
  }

  const rawList =
    (Array.isArray(response.items) ? response.items : null) ??
    (Array.isArray(response.obligations) ? response.obligations : null) ??
    (Array.isArray(response.data) ? response.data : null) ??
    [];

  const out: SharedObligationSummary[] = [];
  for (const item of rawList) {
    const parsed = parseSharedObligationItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function useSharedObligationsQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["shared-obligations", userId ?? null],
    enabled: Boolean(supabase && userId),
    staleTime: STALE.medium,
    retry: 1,
    queryFn: fetchSharedObligations,
  });
}

/** Combina obligaciones del workspace activo con las compartidas contigo (sin duplicar por id). */
export function mergeWorkspaceAndSharedObligations(
  workspace: ObligationSummary[],
  shared: SharedObligationSummary[],
): (ObligationSummary | SharedObligationSummary)[] {
  const byId = new Map<number, ObligationSummary | SharedObligationSummary>();
  for (const o of workspace) byId.set(o.id, o);
  for (const s of shared) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()];
}

// ─── Viewer links helpers (consumidos también por mutations CORE en workspace-data) ──

export async function fetchViewerLinksForEvent(eventId: number): Promise<ViewerEventLinkRow[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligation_event_viewer_links")
    .select("id, movement_id, linked_by_user_id, account_id, viewer_workspace_id")
    .eq("event_id", eventId);
  if (error) throw new Error(error.message ?? "Error al cargar vínculos del evento");
  return (data ?? []) as ViewerEventLinkRow[];
}

export async function deleteViewerLinksForEvent(eventId: number): Promise<ViewerEventLinkRow[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const viewerLinks = await fetchViewerLinksForEvent(eventId);
  for (const link of viewerLinks) {
    if (link.movement_id) {
      const { error: mvErr } = await supabase
        .from("movements")
        .delete()
        .eq("id", link.movement_id);
      if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento asociado del viewer");
    }
  }
  if (viewerLinks.length > 0) {
    const { error: linkErr } = await supabase
      .from("obligation_event_viewer_links")
      .delete()
      .eq("event_id", eventId);
    if (linkErr) throw new Error(linkErr.message ?? "Error al eliminar vínculos de viewers");
  }
  return viewerLinks;
}

// ─── Obligation Payment Requests ──────────────────────────────────────────────

function rowToPaymentRequest(row: Record<string, unknown>): ObligationPaymentRequest {
  return {
    id: Number(row.id),
    obligationId: Number(row.obligation_id),
    workspaceId: Number(row.workspace_id),
    shareId: Number(row.share_id),
    requestedByUserId: String(row.requested_by_user_id ?? ""),
    requestedByDisplayName: (row.requested_by_display_name as string | null) ?? null,
    amount: toNum(row.amount as NumericLike),
    paymentDate: String(row.payment_date ?? ""),
    installmentNo: row.installment_no != null ? Number(row.installment_no) : null,
    description: (row.description as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as ObligationPaymentRequest["status"]) ?? "pending",
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    viewerAccountId: row.viewer_account_id != null ? Number(row.viewer_account_id) : null,
    viewerAccountName: (row.viewer_account_name as string | null) ?? null,
    viewerWorkspaceId: row.viewer_workspace_id != null ? Number(row.viewer_workspace_id) : null,
    acceptedEventId: row.accepted_event_id != null ? Number(row.accepted_event_id) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** Todas las solicitudes pendientes del workspace (para mostrar badges en la lista). */
export function usePendingPaymentRequestCountsQuery(workspaceId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-payment-request-counts", workspaceId ?? null],
    enabled: Boolean(supabase && workspaceId != null),
    staleTime: STALE.short,
    queryFn: async (): Promise<Map<number, number>> => {
      if (!supabase || !workspaceId) return new Map();
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("obligation_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending");
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      const counts = new Map<number, number>();
      for (const row of (data ?? []) as { obligation_id: number }[]) {
        const id = Number(row.obligation_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    },
  });
}

/** Solicitudes enviadas por el viewer para una obligación (vista del shared viewer). */
export function useViewerPaymentRequestsQuery(
  obligationId: number | null | undefined,
  userId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["viewer-payment-requests", obligationId ?? null, userId ?? null],
    enabled: Boolean(supabase && obligationId != null && userId != null),
    staleTime: STALE.short,
    queryFn: async (): Promise<ObligationPaymentRequest[]> => {
      if (!supabase || !obligationId || !userId) return [];
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("id, obligation_id, workspace_id, share_id, requested_by_user_id, requested_by_display_name, amount, payment_date, installment_no, description, notes, status, rejection_reason, viewer_account_id, viewer_workspace_id, accepted_event_id, created_at, updated_at")
        .eq("obligation_id", obligationId)
        .eq("requested_by_user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      return (data ?? []).map((row: Record<string, unknown>) => rowToPaymentRequest(row));
    },
  });
}

/** Solicitudes de pago pendientes para una obligación (vista del owner). */
export function useObligationPaymentRequestsQuery(obligationId: number | null | undefined) {
  return useQuery({
    queryKey: ["obligation-payment-requests", obligationId ?? null],
    enabled: Boolean(supabase && obligationId != null),
    staleTime: STALE.short,
    queryFn: async (): Promise<ObligationPaymentRequest[]> => {
      if (!supabase || !obligationId) return [];
      const { data, error } = await supabase
        .from("obligation_payment_requests")
        .select("id, obligation_id, workspace_id, share_id, requested_by_user_id, requested_by_display_name, amount, payment_date, installment_no, description, notes, status, rejection_reason, viewer_account_id, viewer_workspace_id, accepted_event_id, created_at, updated_at")
        .eq("obligation_id", obligationId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Error al cargar solicitudes");
      return (data ?? []).map((row: Record<string, unknown>) => rowToPaymentRequest(row));
    },
  });
}

export type PaymentRequestInput = {
  obligationId: number;
  shareId: number;
  workspaceId: number;
  requestedByUserId: string;
  requestedByDisplayName?: string | null;
  amount: number;
  paymentDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  /** Cuenta del viewer donde se reflejará el movimiento al aceptarse */
  viewerAccountId?: number | null;
  viewerWorkspaceId?: number | null;
  /** Owner user id — used to send in-app notification */
  ownerUserId?: string | null;
  obligationTitle?: string | null;
};

/** Shared viewer envía una solicitud de pago/cobro al owner. */
export function useCreatePaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;
      const { data, error } = await client
        .from("obligation_payment_requests")
        .insert({
          obligation_id: input.obligationId,
          share_id: input.shareId,
          workspace_id: input.workspaceId,
          requested_by_user_id: input.requestedByUserId,
          requested_by_display_name: input.requestedByDisplayName ?? null,
          amount: input.amount,
          payment_date: input.paymentDate,
          installment_no: input.installmentNo ?? null,
          description: input.description?.trim() || null,
          notes: input.notes?.trim() || null,
          status: "pending",
          viewer_account_id: input.viewerAccountId ?? null,
          viewer_workspace_id: input.viewerWorkspaceId ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error al enviar solicitud");
      const requestId = (data as { id: number }).id;
      if (input.ownerUserId) {
        const senderName = input.requestedByDisplayName ?? "Un usuario";
        const desc = input.description?.trim();
        const obligationLabel = input.obligationTitle?.trim()
          ? ` en "${input.obligationTitle.trim()}"`
          : "";
        const row = {
          user_id: input.ownerUserId,
          channel: "in_app" as const,
          status: "pending" as const,
          kind: "obligation_payment_request",
          title: `Solicitud pendiente${obligationLabel}`,
          body: desc
            ? `${senderName} solicitó un pago de ${input.amount} Â· ${desc}`
            : `${senderName} envió una solicitud de pago de ${input.amount}${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""}.`,
          scheduled_for: new Date().toISOString(),
          related_entity_type: "obligation_payment_request",
          related_entity_id: requestId,
          payload: {
            shareId: input.shareId,
            requestId,
            obligationId: input.obligationId,
            obligationTitle: input.obligationTitle ?? null,
          },
        };

        try {
          const { data: existing, error: findErr } = await client
            .from("notifications")
            .select("id")
            .eq("user_id", row.user_id)
            .eq("kind", row.kind)
            .eq("related_entity_type", row.related_entity_type)
            .eq("related_entity_id", row.related_entity_id)
            .order("id", { ascending: false })
            .limit(1);
          if (findErr) throw new Error(findErr.message ?? "Error al comprobar la notificación");

          if ((existing?.length ?? 0) > 0) {
            const { error: updateErr } = await client
              .from("notifications")
              .update({
                channel: row.channel,
                status: row.status,
                title: row.title,
                body: row.body,
                scheduled_for: row.scheduled_for,
                payload: row.payload,
                read_at: null,
              })
              .eq("user_id", row.user_id)
              .eq("kind", row.kind)
              .eq("related_entity_type", row.related_entity_type)
              .eq("related_entity_id", row.related_entity_id);
            if (updateErr) throw new Error(updateErr.message ?? "Error al actualizar la notificación");
          } else {
            const { error: notificationErr } = await client
              .from("notifications")
              .insert(row);
            if (notificationErr) throw new Error(notificationErr.message ?? "Error al crear la notificación");
          }
        } catch (notificationErr) {
          console.warn("[PaymentRequestNotification]", notificationErr);
        }
      }
      return { id: requestId };
    },
    onSuccess: (data, variables) => {
      // Notify the obligation owner about the new request
      if (false) {
        const senderName = variables.requestedByDisplayName ?? "Un usuario";
        const desc = variables.description?.trim();
        const obligationLabel = variables.obligationTitle?.trim()
          ? ` en "${variables.obligationTitle?.trim() ?? ""}"`
          : "";
        void supabase?.from("notifications").insert({
          user_id: variables.ownerUserId,
          channel: "in_app",
          status: "pending",
          kind: "obligation_payment_request",
          title: `Solicitud pendiente${obligationLabel}`,
          body: desc
            ? `${senderName} solicitó un pago de ${variables.amount} Â· ${desc}`
            : `${senderName} envió una solicitud de pago de ${variables.amount}${variables.obligationTitle ? ` para "${variables.obligationTitle}"` : ""}.`,
          scheduled_for: new Date().toISOString(),
          related_entity_type: "obligation_payment_request",
          related_entity_id: data.id,
          payload: {
            shareId: variables.shareId,
            requestId: data.id,
            obligationId: variables.obligationId,
            obligationTitle: variables.obligationTitle ?? null,
          },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (variables.ownerUserId) {
        void queryClient.invalidateQueries({ queryKey: ["notifications", variables.ownerUserId] });
      }
    },
  });
}

export type AcceptPaymentRequestInput = {
  requestId: number;
  obligationId: number;
  workspaceId: number;
  amount: number;
  paymentDate: string;
  installmentNo?: number | null;
  description?: string | null;
  accountId?: number | null;
  createMovement: boolean;
  direction?: ObligationDirection;
  obligationTitle?: string;
  /** Cuenta del viewer (guardada en la solicitud) para auto-crear su movimiento */
  viewerAccountId?: number | null;
  viewerWorkspaceId?: number | null;
  viewerUserId?: string | null;
  ownerUserId?: string | null;
  shareId?: number | null;
};

/** Owner acepta la solicitud → crea evento + movimiento del owner + movimiento del viewer → actualiza status. */
export function useAcceptPaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptPaymentRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const nowIso = new Date().toISOString();
      const isReceivable = input.direction === "receivable";
      const autoDesc =
        input.description?.trim() ||
        (isReceivable ? `Cobro: ${input.obligationTitle ?? `obligacion #${input.obligationId}`}` : `Pago: ${input.obligationTitle ?? `obligacion #${input.obligationId}`}`);

      const { id: eventId } = await insertObligationPaymentEventWithFallback({
        obligationId: input.obligationId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        installmentNo: input.installmentNo,
        description: input.description,
        notes: null,
        metadata: { from_payment_request: input.requestId },
      });

      // 2. Create owner's movement if they have a settlement account
      let ownerMovementId: number | null = null;
      if (input.createMovement && input.accountId) {
        const movementPayload: Record<string, unknown> = {
          workspace_id: input.workspaceId,
          movement_type: "obligation_payment",
          status: "posted",
          occurred_at: dateStrToISO(input.paymentDate),
          description: autoDesc,
          obligation_id: input.obligationId,
          metadata: { obligation_event_id: eventId },
        };
        if (isReceivable) {
          movementPayload.destination_account_id = input.accountId;
          movementPayload.destination_amount = input.amount;
        } else {
          movementPayload.source_account_id = input.accountId;
          movementPayload.source_amount = input.amount;
        }
        const { data: mvData, error: mvError } = await supabase
          .from("movements")
          .insert(movementPayload)
          .select("id")
          .single();
        if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
        ownerMovementId = (mvData as { id: number }).id;
        await attachMovementToObligationEvent(eventId, ownerMovementId);
      }

      // 3. Mark request as accepted and store the created event id
      // NOTE: viewer's movement is created by the viewer themselves (separate mutation)
      // because the owner cannot insert into the viewer's workspace due to RLS.
      const { error: upError } = await supabase
        .from("obligation_payment_requests")
        .update({
          status: "accepted",
          accepted_event_id: eventId,
          updated_at: nowIso,
        })
        .eq("id", input.requestId);
      if (upError) throw new Error(upError.message ?? "Error al actualizar solicitud");

      if (input.ownerUserId) {
        void supabase
          .from("notifications")
          .update({
            status: "read",
            read_at: nowIso,
            title: "Solicitud aceptada",
            body: input.obligationTitle
              ? `Ya aceptaste la solicitud en "${input.obligationTitle}".`
              : "Ya aceptaste esta solicitud.",
            payload: {
              requestId: input.requestId,
              obligationId: input.obligationId,
              obligationTitle: input.obligationTitle ?? null,
              responseStatus: "accepted",
              acceptedEventId: eventId,
              respondedAt: nowIso,
            },
          })
          .eq("user_id", input.ownerUserId)
          .eq("kind", "obligation_payment_request")
          .eq("related_entity_type", "obligation_payment_request")
          .eq("related_entity_id", input.requestId);
      }

      // 4. Notify the viewer that their request was accepted
      if (input.viewerUserId) {
        const recentCutoffIso = new Date(Date.now() - 5 * 60_000).toISOString();
        const acceptedBody = input.viewerAccountId
          ? `Tu solicitud de ${input.amount} fue aceptada${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""} y se registrará en tu cuenta.`
          : `Tu solicitud de ${input.amount} fue aceptada${input.obligationTitle ? ` para "${input.obligationTitle}"` : ""}. Puedes asociar el movimiento a una cuenta desde el historial.`;

        void supabase
          .from("notifications")
          .update({ status: "read", read_at: nowIso })
          .eq("user_id", input.viewerUserId)
          .eq("kind", "obligation_event_unlinked")
          .eq("related_entity_id", input.obligationId)
          .eq("status", "pending")
          .gte("scheduled_for", recentCutoffIso);

        void supabase
          .from("notifications")
          .insert({
            user_id: input.viewerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_request_accepted",
            title: "Solicitud aceptada",
            body: acceptedBody,
            scheduled_for: nowIso,
            related_entity_type: "obligation_payment_request",
            related_entity_id: input.requestId,
            payload: {
              requestId: input.requestId,
              eventId,
              obligationId: input.obligationId,
              obligationTitle: input.obligationTitle ?? null,
              viewerAccountId: input.viewerAccountId ?? null,
              acceptedEventId: eventId,
              requiresAccountLink: input.viewerAccountId == null,
            },
          });
      }

      return { eventId, ownerMovementId };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Owner rechaza la solicitud. */
export function useRejectPaymentRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      obligationId,
      rejectionReason,
      viewerUserId,
      ownerUserId,
      amount,
      obligationTitle,
    }: {
      requestId: number;
      obligationId: number;
      rejectionReason?: string | null;
      viewerUserId?: string | null;
      ownerUserId?: string | null;
      amount?: number | null;
      obligationTitle?: string | null;
    }) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const { error } = await supabase
        .from("obligation_payment_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (error) throw new Error(error.message ?? "Error al rechazar solicitud");

      if (ownerUserId) {
        void supabase
          .from("notifications")
          .update({
            status: "read",
            read_at: new Date().toISOString(),
            title: "Solicitud rechazada",
            body: obligationTitle
              ? `Ya rechazaste la solicitud en "${obligationTitle}".`
              : "Ya rechazaste esta solicitud.",
            payload: {
              requestId,
              obligationId,
              obligationTitle: obligationTitle ?? null,
              responseStatus: "rejected",
              rejectionReason: rejectionReason?.trim() || null,
              respondedAt: new Date().toISOString(),
            },
          })
          .eq("user_id", ownerUserId)
          .eq("kind", "obligation_payment_request")
          .eq("related_entity_type", "obligation_payment_request")
          .eq("related_entity_id", requestId);
      }

      // Notify the viewer that their request was rejected
      if (viewerUserId) {
        void supabase
          .from("notifications")
          .insert({
            user_id: viewerUserId,
            channel: "in_app",
            status: "pending",
            kind: "obligation_request_rejected",
            title: "Solicitud rechazada",
            body: `Tu solicitud${amount != null ? ` de ${amount}` : ""} fue rechazada${obligationTitle ? ` para "${obligationTitle}"` : ""}${rejectionReason?.trim() ? `. Motivo: ${rejectionReason.trim()}` : ""}.`,
            scheduled_for: new Date().toISOString(),
            related_entity_type: "obligation_payment_request",
            related_entity_id: requestId,
            payload: {
              requestId,
              obligationId,
              obligationTitle: obligationTitle ?? null,
            },
          });
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-payment-request-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-payment-requests", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ─── Obligation Event Viewer Links ────────────────────────────────────────────

/** Links ya creados por el viewer para esta obligación (qué eventos ya vinculó a sus cuentas). */
export function useObligationEventViewerLinksQuery(
  obligationId: number | null | undefined,
  shareId: number | null | undefined,
) {
  return useQuery({
    queryKey: ["obligation-event-viewer-links", obligationId ?? null, shareId ?? null],
    enabled: Boolean(supabase && obligationId != null && shareId != null),
    staleTime: STALE.short,
    queryFn: async (): Promise<ObligationEventViewerLink[]> => {
      if (!supabase || !obligationId || !shareId) return [];
      const { data, error } = await supabase
        .from("obligation_event_viewer_links")
        .select("id, obligation_id, event_id, share_id, linked_by_user_id, viewer_workspace_id, account_id, movement_id, created_at")
        .eq("obligation_id", obligationId)
        .eq("share_id", shareId);
      if (error) throw new Error(error.message ?? "Error al cargar vínculos");
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        obligationId: Number(row.obligation_id),
        eventId: Number(row.event_id),
        shareId: Number(row.share_id),
        linkedByUserId: String(row.linked_by_user_id ?? ""),
        viewerWorkspaceId: row.viewer_workspace_id != null ? Number(row.viewer_workspace_id) : null,
        accountId: row.account_id != null ? Number(row.account_id) : null,
        accountName: null,
        movementId: row.movement_id != null ? Number(row.movement_id) : null,
        createdAt: String(row.created_at ?? ""),
      }));
    },
  });
}

export type LinkEventToAccountInput = {
  obligationId: number;
  obligationWorkspaceId: number;
  eventId: number;
  eventType: "payment" | "principal_increase" | "principal_decrease";
  shareId: number;
  linkedByUserId: string;
  viewerWorkspaceId: number;
  accountId: number;
  amount: number;
  eventDate: string;
  description?: string | null;
  /** Direction of the ORIGINAL obligation (owner's perspective) */
  obligationDirection: ObligationDirection;
  obligationTitle: string;
  currencyCode: string;
};

export function viewerLinkedEventMovementConfig(input: Pick<LinkEventToAccountInput, "eventType" | "obligationDirection" | "obligationTitle">) {
  const viewerIsDebtor = input.obligationDirection === "receivable";

  if (input.eventType === "payment") {
    return {
      movementType: "obligation_payment" as const,
      isInflow: !viewerIsDebtor,
      autoDesc: viewerIsDebtor
        ? `Pago vinculado: ${input.obligationTitle}`
        : `Cobro vinculado: ${input.obligationTitle}`,
    };
  }

  if (input.eventType === "principal_increase") {
    return {
      movementType: "obligation_opening" as const,
      isInflow: viewerIsDebtor,
      autoDesc: viewerIsDebtor
        ? `Dinero recibido: ${input.obligationTitle}`
        : `Prestamo adicional entregado: ${input.obligationTitle}`,
    };
  }

  return {
    movementType: "obligation_opening" as const,
    isInflow: !viewerIsDebtor,
    autoDesc: viewerIsDebtor
      ? `Devolucion de principal: ${input.obligationTitle}`
      : `Pago de principal: ${input.obligationTitle}`,
  };
}

/**
 * Shared viewer asocia un evento de pago a una de sus cuentas.
 * Crea un movimiento en el workspace del viewer y registra el link.
 */
export function useLinkEventToAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LinkEventToAccountInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");

      const movementConfig = viewerLinkedEventMovementConfig(input);
      const autoDesc = input.description?.trim() || movementConfig.autoDesc;

      const movementPayload: Record<string, unknown> = {
        workspace_id: input.viewerWorkspaceId,
        movement_type: movementConfig.movementType,
        status: "posted",
        occurred_at: dateStrToISO(input.eventDate),
        description: autoDesc,
        obligation_id: null,
        metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
      };

      if (movementConfig.isInflow) {
        movementPayload.destination_account_id = input.accountId;
        movementPayload.destination_amount = input.amount;
      } else {
        movementPayload.source_account_id = input.accountId;
        movementPayload.source_amount = input.amount;
      }

      const { data: mvData, error: mvError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
      const movementId = (mvData as { id: number }).id;

      // Record the link
      const { error: linkError } = await supabase
        .from("obligation_event_viewer_links")
        .insert({
          obligation_id: input.obligationId,
          event_id: input.eventId,
          share_id: input.shareId,
          linked_by_user_id: input.linkedByUserId,
          viewer_workspace_id: input.viewerWorkspaceId,
          account_id: input.accountId,
          movement_id: movementId,
        });
      if (linkError) throw new Error(linkError.message ?? "Error al guardar vínculo");

      let attachmentSyncError: string | null = null;
      try {
        await mirrorObligationEventAttachmentsToMovement({
          workspaceId: input.obligationWorkspaceId,
          targetWorkspaceId: input.viewerWorkspaceId,
          eventId: input.eventId,
          movementId,
        });
      } catch (error) {
        attachmentSyncError =
          error instanceof Error
            ? error.message
            : "El movimiento se creo, pero no pudimos copiar los comprobantes.";
      }

      return { movementId, attachmentSyncError };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["movement-attachments", variables.viewerWorkspaceId, data.movementId],
      });
    },
  });
}

export function useUpsertLinkEventToAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LinkEventToAccountInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;

      const movementConfig = viewerLinkedEventMovementConfig(input);
      const autoDesc = input.description?.trim() || movementConfig.autoDesc;

      const movementPayload: Record<string, unknown> = {
        workspace_id: input.viewerWorkspaceId,
        movement_type: movementConfig.movementType,
        status: "posted",
        occurred_at: dateStrToISO(input.eventDate),
        description: autoDesc,
        obligation_id: null,
        metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
        source_account_id: movementConfig.isInflow ? null : input.accountId,
        source_amount: movementConfig.isInflow ? null : input.amount,
        destination_account_id: movementConfig.isInflow ? input.accountId : null,
        destination_amount: movementConfig.isInflow ? input.amount : null,
      };

      const { data: existingLinks, error: existingErr } = await client
        .from("obligation_event_viewer_links")
        .select("id, movement_id, viewer_workspace_id")
        .eq("obligation_id", input.obligationId)
        .eq("event_id", input.eventId)
        .eq("share_id", input.shareId)
        .order("id", { ascending: false })
        .limit(1);
      if (existingErr) throw new Error(existingErr.message ?? "Error al comprobar vínculo existente");

      const existingLink = (existingLinks ?? [])[0] as
        | { id: number; movement_id: number | null; viewer_workspace_id: number | null }
        | undefined;

      let movementId = existingLink?.movement_id ?? null;
      if (movementId) {
        const { error: mvUpdateErr } = await client
          .from("movements")
          .update(movementPayload)
          .eq("id", movementId);
        if (mvUpdateErr) throw new Error(mvUpdateErr.message ?? "Error al actualizar movimiento");
      } else {
        const { data: mvData, error: mvError } = await client
          .from("movements")
          .insert({
            ...movementPayload,
            workspace_id: existingLink?.viewer_workspace_id ?? input.viewerWorkspaceId,
          })
          .select("id")
          .single();
        if (mvError) throw new Error(mvError.message ?? "Error al crear movimiento");
        movementId = (mvData as { id: number }).id;
      }

      if (existingLink?.id) {
        const { error: linkUpdateError } = await client
          .from("obligation_event_viewer_links")
          .update({
            linked_by_user_id: input.linkedByUserId,
            viewer_workspace_id: existingLink.viewer_workspace_id ?? input.viewerWorkspaceId,
            account_id: input.accountId,
            movement_id: movementId,
          })
          .eq("id", existingLink.id);
        if (linkUpdateError) throw new Error(linkUpdateError.message ?? "Error al actualizar vínculo");
      } else {
        const { error: linkError } = await client
          .from("obligation_event_viewer_links")
          .insert({
            obligation_id: input.obligationId,
            event_id: input.eventId,
            share_id: input.shareId,
            linked_by_user_id: input.linkedByUserId,
            viewer_workspace_id: input.viewerWorkspaceId,
            account_id: input.accountId,
            movement_id: movementId,
          });
        if (linkError) throw new Error(linkError.message ?? "Error al guardar vínculo");
      }

      let attachmentSyncError: string | null = null;
      if (movementId) {
        try {
          await mirrorObligationEventAttachmentsToMovement({
            workspaceId: input.obligationWorkspaceId,
            targetWorkspaceId: existingLink?.viewer_workspace_id ?? input.viewerWorkspaceId,
            eventId: input.eventId,
            movementId,
          });
        } catch (error) {
          attachmentSyncError =
            error instanceof Error
              ? error.message
              : "El movimiento se creo, pero no pudimos copiar los comprobantes.";
        }
      }

      return { movementId, updatedExisting: Boolean(existingLink?.id), attachmentSyncError };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({
        queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (data.movementId) {
        void queryClient.invalidateQueries({
          queryKey: ["movement-attachments", variables.viewerWorkspaceId, data.movementId],
        });
      }
    },
  });
}

export type DeleteViewerEventLinkInput = {
  linkId: number;
  movementId?: number | null;
  obligationId: number;
  shareId?: number | null;
};

export function useDeleteViewerEventLinkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteViewerEventLinkInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      if (input.movementId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .delete()
          .eq("id", input.movementId);
        if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento del viewer");
      }

      const { error: linkErr } = await supabase
        .from("obligation_event_viewer_links")
        .delete()
        .eq("id", input.linkId);
      if (linkErr) throw new Error(linkErr.message ?? "Error al eliminar vínculo del evento");
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({
        queryKey: ["obligation-event-viewer-links", variables.obligationId, variables.shareId ?? null],
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
