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
import { TimeoutError, withTimeout } from "../../lib/promise-utils";
import { dateStrToISO, filterDateFrom, filterDateTo } from "../../lib/date";
import { patchSnapshotObligationPayment, patchSnapshotWithCreatedMovement } from "./snapshot-cache";
import {
  mirrorObligationEventAttachmentsToMovement,
  type AttachmentLike,
} from "../../lib/entity-attachments";
import { sortObligationEventsNewestFirst } from "../../lib/sort-obligation-events";
import {
  eventDeletePayload,
  eventEditPayload,
  readEventDeletePayload,
  readEventEditPayload,
  type EventDeleteRequestPayload,
} from "../../lib/obligation-event-payloads";
import type {
  JsonValue,
  MovementType,
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
  createMovement,
  createOrRefreshNotificationRow,
  formatNotificationCurrency,
  invokeEdgeFunction,
  isDuplicateConstraintMessage,
  markNotificationReadByEntity,
  runBackgroundQueryRefresh,
  toNum,
  type NotificationRefreshInput,
  type ObligationEventRow,
  type ObligationSummaryRow,
  type OwnerMovementLookupRow,
  type ViewerEventLinkRow,
} from "./workspace-data";

type NumericLike = number | string | null;

const OBLIGATION_SHARE_EDGE_TIMEOUT_MS = 18_000;
// Diagnóstico 2026-07-05 (dispositivo real): la BD responde en ~120 ms y la edge
// function en 0.7-1.7 s incluso fría. Los timeouts venían del CLIENTE en arranque
// frío: todas las queries iniciales compiten por el lock de auth de supabase-js
// (getSession/refresh serializados). 20 s da margen para salir de esa contención;
// la query ya no bloquea el bootstrap, así que esperar no retiene al usuario.
const OBLIGATION_SHARED_LIST_TIMEOUT_MS = 20_000;

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
      const response = await withTimeout(
        invokeEdgeFunction<{
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
        ),
        OBLIGATION_SHARE_EDGE_TIMEOUT_MS,
        "create-obligation-share-invite",
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
  // Sin getSession propio: invokeEdgeFunction ya resuelve/refresca la sesión.
  // Duplicarlo sumaba UNA adquisición extra del lock de auth en el arranque frío,
  // justo cuando todas las queries iniciales compiten por él (ver constante arriba).

  const response = (await withTimeout(
    invokeEdgeFunction<Record<string, unknown>>("list-shared-obligations", {}),
    OBLIGATION_SHARED_LIST_TIMEOUT_MS,
    "list-shared-obligations",
  )) ?? {};

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
    retry: (failureCount, error) => !(error instanceof TimeoutError) && failureCount < 1,
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

// ─── 4.2-f.1: Helpers de lookup y sync (CORE) ────────────────────────────────

export async function fetchNextObligationInstallmentNo(obligationId: number): Promise<number> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data, error } = await supabase
    .from("obligation_events")
    .select("installment_no")
    .eq("obligation_id", obligationId)
    .eq("event_type", "payment")
    .not("installment_no", "is", null)
    .order("installment_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Error al calcular la siguiente cuota");
  return Number((data as { installment_no?: number | null } | null)?.installment_no ?? 0) + 1;
}

export function mapObligation(
  row: ObligationSummaryRow,
  events: ObligationEventRow[],
  counterpartyMap: Map<number, string>,
): ObligationSummary {
  const obligationEvents: ObligationEventSummary[] = sortObligationEventsNewestFirst(
    events
      .filter((e) => e.obligation_id === row.id)
      .map((e) => ({
        id: e.id,
        eventType: e.event_type,
        eventDate: e.event_date,
        createdAt: e.created_at ?? null,
        amount: toNum(e.amount),
        installmentNo: e.installment_no,
        reason: e.reason,
        description: e.description,
        notes: e.notes,
        movementId: e.movement_id,
        createdByUserId: e.created_by_user_id,
        metadata: e.metadata,
      })),
  );

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    direction: row.direction,
    originType: row.origin_type,
    counterparty: row.counterparty_id ? counterpartyMap.get(row.counterparty_id) ?? "" : "",
    counterpartyId: row.counterparty_id,
    settlementAccountId: row.settlement_account_id,
    settlementAccountName: null,
    status: row.status,
    currencyCode: row.currency_code,
    principalAmount: toNum(row.principal_initial_amount),
    principalAmountInBaseCurrency: toNum(row.principal_initial_amount),
    currentPrincipalAmount: toNum(row.principal_current_amount),
    currentPrincipalAmountInBaseCurrency: toNum(row.principal_current_amount),
    pendingAmount: toNum(row.pending_amount),
    pendingAmountInBaseCurrency: toNum(row.pending_amount),
    progressPercent: toNum(row.progress_percent),
    startDate: row.start_date,
    dueDate: row.due_date,
    installmentAmount: row.installment_amount ? toNum(row.installment_amount) : null,
    installmentCount: row.installment_count,
    interestRate: row.interest_rate ? toNum(row.interest_rate) : null,
    description: row.description,
    notes: row.notes,
    paymentCount: row.payment_count,
    lastPaymentDate: row.last_payment_date,
    installmentLabel: "",
    events: obligationEvents,
  };
}

export function mapObligationEventRowsToSummaries(rows: ObligationEventRow[]): ObligationEventSummary[] {
  return sortObligationEventsNewestFirst(
    rows.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      eventDate: e.event_date,
      createdAt: e.created_at ?? null,
      amount: toNum(e.amount),
      installmentNo: e.installment_no,
      reason: e.reason,
      description: e.description,
      notes: e.notes,
      movementId: e.movement_id,
      createdByUserId: e.created_by_user_id,
      metadata: e.metadata,
    })),
  );
}

export async function fetchObligationEventsByObligationId(obligationId: number): Promise<ObligationEventSummary[]> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligation_events")
    .select(
      "id, obligation_id, event_type, event_date, created_at, amount, installment_no, reason, description, notes, movement_id, created_by_user_id, metadata",
    )
    .eq("obligation_id", obligationId);
  if (error) throw new Error(error.message ?? "Error al cargar eventos");
  return mapObligationEventRowsToSummaries((data ?? []) as ObligationEventRow[]);
}

export async function fetchObligationWorkspaceId(obligationId: number): Promise<number> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { data, error } = await supabase
    .from("obligations")
    .select("workspace_id")
    .eq("id", obligationId)
    .single();
  if (error) throw new Error(error.message ?? "obligación no encontrada");
  const ws = toNum(data?.workspace_id);
  if (!ws) throw new Error("Workspace no disponible.");
  return ws;
}

