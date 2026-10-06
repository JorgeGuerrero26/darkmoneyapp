import type { ContactMetrics } from "../../../components/domain/ContactCard";
import type { CounterpartyOverview } from "../../../types/domain";

export function contactRowSubtitle(contact: CounterpartyOverview, metrics?: ContactMetrics): string {
  const detail = contact.phone?.trim() || contact.email?.trim() ||
    (contact.documentNumber?.trim() ? `Doc. ${contact.documentNumber.trim()}` : null);
  const relations: string[] = [];
  if (metrics?.hasReceivable ?? Boolean(metrics?.receivablePendingTotal)) relations.push("Te debe");
  if (metrics?.hasPayable ?? Boolean(metrics?.payablePendingTotal)) relations.push("Le debes");
  const movementCount = metrics?.movementCount ?? contact.movementCount;
  if (relations.length === 0 && movementCount > 0) {
    relations.push(`${movementCount} movimiento${movementCount === 1 ? "" : "s"}`);
  }
  if (!detail && relations.length === 0) {
    if (metrics?.subscriptionCount) relations.push(`${metrics.subscriptionCount} ${metrics.subscriptionCount === 1 ? "suscripción" : "suscripciones"}`);
    if (metrics?.recurringIncomeCount) relations.push(`${metrics.recurringIncomeCount} ingreso${metrics.recurringIncomeCount === 1 ? "" : "s"} fijo${metrics.recurringIncomeCount === 1 ? "" : "s"}`);
  }
  if (contact.isArchived) relations.push("Archivado");
  return [detail, ...relations].filter(Boolean).join(" · ") || "Sin datos de contacto";
}
