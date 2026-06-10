import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { fetchLiveExchangeRate, type LiveExchangeRate } from "../../lib/exchange-rate-providers";

type NumericLike = number | string | null;

function toNum(val: NumericLike): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export type ExchangeRateRecord = {
  id: number;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  source: string | null;
  notes: string | null;
  isPinned: boolean;
};

export function useExchangeRatesQuery() {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("id, from_currency_code, to_currency_code, rate, effective_at, source, notes, is_pinned")
        .order("effective_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: any) => ({
        id: row.id as number,
        fromCurrencyCode: row.from_currency_code as string,
        toCurrencyCode: row.to_currency_code as string,
        rate: toNum(row.rate),
        effectiveAt: row.effective_at as string,
        source: row.source as string | null,
        notes: row.notes as string | null,
        isPinned: (row.is_pinned ?? false) as boolean,
      })) as ExchangeRateRecord[];
    },
  });
}

export function useCreateExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromCurrencyCode: string; toCurrencyCode: string; rate: number; notes?: string }) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase.from("exchange_rates").insert({
        from_currency_code: input.fromCurrencyCode.toUpperCase().trim(),
        to_currency_code: input.toCurrencyCode.toUpperCase().trim(),
        rate: input.rate,
        effective_at: new Date().toISOString(),
        source: "manual",
        notes: input.notes?.trim() ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useUpdateExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      fromCurrencyCode: string;
      toCurrencyCode: string;
      rate: number;
      notes?: string;
    }) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase
        .from("exchange_rates")
        .update({
          from_currency_code: input.fromCurrencyCode.toUpperCase().trim(),
          to_currency_code: input.toCurrencyCode.toUpperCase().trim(),
          rate: input.rate,
          effective_at: new Date().toISOString(),
          source: "manual",
          notes: input.notes?.trim() ?? null,
        })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

async function upsertExchangeRateRow(input: {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
  source: string;
  notes: string | null;
}) {
  if (!supabase) throw new Error("Supabase no configurado");
  const from = input.fromCurrencyCode.toUpperCase().trim();
  const to = input.toCurrencyCode.toUpperCase().trim();
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

export function useSyncExchangeRatePairMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromCurrencyCode: string; toCurrencyCode: string }) => {
      const liveRate = await fetchLiveExchangeRate(input.fromCurrencyCode, input.toCurrencyCode);
      const from = liveRate.fromCurrencyCode.toUpperCase().trim();
      const to = liveRate.toCurrencyCode.toUpperCase().trim();
      const source = `api:${liveRate.provider}`;

      const directId = await upsertExchangeRateRow({
        fromCurrencyCode: from,
        toCurrencyCode: to,
        rate: liveRate.rate,
        effectiveAt: liveRate.effectiveAt,
        source,
        notes: "Sincronizado automáticamente",
      });

      const inverseRate = 1 / liveRate.rate;
      let inverseId: number | null = null;
      if (Number.isFinite(inverseRate) && inverseRate > 0) {
        inverseId = await upsertExchangeRateRow({
          fromCurrencyCode: to,
          toCurrencyCode: from,
          rate: inverseRate,
          effectiveAt: liveRate.effectiveAt,
          source,
          notes: `Inverso calculado desde ${from}→${to}`,
        });
      }

      return {
        ...liveRate,
        directId,
        inverseId,
      } satisfies LiveExchangeRate & { directId: number; inverseId: number | null };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useDeleteExchangeRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    },
  });
}

export function useToggleExchangeRatePinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: number; isPinned: boolean }) => {
      if (!supabase) throw new Error("Supabase no configurado");
      const { error } = await supabase
        .from("exchange_rates")
        .update({ is_pinned: isPinned })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
  });
}
