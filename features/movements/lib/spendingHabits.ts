export type HabitMovement = {
  description: string | null;
  occurred_at: string;
  source_amount: number | null;
  category_id: number | null;
  source_account_id: number | null;
  movement_type: string;
  status?: string;
};

export type SpendingHabit = {
  /** Clave estable: descripción normalizada + monto. */
  key: string;
  /** El texto tal como lo escribes, para reusarlo en el movimiento nuevo. */
  label: string;
  amount: number;
  categoryId: number | null;
  accountId: number | null;
  /** Cuántas veces, y en cuántos días distintos. */
  times: number;
  distinctDays: number;
  /**
   * Las franjas horarias habituales, en horas locales.
   *
   * En plural porque un mismo gasto puede tener **dos horas punta**: la moto al trabajo son 14
   * viajes a las 6 y 11 a las 19 — ida y vuelta. Con una sola franja calculada sobre la mediana,
   * los once regresos quedaban fuera de su propia franja y a las 7 de la tarde no se proponía
   * nada.
   */
  windows: Array<{ from: number; to: number }>;
  /** `weekday` = solo de lunes a viernes; `weekend` = solo fines de semana. */
  when: "weekday" | "weekend" | "any";
  /** Días desde la última vez. Un hábito abandonado no se propone. */
  daysSinceLast: number;
};

/** Mínimos para llamarlo hábito y no coincidencia. */
const MIN_TIMES = 5;
const MIN_DISTINCT_DAYS = 4;
/** Más de esto sin repetirse y ya no es rutina: dejó de hacerse. */
const MAX_DAYS_SINCE_LAST = 30;
/** Cuánto se abre la franja alrededor de la hora habitual. */
const HOUR_SLACK = 2;

