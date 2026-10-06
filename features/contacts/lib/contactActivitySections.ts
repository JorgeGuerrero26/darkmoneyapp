import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { WorkspaceSnapshot } from "../../../services/queries/workspace-data";

export type ContactActivityItem = {
  id: number;
  kind: "obligation" | "subscription" | "income";
  title: string;
  subtitle: string;
  amount: number;
  currencyCode: string;
};

export function contactActivitySections(snapshot: WorkspaceSnapshot | undefined, contactId: number): ResourceSection<ContactActivityItem>[] {
  if (!snapshot) return [];
  const obligations: ContactActivityItem[] = (snapshot.obligations ?? [])
    .filter((item) => item.counterpartyId === contactId && item.status !== "cancelled")
    .map((item) => ({ id: item.id, kind: "obligation", title: item.title, subtitle: item.direction === "receivable" ? "Por cobrar" : "Por pagar", amount: item.pendingAmount, currencyCode: item.currencyCode }));
  const subscriptions: ContactActivityItem[] = snapshot.subscriptions.filter((item) => item.vendorPartyId === contactId)
    .map((item) => ({ id: item.id, kind: "subscription", title: item.name, subtitle: item.status === "active" ? "Activa" : item.status === "paused" ? "Pausada" : "Cancelada", amount: item.amount, currencyCode: item.currencyCode }));
  const incomes: ContactActivityItem[] = snapshot.recurringIncome.filter((item) => item.payerPartyId === contactId)
    .map((item) => ({ id: item.id, kind: "income", title: item.name, subtitle: item.status === "active" ? "Activo" : item.status === "paused" ? "Pausado" : "Cancelado", amount: item.amount, currencyCode: item.currencyCode }));
  return [
    { key: "obligations", label: "Créditos y deudas", data: obligations, headerVariant: "divider" as const },
    { key: "subscriptions", label: "Suscripciones", data: subscriptions, headerVariant: "divider" as const },
    { key: "incomes", label: "Ingresos fijos", data: incomes, headerVariant: "divider" as const },
  ].filter((section) => section.data.length > 0);
}
