import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeSectionKey = "unconfirmed" | "upcoming" | "paused" | "cancelled";

export type RecurringIncomeListSection = ResourceSection<
  RecurringIncomeSummary,
  RecurringIncomeSectionKey
>;

type Args = {
  items: RecurringIncomeSummary[];
  /** `yyyy-MM-dd`. Lo que separa lo que falta confirmar de lo que está por llegar. */
  today: string;
  cancelledExpanded?: boolean;
  onToggleCancelled?: () => void;
  /** Lo que está en juego, ya formateado: la suma de las llegadas sin anotar. */
  unconfirmedTotalLabel?: string | null;
};

/**
 * Las secciones de ingresos fijos, por estado.
 *
 * La primera se llama **"Sin confirmar"** y no "Atrasados": un ingreso pudo llegar y faltar
 * anotarlo, o no haber llegado nunca. La app no puede distinguirlas, y las dos piden lo mismo
 * —que alguien lo mire—, así que la sección nombra la acción y no una acusación.
 *
 * Sustituye a cuatro pestañas de estado que ocupaban una fila entera y contradecían la nota de
 * abajo: si las pestañas ya filtran por estado, la agrupación por estado no se ve nunca.
 */
export function buildRecurringIncomeSections({
  items,
  today,
  cancelledExpanded = false,
  onToggleCancelled,
  unconfirmedTotalLabel,
}: Args): RecurringIncomeListSection[] {
  const byPinned = (a: RecurringIncomeSummary, b: RecurringIncomeSummary) =>
    Number(b.isPinned) - Number(a.isPinned);

  const active = items.filter((item) => item.status === "active");
  const unconfirmed = active.filter((item) => item.nextExpectedDate < today).sort(byPinned);
  const upcoming = active.filter((item) => item.nextExpectedDate >= today).sort(byPinned);
  const paused = items.filter((item) => item.status === "paused").sort(byPinned);
  const cancelled = items.filter((item) => item.status === "cancelled").sort(byPinned);

  const sections: RecurringIncomeListSection[] = [];

  if (unconfirmed.length > 0) {
    sections.push({
      key: "unconfirmed",
      label: "Sin confirmar",
      data: unconfirmed,
      headerVariant: "divider",
      trailing: unconfirmedTotalLabel ?? undefined,
    });
  }

  if (upcoming.length > 0) {
    sections.push({
      key: "upcoming",
      label: "Próximos",
      data: upcoming,
      headerVariant:
        sections.length === 0 && paused.length === 0 && cancelled.length === 0 ? "hidden" : "divider",
    });
  }

  if (paused.length > 0) {
    sections.push({ key: "paused", label: "Pausados", data: paused, headerVariant: "divider" });
  }

  if (cancelled.length > 0) {
    sections.push({
      key: "cancelled",
      label: cancelledExpanded ? "Cancelados" : `Cancelados (${cancelled.length})`,
      data: cancelledExpanded ? cancelled : [],
      headerVariant: "divider",
      collapsed: !cancelledExpanded,
      onPressHeader: onToggleCancelled,
    });
  }

  return sections;
}
