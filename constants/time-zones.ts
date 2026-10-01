import { DEFAULT_TIME_ZONE } from "../lib/calendar-day";

export type TimeZoneOption = { id: string; label: string };

/**
 * Zonas que se ofrecen en Configuración. Lista corta a propósito: Latinoamérica, más donde suele
 * viajar o vivir alguien que usa la app. Si el perfil ya trae otra zona válida (p. ej. puesta
 * desde la web), se muestra igual como opción para no perderla.
 *
 * Sin el desfase ("UTC−5") en la etiqueta: Santiago, Nueva York o Madrid cambian de hora en el
 * año y un número fijo mentiría la mitad del tiempo.
 */
export const TIME_ZONE_OPTIONS: TimeZoneOption[] = [
  { id: DEFAULT_TIME_ZONE, label: "Perú (Lima)" },
  { id: "America/Bogota", label: "Colombia (Bogotá)" },
  { id: "America/Guayaquil", label: "Ecuador (Guayaquil)" },
  { id: "America/La_Paz", label: "Bolivia (La Paz)" },
  { id: "America/Santiago", label: "Chile (Santiago)" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { id: "America/Asuncion", label: "Paraguay (Asunción)" },
  { id: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { id: "America/Caracas", label: "Venezuela (Caracas)" },
  { id: "America/Panama", label: "Panamá" },
  { id: "America/Costa_Rica", label: "Costa Rica" },
  { id: "America/Mexico_City", label: "México (Ciudad de México)" },
  { id: "America/New_York", label: "EE. UU. (Nueva York)" },
  { id: "America/Chicago", label: "EE. UU. (Chicago)" },
  { id: "America/Los_Angeles", label: "EE. UU. (Los Ángeles)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
  { id: "Europe/London", label: "Reino Unido (Londres)" },
];

export function timeZoneLabel(id: string): string {
  return TIME_ZONE_OPTIONS.find((option) => option.id === id)?.label ?? id.replace(/_/g, " ");
}
