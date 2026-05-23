import { sortByName } from "../../../lib/sort-locale";
import type { AccountSummary, CategoryKind, CategorySummary, ExchangeRateSummary, MovementType } from "../../../types/domain";

export type DetectedAmount = {
  amount: number;
  currencyCode: string;
};

export type ResolvedExchangeRate = {
  rate: number;
  effectiveAt: string | null;
  source: "same_currency" | "direct" | "inverse" | "base_cross";
};

export type ConvertedDetectedAmount = {
  amount: number;
  currencyCode: string;
  originalAmount: number;
  originalCurrencyCode: string;
  exchangeRate: ResolvedExchangeRate | null;
  converted: boolean;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCurrencyCode(value?: string | null, fallback = "PEN") {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : fallback.trim().toUpperCase();
}

export function parseDetectedAmountLabel(amountLabel?: string | null): DetectedAmount | null {
  if (!amountLabel) return null;
  const currencyCode = /usd|us\$|\$/i.test(amountLabel) && !/S\//i.test(amountLabel) ? "USD" : "PEN";
  const match = amountLabel.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? { amount, currencyCode } : null;
}

export function categoryKindForMovementType(movementType: MovementType | "expense" | "income" | "transfer"): CategoryKind | null {
  if (movementType === "income") return "income";
  if (movementType === "transfer") return null;
  return "expense";
}

export function filterCategoriesForMovementType(
  categories: readonly CategorySummary[],
  movementType: MovementType | "expense" | "income" | "transfer",
) {
  const kind = categoryKindForMovementType(movementType);
  if (!kind) return [];
  return sortByName(
    categories.filter((category) =>
      category.isActive && (category.kind === kind || category.kind === "both"),
    ),
  );
}

export function sortAccountsForDetectedCurrency<T extends Pick<AccountSummary, "id" | "name" | "currencyCode" | "isArchived">>(
  accounts: readonly T[],
  detectedCurrencyCode?: string | null,
) {
  const detected = normalizeCurrencyCode(detectedCurrencyCode);
  const active = accounts.filter((account) => !account.isArchived);
  return sortByName(active).sort((left, right) => {
    const leftMatches = normalizeCurrencyCode(left.currencyCode) === detected;
    const rightMatches = normalizeCurrencyCode(right.currencyCode) === detected;
    if (leftMatches === rightMatches) return 0;
    return leftMatches ? -1 : 1;
  });
}

export function recommendedAccountForDetectedCurrency(
  accounts: readonly AccountSummary[],
  detectedCurrencyCode?: string | null,
  preferredAccountId?: number | null,
) {
  const ordered = sortAccountsForDetectedCurrency(accounts, detectedCurrencyCode);
  if (preferredAccountId != null) {
    const preferred = ordered.find((account) => account.id === preferredAccountId);
    if (preferred && normalizeCurrencyCode(preferred.currencyCode) === normalizeCurrencyCode(detectedCurrencyCode)) {
      return preferred;
    }
  }
  return ordered[0] ?? null;
}

function validRate(rate: ExchangeRateSummary) {
  return (
    Boolean(rate.fromCurrencyCode?.trim()) &&
    Boolean(rate.toCurrencyCode?.trim()) &&
    Number.isFinite(rate.rate) &&
    rate.rate > 0
  );
}

function latestRate(left: ExchangeRateSummary, right: ExchangeRateSummary) {
  return new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime();
}

export function resolveExchangeRate(
  exchangeRates: readonly ExchangeRateSummary[],
  fromCurrencyCode: string,
  toCurrencyCode: string,
  workspaceBaseCurrencyCode = "PEN",
): ResolvedExchangeRate | null {
  const from = normalizeCurrencyCode(fromCurrencyCode);
  const to = normalizeCurrencyCode(toCurrencyCode);
  const base = normalizeCurrencyCode(workspaceBaseCurrencyCode);
  if (from === to) return { rate: 1, effectiveAt: null, source: "same_currency" };

  const candidates = exchangeRates
    .filter(validRate)
    .filter((rate) => {
      const rateFrom = normalizeCurrencyCode(rate.fromCurrencyCode);
      const rateTo = normalizeCurrencyCode(rate.toCurrencyCode);
      return (rateFrom === from && rateTo === to) || (rateFrom === to && rateTo === from);
    })
    .sort(latestRate);

  const best = candidates[0];
  if (best) {
    const direct = normalizeCurrencyCode(best.fromCurrencyCode) === from;
    return {
      rate: direct ? best.rate : 1 / best.rate,
      effectiveAt: best.effectiveAt,
      source: direct ? "direct" : "inverse",
    };
  }

  if (from !== base && to !== base) {
    const toBase = resolveExchangeRate(exchangeRates, from, base, base);
    const baseToTarget = resolveExchangeRate(exchangeRates, base, to, base);
    if (toBase && baseToTarget) {
      return {
        rate: toBase.rate * baseToTarget.rate,
        effectiveAt: toBase.effectiveAt ?? baseToTarget.effectiveAt,
        source: "base_cross",
      };
    }
  }

  return null;
}

export function convertDetectedAmountForAccount(input: {
  amount: number;
  detectedCurrencyCode: string;
  accountCurrencyCode: string;
  exchangeRates: readonly ExchangeRateSummary[];
  workspaceBaseCurrencyCode?: string | null;
}): ConvertedDetectedAmount {
  const originalCurrencyCode = normalizeCurrencyCode(input.detectedCurrencyCode);
  const accountCurrencyCode = normalizeCurrencyCode(input.accountCurrencyCode);
  const exchangeRate = resolveExchangeRate(
    input.exchangeRates,
    originalCurrencyCode,
    accountCurrencyCode,
    input.workspaceBaseCurrencyCode ?? "PEN",
  );
  const rate = exchangeRate?.rate ?? 1;
  return {
    amount: roundMoney(input.amount * rate),
    currencyCode: accountCurrencyCode,
    originalAmount: input.amount,
    originalCurrencyCode,
    exchangeRate,
    converted: originalCurrencyCode !== accountCurrencyCode && Boolean(exchangeRate),
  };
}

export function cleanDetectedMerchantName(value?: string | null) {
  const raw = value
    ?.replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, "")
    ?? "";
  if (!raw) return "";

  const normalized = raw
    .replace(/\*/g, " ")
    .replace(/\b(SUBSCR|SUBSCRIPTION|SUSCRIPCION|SUSCRIPCIÓN|RECURRING|RECURRENTE|COMPRA|CONSUMO|PAGO)\b/gi, " ")
    .replace(/\b(VISA|MASTERCARD|MC|POS|PAYU|PAGOEFECTIVO)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, "");

  const aliases: Array<[RegExp, string]> = [
    [/\b(OPENAI\s+)?CHAT\s*GPT\b/i, "ChatGPT"],
    [/\bOPENAI\b/i, "OpenAI"],
    [/\bNETFLIX\b/i, "Netflix"],
    [/\bSPOTIFY\b/i, "Spotify"],
    [/\bAPPLE\b/i, "Apple"],
    [/\bGOOGLE\b/i, "Google"],
    [/\bAMAZON\b/i, "Amazon"],
  ];
  for (const [pattern, label] of aliases) {
    if (pattern.test(normalized)) return label;
  }

  return normalized
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    .slice(0, 48);
}

