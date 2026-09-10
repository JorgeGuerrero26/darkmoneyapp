import { buildSpendTypeBreakdown, type SpendTypeCarrier } from "../../movements/lib/effectiveSpendType";

export type SpendTypeMixSegment = {
  id: number;
  name: string;
  color: string;
  amount: number;
  /** Parte del gasto CLASIFICADO, de 0 a 1. Los segmentos suman 1. */
  share: number;
};

export type SpendTypeMix =
  | { state: "hidden" }
  | { state: "invite"; total: number }
  | {
      state: "ready";
      segments: SpendTypeMixSegment[];
      classified: number;
      total: number;
      /** Parte del gasto que tiene tipo, de 0 a 1. */
      coverage: number;
      /** La frase de abajo, o `null` si el dato se explica solo. */
      footnote: string | null;
    };

type SpendTypeLike = { id: number; name: string; color?: string | null };

const FALLBACK_COLOR = "#8E8B86";

function money(value: number, currency: (value: number) => string): string {
  return currency(Math.round(value * 100) / 100);
}

/**
 * De qué tipo fue el gasto del período.
 *
 * **Los porcentajes son sobre el gasto clasificado, y la nota dice cuánto es eso.** Es la única
 * forma honesta de mostrarlo mientras la clasificación esté a medias, y va a estarlo mucho
 * tiempo: de los últimos tres meses medidos, S/ 4,110 de gasto —61 movimientos, casi una cuarta
 * parte— no tiene ni categoría, así que ni clasificando las 21 categorías se llega al 100 %.
 * Repartir ese resto entre los tres tipos, o esconderlo, haría que un "62 % necesidades"
 * describiera bastante menos gasto del que hubo.
 *
 * **Y con nada clasificado no se dibuja una torta de un solo color**: se invita una vez. La
 * invitación se apaga sola en cuanto una categoría tiene tipo, así que no es un aviso que haya
 * que aguantar para siempre.
 */
export function buildSpendTypeMix(
  movements: Array<SpendTypeCarrier & { amount: number }>,
  categoryDefaults: Map<number, number | null>,
  spendTypes: SpendTypeLike[],
  formatAmount: (value: number) => string,
): SpendTypeMix {
  if (spendTypes.length === 0) return { state: "hidden" };

  const rows = buildSpendTypeBreakdown(movements, categoryDefaults);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) return { state: "hidden" };

  const classified = rows
    .filter((row) => row.spendTypeId != null)
    .reduce((sum, row) => sum + row.amount, 0);

  if (classified <= 0) return { state: "invite", total };

  const byId = new Map(spendTypes.map((type) => [type.id, type]));
  const segments = rows
    .filter((row): row is typeof row & { spendTypeId: number } => row.spendTypeId != null)
    .map((row) => ({
      id: row.spendTypeId,
      name: byId.get(row.spendTypeId)?.name ?? "Sin nombre",
      color: byId.get(row.spendTypeId)?.color ?? FALLBACK_COLOR,
      amount: row.amount,
      share: classified > 0 ? row.amount / classified : 0,
    }));

  const coverage = total > 0 ? classified / total : 0;
  const missing = total - classified;

  return {
    state: "ready",
    segments,
    classified: Math.round(classified * 100) / 100,
    total: Math.round(total * 100) / 100,
    coverage,
    footnote:
      missing > 0.009
        ? `Faltan ${money(missing, formatAmount)} por clasificar.`
        : null,
  };
}
