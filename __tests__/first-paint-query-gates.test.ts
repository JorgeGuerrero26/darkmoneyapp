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
