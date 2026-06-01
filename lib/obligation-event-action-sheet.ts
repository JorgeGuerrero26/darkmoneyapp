import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../components/ui/AmountDisplay";
import type {
  Notice,
  QuickAction,
  SheetAction,
  StatusBadge,
} from "../components/domain/ObligationEventActionSheet";
import { parseDisplayDate } from "./date";
import type {
  EventDeleteStatus,
  EventEditStatus,
} from "./obligation-event-payloads";
import { obligationHistoryEventAmountPrefix } from "./obligation-viewer-labels";
import type { ViewerEventAccountImpactCopy } from "./obligation-viewer-account-impact";
import type {
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

export const EDITABLE_OBLIGATION_EVENT_TYPES = new Set<string>([
  "payment",
  "principal_increase",
  "principal_decrease",
]);

export const LINKABLE_VIEWER_EVENT_TYPES = new Set<string>([
  "payment",
  "principal_increase",
  "principal_decrease",
]);

export function obligationEventDateLabel(event: ObligationEventSummary | null): string | null {
  if (!event) return null;
  return format(parseDisplayDate(event.eventDate), "d MMM yyyy", { locale: es });
}

export function obligationEventAmountLabel(
  event: ObligationEventSummary | null,
  obligation: ObligationSummary | SharedObligationSummary | null,
  isSharedViewer: boolean,
  viewerImpactCopy: ViewerEventAccountImpactCopy | null,
): string | null {
  if (!event) return null;
  const useCashPerspective = Boolean(
    isSharedViewer && viewerImpactCopy && viewerImpactCopy.tone !== "neutral",
  );
  const prefix = obligationHistoryEventAmountPrefix(
    event.eventType,
    obligation?.direction ?? "payable",
    isSharedViewer,
    useCashPerspective,
  );
  return `${prefix}${formatCurrency(event.amount, obligation?.currencyCode ?? "")}`;
}

export function obligationEventStatusBadge(
  isSharedViewer: boolean,
  deleteStatus: EventDeleteStatus | null | undefined,
): StatusBadge | null {
  if (!isSharedViewer || !deleteStatus) return null;
  if (deleteStatus.status === "pending") {
    return { label: "Eliminacion pendiente", tone: "warning" };
  }
  if (deleteStatus.status === "accepted") {
    return { label: "Eliminacion aprobada", tone: "success" };
  }
  return null;
}

type NoticesInput = {
  isSharedViewer: boolean;
  attachmentsLoading: boolean;
  deleteStatus: EventDeleteStatus | null | undefined;
  editStatus: EventEditStatus | null | undefined;
  viewerImpactCopy: ViewerEventAccountImpactCopy | null;
};

export function buildObligationEventNotices({
  isSharedViewer,
  attachmentsLoading,
  deleteStatus,
  editStatus,
  viewerImpactCopy,
}: NoticesInput): Notice[] {
  const notices: Notice[] = [];

  if (attachmentsLoading) {
    notices.push({
      key: "checking-attachments",
      text: "Comprobando si este evento tiene comprobantes...",
      tone: "info",
    });
  }

  if (isSharedViewer && deleteStatus?.status === "rejected") {
    notices.push({
      key: "delete-rejected",
      text: deleteStatus.payload.rejectionReason?.trim()
        ? `Rechazada: ${deleteStatus.payload.rejectionReason.trim()}`
        : "La solicitud anterior fue rechazada.",
      tone: "danger",
    });
  }

  if (isSharedViewer && editStatus?.status === "pending") {
    notices.push({
      key: "edit-pending",
      text: "Ya hay una solicitud de edicion pendiente para este evento.",
      tone: "warning",
    });
  }

  if (isSharedViewer && editStatus?.status === "rejected") {
    notices.push({
      key: "edit-rejected",
      text: editStatus.payload.rejectionReason?.trim()
        ? `Edicion rechazada: ${editStatus.payload.rejectionReason.trim()}`
        : "La solicitud de edicion anterior fue rechazada.",
      tone: "danger",
    });
  }

  if (isSharedViewer && viewerImpactCopy) {
    notices.push({
      key: "viewer-account-impact",
      text: viewerImpactCopy.note,
      tone:
        viewerImpactCopy.tone === "positive"
          ? "success"
          : viewerImpactCopy.tone === "negative"
            ? "danger"
            : "info",
    });
  }

  return notices;
}

type QuickActionsInput = {
  isSharedViewer: boolean;
  selectedEvent: ObligationEventSummary | null;
  previewAttachmentsCount: number;
  linkedEventIds: Set<number>;
  onPressAttachments: () => void;
  onPressLinkAccount: () => void;
};

export function buildObligationEventQuickActions({
  isSharedViewer,
  selectedEvent,
  previewAttachmentsCount,
  linkedEventIds,
  onPressAttachments,
  onPressLinkAccount,
}: QuickActionsInput): QuickAction[] {
  const quickActions: QuickAction[] = [];

  if (previewAttachmentsCount > 0) {
    quickActions.push({
      key: "attachments",
      label:
        previewAttachmentsCount === 1
          ? "Ver comprobante"
          : `Ver ${previewAttachmentsCount} comprobantes`,
      onPress: onPressAttachments,
      variant: "secondary",
    });
  }

  if (
    isSharedViewer &&
    selectedEvent &&
    LINKABLE_VIEWER_EVENT_TYPES.has(selectedEvent.eventType)
  ) {
    quickActions.push({
      key: "link-account",
      label: linkedEventIds.has(selectedEvent.id)
        ? "Cambiar cuenta asociada"
        : "Asociar a una cuenta",
      onPress: onPressLinkAccount,
      variant: "ghost",
    });
  }

  return quickActions;
}

type ActionsInput = {
  isSharedViewer: boolean;
  selectedEvent: ObligationEventSummary | null;
  deleteStatus: EventDeleteStatus | null | undefined;
  editStatus: EventEditStatus | null | undefined;
  onViewerRequestEdit: () => void;
  onViewerRequestDelete: () => void;
  onOwnerEdit: () => void;
  onOwnerDelete: () => void;
};

export function buildObligationEventActions({
  isSharedViewer,
  selectedEvent,
  deleteStatus,
  editStatus,
  onViewerRequestEdit,
  onViewerRequestDelete,
  onOwnerEdit,
  onOwnerDelete,
}: ActionsInput): SheetAction[] {
  if (isSharedViewer) {
    const actions: SheetAction[] = [];

    if (
      selectedEvent &&
      EDITABLE_OBLIGATION_EVENT_TYPES.has(selectedEvent.eventType) &&
      editStatus?.status !== "pending"
    ) {
      actions.push({
        key: "request-edit",
        label:
          editStatus?.status === "rejected"
            ? "Solicitar edicion otra vez"
            : "Solicitar edicion",
        variant: "primary",
        onPress: onViewerRequestEdit,
      });
    }

    if (
      selectedEvent &&
      deleteStatus?.status !== "pending" &&
      deleteStatus?.status !== "accepted"
    ) {
      actions.push({
        key: "request-delete",
        label:
          deleteStatus?.status === "rejected"
            ? "Solicitar eliminacion otra vez"
            : "Solicitar eliminacion",
        variant: "ghost",
        onPress: onViewerRequestDelete,
      });
    }

    return actions;
  }

  const actions: SheetAction[] = [];

  if (selectedEvent && EDITABLE_OBLIGATION_EVENT_TYPES.has(selectedEvent.eventType)) {
    actions.push({
      key: "edit",
      label: "Editar",
      onPress: onOwnerEdit,
      variant: "primary",
    });
  }

  actions.push({
    key: "delete",
    label: "Eliminar",
    variant: "ghost",
    onPress: onOwnerDelete,
  });

  return actions;
}
