import { useQueryClient } from "@tanstack/react-query";

import type { Attachment } from "../../../components/domain/AttachmentPicker";
import {
  mirrorMovementAttachmentsToObligationEvent,
  promoteDraftAttachmentsToEntity,
} from "../../../lib/entity-attachments";
import { humanizeError } from "../../../lib/errors";
import { useToast } from "../../../hooks/useToast";
import { useUiStore } from "../../../store/ui-store";

/**
 * Sincronización en segundo plano de comprobantes tras guardar un movimiento
 * (fase 5 del refactor R7, extraído de handleSubmit de MovementForm). Corre
 * DESPUÉS de cerrar el formulario para no bloquear la UI: muestra el activity
 * notice global, invalida las queries de adjuntos al terminar y reporta el
 * error con toast si falla (el movimiento ya quedó guardado igual).
 */
export function useMovementAttachmentSync(workspaceId: number | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { showActivityNotice, dismissActivityNotice } = useUiStore();

  /** Copia los borradores locales al storage del movimiento recién creado. */
  function syncDraftAttachments(movementId: number, attachments: Attachment[]) {
    if (!workspaceId || attachments.length === 0) return;
    const noticeId = showActivityNotice(
      "Sincronizando comprobantes",
      "Puedes seguir usando la app mientras terminamos de copiar las imágenes.",
    );
    void promoteDraftAttachmentsToEntity({
      attachments,
      workspaceId,
      entityType: "movement",
      entityId: movementId,
    })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ["movement-attachments", workspaceId, movementId],
        });
      })
      .catch((attachmentError) => {
        showToast(humanizeError(attachmentError), "error");
      })
      .finally(() => dismissActivityNotice(noticeId));
  }

  /** Refleja los comprobantes del movimiento editado en su evento de obligación vinculado. */
  function mirrorToObligationEvent(movementId: number, eventId: number) {
    if (!workspaceId) return;
    const noticeId = showActivityNotice(
      "Sincronizando comprobantes",
      "Puedes seguir usando la app mientras actualizamos el evento vinculado.",
    );
    void mirrorMovementAttachmentsToObligationEvent({
      workspaceId,
      movementId,
      eventId,
    })
      .then(() => {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["movement-attachments", workspaceId, movementId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["entity-attachments", workspaceId, "obligation-event", eventId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["entity-attachment-counts", workspaceId, "obligation-event"],
          }),
        ]);
      })
      .catch((attachmentError) => {
        showToast(humanizeError(attachmentError), "error");
      })
      .finally(() => dismissActivityNotice(noticeId));
  }

  return { syncDraftAttachments, mirrorToObligationEvent };
}
