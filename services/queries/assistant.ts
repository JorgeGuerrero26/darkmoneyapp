import { createSseDataReader, parseStreamEvent } from "../../features/assistant/lib/live-reply";
import { hasNativeModule } from "../../lib/native-module";
import { invokeEdgeFunction, prepareEdgeFunctionRequest } from "./workspace-data";

/**
 * Cliente del asistente IA de consulta (edge function assistant-chat).
 * Spec: docs/superpowers/specs/2026-07-19-assistant-chat-consulta-design.md
 * La conversación es efímera: la pantalla guarda el historial en memoria y lo
 * manda como contexto; aquí no hay persistencia ni React Query.
 */

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantEvidence = {
  label: string;
  movementIds: number[];
};

export type AssistantDraft = {
  operation: "expense" | "income" | "transfer" | "pay_subscription" | "pay_debt";
  amount: number;
  currency: string;
  accountName: string | null;
  destinationAccountName: string | null;
  categoryName: string | null;
  counterpartyName: string | null;
  subscriptionId: number | null;
  subscriptionName: string | null;
  obligationId: number | null;
  obligationCounterparty: string | null;
  occurredAt: string | null;
  description: string | null;
  missing: string[];
};

export type BudgetDraft = {
  name: string;
  limitAmount: number;
  currency: string;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  alertPercent: number;
};

/** Mismo shape que `features/obligations/lib/payment-plan.ts`; se guarda tal cual. */
export type ObligationPlanDraft =
  | { mode: "equal"; count: number; firstDueDate?: string }
  | { mode: "custom"; agreed: Array<{ amount: number; dueDate?: string }>; tail: number | null; firstDueDate?: string };

export type ObligationDraft = {
  direction: "receivable" | "payable";
  title: string;
  counterpartyName: string | null;
  principalAmount: number;
  currency: string;
  startDate: string;
  dueDate: string | null;
  description: string | null;
  paymentPlan: ObligationPlanDraft | null;
  planSummary: string | null;
};

export type RecurringDraft = {
  kind: "subscription" | "recurring_income";
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number | null;
  nextDate: string;
  categoryName: string | null;
  accountName: string | null;
  description: string | null;
};

/**
 * Corrección o borrado de un gasto/ingreso ya registrado. El servidor ya validó que se puede y
 * resolvió los nombres a ids del espacio; la app solo lo muestra y, si el usuario confirma, lo
 * aplica con la edición o el borrado normales.
 */
export type MovementChange = {
  action: "update" | "delete";
  movementId: number;
  movementType: "expense" | "income";
  currency: string;
  before: {
    amount: number;
    description: string | null;
    categoryName: string | null;
    accountName: string | null;
    counterpartyName: string | null;
    date: string;
  };
  after: {
    amount?: number;
    description?: string;
    notes?: string;
    categoryId?: number;
    categoryName?: string;
    accountId?: number;
    accountName?: string;
    counterpartyId?: number;
    counterpartyName?: string;
    date?: string;
    occurredAt?: string;
  };
};

export type AssistantReply = {
  reply: string;
  evidence: AssistantEvidence[];
  /** Primero de `drafts`, o null. Se conserva porque hay pantallas que solo leen uno. */
  draft: AssistantDraft | null;
  /** Todos los movimientos propuestos en el turno: una frase puede traer varios. */
  drafts: AssistantDraft[];
  budgetDraft: BudgetDraft | null;
  obligationDraft: ObligationDraft | null;
  recurringDraft: RecurringDraft | null;
  remainingToday: number | null;
  /** Preguntas para seguir la conversación; se muestran como botones bajo la respuesta. */
  suggestions: string[];
  /** Correcciones o borrados propuestos; cada uno lleva su tarjeta para confirmar. */
  movementChanges: MovementChange[];
};

