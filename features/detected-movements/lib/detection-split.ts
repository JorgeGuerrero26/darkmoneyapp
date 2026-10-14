export type DetectedSplitJson = null | string | number | boolean | DetectedSplitJson[] | { [key: string]: DetectedSplitJson };
export type DetectedSplitHeader = {
  movementType: "expense" | "income"; accountId: number; currencyCode: string; amount: number;
  description: string; occurredAt: string; notes?: string | null; counterpartyId?: number | null;
  metadata?: { [key: string]: DetectedSplitJson } | null;
  subscriptionId?: number | null; recurringIncomeId?: number | null;
};
export type DetectedSplitPart = { amount: number; categoryId: number; spendTypeId?: number | null };
export type DetectedSplitInput = {
  workspaceId: number; suggestionId: number; expectedUpdatedAt: string;
  header: DetectedSplitHeader; parts: DetectedSplitPart[];
};
export type DetectedSplitResult = {
  workspaceId: number; suggestionId: number; status: "registered";
  movementId: number; movementIds: number[]; alreadyRegistered: boolean;
};
type SplitClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};
const invalid = "Revisa el encabezado y las partes de la división. No se envió ningún registro.";
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 999999999999.99 ||
      !/^[0-9]+(\.[0-9]{1,2})?$/.test(String(value))) throw new Error(invalid);
  return Math.round(value * 100);
}
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = m;
  return Number(year) >= 1000 && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 &&
    Number(day) <= new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate() &&
    Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 &&
    (!offsetHour || (Number(offsetHour) <= 14 && Number(offsetMinute) <= 59 &&
      (Number(offsetHour) < 14 || Number(offsetMinute) === 0)));
}
function json(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if ((!object(value) && !Array.isArray(value)) || seen.has(value) || depth > 40) return false;
  seen.add(value);
  const valid = Object.values(value).every(item => json(item, seen, depth + 1));
  seen.delete(value);
  return valid;
}

/** Phase 1 deliberately refuses recurring/subscription links until aggregate occurrences are implemented. */
export function validateDetectedSplit(input: DetectedSplitInput): void {
  if (!object(input) || !id(input.workspaceId) || !id(input.suggestionId) || !timestamp(input.expectedUpdatedAt) ||
      !object(input.header) || !Array.isArray(input.parts) || input.parts.length < 2 || input.parts.length > 100) throw new Error(invalid);
  const h = input.header;
  const fields = ["movementType", "accountId", "currencyCode", "amount", "description", "occurredAt", "notes", "counterpartyId", "metadata", "subscriptionId", "recurringIncomeId"];
  if (Object.keys(h).some(key => !fields.includes(key)) ||
      !["expense", "income"].includes(h.movementType) || !id(h.accountId) ||
      typeof h.currencyCode !== "string" || !/^[A-Z]{3}$/.test(h.currencyCode) ||
      typeof h.description !== "string" || !h.description.trim() || !timestamp(h.occurredAt) ||
      (h.notes != null && typeof h.notes !== "string") || (h.counterpartyId != null && !id(h.counterpartyId)) ||
      (h.metadata != null && (!object(h.metadata) || !json(h.metadata)))) throw new Error(invalid);
  const meta = h.metadata ?? {};
  if (h.subscriptionId != null || h.recurringIncomeId != null || meta.recurring_income_id != null || meta.subscriptionId != null ||
      "obligation_event_id" in meta || "obligationEventId" in meta) {
    throw new Error("La división vinculada requiere el contrato de cobro agrupado. No se envió ningún registro.");
  }
  const total = cents(h.amount), categories = new Set<number>();
  let sum = 0;
  for (const part of input.parts) {
    if (!object(part) || Object.keys(part).some(key => !["amount", "categoryId", "spendTypeId"].includes(key)) ||
        !id(part.categoryId) || categories.has(part.categoryId) ||
        (part.spendTypeId != null && (h.movementType !== "expense" || !id(part.spendTypeId)))) throw new Error(invalid);
    categories.add(part.categoryId); sum += cents(part.amount);
  }
  if (!Number.isSafeInteger(sum) || sum !== total) throw new Error("La suma de las partes debe coincidir exactamente con el total.");
}

/** One transaction. Missing RPC, timeout or invalid response never fall back to individual inserts. */
export async function requestDetectedSplit(client: SplitClient, input: DetectedSplitInput): Promise<DetectedSplitResult> {
  validateDetectedSplit(input);
  // Capture the entire request before awaiting: caller edits cannot change result validation.
  const request = JSON.parse(JSON.stringify(input)) as DetectedSplitInput;
  const { data, error } = await client.rpc("register_detected_movement_split", {
    p_workspace_id: request.workspaceId, p_suggestion_id: request.suggestionId,
    p_expected_updated_at: request.expectedUpdatedAt, p_header: request.header, p_parts: request.parts,
  });
  if (error?.code === "PGRST202" || error?.code === "42883") {
    throw new Error("El servidor aún no permite divisiones atómicas. No se usará el guardado por partes; falta desplegar el contrato.");
  }
  if (error) throw new Error(error.message || "No se pudo confirmar la división. Actualiza o reintenta la misma operación.");
  const ids = object(data) ? data.movementIds : null;
  if (!object(data) || data.workspaceId !== request.workspaceId || data.suggestionId !== request.suggestionId ||
      data.status !== "registered" || !id(data.movementId) || typeof data.alreadyRegistered !== "boolean" ||
      !Array.isArray(ids) || ids.length !== request.parts.length || !ids.every(id) ||
      new Set(ids).size !== ids.length || ids[0] !== data.movementId) {
    throw new Error("No se pudo confirmar la división. Actualiza o reintenta la misma operación; no crees partes sueltas.");
  }
  return { workspaceId: request.workspaceId, suggestionId: request.suggestionId, status: "registered",
    movementId: data.movementId, movementIds: ids, alreadyRegistered: data.alreadyRegistered };
}
