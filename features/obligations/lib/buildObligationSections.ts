import type { ObligationSummary, SharedObligationSummary } from "../../../types/domain";

export type ObligationListItem = ObligationSummary | SharedObligationSummary;

export type ObligationSectionKey =
  | "workspace"
  | "shared"
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
};

export function buildObligationSections({
  workspaceObligations,
  sharedObligations,
  showArchived,
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
