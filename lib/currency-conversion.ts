/**
 * Conversión de moneda de paridad. Re-exporta la fuente de verdad desde
 * @darkmoney/shared para no mantener una copia duplicada en el móvil.
 */

export type { ConvertParityAmountInput } from "@darkmoney/shared/currency";
export { convertParityAmount, resolveParityRate } from "@darkmoney/shared/currency";