function parseDraft(raw: unknown): AssistantDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const ops = ["expense", "income", "transfer", "pay_subscription", "pay_debt"];
  const amount = Number(d.amount);
  if (typeof d.operation !== "string" || !ops.includes(d.operation) || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    operation: d.operation as AssistantDraft["operation"],
    amount,
    currency: str(d.currency) ?? "PEN",
    accountName: str(d.accountName),
    destinationAccountName: str(d.destinationAccountName),
    categoryName: str(d.categoryName),
    counterpartyName: str(d.counterpartyName),
    subscriptionId: num(d.subscriptionId),
    subscriptionName: str(d.subscriptionName),
    obligationId: num(d.obligationId),
    obligationCounterparty: str(d.obligationCounterparty),
    occurredAt: str(d.occurredAt),
    description: str(d.description),
    missing: Array.isArray(d.missing) ? d.missing.filter((m): m is string => typeof m === "string") : [],
  };
}

function parseBudgetDraft(raw: unknown): BudgetDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const limitAmount = Number(d.limitAmount);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isFinite(limitAmount) || limitAmount <= 0) return null;
  if (typeof d.periodStart !== "string" || !DATE_RE.test(d.periodStart)) return null;
  if (typeof d.periodEnd !== "string" || !DATE_RE.test(d.periodEnd)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const alert = Number(d.alertPercent);
  return {
    name: str(d.name) ?? "Presupuesto",
    limitAmount,
    currency: str(d.currency) ?? "PEN",
    categoryName: str(d.categoryName),
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    alertPercent: Number.isFinite(alert) && alert >= 1 && alert <= 100 ? alert : 80,
  };
}

function parseObligationDraft(raw: unknown): ObligationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const principalAmount = Number(d.principalAmount);
  if (d.direction !== "receivable" && d.direction !== "payable") return null;
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) return null;
  if (typeof d.startDate !== "string" || !DATE_RE.test(d.startDate)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const due = typeof d.dueDate === "string" && DATE_RE.test(d.dueDate) ? d.dueDate : null;
  return {
    direction: d.direction,
    title: str(d.title) ?? (d.direction === "receivable" ? "Crédito a favor" : "Deuda"),
    counterpartyName: str(d.counterpartyName),
    principalAmount,
    currency: str(d.currency) ?? "PEN",
    startDate: d.startDate,
    dueDate: due,
    description: str(d.description),
    // El plan llega tal cual y se vuelve a validar aquí: es lo que decide en qué mes cae cada
    // cuota, y viene de un modelo. Si no cuadra, la deuda se registra sin él en vez de guardar
    // un cronograma torcido.
    paymentPlan: parseObligationPlan(d.paymentPlan),
    planSummary: str(d.planSummary),
  };
}

function parseObligationPlan(raw: unknown): ObligationPlanDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const first = typeof d.firstDueDate === "string" && DATE_RE.test(d.firstDueDate) ? { firstDueDate: d.firstDueDate } : {};

  if (d.mode === "equal") {
    const count = Math.floor(Number(d.count));
    if (!Number.isFinite(count) || count <= 0) return null;
    return { mode: "equal", count, ...first };
  }
  if (d.mode === "custom") {
    const agreed = (Array.isArray(d.agreed) ? d.agreed : [])
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const dueDate = typeof row.dueDate === "string" && DATE_RE.test(row.dueDate) ? row.dueDate : undefined;
        return dueDate ? { amount, dueDate } : { amount };
      })
      .filter((entry): entry is { amount: number; dueDate?: string } => entry != null);
    const tailRaw = Number(d.tail);
    const tail = Number.isFinite(tailRaw) && tailRaw > 0 ? tailRaw : null;
    if (agreed.length === 0 && tail == null) return null;
    return { mode: "custom", agreed, tail, ...first };
  }
  return null;
}

function parseRecurringDraft(raw: unknown): RecurringDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const amount = Number(d.amount);
  if (d.kind !== "subscription" && d.kind !== "recurring_income") return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (typeof d.nextDate !== "string" || !DATE_RE.test(d.nextDate)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const freq = d.frequency === "weekly" || d.frequency === "yearly" ? d.frequency : "monthly";
  const day = Number(d.dayOfMonth);
  return {
    kind: d.kind,
    name: str(d.name) ?? "Recurrente",
    amount,
    currency: str(d.currency) ?? "PEN",
    frequency: freq,
    dayOfMonth: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
    nextDate: d.nextDate,
    categoryName: str(d.categoryName),
    accountName: str(d.accountName),
    description: str(d.description),
  };
}

