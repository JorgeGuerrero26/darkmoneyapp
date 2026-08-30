import { sortByLabel } from "../../../lib/sort-locale";
import { COLORS } from "../../../constants/theme";

// Preset por tipo de cuenta (ícono y color por defecto). Se aplica al cambiar de tipo mientras
// el usuario no haya elegido los suyos a mano.
// Los siete presets usan los mismos seis tonos que el selector de apariencia. Antes eran hex
// sueltos —incluido un violeta, que en el sistema significa IA— que no salian en ninguna otra
// pantalla: un color de cuenta es una etiqueta para reconocerla, no decoracion libre.
export const TYPE_PRESETS: Record<string, { icon: string; color: string }> = {
  cash:        { icon: "banknote",    color: COLORS.gold },
  bank:        { icon: "landmark",    color: COLORS.ember },
  savings:     { icon: "piggy-bank",  color: COLORS.pine },
  credit_card: { icon: "credit-card", color: COLORS.dangerStrong },
  investment:  { icon: "trending-up", color: COLORS.pine },
  loan:        { icon: "briefcase",   color: COLORS.dangerSoft },
  other:       { icon: "wallet",      color: COLORS.neutral },
};

export const ACCOUNT_TYPES = sortByLabel([
  { label: "Efectivo", value: "cash" },
  { label: "Banco", value: "bank" },
  { label: "Ahorro", value: "savings" },
  { label: "Tarjeta", value: "credit_card" },
  { label: "Inversión", value: "investment" },
  { label: "Préstamo", value: "loan" },
  { label: "Otro", value: "other" },
]);

export function accountTypeLabel(value: string) {
  return ACCOUNT_TYPES.find((t) => t.value === value)?.label ?? value;
}