export async function resolveMovementAccountId(movementId: number | null | undefined): Promise<number | null> {
  if (!supabase || !movementId) return null;
  const { data, error } = await supabase
    .from("movements")
    .select("source_account_id, destination_account_id")
    .eq("id", movementId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Error al cargar la cuenta del movimiento");
  }
  const row = data as { source_account_id?: NumericLike; destination_account_id?: NumericLike } | null;
  const sourceAccountId = toNum(row?.source_account_id ?? null);
  if (sourceAccountId) return sourceAccountId;
  const destinationAccountId = toNum(row?.destination_account_id ?? null);
  return destinationAccountId || null;
}

export async function syncViewerLinkedMovementsForEvent(input: {
  eventId: number;
  obligationId: number;
  obligationWorkspaceId: number;
  eventType: "payment" | "principal_increase" | "principal_decrease";
  amount: number;
  eventDate: string;
  description?: string | null;
  direction: ObligationDirection;
  obligationTitle?: string | null;
}) {
  if (!supabase) throw new Error("Supabase no disponible.");

  const viewerLinks = await fetchViewerLinksForEvent(input.eventId);
  if (viewerLinks.length === 0) return [] as number[];

  const movementConfig = viewerLinkedEventMovementConfig({
    eventType: input.eventType,
    obligationDirection: input.direction,
    obligationTitle: input.obligationTitle?.trim() || `Obligacion #${input.obligationId}`,
  });
  const autoDesc = input.description?.trim() || movementConfig.autoDesc;

  const syncedMovementIds: number[] = [];

  for (const link of viewerLinks) {
    const viewerWorkspaceId = link.viewer_workspace_id != null ? Number(link.viewer_workspace_id) : null;
    let accountId = link.account_id != null ? Number(link.account_id) : null;
    if (!accountId && link.movement_id) {
      accountId = await resolveMovementAccountId(link.movement_id);
    }
    if (!viewerWorkspaceId || !accountId) continue;

    const movementPayload: Record<string, unknown> = {
      workspace_id: viewerWorkspaceId,
      movement_type: movementConfig.movementType,
      status: "posted",
      occurred_at: dateStrToISO(input.eventDate),
      description: autoDesc,
      obligation_id: null,
      metadata: { obligation_id: input.obligationId, obligation_event_id: input.eventId },
      source_account_id: movementConfig.isInflow ? null : accountId,
      source_amount: movementConfig.isInflow ? null : input.amount,
      destination_account_id: movementConfig.isInflow ? accountId : null,
      destination_amount: movementConfig.isInflow ? input.amount : null,
    };

    let movementId = link.movement_id != null ? Number(link.movement_id) : null;
    if (movementId) {
      const { error: movementUpdateError } = await supabase
        .from("movements")
        .update(movementPayload)
        .eq("id", movementId);
      if (movementUpdateError) {
        throw new Error(movementUpdateError.message ?? "Error al actualizar movimiento del viewer");
      }
    } else {
      const { data: movementData, error: movementInsertError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (movementInsertError) {
        throw new Error(movementInsertError.message ?? "Error al crear movimiento del viewer");
      }
      movementId = toNum((movementData as { id: NumericLike }).id);
      const { error: linkUpdateError } = await supabase
        .from("obligation_event_viewer_links")
        .update({
          account_id: accountId,
          movement_id: movementId,
        })
        .eq("id", link.id);
      if (linkUpdateError) {
        throw new Error(linkUpdateError.message ?? "Error al actualizar vinculo del viewer");
      }
    }

    if (movementId) {
      syncedMovementIds.push(movementId);
      try {
        await mirrorObligationEventAttachmentsToMovement({
          workspaceId: input.obligationWorkspaceId,
          targetWorkspaceId: viewerWorkspaceId,
          eventId: input.eventId,
          movementId,
        });
      } catch (error) {
        console.warn("[syncViewerLinkedMovementsForEvent] attachment mirror failed", error);
      }
    }
  }

  return syncedMovementIds;
}

export async function notifyAcceptedViewersObligationEventUpdated(input: {
  obligationId: number;
  eventId: number;
  amount: number;
  eventDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  currencyCode?: string | null;
  eventType?: string | null;
  obligationTitle?: string | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
}) {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data: shareRows, error: shareRowsError } = await supabase
    .from("obligation_shares")
    .select("invited_user_id")
    .eq("obligation_id", input.obligationId)
    .eq("status", "accepted");
  if (shareRowsError) {
    throw new Error(shareRowsError.message ?? "Error al cargar viewers de la obligacion");
  }

  const viewerIds = (shareRows ?? [])
    .map((row) => (row as { invited_user_id?: string | null }).invited_user_id ?? null)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (viewerIds.length === 0) return;

  const amountLabel = formatNotificationCurrency(input.amount, input.currencyCode);
  const payload = eventEditPayload({
    obligationId: input.obligationId,
    eventId: input.eventId,
    currencyCode: input.currencyCode,
    eventType: input.eventType,
    obligationTitle: input.obligationTitle,
    currentAmount: input.currentAmount,
    currentEventDate: input.currentEventDate,
    currentInstallmentNo: input.currentInstallmentNo,
    currentDescription: input.currentDescription,
    currentNotes: input.currentNotes,
    proposedAmount: input.amount,
    proposedEventDate: input.eventDate,
    proposedInstallmentNo: input.installmentNo ?? null,
    proposedDescription: input.description?.trim() || null,
    proposedNotes: input.notes?.trim() || null,
  });

  await Promise.all(
    viewerIds.map((viewerUserId) =>
      createOrRefreshNotificationRow({
        user_id: viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_updated",
        title: "Evento actualizado",
        body: `Se actualizo un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      }),
    ),
  );
}

export function movementTypeForObligationEvent(eventType: string | null | undefined): MovementType | null {
  switch (eventType) {
    case "payment":
      return "obligation_payment";
    case "principal_increase":
      return "income";
    case "principal_decrease":
      return "expense";
    default:
      return null;
  }
}

export function readMovementMetadataEventId(value: JsonValue | null | undefined): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, JsonValue>;
  const movementEventId =
    typeof raw.obligation_event_id === "number"
      ? raw.obligation_event_id
      : Number(raw.obligation_event_id ?? 0);
  return Number.isFinite(movementEventId) && movementEventId > 0 ? movementEventId : null;
}

export async function attachMovementToObligationEvent(eventId: number, movementId: number) {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { error } = await supabase
    .from("obligation_events")
    .update({ movement_id: movementId })
    .eq("id", eventId);
  if (error) {
    console.warn("[attachMovementToObligationEvent]", {
      eventId,
      movementId,
      message: error.message ?? "Error al vincular evento y movimiento",
    });
  }
}

export async function resolveOwnerMovementIdForObligationEvent(
  input: DeleteObligationEventInput,
): Promise<number | null> {
  if (!supabase) throw new Error("Supabase no disponible.");
  if (input.movementId) return input.movementId;

  const { data: eventRow, error: eventErr } = await supabase
    .from("obligation_events")
    .select("movement_id, event_date, amount, event_type, description")
    .eq("id", input.eventId)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message ?? "Error al cargar el evento");

  const eventMovementId = toNum((eventRow as { movement_id: NumericLike } | null)?.movement_id ?? null);
  if (eventMovementId) return eventMovementId;

  const eventDate =
    typeof (eventRow as { event_date?: string | null } | null)?.event_date === "string"
      ? (eventRow as { event_date: string }).event_date
      : input.eventDate ?? null;
  const eventAmount =
    (eventRow as { amount?: NumericLike | null } | null)?.amount != null
      ? toNum((eventRow as { amount: NumericLike }).amount)
      : input.amount ?? null;
  const eventType =
    typeof (eventRow as { event_type?: string | null } | null)?.event_type === "string"
      ? (eventRow as { event_type: string }).event_type
      : input.eventType ?? null;
  const eventDescription =
    typeof (eventRow as { description?: string | null } | null)?.description === "string"
      ? (eventRow as { description: string }).description.trim().toLowerCase()
      : "";
  if (!eventDate) return null;

  let query = supabase
    .from("movements")
    .select("id, movement_type, source_amount, destination_amount, description, metadata")
    .eq("obligation_id", input.obligationId)
    .gte("occurred_at", filterDateFrom(eventDate))
    .lte("occurred_at", filterDateTo(eventDate))
    .order("id", { ascending: false })
    .limit(25);

  const movementType = movementTypeForObligationEvent(eventType);
  if (movementType) {
    query = query.eq("movement_type", movementType);
  }

  const { data: movementRows, error: movementErr } = await query;
  if (movementErr) throw new Error(movementErr.message ?? "Error al buscar el movimiento vinculado");

  const candidates = (movementRows ?? []) as OwnerMovementLookupRow[];
  const metadataMatch = candidates.find((row) => readMovementMetadataEventId(row.metadata) === input.eventId);
  if (metadataMatch) return toNum(metadataMatch.id);

  if (eventAmount == null) return null;
  const normalizedAmount = Math.abs(eventAmount);
  const amountMatches = candidates.filter((row) => {
    const sourceAmount = Math.abs(toNum(row.source_amount));
    const destinationAmount = Math.abs(toNum(row.destination_amount));
    return sourceAmount === normalizedAmount || destinationAmount === normalizedAmount;
  });
  if (amountMatches.length === 1) return toNum(amountMatches[0].id);

  const obligationTitleNeedle = input.obligationTitle?.trim().toLowerCase() ?? "";
  const descriptiveMatches = amountMatches.filter((row) => {
    const description = row.description?.trim().toLowerCase() ?? "";
    if (!description) return false;
    return Boolean(
      (obligationTitleNeedle && description.includes(obligationTitleNeedle)) ||
      (eventDescription && description.includes(eventDescription)),
    );
  });
  if (descriptiveMatches.length === 1) return toNum(descriptiveMatches[0].id);

  return null;
}

// ─── 4.2-f.2: Helpers resolve notif + insert payment + CRUD mutations ────────

export async function insertObligationPaymentEventWithFallback(input: {
  obligationId: number;
  paymentDate: string;
  amount: number;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  metadata?: JsonValue;
}): Promise<{ id: number; installmentNoApplied: boolean; appliedInstallmentNo: number | null }> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const payload = {
    obligation_id: input.obligationId,
    event_type: "payment" as const,
    event_date: input.paymentDate,
    amount: input.amount,
    installment_no: input.installmentNo ?? null,
    description: input.description?.trim() || null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("obligation_events")
    .insert(payload)
    .select("id")
    .single();
  if (!error) {
    return {
      id: (data as { id: number }).id,
      installmentNoApplied: input.installmentNo != null,
      appliedInstallmentNo: input.installmentNo ?? null,
    };
  }

  if (input.installmentNo != null && isDuplicateConstraintMessage(error.message)) {
    const nextInstallmentNo = await fetchNextObligationInstallmentNo(input.obligationId);
    if (nextInstallmentNo > input.installmentNo) {
      const { data: nextData, error: nextErr } = await supabase
        .from("obligation_events")
        .insert({
          ...payload,
          installment_no: nextInstallmentNo,
        })
        .select("id")
        .single();
      if (!nextErr) {
        return {
          id: (nextData as { id: number }).id,
          installmentNoApplied: true,
          appliedInstallmentNo: nextInstallmentNo,
        };
      }
      if (!isDuplicateConstraintMessage(nextErr.message)) {
        throw new Error(nextErr.message ?? "Error de base de datos");
      }
    }

    const { data: retryData, error: retryErr } = await supabase
      .from("obligation_events")
      .insert({
        ...payload,
        installment_no: null,
      })
      .select("id")
      .single();
    if (!retryErr) {
      return {
        id: (retryData as { id: number }).id,
        installmentNoApplied: false,
        appliedInstallmentNo: null,
      };
    }
    throw new Error(retryErr.message ?? "Error de base de datos");
  }

  throw new Error(error.message ?? "Error de base de datos");
}

export async function resolveViewerDeletePendingNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_delete_pending")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveViewerDeletePendingNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventDeletePayload(row.payload);
    const updatePayload = payload
      ? eventDeletePayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveViewerDeletePendingNotification]", updateErr.message ?? updateErr);
    }
  }
}

export async function resolveOwnerDeleteRequestNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_delete_request")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveOwnerDeleteRequestNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventDeletePayload(row.payload);
    const updatePayload = payload
      ? eventDeletePayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveOwnerDeleteRequestNotification]", updateErr.message ?? updateErr);
    }
  }
}

export async function resolveViewerEditPendingNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_edit_pending")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveViewerEditPendingNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventEditPayload(row.payload);
    const updatePayload = payload
      ? eventEditPayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveViewerEditPendingNotification]", updateErr.message ?? updateErr);
    }
  }
}

export async function resolveOwnerEditRequestNotification(
  userId: string | null | undefined,
  eventId: number,
  responseStatus: "accepted" | "rejected",
  rejectionReason?: string | null,
) {
  if (!supabase || !userId) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("kind", "obligation_event_edit_request")
    .eq("related_entity_type", "obligation_event")
    .eq("related_entity_id", eventId);
  if (error) {
    console.warn("[resolveOwnerEditRequestNotification]", error.message ?? error);
    return;
  }

  for (const row of (data ?? []) as { id: number; payload: JsonValue | null }[]) {
    const payload = readEventEditPayload(row.payload);
    const updatePayload = payload
      ? eventEditPayload({
          ...payload,
          rejectionReason:
            responseStatus === "rejected" ? rejectionReason?.trim() || null : payload.rejectionReason ?? null,
          responseStatus,
        })
      : row.payload;
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        status: "read",
        read_at: nowIso,
        payload: updatePayload,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[resolveOwnerEditRequestNotification]", updateErr.message ?? updateErr);
    }
  }
}

export type ObligationFormInput = {
  userId: string;
  title: string;
  direction: "receivable" | "payable";
  originType: "cash_loan" | "sale_financed" | "purchase_financed" | "manual";
  openingImpact?: "none" | "inflow" | "outflow";
  openingAccountId?: number | null;
  counterpartyId?: number | null;
  settlementAccountId?: number | null;
  currencyCode: string;
  principalAmount: number;
  startDate: string;
  dueDate?: string | null;
  installmentAmount?: number | null;
  installmentCount?: number | null;
  interestRate?: number | null;
  description?: string | null;
  notes?: string | null;
};

export function useDeleteObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { count, error: eventsError } = await supabase
        .from("obligation_events")
        .select("id", { head: true, count: "exact" })
        .eq("obligation_id", id)
        .neq("event_type", "opening");
      if (eventsError) throw new Error(eventsError.message ?? "Error al validar la obligación");
      if ((count ?? 0) > 0) {
        throw new Error("No puedes eliminar esta obligación porque tiene eventos. Archívala o elimina sus eventos primero.");
      }
      const { error } = await supabase
        .from("obligations")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useArchiveObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const nextStatus: ObligationStatus = archived ? "cancelled" : "active";
      const { error } = await supabase
        .from("obligations")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(
        queryClient,
        workspaceId
          ? [["workspace-snapshot"], ["obligation-active-share"], ["obligation-shares", workspaceId]]
          : [["workspace-snapshot"], ["obligation-active-share"]],
      );
    },
  });
}

export function useCreateObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationFormInput) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const { data, error } = await supabase
        .from("obligations")
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: input.userId,
          updated_by_user_id: input.userId,
          title: input.title,
          direction: input.direction,
          origin_type: input.originType,
          counterparty_id: input.counterpartyId ?? null,
          settlement_account_id: input.settlementAccountId ?? null,
          currency_code: input.currencyCode,
          principal_amount: input.principalAmount,
          start_date: input.startDate,
          due_date: input.dueDate ?? null,
          installment_amount: input.installmentAmount ?? null,
          installment_count: input.installmentCount ?? null,
          interest_rate: input.interestRate ?? null,
          description: input.description ?? null,
          notes: input.notes ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      const created = data as { id: number };

      // Create opening movement when cash actually moved at obligation start
      const openingImpact = input.openingImpact ?? "none";
      if (openingImpact !== "none" && input.openingAccountId) {
        const isInflow = openingImpact === "inflow";
        const openingDesc = input.direction === "receivable"
          ? `Préstamo entregado: ${input.title}`
          : `Dinero recibido: ${input.title}`;
        await createMovement(workspaceId, {
          movementType: "obligation_opening" as MovementType,
          status: "posted",
          occurredAt: `${input.startDate}T12:00:00`,
          description: openingDesc,
          notes: null,
          sourceAccountId: isInflow ? null : input.openingAccountId,
          sourceAmount: isInflow ? null : input.principalAmount,
          destinationAccountId: isInflow ? input.openingAccountId : null,
          destinationAmount: isInflow ? input.principalAmount : null,
          obligationId: created.id,
        });
      }

      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-active-share"] });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: ["obligation-shares", workspaceId] });
      }
    },
  });
}

export function useUpdateObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<ObligationFormInput> }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      const payload: Record<string, unknown> = {};
      if (input.title !== undefined) payload.title = input.title;
      if (input.counterpartyId !== undefined) payload.counterparty_id = input.counterpartyId;
      if (input.settlementAccountId !== undefined) payload.settlement_account_id = input.settlementAccountId;
      if (input.dueDate !== undefined) payload.due_date = input.dueDate;
      if (input.installmentAmount !== undefined) payload.installment_amount = input.installmentAmount;
      if (input.installmentCount !== undefined) payload.installment_count = input.installmentCount;
      if (input.interestRate !== undefined) payload.interest_rate = input.interestRate;
      if (input.description !== undefined) payload.description = input.description;
      if (input.notes !== undefined) payload.notes = input.notes;
      const { error } = await supabase
        .from("obligations")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
    },
    onSuccess: () => {
      runBackgroundQueryRefresh(
        queryClient,
        workspaceId
          ? [["workspace-snapshot"], ["obligation-active-share"], ["obligation-shares", workspaceId]]
          : [["workspace-snapshot"], ["obligation-active-share"]],
      );
    },
  });
}

// ─── 4.2-f.3: Payment / link / principal / update event mutations ────────────

export type ObligationPaymentInput = {
  obligationId: number;
  amount: number;
  paymentDate: string;
  accountId?: number | null;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  createMovement: boolean;
  /** Si es "receivable" (me deben), textos automáticos usan "cobro". */
  direction?: ObligationDirection;
  attachments?: AttachmentLike[];
};

export function useCreateObligationPaymentMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObligationPaymentInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const wsId = await fetchObligationWorkspaceId(input.obligationId);
      if (workspaceId != null && workspaceId !== wsId) {
        throw new Error("La obligación no pertenece al workspace activo.");
      }
      const isReceivable = input.direction === "receivable";
      const autoDesc =
        input.description?.trim() ||
        (isReceivable ? `Cobro de obligacion #${input.obligationId}` : `Pago de obligacion #${input.obligationId}`);
      const { id: eventId, installmentNoApplied } = await insertObligationPaymentEventWithFallback({
        obligationId: input.obligationId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        installmentNo: input.installmentNo,
        description: input.description,
        notes: input.notes,
        metadata: {},
      });
      let ownerMovementId: number | null = null;
      // If requested, also create a movement linked to this obligation
      if (input.createMovement && input.accountId) {
        const movementPayload: Record<string, unknown> = {
          workspace_id: wsId,
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
        const { data: mvData, error: mvErr } = await supabase
          .from("movements")
          .insert(movementPayload)
          .select("id")
          .single();
        if (mvErr) throw mvErr;
        ownerMovementId = (mvData as { id: number }).id;
        await attachMovementToObligationEvent(eventId, ownerMovementId);
      }
      return {
        id: eventId,
        movementId: ownerMovementId,
        workspaceId: wsId,
        installmentNoApplied,
      };
    },
    onSuccess: (data, variables) => {
      // Parche quirúrgico primero: saldo de cuenta y pendiente de la obligación
      // cambian en este frame; el refresh de abajo confirma/corrige detrás.
      const isReceivable = variables.direction === "receivable";
      if (data.movementId && variables.accountId) {
        patchSnapshotWithCreatedMovement(queryClient, data.workspaceId, {
          id: data.movementId,
          status: "posted",
          occurredAt: dateStrToISO(variables.paymentDate),
          sourceAccountId: isReceivable ? null : variables.accountId,
          sourceAmount: isReceivable ? null : variables.amount,
          destinationAccountId: isReceivable ? variables.accountId : null,
          destinationAmount: isReceivable ? variables.amount : null,
        });
      }
      patchSnapshotObligationPayment(queryClient, data.workspaceId, variables.obligationId, variables.amount);
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
        ["entity-attachments", data.workspaceId, "obligation-event", data.id],
      ];
      if (data.movementId) {
        queryKeys.push(["movement-attachments", data.workspaceId, data.movementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Actualizando pago",
        description: "Estamos sincronizando el historial y los balances en segundo plano.",
      });
    },
  });
}

export function useLinkMovementToObligationMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      movementId,
      obligationId,
      amount,
      paymentDate,
      description,
      installmentNo,
    }: {
      movementId: number;
      obligationId: number;
      amount: number;
      paymentDate: string;
      description?: string | null;
      installmentNo?: number | null;
    }) => {
      if (!supabase || !workspaceId) throw new Error("Workspace no disponible.");
      // 1. Create obligation_event of type "payment" linked to this movement
      const { error: evError } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: obligationId,
          event_type: "payment",
          event_date: paymentDate,
          amount,
          movement_id: movementId,
          description: description?.trim() || null,
          installment_no: installmentNo ?? null,
          metadata: {},
        });
      if (evError) throw new Error(evError.message ?? "Error al crear evento de obligación");
      // 2. Tag the movement with the obligation id
      const { error: mvError } = await supabase
        .from("movements")
        .update({ obligation_id: obligationId })
        .eq("id", movementId)
        .eq("workspace_id", workspaceId);
      if (mvError) throw new Error(mvError.message ?? "Error al vincular movimiento");
    },
    onSuccess: (_data, { movementId, obligationId }) => {
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["movement", movementId],
        ["obligation-events", obligationId],
      ]);
    },
  });
}

