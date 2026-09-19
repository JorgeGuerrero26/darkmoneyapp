import type {
  AssistantDraft,
  BudgetDraft,
  ObligationDraft,
  RecurringDraft,
} from "../../../services/queries/assistant";

export type DraftStatus = "pending" | "saved" | "discarded";

/** Lo que un turno del asistente propuso, y en qué quedó. */
export type DraftTurn = {
  draft?: AssistantDraft | null;
  budgetDraft?: BudgetDraft | null;
  obligationDraft?: ObligationDraft | null;
  recurringDraft?: RecurringDraft | null;
  draftStatus?: DraftStatus;
};

const OPERACION: Record<AssistantDraft["operation"], string> = {
  expense: "gasto",
  income: "ingreso",
  transfer: "transferencia",
  pay_subscription: "pago de suscripción",
  pay_debt: "pago de deuda",
};

const DESENLACE: Record<DraftStatus, string> = {
  saved: "el usuario lo GUARDÓ",
  discarded: "el usuario lo DESCARTÓ",
  pending: "sigue SIN CONFIRMAR",
};

const monto = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

/** Une las partes que existen, sin dejar separadores huérfanos cuando alguna es nula. */
const partes = (valores: Array<string | null | undefined>) =>
  valores.filter((v): v is string => Boolean(v && v.trim())).join(" · ");

function describirMovimiento(d: AssistantDraft): string {
  const cuentas = d.operation === "transfer" && d.destinationAccountName
    ? `${d.accountName ?? "?"} → ${d.destinationAccountName}`
    : d.accountName;
  return partes([
    `${OPERACION[d.operation]} ${monto(d.amount, d.currency)}`,
    cuentas,
    d.categoryName,
    d.counterpartyName,
    d.subscriptionName,
    d.obligationCounterparty,
    d.occurredAt,
    d.description ? `"${d.description}"` : null,
    d.missing.length > 0 ? `falta: ${d.missing.join(", ")}` : null,
  ]);
}

/**
 * Describe en una línea lo que el asistente propuso en un turno.
 *
 * Devuelve `null` si ese turno no propuso nada — así el llamador no inventa anotaciones vacías.
 */
export function describeDraftTurn(turn: DraftTurn): string | null {
  if (turn.draft) return describirMovimiento(turn.draft);
  if (turn.budgetDraft) {
    const b = turn.budgetDraft;
    return partes([`presupuesto "${b.name}" ${monto(b.limitAmount, b.currency)}`, b.categoryName, `${b.periodStart}→${b.periodEnd}`]);
  }
  if (turn.obligationDraft) {
    const o = turn.obligationDraft;
    const sentido = o.direction === "receivable" ? "me deben" : "yo debo";
    return partes([`${sentido} "${o.title}" ${monto(o.principalAmount, o.currency)}`, o.counterpartyName, o.planSummary]);
  }
  if (turn.recurringDraft) {
    const r = turn.recurringDraft;
    const tipo = r.kind === "subscription" ? "suscripción" : "ingreso fijo";
    return partes([`${tipo} "${r.name}" ${monto(r.amount, r.currency)}`, r.frequency, r.accountName, r.categoryName]);
  }
  return null;
}

/**
 * Añade al texto de un turno la memoria de lo que propuso y en qué quedó.
 *
 * Existe porque el asistente era **ciego a sus propios actos**. Al servidor solo viajaban `role`
 * y `content`: ni el borrador ni si el usuario lo guardó. Así que tras registrar un gasto y pedirle
 * lo que faltaba, el modelo no tenía delante ni lo que había propuesto ni que ya estaba guardado —
 * y volvía a ofrecer la misma tarjeta. No era falta de inteligencia: era falta de memoria.
 *
 * La anotación va SOLO en el historial que se manda; lo que se ve en pantalla no cambia.
 */
export function annotateAssistantTurn(content: string, turn: DraftTurn): string {
  const descripcion = describeDraftTurn(turn);
  if (!descripcion) return content;
  const desenlace = DESENLACE[turn.draftStatus ?? "pending"];
  const nota = `[Propuse: ${descripcion} — ${desenlace}]`;
  return content.trim() ? `${content}\n${nota}` : nota;
}
