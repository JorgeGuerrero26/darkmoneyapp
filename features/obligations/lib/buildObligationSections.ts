import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

export type ObligationListItem = ObligationSummary | SharedObligationSummary;

export type ObligationSectionKey =
  | "workspace"
  | "shared"
  | "receivable"
  | "payable"
  | "archived-divider"
  | "workspace-archived"
  | "shared-archived";

export type ObligationListSection = {
  key: ObligationSectionKey;
  label: string;
  hint?: string;
  data: ObligationListItem[];
};

type BuildObligationSectionsInput = {
  workspaceObligations: ObligationSummary[];
  sharedObligations: SharedObligationSummary[];
  showArchived: boolean;
  /**
   * Agrupa lo activo por dirección —"Me deben" / "Yo debo"— en vez de por dueño.
   *
   * Es el equivalente del "agrupar por tipo" de Cuentas: el tipo de una obligación es hacia
   * dónde va la plata. Los compartidos siguen distinguiéndose por su distintivo en la fila, que
   * es donde importa.
   */
  groupByDirection?: boolean;
};

export function buildObligationSections({
  workspaceObligations,
  sharedObligations,
  showArchived,
  groupByDirection = false,
}: BuildObligationSectionsInput): ObligationListSection[] {
  const activeWorkspaceData = workspaceObligations.filter((obligation) => obligation.status !== "cancelled");
  const archivedWorkspaceData = showArchived
    ? workspaceObligations.filter((obligation) => obligation.status === "cancelled")
    : [];
  const activeSharedData = sharedObligations.filter((obligation) => obligation.status !== "cancelled");
  const archivedSharedData = showArchived
    ? sharedObligations.filter((obligation) => obligation.status === "cancelled")
    : [];

  const sections: ObligationListSection[] = [];

  if (groupByDirection) {
    const active: ObligationListItem[] = [...activeWorkspaceData, ...activeSharedData];
    const receivable = active.filter((obligation) => obligation.direction === "receivable");
    const payable = active.filter((obligation) => obligation.direction !== "receivable");
    if (receivable.length > 0) {
      sections.push({ key: "receivable", label: "Me deben", data: receivable });
    }
    if (payable.length > 0) {
      sections.push({ key: "payable", label: "Yo debo", data: payable });
    }
  } else {
    if (activeWorkspaceData.length > 0) {
      sections.push({ key: "workspace", label: "Tu workspace", data: activeWorkspaceData });
    }
    if (activeSharedData.length > 0) {
      sections.push({
        key: "shared",
        label: "Compartidos contigo",
        hint: "Créditos o deudas que otro usuario compartió contigo (invitación aceptada).",
        data: activeSharedData,
      });
    }
  }

  const archivedCount = archivedWorkspaceData.length + archivedSharedData.length;
  if (archivedCount > 0) {
    sections.push({ key: "archived-divider", label: `Archivadas (${archivedCount})`, data: [] });
    if (archivedWorkspaceData.length > 0) {
      sections.push({ key: "workspace-archived", label: "Tu workspace", data: archivedWorkspaceData });
    }
    if (archivedSharedData.length > 0) {
      sections.push({
        key: "shared-archived",
        label: "Compartidos contigo",
        hint: "Créditos o deudas archivadas que otro usuario compartió contigo.",
        data: archivedSharedData,
      });
    }
  }

  return sections;
}