export type PrincipalAdjustmentInput = {
  obligationId: number;
  direction: ObligationDirection;
  mode: "increase" | "decrease";
  amount: number;
  eventDate: string;
  reason?: string | null;
  notes?: string | null;
  accountId?: number | null;
  createMovement?: boolean;
};

export function useCreatePrincipalAdjustmentMutation(workspaceId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PrincipalAdjustmentInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const wsId = await fetchObligationWorkspaceId(input.obligationId);
      if (workspaceId != null && workspaceId !== wsId) {
        throw new Error("La obligación no pertenece al workspace activo.");
      }
      const eventType = input.mode === "increase" ? "principal_increase" : "principal_decrease";
      const { data, error } = await supabase
        .from("obligation_events")
        .insert({
          obligation_id: input.obligationId,
          event_type: eventType,
          event_date: input.eventDate,
          amount: input.amount,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          metadata: {},
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "Error de base de datos");
      const eventId = (data as { id: number }).id;
      // Optionally create a linked account movement
      if (input.createMovement && input.accountId) {
        const isReceivable = input.direction === "receivable";
        const movType =
          input.mode === "increase"
            ? (isReceivable ? "expense" : "income")
            : (isReceivable ? "income" : "expense");
        const desc = input.mode === "increase"
          ? (isReceivable
              ? `Prestamo adicional de obligacion #${input.obligationId}`
              : `Aumento de deuda #${input.obligationId}`)
          : (isReceivable
              ? `Recuperacion de principal de obligacion #${input.obligationId}`
              : `Reduccion de deuda #${input.obligationId}`);
        const { data: mvData, error: mvErr } = await supabase
          .from("movements")
          .insert({
            workspace_id: wsId,
            movement_type: movType,
            status: "posted",
            occurred_at: dateStrToISO(input.eventDate),
            description: desc,
            ...((movType === "income")
              ? { destination_account_id: input.accountId, destination_amount: input.amount }
              : { source_account_id: input.accountId, source_amount: input.amount }),
            obligation_id: input.obligationId,
            metadata: { obligation_event_id: eventId },
          })
          .select("id")
          .single();
        if (mvErr) throw mvErr;
        await attachMovementToObligationEvent(eventId, (mvData as { id: number }).id);
      }
      return { id: eventId };
    },
    onSuccess: (data, variables) => {
      runBackgroundQueryRefresh(queryClient, [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
      ], {
        message: "Actualizando deuda o crédito",
        description: "Estamos sincronizando el evento y los balances asociados en segundo plano.",
      });
    },
  });
}