function parseEvidence(raw: unknown): AssistantEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantEvidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, movementIds } = item as Record<string, unknown>;
    const ids = Array.isArray(movementIds)
      ? movementIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (typeof label === "string" && ids.length > 0) {
      out.push({ label, movementIds: ids });
    }
  }
  return out;
}

function parseMovementChange(raw: unknown): MovementChange | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const movementId = Number(d.movementId);
  if (d.action !== "update" && d.action !== "delete") return null;
  if (d.movementType !== "expense" && d.movementType !== "income") return null;
  if (!Number.isInteger(movementId) || movementId <= 0) return null;
  const before = (d.before && typeof d.before === "object" ? d.before : {}) as Record<string, unknown>;
  const after = (d.after && typeof d.after === "object" ? d.after : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const pos = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const parsedAfter: MovementChange["after"] = {};
  if (pos(after.amount) !== undefined) parsedAfter.amount = pos(after.amount);
  if (str(after.description)) parsedAfter.description = str(after.description)!;
  if (str(after.notes)) parsedAfter.notes = str(after.notes)!;
  if (pos(after.categoryId) !== undefined && str(after.categoryName)) {
    parsedAfter.categoryId = pos(after.categoryId);
    parsedAfter.categoryName = str(after.categoryName)!;
  }
  if (pos(after.accountId) !== undefined && str(after.accountName)) {
    parsedAfter.accountId = pos(after.accountId);
    parsedAfter.accountName = str(after.accountName)!;
  }
  if (pos(after.counterpartyId) !== undefined && str(after.counterpartyName)) {
    parsedAfter.counterpartyId = pos(after.counterpartyId);
    parsedAfter.counterpartyName = str(after.counterpartyName)!;
  }
  if (typeof after.date === "string" && DATE_RE.test(after.date) && str(after.occurredAt)) {
    parsedAfter.date = after.date;
    parsedAfter.occurredAt = str(after.occurredAt)!;
  }
  // Un update sin cambios válidos no se ofrece: la tarjeta no tendría nada que aplicar.
  if (d.action === "update" && Object.keys(parsedAfter).length === 0) return null;
  return {
    action: d.action,
    movementId,
    movementType: d.movementType,
    currency: str(d.currency) ?? "PEN",
    before: {
      amount: Number(before.amount) || 0,
      description: str(before.description),
      categoryName: str(before.categoryName),
      accountName: str(before.accountName),
      counterpartyName: str(before.counterpartyName),
      date: typeof before.date === "string" ? before.date : "",
    },
    after: parsedAfter,
  };
}

function parseSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 3);
}

/** El JSON de la respuesta (directo o en el evento `done`) ya validado. */
function parseAssistantPayload(response: Record<string, unknown>): AssistantReply {
  if (response.ok === false) {
    throw new Error(String(response.error ?? "No se pudo responder. Inténtalo de nuevo."));
  }

  /* El servidor manda `drafts` (lista) y `draft` (el primero, por compatibilidad). Se lee la
     lista y se cae al campo suelto si la respuesta viene de una versión anterior del servidor:
     así un cliente al día sigue funcionando contra un despliegue viejo. */
  const drafts = Array.isArray(response.drafts)
    ? response.drafts.map(parseDraft).filter((d): d is AssistantDraft => d !== null)
    : [];
  const primero = parseDraft(response.draft);
  const todos = drafts.length > 0 ? drafts : primero ? [primero] : [];

  return {
    reply: String(response.reply ?? ""),
    evidence: parseEvidence(response.evidence),
    draft: todos[0] ?? null,
    drafts: todos,
    budgetDraft: parseBudgetDraft(response.budgetDraft),
    obligationDraft: parseObligationDraft(response.obligationDraft),
    recurringDraft: parseRecurringDraft(response.recurringDraft),
    remainingToday:
      typeof response.remainingToday === "number" ? response.remainingToday : null,
    suggestions: parseSuggestions(response.suggestions),
    movementChanges: Array.isArray(response.movementChanges)
      ? response.movementChanges.map(parseMovementChange).filter((c): c is MovementChange => c !== null)
      : [],
  };
}

