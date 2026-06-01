export const EVENT_LABEL_PAYABLE: Record<string, string> = {
  opening: "Apertura",
  payment: "Pago",
  principal_increase: "Aumento de capital",
  principal_decrease: "Reduccion de capital",
  interest: "Interes",
  fee: "Cargo",
  discount: "Descuento",
  adjustment: "Ajuste",
  writeoff: "Castigo",
};

export const EVENT_TYPE_ICON: Record<string, string> = {
  opening: "◎",
  payment: "↕",
  principal_increase: "+",
  principal_decrease: "−",
  interest: "%",
  fee: "!",
  discount: "↓",
  adjustment: "~",
  writeoff: "×",
};

const PILL_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function eventDatePillLabel(dateStr: string, todayStr: string): string {
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [ey, em, ed] = dateStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const eventMs = Date.UTC(ey, em - 1, ed);
  const diffDays = Math.round((todayMs - eventMs) / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return `${ed} ${PILL_MONTHS[em - 1]} ${ey}`;
}
