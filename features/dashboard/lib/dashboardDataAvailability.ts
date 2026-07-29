/**
 * ¿Se puede confiar en lo que el dashboard está a punto de afirmar?
 *
 * La válvula de 15 s del overlay de arranque (`app/_layout.tsx`) libera la UI con las queries
 * SIN resolver para no dejar la app congelada. Registrado 6 veces en `app_error_logs`, siempre
 * con `user-workspaces` y `workspace-snapshot` en pending.
 *
 * En ese estado el store de workspaces sigue en su valor inicial `[]`, que es indistinguible de
 * "este usuario no tiene ninguno", y el dashboard pintaba S/ 0.00 y "aún no hay cuentas activas"
 * a alguien con 10 cuentas y 730 movimientos. Eso parece pérdida de datos y puede llevarle a
 * crear cuentas duplicadas.
 *
 * La distinción que importa: `undefined` es "no sé", `[]` es "sé que no hay".
 */
export function isDashboardDataUnavailable(input: {
  /** `undefined` mientras la query no resuelve; `[]` cuando de verdad no hay ninguno. */
  knownWorkspaces: { id: number }[] | undefined;
  activeWorkspaceId: number | null;
  hasSnapshot: boolean;
}): boolean {
  // Confirmado sin workspaces: el estado vacío SÍ es cierto y el dashboard debe mostrarlo.
  if (input.knownWorkspaces?.length === 0) return false;
  return (
    input.knownWorkspaces === undefined || !input.activeWorkspaceId || !input.hasSnapshot
  );
}