type AskInput = {
  message: string;
  history: AssistantChatMessage[];
  workspaceId: number;
};

export async function askAssistant(input: AskInput): Promise<AssistantReply> {
  const response = await invokeEdgeFunction<Record<string, unknown>>("assistant-chat", {
    message: input.message,
    history: input.history,
    workspaceId: input.workspaceId,
  });
  return parseAssistantPayload(response);
}

export type AssistantStreamHandlers = {
  /** Qué está consultando el servidor (null = pensando). */
  onStatus: (tool: string | null) => void;
  /** Un trozo nuevo de la respuesta. */
  onDelta: (text: string) => void;
  /** Borrar lo mostrado: el servidor reintenta o pasó a consultar datos. */
  onReset: () => void;
};

/** Tope de toda la respuesta en vivo; el servidor manda un latido cada 10 s. */
const STREAM_TIMEOUT_MS = 150_000;

type StreamingFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
}>;

/**
 * El `fetch` de Expo, que sí deja leer la respuesta mientras llega (el de React Native la
 * entrega entera al final). Se carga con `require` protegido: si un binario no lo tuviera, el
 * asistente sigue funcionando por el camino de siempre, solo que sin texto en vivo.
 */
function loadStreamingFetch(): StreamingFetch | null {
  if (typeof TextDecoder === "undefined") return null;
  // Antes del require: sin esto, un binario sin el módulo nativo se CIERRA (ver lib/native-module.ts).
  if (!hasNativeModule("ExpoFetchModule")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo/fetch") as { fetch?: StreamingFetch };
    return typeof mod.fetch === "function" ? mod.fetch : null;
  } catch {
    return null;
  }
}

/**
 * Pregunta al asistente y va contando lo que pasa: qué consulta y el texto a medida que se
 * escribe. Devuelve lo mismo que `askAssistant`; el evento final manda sobre lo mostrado.
 *
 * `signal` es el botón Detener: corta la conexión y el servidor deja de trabajar sin cobrar la
 * pregunta. Quien llama sabe que detuvo, así que el error de esa cancelación lo ignora.
 */
export async function streamAssistant(
  input: AskInput,
  handlers: AssistantStreamHandlers,
  signal: AbortSignal,
): Promise<AssistantReply> {
  const streamingFetch = loadStreamingFetch();
  if (!streamingFetch) return askAssistant(input);

  const body = { message: input.message, history: input.history, workspaceId: input.workspaceId };
  const request = await prepareEdgeFunctionRequest("assistant-chat", body);

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort);
  const timeout = setTimeout(abort, STREAM_TIMEOUT_MS);

  try {
    let response: Awaited<ReturnType<StreamingFetch>>;
    try {
      response = await streamingFetch(request.endpoint, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({ ...body, stream: true }),
        signal: controller.signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (controller.signal.aborted) throw new Error("La respuesta tardó demasiado. Intenta de nuevo.");
      throw new Error("No pudimos conectarnos al servidor. Revisa tu internet e intenta de nuevo.");
    }

    // Sesión vencida justo ahora: el camino de siempre sabe renovarla y reintentar.
    if (response.status === 401) return askAssistant(input);

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/event-stream") || !response.body) {
      // Pro, cupo agotado o un error antes de empezar: llegan como JSON, igual que siempre.
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok && json.ok !== false) {
        throw new Error("No se pudo responder. Inténtalo de nuevo.");
      }
      return parseAssistantPayload(json);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const lines = createSseDataReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const data of lines.push(decoder.decode(value, { stream: true }))) {
        const event = parseStreamEvent(data);
        if (!event) continue;
        if (event.type === "status") handlers.onStatus(event.tool);
        else if (event.type === "delta") handlers.onDelta(event.text);
        else if (event.type === "reset") handlers.onReset();
        else if (event.type === "error") throw new Error(event.error);
        else if (event.type === "done") return parseAssistantPayload(event.payload);
      }
    }
    throw new Error("La respuesta se cortó. Intenta de nuevo.");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
