import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { RecurringIncomeFrequency, RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeSectionKey = "unconfirmed" | `frequency-${RecurringIncomeFrequency}` | "paused" | "cancelled";

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

const FREQUENCY_GROUPS: Array<{ value: RecurringIncomeFrequency; label: string }> = [
  { value: "daily", label: "Diarios" },
  { value: "weekly", label: "Semanales" },
  { value: "monthly", label: "Mensuales" },
  { value: "quarterly", label: "Trimestrales" },
  { value: "yearly", label: "Anuales" },
  { value: "custom", label: "Personalizados" },
];

/**
 * Primero las llegadas que requieren confirmación; después, las próximas por frecuencia.
 *
 * La primera se llama **"Por confirmar"** y no "Atrasados": un ingreso pudo llegar y faltar
 * anotarlo, o no haber llegado nunca. La app no puede distinguirlas, y las dos piden lo mismo
 * —que alguien lo mire—, así que la sección nombra la acción y no una acusación.
 *
 * La frecuencia es el tipo de ingreso fijo disponible en todos los registros. Categoría es
 * opcional, así que agrupar por ella escondería muchos ingresos bajo "Sin categoría".
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
      label: "Por confirmar",
      data: unconfirmed,
      headerVariant: "divider",
      trailing: unconfirmedTotalLabel ?? undefined,
    });
  }

  for (const group of FREQUENCY_GROUPS) {
    const data = upcoming.filter((item) => item.frequency === group.value);
    if (data.length === 0) continue;
    sections.push({
      key: `frequency-${group.value}`,
      label: `${group.label} (${data.length})`,
      data,
      headerVariant: "divider",
    });
  }

  if (paused.length > 0) {
    sections.push({ key: "paused", label: "En pausa", data: paused, headerVariant: "divider" });
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
