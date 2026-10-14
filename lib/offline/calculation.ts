/** Una réplica solo puede reemplazar al servidor con beta, datos completos y paridad verificada. */
export type CalculationGate = { enabled: boolean; hydrated: boolean; parityVerified: boolean; serverEffectsPending: boolean };
export type CalculationResult<T> = { source: "local" | "server"; value: T; reason?: string };

export function selectCalculation<T>(gate: CalculationGate, server: T, compute: () => T): CalculationResult<T> {
  if (!gate.enabled || !gate.hydrated || !gate.parityVerified || gate.serverEffectsPending) return { source: "server", value: server };
  try {
    return { source: "local", value: compute() };
  } catch (error) {
    return { source: "server", value: server, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Aritmética decimal: redondeo de PostgreSQL (los empates se alejan de cero). */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("El divisor debe ser positivo.");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  const integer = absolute / denominator;
  return sign * (integer + (absolute % denominator * 2n >= denominator ? 1n : 0n));
}

export function decimalRatio(value: unknown): [bigint, bigint] {
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error("El decimal no es válido.");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return [(BigInt(whole) * denominator + BigInt(fraction || "0")) * (text.startsWith("-") ? -1n : 1n), denominator];
}

export function centsText(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