export type UpdateObligationEventInput = {
  eventId: number;
  obligationId: number;
  amount: number;
  eventDate: string;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  reason?: string | null;
  movementId?: number | null;
  accountId?: number | null;
  createMovement?: boolean;
  direction?: ObligationDirection;
  eventType?: string | null;
  currencyCode?: string | null;
  obligationTitle?: string | null;
};

type UpdateObligationEventSyncResult = {
  movementId: number | null;
  workspaceId: number;
  removedMovementId: number | null;
  syncedViewerMovementIds: number[];
};

export async function updateObligationEventAndSyncMovements(
  input: UpdateObligationEventInput,
): Promise<UpdateObligationEventSyncResult> {
  if (!supabase) throw new Error("Supabase no disponible.");

  const { data: currentEventRow, error: currentEventError } = await supabase
    .from("obligation_events")
    .select("amount, event_date, installment_no, description, notes, event_type")
    .eq("id", input.eventId)
    .maybeSingle();
  if (currentEventError) {
    throw new Error(currentEventError.message ?? "Error al cargar el evento");
  }
  const currentEvent = currentEventRow as {
    amount?: NumericLike | null;
    event_date?: string | null;
    installment_no?: NumericLike | null;
    description?: string | null;
    notes?: string | null;
    event_type?: string | null;
  } | null;

  const { error } = await supabase
    .from("obligation_events")
    .update({
      amount: input.amount,
      event_date: input.eventDate,
      installment_no: input.installmentNo ?? null,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      reason: input.reason?.trim() || null,
    })
    .eq("id", input.eventId);
  if (error) throw new Error(error.message ?? "Error de base de datos");

  const workspaceId = await fetchObligationWorkspaceId(input.obligationId);
  const shouldSyncPaymentMovement =
    input.direction != null &&
    (input.movementId != null || input.accountId != null || input.createMovement != null);

  if (!shouldSyncPaymentMovement) {
    return {
      movementId: input.movementId ?? null,
      workspaceId,
      removedMovementId: null,
      syncedViewerMovementIds: [],
    };
  }

  const isReceivable = input.direction === "receivable";
  const autoDesc =
    input.description?.trim() ||
    (isReceivable
      ? `Cobro de obligacion #${input.obligationId}`
      : `Pago de obligacion #${input.obligationId}`);

  const createMovementFlag = input.createMovement ?? Boolean(input.movementId ?? input.accountId);
  const resolvedAccountId =
    input.accountId ?? (input.movementId ? await resolveMovementAccountId(input.movementId) : null);

  let movementId = input.movementId ?? null;
  let removedMovementId: number | null = null;

  if (createMovementFlag && resolvedAccountId) {
    const movementPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      movement_type: "obligation_payment",
      status: "posted",
      occurred_at: dateStrToISO(input.eventDate),
      description: autoDesc,
      obligation_id: input.obligationId,
      metadata: { obligation_event_id: input.eventId },
      source_account_id: isReceivable ? null : resolvedAccountId,
      source_amount: isReceivable ? null : input.amount,
      destination_account_id: isReceivable ? resolvedAccountId : null,
      destination_amount: isReceivable ? input.amount : null,
    };

    if (movementId) {
      const { error: movementUpdateError } = await supabase
        .from("movements")
        .update(movementPayload)
        .eq("id", movementId);
      if (movementUpdateError) {
        throw new Error(movementUpdateError.message ?? "Error al actualizar movimiento vinculado");
      }
    } else {
      const { data: movementData, error: movementInsertError } = await supabase
        .from("movements")
        .insert(movementPayload)
        .select("id")
        .single();
      if (movementInsertError) {
        throw new Error(movementInsertError.message ?? "Error al crear movimiento vinculado");
      }
      movementId = toNum((movementData as { id: NumericLike }).id);
      await attachMovementToObligationEvent(input.eventId, movementId);
    }
  } else if (!createMovementFlag && movementId) {
    const { error: movementDeleteError } = await supabase
      .from("movements")
      .delete()
      .eq("id", movementId);
    if (movementDeleteError) {
      throw new Error(movementDeleteError.message ?? "Error al eliminar movimiento vinculado");
    }
    const { error: unlinkError } = await supabase
      .from("obligation_events")
      .update({ movement_id: null })
      .eq("id", input.eventId);
    if (unlinkError) {
      throw new Error(unlinkError.message ?? "Error al desvincular movimiento del evento");
    }
    removedMovementId = movementId;
    movementId = null;
  }

  const syncedViewerMovementIds = await syncViewerLinkedMovementsForEvent({
    eventId: input.eventId,
    obligationId: input.obligationId,
    obligationWorkspaceId: workspaceId,
    eventType: input.eventType as "payment" | "principal_increase" | "principal_decrease",
    amount: input.amount,
    eventDate: input.eventDate,
    description: input.description,
    direction: input.direction as ObligationDirection,
    obligationTitle: input.obligationTitle ?? undefined,
  });

  await notifyAcceptedViewersObligationEventUpdated({
    obligationId: input.obligationId,
    eventId: input.eventId,
    amount: input.amount,
    eventDate: input.eventDate,
    installmentNo: input.installmentNo ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
    currencyCode: input.currencyCode ?? null,
    eventType: input.eventType ?? currentEvent?.event_type ?? null,
    obligationTitle: input.obligationTitle ?? null,
    currentAmount: toNum(currentEvent?.amount ?? null),
    currentEventDate: currentEvent?.event_date ?? null,
    currentInstallmentNo: toNum(currentEvent?.installment_no ?? null),
    currentDescription: currentEvent?.description ?? null,
    currentNotes: currentEvent?.notes ?? null,
  });

  return {
    movementId,
    workspaceId,
    removedMovementId,
    syncedViewerMovementIds,
  };
}