export function extractMerchantFromFinancialEmail(value?: string | null) {
  if (!value) return "";
  const head = value.slice(0, 700);
  const patterns = [
    /\bEmpresa\s*[:\t ]+\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})/i,
    /\bComercio\s*[:\t ]+\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})/i,
    /\bEstablecimiento\s*[:\t ]+\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})/i,
    /\ben\s+([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})(?:[.,\n\r]|$)/i,
  ];
  for (const pattern of patterns) {
    const raw = pattern.exec(head)?.[1]
      ?.replace(/\s+(Monto|Datos|Operaci[oó]n|Fecha|N[uú]mero|Por tu seguridad).*$/i, "")
      .trim();
    const merchant = cleanDetectedMerchantName(raw);
    if (merchant.length >= 3) return merchant;
  }
  return "";
}

export function cleanDetectedMovementDescription(input: {
  rawDescription?: string | null;
  rawNotificationText?: string | null;
  bankLabel?: string | null;
}) {
  const merchant = extractMerchantFromFinancialEmail(input.rawNotificationText)
    || cleanDetectedMerchantName(input.rawDescription);
  if (merchant) return merchant;
  const bankLabel = input.bankLabel?.trim();
  return bankLabel ? `Movimiento ${bankLabel}` : "Movimiento detectado";
}
