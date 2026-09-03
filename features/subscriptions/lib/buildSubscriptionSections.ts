import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { SubscriptionSummary } from "../../../types/domain";

export type SubscriptionSectionKey = "overdue" | "upcoming" | "paused" | "cancelled";

export type SubscriptionListSection = ResourceSection<SubscriptionSummary, SubscriptionSectionKey>;

type Args = {
  subscriptions: SubscriptionSummary[];
  /** `yyyy-MM-dd`. Lo que separa lo atrasado de lo próximo. */
  today: string;
  /** Las canceladas son historial: llegan plegadas y se abren si alguien las busca. */
  cancelledExpanded?: boolean;
  onToggleCancelled?: () => void;
  /**
   * Lo que suman los cobros sin anotar, ya formateado. Es el único total de la pantalla que
   * pide una acción, así que va al encabezado de Atrasadas. Sale del historial de ocurrencias
   * (fase 1); mientras no exista, no se pone — nunca estimado desde el precio de hoy.
   */
  overdueTotalLabel?: string | null;
};

/**
 * Las secciones de la lista, por estado.
 *
 * Antes la primera era **"Fijadas"**: agrupaba por una preferencia del usuario en vez de por lo
 * que hay que hacer, así que una suscripción atrasada podía quedar debajo de una al día solo
 * porque la otra tenía estrella. Ahora el orden es el de la urgencia —**Atrasadas → Próximas →
 * Pausadas → Canceladas**— y lo fijado se marca con la estrella junto al nombre, dentro de su
 * sección.
 *
 * Los conteos entre paréntesis se van: sobran cuando las filas se ven. Se quedan solo en
 * Canceladas mientras está plegada, que es cuando no se ven.
 */
export function buildSubscriptionSections({
  subscriptions,
  today,
  cancelledExpanded = false,
  onToggleCancelled,
  overdueTotalLabel,
}: Args): SubscriptionListSection[] {
  // Dentro de cada sección lo fijado sube: es una preferencia, y como tal ordena, no agrupa.
  const byPinned = (a: SubscriptionSummary, b: SubscriptionSummary) =>
    Number(b.isPinned) - Number(a.isPinned);

  const active = subscriptions.filter((subscription) => subscription.status === "active");
  const overdue = active.filter((subscription) => subscription.nextDueDate < today).sort(byPinned);
  const upcoming = active.filter((subscription) => subscription.nextDueDate >= today).sort(byPinned);
  const paused = subscriptions.filter((s) => s.status === "paused").sort(byPinned);
  const cancelled = subscriptions.filter((s) => s.status === "cancelled").sort(byPinned);

  const sections: SubscriptionListSection[] = [];

  if (overdue.length > 0) {
    sections.push({
      key: "overdue",
      label: "Atrasadas",
      data: overdue,
      headerVariant: "divider",
      trailing: overdueTotalLabel ?? undefined,
    });
  }

  if (upcoming.length > 0) {
    sections.push({
      key: "upcoming",
      label: "Próximas",
      data: upcoming,
      // Sin nada más en pantalla, un encabezado que dice "Próximas" sobre la única lista que
      // hay no informa de nada.
      headerVariant: sections.length === 0 && paused.length === 0 && cancelled.length === 0
        ? "hidden"
        : "divider",
    });
  }

  if (paused.length > 0) {
    sections.push({ key: "paused", label: "Pausadas", data: paused, headerVariant: "divider" });
  }

  if (cancelled.length > 0) {
    sections.push({
      key: "cancelled",
      label: cancelledExpanded ? "Canceladas" : `Canceladas (${cancelled.length})`,
      data: cancelledExpanded ? cancelled : [],
      headerVariant: "divider",
      collapsed: !cancelledExpanded,
      onPressHeader: onToggleCancelled,
    });
  }

  return sections;
}
