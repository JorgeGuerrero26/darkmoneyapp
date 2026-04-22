export type LiveExchangeRate = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  provider: string;
};

function normalizeCurrencyCode(value: string) {
  return value.trim().toUpperCase();
}

function ensureValidRate(rate: unknown): number | null {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

async function fetchFromExchangeRateApi(from: string, to: string): Promise<LiveExchangeRate> {
  const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
  if (!response.ok) {
    throw new Error(`ExchangeRate-API respondió ${response.status}`);
  }

  const data = await response.json() as {
    result?: string;
    time_last_update_utc?: string;
    rates?: Record<string, unknown>;
    "error-type"?: string;
  };
  const rate = ensureValidRate(data.rates?.[to]);
  if (data.result !== "success" || !rate) {
    throw new Error(data["error-type"] ?? `ExchangeRate-API no devolvió ${from}→${to}`);
  }

  return {
    fromCurrencyCode: from,
    toCurrencyCode: to,
    rate,
    effectiveAt: data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString(),
    provider: "ExchangeRate-API",
  };
}

async function fetchFromFrankfurter(from: string, to: string): Promise<LiveExchangeRate> {
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
  if (!response.ok) {
    throw new Error(`Frankfurter respondió ${response.status}`);
  }

  const data = await response.json() as {
    date?: string;
    rate?: unknown;
    message?: string;
  };
  const rate = ensureValidRate(data.rate);
  if (!rate) {
    throw new Error(data.message ?? `Frankfurter no devolvió ${from}→${to}`);
  }

  return {
    fromCurrencyCode: from,
    toCurrencyCode: to,
    rate,
    effectiveAt: data.date ? new Date(`${data.date}T00:00:00.000Z`).toISOString() : new Date().toISOString(),
    provider: "Frankfurter",
  };
}

export async function fetchLiveExchangeRate(fromCurrencyCode: string, toCurrencyCode: string): Promise<LiveExchangeRate> {
  const from = normalizeCurrencyCode(fromCurrencyCode);
  const to = normalizeCurrencyCode(toCurrencyCode);
  if (!from || !to || from === to) {
    throw new Error("Par de monedas inválido");
  }

  try {
    return await fetchFromExchangeRateApi(from, to);
  } catch (primaryError) {
    try {
      return await fetchFromFrankfurter(from, to);
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : "falló proveedor primario";
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "falló proveedor alterno";
      throw new Error(`No se pudo obtener ${from}→${to}: ${primaryMessage}; ${fallbackMessage}`);
    }
  }
}
