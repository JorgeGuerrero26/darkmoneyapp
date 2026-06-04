import type { CounterpartyOverview } from "../../../types/domain";
import type { ContactMetrics } from "../../../components/domain/ContactCard";

type Args = {
  filteredContacts: CounterpartyOverview[];
  metricsById: Map<number, ContactMetrics>;
  hasFilters: boolean;
  hiddenArchivedCount: number;
};

export function buildContactsContextNote({
  filteredContacts,
  metricsById,
  hasFilters,
  hiddenArchivedCount,
}: Args): string | null {
  const parts: string[] = [];

  const withOpenBalances = filteredContacts.filter((contact) => {
    const metrics = metricsById.get(contact.id);
    if (!metrics) return false;
    return metrics.receivablePendingTotal > 0 || metrics.payablePendingTotal > 0;
  }).length;

  if (withOpenBalances > 0) {
    parts.push(
      withOpenBalances === 1
        ? "1 contacto con saldos abiertos"
        : `${withOpenBalances} contactos con saldos abiertos`,
    );
  }

  if (!hasFilters && hiddenArchivedCount > 0) {
    parts.push(
      hiddenArchivedCount === 1
        ? "1 archivado oculto"
        : `${hiddenArchivedCount} archivados ocultos`,
    );
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
