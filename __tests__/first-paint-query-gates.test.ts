import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8").replace(/\s+/g, " ");
}

describe("consultas secundarias fuera del primer pintado", () => {
  it("no consulta ayudas del formulario mientras MovementForm esta cerrado", () => {
    const source = read("components/forms/MovementForm.tsx");

    expect(source).toContain(
      "useDashboardAnalyticsQuery( visible ? activeWorkspaceId : null, visible ? profile?.id : null, )",
    );
    expect(source).toContain(
      "useUserEntitlementQuery( visible ? profile?.id ?? null : null, visible ? profile?.email ?? null : null, )",
    );
    expect(source).toContain(
      'visible && form.movementType === "transfer" ? activeWorkspaceId : null',
    );
  });

  it("carga plantillas y conteos solo cuando su UI ya los necesita", () => {
    const source = read("app/(app)/movements.tsx");

    expect(source).toContain(
      "useMovementTemplatesQuery(activeWorkspaceId, quickAddSheetVisible)",
    );
    expect(source).toContain(
      "useMovementAttachmentCountsQuery( activeWorkspaceId, allMovementIds, afterFirstPaint, )",
    );
  });

  /**
   * Diferir una consulta y marcarla como no bloqueante son DOS arreglos distintos, y se
   * hicieron por separado sin conectarlos: `budget-scope-movements` y
   * `pending-obligation-share-invites` se retrasaban bien con useAfterFirstPaint, pero seguían
   * contando como "el usuario está esperando" para el aviso de red lenta. Resultado medido en
   * los logs del 05 y 06 de agosto de 2026: los 5 de 5 avisos de "conexión lenta" los
   * disparaban esas dos, con la app entera ya pintada delante y sin que nadie esperase nada.
   *
   * Si difieres una consulta al primer pintado, márcala también aquí.
   */
  it("las consultas diferidas al primer pintado no cuentan para el aviso de red lenta", () => {
    const budgets = read("services/queries/budget-analytics.ts");
    const obligations = read("services/queries/obligations-impl.ts");

    expect(budgets).toContain('"budget-scope-movements"');
    expect(budgets).toContain("meta: { uxBlocking: false }");
    expect(obligations).toContain('"pending-obligation-share-invites"');
    expect(obligations).toContain("meta: { uxBlocking: false }");
  });

  it("no monta Dashboard anticipadamente ni adelanta prefetch de otras tabs", () => {
    const layout = read("app/(app)/_layout.tsx");
    const dashboard = read("app/(app)/dashboard.tsx");
    const dashboardOptions = layout.slice(
      layout.indexOf('name="dashboard"'),
      layout.indexOf('name="movements"'),
    );

    expect(dashboardOptions).not.toContain("lazy: false");
    expect(dashboard).toContain(
      "if (!afterFirstPaint || !supabase || !activeWorkspaceId) return;",
    );
  });
});
