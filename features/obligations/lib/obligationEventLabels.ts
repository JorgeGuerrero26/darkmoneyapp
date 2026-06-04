export const ANALYTICS_EVENT_LABELS: Record<string, string> = {
  opening: "Apertura",
  payment: "Pago",
  principal_increase: "Aumento de capital",
  principal_decrease: "Reducción de capital",
  interest: "Interés",
  fee: "Cargo",
  discount: "Descuento",
  adjustment: "Ajuste",
  writeoff: "Castigo",
};

export const ANALYTICS_EDITABLE_TYPES = new Set([
  "payment",
  "principal_increase",
  "principal_decrease",
]);
