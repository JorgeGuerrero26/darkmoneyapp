import { useQuery } from "@tanstack/react-query";

const BCRP_API_BASE = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api";
const BCRP_FETCH_ATTEMPTS = 3;

const SERIES = {
  inflation12m: {
    code: "PN01273PM",
    label: "Inflación 12 meses",
  },
  referenceRate: {
    code: "PD04722MM",
    label: "Tasa de referencia",
  },
} as const;

type BcrpPeriod = {
  name?: string;
  values?: unknown[];
};

type BcrpSeriesConfig = {
  name?: string;
};

type BcrpResponse = {
  config?: {
    series?: BcrpSeriesConfig[];
  };
  periods?: BcrpPeriod[];
};

export type BcrpMacroIndicator = {
  code: string;
  label: string;
  period: string;
  value: number | null;
};

export type BcrpMacroIndicators = {
  inflation12m: BcrpMacroIndicator;
  referenceRate: BcrpMacroIndicator;
  source: "BCRPData";
  fetchedAt: string;
};

function parseBcrpNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildBcrpRange(now = new Date()) {
  const currentYear = now.getFullYear();
  return `${currentYear - 2}-1/${currentYear}-12`;
}

function valueIndexForSeries(data: BcrpResponse, target: keyof typeof SERIES) {
  const series = data.config?.series ?? [];
  const index = series.findIndex((item) => {
    const name = normalizeText(item.name);
    if (target === "inflation12m") {
      return name.includes("ipc") || (name.includes("precios") && name.includes("12 meses"));
    }
    return name.includes("referencia") && name.includes("politica monetaria");
  });
  if (index >= 0) return index;

  // BCRPData can reorder the combined response; this fallback matches the
  // observed API order for PD04722MM-PN01273PM when config metadata is absent.
  return target === "referenceRate" ? 0 : 1;
}

function latestPeriodForValue(periods: BcrpPeriod[] | undefined, valueIndex: number) {
  if (!periods) return undefined;
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index];
    if (parseBcrpNumber(period.values?.[valueIndex]) !== null) return period;
  }
  return undefined;
}

function indicatorFromPeriod(
  period: BcrpPeriod | undefined,
  series: typeof SERIES[keyof typeof SERIES],
  valueIndex: number,
): BcrpMacroIndicator {
  return {
    code: series.code,
    label: series.label,
    period: period?.name ?? "",
    value: parseBcrpNumber(period?.values?.[valueIndex]),
  };
}

async function fetchBcrpJson(url: string): Promise<BcrpResponse> {
  let lastError = "BCRPData no devolvió datos válidos.";

  for (let attempt = 1; attempt <= BCRP_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 DarkMoney/1.0",
      },
    });
    if (!response.ok) {
      lastError = `BCRPData respondió ${response.status}`;
      continue;
    }

    const raw = (await response.text()).trim();
    if (!raw.startsWith("{")) {
      lastError = "BCRPData respondió sin JSON.";
      continue;
    }

    try {
      const data = JSON.parse(raw) as BcrpResponse;
      if (Array.isArray(data.periods) && data.periods.length > 0) return data;
      lastError = "BCRPData no trajo periodos.";
    } catch {
      lastError = "BCRPData devolvió JSON inválido.";
    }
  }

  throw new Error(lastError);
}

export async function fetchBcrpMacroIndicators(): Promise<BcrpMacroIndicators> {
  const codes = [SERIES.referenceRate.code, SERIES.inflation12m.code];
  const data = await fetchBcrpJson(`${BCRP_API_BASE}/${codes.join("-")}/json/${buildBcrpRange()}`);
  const inflationIndex = valueIndexForSeries(data, "inflation12m");
  const referenceRateIndex = valueIndexForSeries(data, "referenceRate");
  const inflationPeriod = latestPeriodForValue(data.periods, inflationIndex);
  const referenceRatePeriod = latestPeriodForValue(data.periods, referenceRateIndex);

  return {
    inflation12m: indicatorFromPeriod(inflationPeriod, SERIES.inflation12m, inflationIndex),
    referenceRate: indicatorFromPeriod(referenceRatePeriod, SERIES.referenceRate, referenceRateIndex),
    source: "BCRPData",
    fetchedAt: new Date().toISOString(),
  };
}

export function useBcrpMacroIndicatorsQuery() {
  return useQuery({
    queryKey: ["bcrp-macro-indicators", "v2"],
    queryFn: fetchBcrpMacroIndicators,
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}