export function useUpdateObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateObligationEventInput) => updateObligationEventAndSyncMovements(input),
    onSuccess: (data, variables) => {
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
      ];
      if (data?.movementId) queryKeys.push(["movement", data.movementId]);
      if (data?.removedMovementId) queryKeys.push(["movement", data.removedMovementId]);
      for (const syncedViewerMovementId of data?.syncedViewerMovementIds ?? []) {
        queryKeys.push(["movement", syncedViewerMovementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Actualizando evento",
        description: "Estamos sincronizando el historial de la deuda o crédito en segundo plano.",
      });
    },
  });
}

// ─── 4.2-f.4: Delete + edit request mutations + events query ─────────────────

export type DeleteObligationEventInput = {
  eventId: number;
  obligationId: number;
  workspaceId?: number | null;
  movementId?: number | null;
  ownerUserId?: string | null;
  obligationTitle?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
};

export function useDeleteObligationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteObligationEventInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");

      const ownerMovementId = await resolveOwnerMovementIdForObligationEvent(input);
      const viewerLinks = await deleteViewerLinksForEvent(input.eventId);
      const deleteRequesterPayloads: EventDeleteRequestPayload[] = [];
      if (input.ownerUserId) {
        const { data: notifRows } = await supabase
          .from("notifications")
          .select("payload")
          .eq("user_id", input.ownerUserId)
          .eq("kind", "obligation_event_delete_request")
          .eq("related_entity_type", "obligation_event")
          .eq("related_entity_id", input.eventId);
        for (const row of (notifRows ?? []) as { payload: JsonValue | null }[]) {
          const payload = readEventDeletePayload(row.payload);
          if (payload?.requestedByUserId) deleteRequesterPayloads.push(payload);
        }
      }
      const acceptedViewerIds = new Set<string>();
      const { data: shareRows, error: shareRowsError } = await supabase
        .from("obligation_shares")
        .select("invited_user_id")
        .eq("obligation_id", input.obligationId)
        .eq("status", "accepted");
      if (shareRowsError) {
        throw new Error(shareRowsError.message ?? "Error al cargar viewers de la obligación");
      }
      for (const row of (shareRows ?? []) as Array<{ invited_user_id: string | null }>) {
        if (typeof row.invited_user_id === "string" && row.invited_user_id.trim().length > 0) {
          acceptedViewerIds.add(row.invited_user_id);
        }
      }

      const { error } = await supabase
        .from("obligation_events")
        .delete()
        .eq("id", input.eventId);
      if (error) throw new Error(error.message ?? "Error de base de datos");
      if (ownerMovementId) {
        const { error: mvErr } = await supabase
          .from("movements")
          .delete()
          .eq("id", ownerMovementId);
        if (mvErr) throw new Error(mvErr.message ?? "Error al eliminar movimiento vinculado");
      }

      if (input.ownerUserId) {
        void resolveOwnerDeleteRequestNotification(input.ownerUserId, input.eventId, "accepted");
      }

      const requestViewerIds = new Set(
        deleteRequesterPayloads
          .map((payload) => payload.requestedByUserId)
          .filter((value): value is string => Boolean(value)),
      );
      const linkedViewerIds = new Set(
        viewerLinks
          .map((link) => link.linked_by_user_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      );
      const allViewerIds = new Set<string>([
        ...acceptedViewerIds,
        ...requestViewerIds,
        ...linkedViewerIds,
      ]);

      for (const viewerUserId of requestViewerIds) {
        void markNotificationReadByEntity(
          viewerUserId,
          "obligation_event_delete_pending",
          "obligation_event",
          input.eventId,
        );
        void resolveViewerDeletePendingNotification(
          viewerUserId,
          input.eventId,
          "accepted",
        );
      }

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
      });

      const amountLabel = formatNotificationCurrency(input.amount ?? null, input.currencyCode ?? null);

      const acceptedNotifs: NotificationRefreshInput[] = [...requestViewerIds].map((viewerUserId) => ({
        user_id: viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_accepted",
        title: "Eliminación aprobada",
        body: `Se eliminó el evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      }));
      if (acceptedNotifs.length > 0) {
        await Promise.all(
          acceptedNotifs.map((notification) => createOrRefreshNotificationRow(notification)),
        );
      }

      const otherViewerIds = [...allViewerIds].filter((viewerUserId) => !requestViewerIds.has(viewerUserId));
      if (otherViewerIds.length > 0) {
        await Promise.all(
          otherViewerIds.map((viewerUserId) =>
            createOrRefreshNotificationRow({
              user_id: viewerUserId,
              channel: "in_app",
              status: "pending",
              kind: "obligation_event_deleted",
              title: "Evento eliminado",
              body: `Se eliminó un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
              scheduled_for: new Date().toISOString(),
              related_entity_type: "obligation_event",
              related_entity_id: input.eventId,
              payload,
            }),
          ),
        );
      }
      return { deletedOwnerMovementId: ownerMovementId };
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-events", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-event-viewer-links", variables.obligationId] });
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      if (data?.deletedOwnerMovementId) {
        void queryClient.invalidateQueries({ queryKey: ["movement", data.deletedOwnerMovementId] });
      }
      // Refresh attachment counts and lists so both the detail and list screens stay in sync
      const wsId = variables.workspaceId ?? null;
      void queryClient.invalidateQueries({ queryKey: ["entity-attachment-counts", wsId, "obligation-event"] });
      void queryClient.invalidateQueries({ queryKey: ["entity-attachments", wsId, "obligation-event", variables.eventId] });
    },
  });
}

