/**
 * Catálogo cliente de instituciones financieras conocidas. Vive en código (no
 * en DB) para que añadir bancos / fintechs no requiera migration. La columna
 * `accounts.institution_code` guarda el slug; este módulo lo resuelve a un
 * objeto con nombre legible, color de marca e iniciales para badges.
 *
 * Si en el futuro queremos logos bitmap, este catálogo es el único lugar que
 * hay que tocar.
 */

export type AccountInstitution = {
  /** Slug almacenado en `accounts.institution_code`. */
  code: string;
  /** Nombre legible para mostrar en la UI. */
  label: string;
  /** Iniciales 1-2 chars para el avatar. */
  initials: string;
  /** Color HEX de marca (fondo del badge). */
  brandColor: string;
  /** Países donde opera (filtro futuro en el picker; informativo por ahora). */
  countries: readonly string[];
};

/**
 * Catálogo ordenado: Perú primero (mercado primario), luego LATAM y globales.
 * Cuando se agregue un código nuevo, conservar el slug en minúsculas y sin
 * acentos — es lo que se guarda en DB.
 */
export const ACCOUNT_INSTITUTIONS: readonly AccountInstitution[] = [
  // Perú
  { code: "bcp",         label: "BCP",            initials: "BCP", brandColor: "#0033A0", countries: ["PE"] },
  { code: "interbank",   label: "Interbank",      initials: "IB",  brandColor: "#00A859", countries: ["PE"] },
  { code: "bbva-pe",     label: "BBVA Perú",      initials: "BB",  brandColor: "#004481", countries: ["PE"] },
  { code: "scotiabank",  label: "Scotiabank",     initials: "SB",  brandColor: "#EC111A", countries: ["PE", "CL", "MX"] },
  { code: "banbif",      label: "BanBif",         initials: "BI",  brandColor: "#E30613", countries: ["PE"] },
  { code: "pichincha",   label: "Pichincha",      initials: "BP",  brandColor: "#FFC107", countries: ["PE", "EC"] },
  { code: "yape",        label: "Yape",           initials: "YA",  brandColor: "#7B2D8E", countries: ["PE"] },
  { code: "plin",        label: "Plin",           initials: "PL",  brandColor: "#3CB4E5", countries: ["PE"] },
  { code: "tunki",       label: "Tunki",          initials: "TU",  brandColor: "#00B894", countries: ["PE"] },
  // LATAM
  { code: "bbva",        label: "BBVA",           initials: "BB",  brandColor: "#004481", countries: ["MX", "ES", "AR"] },
  { code: "santander",   label: "Santander",      initials: "SA",  brandColor: "#EC0000", countries: ["MX", "AR", "CL", "BR"] },
  { code: "banamex",     label: "Banamex",        initials: "BX",  brandColor: "#013484", countries: ["MX"] },
  { code: "mercadopago", label: "Mercado Pago",   initials: "MP",  brandColor: "#00B1EA", countries: ["AR", "MX", "BR"] },
  { code: "nubank",      label: "Nubank",         initials: "NU",  brandColor: "#820AD1", countries: ["BR", "MX", "CO"] },
  { code: "rappi",       label: "RappiPay",       initials: "RP",  brandColor: "#FF441F", countries: ["CO", "MX", "BR"] },
  // Global
  { code: "paypal",      label: "PayPal",         initials: "PP",  brandColor: "#003087", countries: ["GLOBAL"] },
  { code: "wise",        label: "Wise",           initials: "WI",  brandColor: "#9FE870", countries: ["GLOBAL"] },
  { code: "revolut",     label: "Revolut",        initials: "RE",  brandColor: "#000000", countries: ["GLOBAL"] },
  { code: "binance",     label: "Binance",        initials: "BN",  brandColor: "#F0B90B", countries: ["GLOBAL"] },
  // Genérica
  { code: "other-bank",  label: "Otro banco",     initials: "🏦",  brandColor: "#6b7280", countries: ["GLOBAL"] },
];

const BY_CODE = new Map(ACCOUNT_INSTITUTIONS.map((i) => [i.code, i]));

/**
 * Resuelve un código almacenado en DB a su entrada del catálogo. Returns
 * `null` si el código no está registrado (p. ej. fue removido del catálogo
 * pero quedó persistido en alguna cuenta) — los consumidores deben tratarlo
 * como "sin institución" para evitar romper la UI.
 */
export function findInstitution(code: string | null | undefined): AccountInstitution | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}
