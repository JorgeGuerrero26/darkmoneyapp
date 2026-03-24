import type { ObligationShareSummary } from "../types/domain";

/** Estado del bloque de invitación en el editor (correo + mensaje). */
export type ShareInviteFormState = {
  invitedEmail: string;
  message: string;
};

/**
 * ¿Debemos llamar a sendShareInvite al guardar el editor?
 * Alineado con la lógica web (`shouldResendShareInvite`).
 */
export function shouldResendShareInvite(
  currentShare: ObligationShareSummary | null | undefined,
  formState: ShareInviteFormState,
): boolean {
  const invitedEmail = formState.invitedEmail.trim().toLowerCase();
  const normalizedMessage = formState.message.trim();
  if (!invitedEmail) return false;
  if (!currentShare) return true;
  if (currentShare.invitedEmail.toLowerCase() !== invitedEmail) return true;
  return (
    currentShare.status === "pending" &&
    (currentShare.message ?? "").trim() !== normalizedMessage
  );
}