export type CreateObligationEventDeleteRequestInput = {
  obligationId: number;
  eventId: number;
  amount: number;
  currencyCode: string;
  eventType: string;
  eventDate: string;
  ownerUserId: string;
  viewerUserId: string;
  viewerDisplayName?: string | null;
  obligationTitle?: string | null;
};

export function useCreateObligationEventDeleteRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateObligationEventDeleteRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const client = supabase;

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
        requestedByUserId: input.viewerUserId,
        requestedByDisplayName: input.viewerDisplayName,
      });
      const ownerName = input.viewerDisplayName?.trim() || "El visualizador";
      const now = new Date().toISOString();
      const amountLabel = formatNotificationCurrency(input.amount, input.currencyCode);

      async function createOrRefreshNotification(row: {
        user_id: string;
        channel: "in_app";
        status: "pending";
        kind: string;
        title: string;
        body: string;
        scheduled_for: string;
        related_entity_type: string;
        related_entity_id: number;
        payload: EventDeleteRequestPayload;
      }) {
        const { data: existing, error: findErr } = await client
          .from("notifications")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("kind", row.kind)
          .eq("related_entity_type", row.related_entity_type)
          .eq("related_entity_id", row.related_entity_id)
          .order("id", { ascending: false });
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
          return;
        }

        const { error: insertErr } = await client
          .from("notifications")
          .insert(row);
        if (insertErr) throw new Error(insertErr.message ?? "Error al crear la notificación");
      }

      await createOrRefreshNotification({
        user_id: input.ownerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_request",
        title: "Solicitud de Eliminación",
        body: `${ownerName} solicitó eliminar un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      await createOrRefreshNotification({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_pending",
        title: "Solicitud enviada",
        body: `Tu solicitud para eliminar este evento quedó pendiente${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type RejectObligationEventDeleteRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  amount?: number | null;
  eventType?: string | null;
  eventDate?: string | null;
  obligationTitle?: string | null;
  rejectionReason?: string | null;
};

export function useRejectObligationEventDeleteRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectObligationEventDeleteRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();

      await resolveOwnerDeleteRequestNotification(
        input.ownerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_delete_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerDeletePendingNotification(
        input.viewerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );

      const payload = eventDeletePayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        amount: input.amount,
        eventType: input.eventType,
        eventDate: input.eventDate,
        obligationTitle: input.obligationTitle,
        rejectionReason: input.rejectionReason,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_delete_rejected",
        title: "Solicitud rechazada",
        body: `No se aprobó la Eliminación del evento${input.rejectionReason?.trim() ? `. Motivo: ${input.rejectionReason.trim()}` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type CreateObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  currencyCode: string;
  eventType: string;
  ownerUserId: string;
  viewerUserId: string;
  viewerDisplayName?: string | null;
  obligationTitle?: string | null;
  currentAmount: number;
  currentEventDate: string;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount: number;
  proposedEventDate: string;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
};

export type AcceptObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  obligationTitle?: string | null;
  currencyCode?: string | null;
  eventType: string;
  direction?: ObligationDirection;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount: number;
  proposedEventDate: string;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
  accountId?: number | null;
};

export type RejectObligationEventEditRequestInput = {
  obligationId: number;
  eventId: number;
  ownerUserId: string;
  viewerUserId: string;
  currencyCode?: string | null;
  obligationTitle?: string | null;
  currentAmount?: number | null;
  currentEventDate?: string | null;
  currentInstallmentNo?: number | null;
  currentDescription?: string | null;
  currentNotes?: string | null;
  proposedAmount?: number | null;
  proposedEventDate?: string | null;
  proposedInstallmentNo?: number | null;
  proposedDescription?: string | null;
  proposedNotes?: string | null;
  rejectionReason?: string | null;
};

export function useCreateObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();
      const amountLabel = formatNotificationCurrency(input.proposedAmount, input.currencyCode);
      const ownerName = input.viewerDisplayName?.trim() || "El visualizador";
      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        obligationTitle: input.obligationTitle,
        requestedByUserId: input.viewerUserId,
        requestedByDisplayName: input.viewerDisplayName,
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.ownerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_request",
        title: "Solicitud de edicion",
        body: `${ownerName} solicito editar un evento${amountLabel}${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_pending",
        title: "Solicitud enviada",
        body: `Tu solicitud para editar este evento quedo pendiente${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAcceptObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();
      const { data: eventRow, error: eventError } = await supabase
        .from("obligation_events")
        .select("movement_id")
        .eq("id", input.eventId)
        .maybeSingle();
      if (eventError) {
        throw new Error(eventError.message ?? "Error al cargar el evento");
      }
      if (!eventRow) {
        throw new Error("El evento ya no esta disponible.");
      }

      const ownerMovementId = toNum((eventRow as { movement_id?: NumericLike | null }).movement_id ?? null) || null;
      const ownerAccountId =
        input.accountId !== undefined ? input.accountId : await resolveMovementAccountId(ownerMovementId);
      const syncResult = await updateObligationEventAndSyncMovements({
        eventId: input.eventId,
        obligationId: input.obligationId,
        amount: input.proposedAmount,
        eventDate: input.proposedEventDate,
        installmentNo: input.proposedInstallmentNo ?? null,
        description: input.proposedDescription ?? null,
        notes: input.proposedNotes ?? null,
        movementId: ownerMovementId,
        accountId: ownerAccountId,
        createMovement: ownerMovementId != null,
        direction: input.eventType === "payment" ? input.direction : undefined,
      });

      await resolveOwnerEditRequestNotification(input.ownerUserId, input.eventId, "accepted");
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_edit_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerEditPendingNotification(input.viewerUserId, input.eventId, "accepted");

      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        eventType: input.eventType,
        obligationTitle: input.obligationTitle,
        responseStatus: "accepted",
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_accepted",
        title: "Edicion aprobada",
        body: `Se aprobo la edicion del evento${input.obligationTitle ? ` en "${input.obligationTitle}"` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });

      return syncResult;
    },
    onSuccess: (data, variables) => {
      const queryKeys: Array<readonly unknown[]> = [
        ["workspace-snapshot"],
        ["movements"],
        ["obligation-events", variables.obligationId],
        ["notifications"],
        ["shared-obligations"],
      ];
      if (data?.movementId) queryKeys.push(["movement", data.movementId]);
      if (data?.removedMovementId) queryKeys.push(["movement", data.removedMovementId]);
      for (const syncedViewerMovementId of data?.syncedViewerMovementIds ?? []) {
        queryKeys.push(["movement", syncedViewerMovementId]);
      }
      runBackgroundQueryRefresh(queryClient, queryKeys, {
        message: "Aprobando edicion",
        description: "Estamos sincronizando el evento y los movimientos relacionados.",
      });
    },
  });
}

