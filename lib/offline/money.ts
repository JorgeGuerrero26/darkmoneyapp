/** Decimal exacto para JSON; nunca pasa por un REAL de SQLite. */
export function moneyText(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error("El monto no es un decimal válido.");
  return text;
}

/** null = fracción de centavo o valor que no cabe exactamente en un entero de JS. */
export function exactCents(value: unknown): number | null {
  const text = moneyText(value);
  if (text == null) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  if (/[1-9]/.test(fraction.slice(2))) return null;
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  const result = Number(negative ? -cents : cents);
  return Number.isSafeInteger(result) ? result : null;
}

const MONEY_FIELDS = ["opening_balance", "credit_limit", "amount", "expected_amount", "gross_amount", "limit_amount", "principal_amount", "installment_amount",
  "monthly_savings_target", "source_amount", "destination_amount"];

export function mirrorMoney(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const field of MONEY_FIELDS) if (field in next) next[field] = moneyText(next[field]);
  if (Array.isArray(next.deductions)) next.deductions = next.deductions.map((item) => {
    if (!item || typeof item !== "object") return item;
    return { ...item, amount: moneyText(item.amount) };
  });
  if (Array.isArray(next.scheduled_changes)) next.scheduled_changes = next.scheduled_changes.map((item) => {
    if (!item || typeof item !== "object") return item;
    return { ...item, amount: moneyText(item.amount) };
  });
  return next;
}

export function assertWritableMoney(row: Record<string, unknown>): void {
  const normal = mirrorMoney(row);
  const check = (value: unknown) => {
    if (value != null && value !== "" && exactCents(value) == null) throw new Error("Este monto tiene una fracción de centavo. Solo puedes consultarlo sin conexión.");
  };
  for (const field of MONEY_FIELDS) check(normal[field]);
  for (const field of ["deductions", "scheduled_changes"]) {
    if (Array.isArray(normal[field])) for (const item of normal[field]) if (item && typeof item === "object") check(item.amount);
  }
}
