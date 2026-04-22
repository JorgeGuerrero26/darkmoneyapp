import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

type PublicHoliday = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
};

export type HolidayNotice = {
  kind: "weekend" | "holiday";
  title: string;
  detail: string;
  suggestedDate: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_COUNTRY_CODE = "PE";

function parseYmd(value: string) {
  if (!YMD_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = parseYmd(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

function weekdayName(value: string) {
  const date = parseYmd(value);
  if (!date) return "";
  return date.toLocaleDateString("es-PE", { weekday: "long" });
}

function isWeekend(value: string) {
  const date = parseYmd(value);
  if (!date) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nextBusinessDate(value: string, holidays: Set<string>) {
  let candidate = value;
  for (let i = 0; i < 10; i += 1) {
    candidate = addDays(candidate, 1);
    if (!isWeekend(candidate) && !holidays.has(candidate)) return candidate;
  }
  return addDays(value, 1);
}

async function fetchPublicHolidays(year: number, countryCode: string) {
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar feriados (${response.status})`);
  }
  return await response.json() as PublicHoliday[];
}

export function useHolidayNotice(dateValue: string, countryCode = DEFAULT_COUNTRY_CODE) {
  const year = useMemo(() => {
    const date = parseYmd(dateValue);
    return date?.getFullYear() ?? null;
  }, [dateValue]);

  const query = useQuery({
    queryKey: ["public-holidays", countryCode, year],
    queryFn: () => fetchPublicHolidays(year as number, countryCode),
    enabled: Boolean(year),
    staleTime: 1000 * 60 * 60 * 24 * 14,
    gcTime: 1000 * 60 * 60 * 24 * 30,
  });

  const notice = useMemo<HolidayNotice | null>(() => {
    if (!YMD_RE.test(dateValue)) return null;
    const holidays = new Set((query.data ?? []).map((holiday) => holiday.date));
    const holiday = (query.data ?? []).find((item) => item.date === dateValue);
    const suggestedDate = nextBusinessDate(dateValue, holidays);

    if (holiday) {
      return {
        kind: "holiday",
        title: `Feriado: ${holiday.localName || holiday.name}`,
        detail: `La fecha elegida puede no ser día hábil. Sugerencia: ${suggestedDate}.`,
        suggestedDate,
      };
    }

    if (isWeekend(dateValue)) {
      const dayName = weekdayName(dateValue);
      return {
        kind: "weekend",
        title: `Cae ${dayName}`,
        detail: `La fecha elegida puede no ser día hábil. Sugerencia: ${suggestedDate}.`,
        suggestedDate,
      };
    }

    return null;
  }, [dateValue, query.data]);

  return {
    notice,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
