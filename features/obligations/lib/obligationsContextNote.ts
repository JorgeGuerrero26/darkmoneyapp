type Args = {
  sharedActiveCount: number;
  pendingRequestCount: number;
};

export function buildObligationsContextNote({
  sharedActiveCount,
  pendingRequestCount,
}: Args): string | null {
  const parts: string[] = [];
  if (sharedActiveCount > 0) {
    parts.push(
      sharedActiveCount === 1
        ? "1 obligación compartida contigo"
        : `${sharedActiveCount} obligaciones compartidas contigo`,
    );
  }
  if (pendingRequestCount > 0) {
    parts.push(
      pendingRequestCount === 1
        ? "1 solicitud de pago pendiente"
        : `${pendingRequestCount} solicitudes de pago pendientes`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
