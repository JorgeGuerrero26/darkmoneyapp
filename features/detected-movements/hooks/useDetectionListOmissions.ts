import { useEffect, useRef, useState } from "react";
import { useToast } from "../../../hooks/useToast";
import { humanizeError } from "../../../lib/errors";
import { useDetectedMovementOmissionsMutation, type DetectedMovementSuggestion, type DetectionOmissionChange } from "../../../services/queries/notification-detection";

export function useDetectionListOmissions(userId: string | null, workspaceId: number | null, pending: DetectedMovementSuggestion[], onResolved: (ids: number[]) => void) {
  const mutation = useDetectedMovementOmissionsMutation(userId, workspaceId);
  const { showRichToast, showErrorToast } = useToast();
  const [confirmation, setConfirmation] = useState<DetectedMovementSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [omittingId, setOmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const scope = `${userId}:${workspaceId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  useEffect(() => { setConfirmation(null); setError(null); }, [scope]);

  async function restore(changes: DetectionOmissionChange[]) {
    if (locked.current || activeScope.current !== scope) return;
    locked.current = true; setBusy(true);
    try {
      const result = await mutation.mutateAsync({ action: "restore", changes });
      if (activeScope.current !== scope) return;
      if (result.failed) showErrorToast("No se pudieron recuperar todas las detecciones");
      else showRichToast({ type: "update", title: result.changes.length ? "Detecciones recuperadas" : "Las detecciones ya cambiaron", subtitle: result.changes.length ? "Vuelven a estar por revisar." : "Se conserva su estado actual." });
    } catch (cause) { showErrorToast("No se pudo deshacer", cause); }
    finally { locked.current = false; setBusy(false); }
  }

  async function omit(targets: DetectedMovementSuggestion[], markNotificationsRead = true) {
    if (locked.current || !targets.length) return;
    locked.current = true; setBusy(true); setError(null);
    setOmittingId(targets.length === 1 ? targets[0].id : null);
    try {
      const result = await mutation.mutateAsync({ action: "omit", suggestions: targets, markNotificationsRead });
      if (activeScope.current !== scope) return;
      const count = result.changes.length;
      if (count) {
        onResolved(result.changes.map(({ after }) => after.id));
        showRichToast({ type: "delete", title: count === 1 ? "Detección omitida" : `${count} detecciones omitidas`, subtitle: !markNotificationsRead ? "Se quitaron del dashboard. Tus notificaciones se conservan." : count === 1 ? result.changes[0].before.description : "Ya no aparecen entre los pendientes. No se creó ningún movimiento.", onUndo: () => { void restore(result.changes); } });
      }
      if (result.failed) setError(`No se pudieron omitir ${result.failed} detecciones. Puedes intentarlo de nuevo.`);
      else if (!count) setError("Estas detecciones ya cambiaron. Actualizamos los pendientes.");
      setConfirmation(null);
    } catch (cause) { if (activeScope.current === scope) setError(humanizeError(cause)); }
    finally { locked.current = false; setBusy(false); setOmittingId(null); }
  }

  return { confirmation, busy, omittingId, error,
    omitOne: (id: number) => { const target = pending.find((item) => item.id === id); if (target) void omit([target]); },
    requestOmitAll: () => { if (!locked.current) setConfirmation([...pending]); },
    confirmOmitAll: () => { if (confirmation) void omit(confirmation, false); },
    cancel: () => { if (!locked.current) setConfirmation(null); },
  };
}
