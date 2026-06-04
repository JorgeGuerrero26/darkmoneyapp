import type { CounterpartyOverview } from "../../../types/domain";
import type { ContactMetrics } from "../../../components/domain/ContactCard";
import { TYPE_LABELS } from "./contactsLabels";

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildContactCSV(
  contacts: CounterpartyOverview[],
  metricsById: Map<number, ContactMetrics>,
) {
  const BOM = "﻿";
  const headers = [
    "Nombre",
    "Tipo",
    "Telefono",
    "Email",
    "Documento",
    "Archivado",
    "Movimientos",
    "Por cobrar",
    "Por pagar",
    "Suscripciones",
    "Ingresos fijos",
    "Notas",
  ];
  const rows = contacts.map((contact) => {
    const metrics = metricsById.get(contact.id);
    return [
      contact.name,
      TYPE_LABELS[contact.type] ?? contact.type,
      contact.phone ?? "",
      contact.email ?? "",
      contact.documentNumber ?? "",
      contact.isArchived ? "Si" : "No",
      metrics?.movementCount ?? contact.movementCount,
      metrics?.receivablePendingTotal ?? 0,
      metrics?.payablePendingTotal ?? 0,
      metrics?.subscriptionCount ?? 0,
      metrics?.recurringIncomeCount ?? 0,
      contact.notes ?? "",
    ]
      .map(csvEscape)
      .join(",");
  });
  return BOM + [headers.join(","), ...rows].join("\n");
}
