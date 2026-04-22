/**
 * sync-exchange-rates
 *
 * Synchronizes the latest exchange rates already present in `exchange_rates`.
 * For each unique currency pair it fetches a live rate, then updates/creates
 * both the direct pair and its inverse.
 *
 * Primary provider:  ExchangeRate-API Open Access
 * Fallback provider: Frankfurter
 *
 * Deploy:
 *   npx supabase functions deploy sync-exchange-rates --project-ref <project-ref>
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional secret:
 *   SYNC_EXCHANGE_RATES_SECRET
 * If set, callers must pass header:
 *   x-sync-secret: <secret>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ExchangeRateRow = {
  id: number;
  from_currency_code: string;
  to_currency_code: string;
  rate: number | string;
  effective_at: string;
};

type LiveExchangeRate = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  provider: string;
};

type SyncResult = {
  pair: string;
  ok: boolean;
  provider?: string;
  rate?: number;
  directId?: number;
  inverseId?: number | null;
  error?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
    throw new Error(`ExchangeRate-API responded ${response.status}`);
  }

  const data = await response.json() as {
    result?: string;
    time_last_update_utc?: string;
    rates?: Record<string, unknown>;
    "error-type"?: string;
  };
  const rate = ensureValidRate(data.rates?.[to]);
  if (data.result !== "success" || !rate) {
    throw new Error(data["error-type"] ?? `ExchangeRate-API did not return ${from}->${to}`);
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
    throw new Error(`Frankfurter responded ${response.status}`);
  }

  const data = await response.json() as {
    date?: string;
    rate?: unknown;
    message?: string;
  };
  const rate = ensureValidRate(data.rate);
  if (!rate) {
    throw new Error(data.message ?? `Frankfurter did not return ${from}->${to}`);
  }

  return {
    fromCurrencyCode: from,
    toCurrencyCode: to,
    rate,
    effectiveAt: data.date ? new Date(`${data.date}T00:00:00.000Z`).toISOString() : new Date().toISOString(),
    provider: "Frankfurter",
  };
}

async function fetchLiveExchangeRate(fromCurrencyCode: string, toCurrencyCode: string): Promise<LiveExchangeRate> {
  const from = normalizeCurrencyCode(fromCurrencyCode);
  const to = normalizeCurrencyCode(toCurrencyCode);
  if (!from || !to || from === to) {
    throw new Error("Invalid currency pair");
  }

  try {
    return await fetchFromExchangeRateApi(from, to);
  } catch (primaryError) {
    try {
      return await fetchFromFrankfurter(from, to);
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : "primary provider failed";
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "fallback provider failed";
      throw new Error(`${primaryMessage}; ${fallbackMessage}`);
    }
  }
}

async function upsertExchangeRateRow(
  supabase: ReturnType<typeof createClient>,
  input: {
    fromCurrencyCode: string;
    toCurrencyCode: string;
    rate: number;
    effectiveAt: string;
    source: string;
    notes: string | null;
  },
) {
  const from = normalizeCurrencyCode(input.fromCurrencyCode);
  const to = normalizeCurrencyCode(input.toCurrencyCode);

  const { data: existing, error: selectError } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("from_currency_code", from)
    .eq("to_currency_code", to)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);

  const payload = {
    from_currency_code: from,
    to_currency_code: to,
    rate: input.rate,
    effective_at: input.effectiveAt,
    source: input.source,
    notes: input.notes,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("exchange_rates")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return Number(existing.id);
  }

  const { data, error } = await supabase
    .from("exchange_rates")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return Number(data.id);
}

function buildUniquePairs(rows: ExchangeRateRow[]) {
  const pairMap = new Map<string, { fromCurrencyCode: string; toCurrencyCode: string }>();
  for (const row of rows) {
    const from = normalizeCurrencyCode(row.from_currency_code);
    const to = normalizeCurrencyCode(row.to_currency_code);
    if (!from || !to || from === to) continue;
    const canonical = [from, to].sort().join(":");
    if (!pairMap.has(canonical)) {
      pairMap.set(canonical, { fromCurrencyCode: from, toCurrencyCode: to });
    }
  }
  return Array.from(pairMap.values());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const syncSecret = Deno.env.get("SYNC_EXCHANGE_RATES_SECRET");
  if (syncSecret && req.headers.get("x-sync-secret") !== syncSecret) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[sync-exchange-rates] Missing Supabase env vars");
    return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: rows, error } = await supabase
    .from("exchange_rates")
    .select("id, from_currency_code, to_currency_code, rate, effective_at")
    .order("effective_at", { ascending: false });
  if (error) {
    console.error("[sync-exchange-rates] Failed to load exchange rates:", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const pairs = buildUniquePairs((rows ?? []) as ExchangeRateRow[]);
  const results: SyncResult[] = [];

  for (const pair of pairs) {
    const pairLabel = `${pair.fromCurrencyCode}->${pair.toCurrencyCode}`;
    try {
      const liveRate = await fetchLiveExchangeRate(pair.fromCurrencyCode, pair.toCurrencyCode);
      const source = `api:${liveRate.provider}`;
      const directId = await upsertExchangeRateRow(supabase, {
        fromCurrencyCode: liveRate.fromCurrencyCode,
        toCurrencyCode: liveRate.toCurrencyCode,
        rate: liveRate.rate,
        effectiveAt: liveRate.effectiveAt,
        source,
        notes: "Sincronizado automáticamente por cron",
      });

      const inverseRate = 1 / liveRate.rate;
      let inverseId: number | null = null;
      if (Number.isFinite(inverseRate) && inverseRate > 0) {
        inverseId = await upsertExchangeRateRow(supabase, {
          fromCurrencyCode: liveRate.toCurrencyCode,
          toCurrencyCode: liveRate.fromCurrencyCode,
          rate: inverseRate,
          effectiveAt: liveRate.effectiveAt,
          source,
          notes: `Inverso calculado desde ${liveRate.fromCurrencyCode}->${liveRate.toCurrencyCode}`,
        });
      }

      results.push({
        pair: pairLabel,
        ok: true,
        provider: liveRate.provider,
        rate: liveRate.rate,
        directId,
        inverseId,
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Unknown sync error";
      console.error(`[sync-exchange-rates] ${pairLabel} failed:`, message);
      results.push({ pair: pairLabel, ok: false, error: message });
    }
  }

  const failed = results.filter((result) => !result.ok);
  return jsonResponse({
    ok: failed.length === 0,
    totalPairs: pairs.length,
    syncedPairs: results.length - failed.length,
    failedPairs: failed.length,
    results,
  }, failed.length === 0 ? 200 : 207);
});