function normalizeLabel(description: string | null | undefined): string {
  return (description ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function partsInLima(iso: string): { hour: number; isoDow: number; day: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    hour: Number(parts.hour) % 24,
    isoDow: dowMap[parts.weekday] ?? 1,
    day: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * Los gastos que repites igual: mismo concepto, mismo monto, misma franja.
 *
 * **Por qué el monto entra en la clave.** El atajo solo sirve si registra de un toque, y para
 * eso el monto tiene que estar decidido. "Taxi" no es un hábito: en los datos aparece a 7, 8,
 * 8.50 y 9 soles. "Moto a S/ 2.00" sí lo es — 27 veces, las 27 en día de semana.
 *
 * **Por qué se mira el día de la semana.** Es lo que separa una rutina de una casualidad: los
 * 27 "moto" son de lunes a viernes y ninguno en fin de semana, así que proponerlo un domingo
 * sería ruido. "Taxi" está repartido mitad y mitad, y por eso no debe proponerse por franja.
 *
 * **Por qué caduca.** Un hábito que lleva más de un mes sin repetirse dejó de serlo — como la
 * vendomática, seis veces en junio y nada desde julio. Seguir ofreciéndolo es ensuciar la
 * pantalla con el pasado.
 *
 * Nada de esto necesita un modelo: es contar. Y contar es instantáneo, gratis y funciona sin
 * señal, tres cosas que una llamada a una IA no da.
 */
export function detectSpendingHabits(
  movements: HabitMovement[],
  now: Date = new Date(),
): SpendingHabit[] {
  const buckets = new Map<string, {
    label: string;
    labelCounts: Map<string, number>;
    amount: number;
    hours: number[];
    days: Set<string>;
    weekdayCount: number;
    weekendCount: number;
    categories: Map<number, number>;
    accounts: Map<number, number>;
    lastAt: number;
  }>();

  for (const movement of movements) {
    if (movement.movement_type !== "expense") continue;
    if (movement.status && movement.status !== "posted") continue;
    const amount = Number(movement.source_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const label = normalizeLabel(movement.description);
    if (!label) continue;
    const when = partsInLima(movement.occurred_at);
    if (!when) continue;

    const key = `${label}|${amount.toFixed(2)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        label,
        labelCounts: new Map(),
        amount,
        hours: [],
        days: new Set(),
        weekdayCount: 0,
        weekendCount: 0,
        categories: new Map(),
        accounts: new Map(),
        lastAt: 0,
      });
    }
    const bucket = buckets.get(key)!;
    const raw = (movement.description ?? "").trim();
    if (raw) bucket.labelCounts.set(raw, (bucket.labelCounts.get(raw) ?? 0) + 1);
    bucket.hours.push(when.hour);
    bucket.days.add(when.day);
    if (when.isoDow <= 5) bucket.weekdayCount += 1;
    else bucket.weekendCount += 1;
    if (movement.category_id != null) {
      bucket.categories.set(movement.category_id, (bucket.categories.get(movement.category_id) ?? 0) + 1);
    }
    if (movement.source_account_id != null) {
      bucket.accounts.set(movement.source_account_id, (bucket.accounts.get(movement.source_account_id) ?? 0) + 1);
    }
    bucket.lastAt = Math.max(bucket.lastAt, new Date(movement.occurred_at).getTime());
  }

  const mostFrequent = (counts: Map<number, number>): number | null => {
    let best: number | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) { best = id; bestCount = count; }
    }
    return best;
  };

  const habits: SpendingHabit[] = [];
  for (const [key, bucket] of buckets) {
    const times = bucket.hours.length;
    if (times < MIN_TIMES || bucket.days.size < MIN_DISTINCT_DAYS) continue;

    const daysSinceLast = Math.floor((now.getTime() - bucket.lastAt) / 86_400_000);
    if (daysSinceLast > MAX_DAYS_SINCE_LAST) continue;

    const windows = habitWindows(bucket.hours);

    let label = bucket.label;
    let bestLabel = 0;
    for (const [text, count] of bucket.labelCounts) {
      if (count > bestLabel) { bestLabel = count; label = text; }
    }

    const weekdayShare = bucket.weekdayCount / times;
    habits.push({
      key,
      label,
      amount: bucket.amount,
      categoryId: mostFrequent(bucket.categories),
      accountId: mostFrequent(bucket.accounts),
      times,
      distinctDays: bucket.days.size,
      windows,
      when: weekdayShare >= 0.8 ? "weekday" : weekdayShare <= 0.2 ? "weekend" : "any",
      daysSinceLast,
    });
  }

  return habits.sort((a, b) => b.times - a.times);
}

/** Un pico necesita repetirse de verdad: con siete registros, dos a la misma hora es azar. */
const MIN_PEAK_TIMES = 3;
/** Y pesar dentro del hábito: por debajo de esto es una hora suelta, no una rutina. */
const MIN_PEAK_SHARE = 0.2;
/** Como mucho dos: ida y vuelta. Tres franjas ya son "a cualquier hora". */
const MAX_PEAKS = 2;

/**
 * Las franjas en las que de verdad ocurre el gasto.
 *
 * Antes era una sola, la mediana ±2. Para un gasto de dos picos —la moto de las 6 y la de las
 * 19— la mediana cae en uno de los dos y el otro se queda fuera: once regresos sin proponerse
 * nunca, a la hora exacta en que se hacen.
 *
 * Cuando no hay un pico claro se vuelve a la mediana, que es lo que había: medido contra los
 * datos reales, de los nueve hábitos vivos **solo la moto cambia de franja**. Un cambio que
 * mueve todo lo demás no estaría arreglando esto, estaría cambiando otra cosa.
 */
function habitWindows(hours: number[]): Array<{ from: number; to: number }> {
  const counts = new Map<number, number>();
  for (const hour of hours) counts.set(hour, (counts.get(hour) ?? 0) + 1);

  const peaks = [...counts.entries()]
    .filter(([, count]) => count >= MIN_PEAK_TIMES && count >= hours.length * MIN_PEAK_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PEAKS)
    .map(([hour]) => hour)
    .sort((a, b) => a - b);

  const centers = peaks.length > 0
    ? peaks
    : [[...hours].sort((a, b) => a - b)[Math.floor(hours.length / 2)]];

  return centers.map((center) => ({
    from: Math.max(0, center - HOUR_SLACK),
    to: Math.min(23, center + HOUR_SLACK),
  }));
}

/**
 * Los que encajan con este momento: el día correcto y dentro de su franja.
 *
 * **Un hábito sin patrón de día también cuenta.** Antes se descartaba: sin día claro, ofrecerlo
 * parecía adivinar. Medido contra los datos reales el 2026-09-07, esa regla dejaba fuera el
 * segundo hábito más repetido —un taxi de S/ 8, 25 veces en 22 días distintos— para siempre,
 * porque se toma cualquier día de la semana. Y de eso justamente se trata: es rutina, solo que
 * no de lunes a viernes.
 *
 * La franja horaria sigue filtrando, que es el filtro que de verdad acota: el taxi se propone
 * de 13 a 17, no a las tres de la mañana. El día solo descarta cuando SÍ hay patrón — la moto
 * de entre semana no se ofrece un domingo.
 */
export function habitsForNow(habits: SpendingHabit[], now: Date = new Date(), max = 3): SpendingHabit[] {
  const when = partsInLima(now.toISOString());
  if (!when) return [];
  const isWeekend = when.isoDow >= 6;

  return habits
    .filter((habit) => {
      if (habit.when === "weekday" && isWeekend) return false;
      if (habit.when === "weekend" && !isWeekend) return false;
      return habit.windows.some((window) => when.hour >= window.from && when.hour <= window.to);
    })
    .slice(0, max);
}
