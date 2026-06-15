/**
 * Salud financiera unificada (web + móvil). Re-exporta la fuente de verdad
 * desde @darkmoney/shared para no mantener una copia duplicada en el móvil.
 */

export type {
  HealthTone,
  HealthIndicator,
  HealthScoreResult,
  BuildHealthScoreInput,
} from "@darkmoney/shared/health";
export { buildHealthScore } from "@darkmoney/shared/health";
