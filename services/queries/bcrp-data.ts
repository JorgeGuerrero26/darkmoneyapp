import { useQuery } from "@tanstack/react-query";

const BCRP_API_BASE = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api";

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

type BcrpResponse = {
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

function latestPeriodForValue(periods: BcrpPeriod[] | undefined, valueIndex: number) {
  return periods?.find((period) => parseBcrpNumber(period.values?.[valueIndex]) !== null);
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

export async function fetchBcrpMacroIndicators(): Promise<BcrpMacroIndicators> {
  const codes = [SERIES.inflation12m.code, SERIES.referenceRate.code];
  const response = await fetch(`${BCRP_API_BASE}/${codes.join("-")}/json`, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 DarkMoney/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`BCRPData respondió ${response.status}`);
  }

  const data = await response.json() as BcrpResponse;
  const inflationPeriod = latestPeriodForValue(data.periods, 0);
  const referenceRatePeriod = latestPeriodForValue(data.periods, 1);

  return {
    inflation12m: indicatorFromPeriod(inflationPeriod, SERIES.inflation12m, 0),
    referenceRate: indicatorFromPeriod(referenceRatePeriod, SERIES.referenceRate, 1),
    source: "BCRPData",
    fetchedAt: new Date().toISOString(),
  };
}

export function useBcrpMacroIndicatorsQuery() {
  return useQuery({
    queryKey: ["bcrp-macro-indicators"],
    queryFn: fetchBcrpMacroIndicators,
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}
