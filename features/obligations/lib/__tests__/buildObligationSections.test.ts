import { buildObligationSections } from "../buildObligationSections";
import type { ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

function obligation(
  id: number,
  direction: "receivable" | "payable",
  status: ObligationSummary["status"] = "active",
): ObligationSummary {
  return {
    id,
    direction,
    status,
    title: `Obligación ${id}`,
    events: [],
  } as unknown as ObligationSummary;
}

function shared(id: number, direction: "receivable" | "payable"): SharedObligationSummary {
  return { ...obligation(id, direction), viewerMode: "shared_viewer" } as SharedObligationSummary;
}

describe("secciones de créditos y deudas", () => {
  const workspaceObligations = [obligation(1, "receivable"), obligation(2, "payable")];
  const sharedObligations = [shared(3, "receivable")];

  it("por defecto separa lo tuyo de lo que te compartieron", () => {
    const sections = buildObligationSections({
      workspaceObligations,
      sharedObligations,
      showArchived: false,
    });
    expect(sections.map((section) => section.key)).toEqual(["workspace", "shared"]);
  });

  it("agrupado por tipo, lo tuyo y lo compartido caen juntos por dirección", () => {
    const sections = buildObligationSections({
      workspaceObligations,
      sharedObligations,
      showArchived: false,
      groupByDirection: true,
    });
    expect(sections.map((section) => section.key)).toEqual(["receivable", "payable"]);
    expect(sections[0].label).toBe("Me deben");
    // La compartida es un crédito: va con los créditos, y su fila lleva el distintivo.
    expect(sections[0].data.map((item) => item.id)).toEqual([1, 3]);
    expect(sections[1].data.map((item) => item.id)).toEqual([2]);
  });

  it("una sección vacía no se dibuja", () => {
    const sections = buildObligationSections({
      workspaceObligations: [obligation(1, "receivable")],
      sharedObligations: [],
      showArchived: false,
      groupByDirection: true,
    });
    expect(sections.map((section) => section.key)).toEqual(["receivable"]);
  });

  it("las archivadas siguen aparte, agrupado o no", () => {
    const archived = obligation(4, "payable", "cancelled");
    const sections = buildObligationSections({
      workspaceObligations: [...workspaceObligations, archived],
      sharedObligations,
      showArchived: true,
      groupByDirection: true,
    });
    expect(sections.map((section) => section.key)).toEqual([
      "receivable",
      "payable",
      "archived-divider",
      "workspace-archived",
    ]);
    expect(sections[1].data.map((item) => item.id)).toEqual([2]);
  });
});