export function useRejectObligationEventEditRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectObligationEventEditRequestInput) => {
      if (!supabase) throw new Error("Supabase no disponible.");
      const now = new Date().toISOString();

      await resolveOwnerEditRequestNotification(
        input.ownerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );
      await markNotificationReadByEntity(
        input.viewerUserId,
        "obligation_event_edit_pending",
        "obligation_event",
        input.eventId,
      );
      await resolveViewerEditPendingNotification(
        input.viewerUserId,
        input.eventId,
        "rejected",
        input.rejectionReason,
      );

      const payload = eventEditPayload({
        obligationId: input.obligationId,
        eventId: input.eventId,
        currencyCode: input.currencyCode,
        obligationTitle: input.obligationTitle,
        rejectionReason: input.rejectionReason,
        responseStatus: "rejected",
        currentAmount: input.currentAmount,
        currentEventDate: input.currentEventDate,
        currentInstallmentNo: input.currentInstallmentNo,
        currentDescription: input.currentDescription,
        currentNotes: input.currentNotes,
        proposedAmount: input.proposedAmount,
        proposedEventDate: input.proposedEventDate,
        proposedInstallmentNo: input.proposedInstallmentNo,
        proposedDescription: input.proposedDescription,
        proposedNotes: input.proposedNotes,
      });

      await createOrRefreshNotificationRow({
        user_id: input.viewerUserId,
        channel: "in_app",
        status: "pending",
        kind: "obligation_event_edit_rejected",
        title: "Edicion rechazada",
        body: `No se aprobo la edicion del evento${input.rejectionReason?.trim() ? `. Motivo: ${input.rejectionReason.trim()}` : ""}.`,
        scheduled_for: now,
        related_entity_type: "obligation_event",
        related_entity_id: input.eventId,
        payload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useObligationEventsQuery(
  obligationId: number | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["obligation-events", obligationId ?? null],
    enabled: Boolean(supabase && obligationId != null && enabled),
    staleTime: STALE.short,
    retry: 1,
    queryFn: () => fetchObligationEventsByObligationId(obligationId as number),
  });
}
