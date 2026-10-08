import { buildDedupeKey, extractAliasToken, extractSenderAddress, htmlToText, parseReceiptEmail } from "./logic.ts";
import type { ReceivedEmail, ReceivedEvent } from "./resend.ts";
import type { AiReceipt, AiReceiptInput, ReceiptCategory } from "./ai.ts";

export type Alias = { user_id: string; workspace_id: number };
export type Suggestion = {
  id: number; status: string; amount: number; currency_code: string;
  description: string; app_label: string; created_at: string;
};
export type SuggestionInput = Alias & {
  financial_app_key: string; package_name: string; app_label: string;
  movement_type: string; amount: number; currency_code: string; description: string;
  occurred_at: string; confidence: string; dedupe_key: string; status: "pending" | "needs_review";
  metadata: Record<string, unknown>;
};
export type InboundRepository = {
  resolveAlias(token: string): Promise<Alias | null>;
  hasProAccess(userId: string): Promise<boolean>;
  findSuggestion(alias: Alias, emailId: string): Promise<Suggestion | null>;
  listCategories(workspaceId: number): Promise<ReceiptCategory[]>;
  saveSuggestion(input: SuggestionInput): Promise<Suggestion>;
  ensureNotification(userId: string, suggestion: Suggestion): Promise<void>;
};

/** Separado del transporte para probar reintentos y recuperación sin una base real. */
export async function processReceivedEvent(
  event: ReceivedEvent,
  repository: InboundRepository,
  retrieve: (emailId: string) => Promise<ReceivedEmail>,
  detectUnknown?: (input: AiReceiptInput) => Promise<AiReceipt | null>,
): Promise<Record<string, unknown>> {
  if (event.type !== "email.received") return { ok: true, ignored: "otro evento" };
  const recipients = event.data?.to;
  const addresses = Array.isArray(recipients) ? recipients.filter((to) => typeof to === "string") : [];
  let token = extractAliasToken(addresses);
  // Un correo directo de prueba no necesita consulta API. Un reenvío puede conservar
  // el To original de Gmail; en ese caso recupera el destinatario real de received_for.
  if (!token && addresses.some((to) => extractSenderAddress(to).endsWith("@recibos.darkmoney.company"))) {
    return { ok: true, ignored: "sin alias" };
  }
  let alias = token ? await repository.resolveAlias(token) : null;
  if (token && !alias) return { ok: true, ignored: "alias revocado o desconocido" };
  if (alias && !(await repository.hasProAccess(alias.user_id))) {
    return { ok: true, ignored: "detección por correo requiere PRO" };
  }
  const emailId = event.data?.email_id;
  if (!emailId) throw new Error("Falta ID de correo");
  const email = await retrieve(emailId);
  const deliveredToken = extractAliasToken([...(email.received_for ?? []), ...email.to]);
  if (token && deliveredToken !== token) throw new Error("Destinatario incoherente");
  if (!token) {
    token = deliveredToken;
    if (!token) return { ok: true, ignored: "sin alias" };
    alias = await repository.resolveAlias(token);
  }
  if (!alias) return { ok: true, ignored: "alias revocado o desconocido" };
  // Revalida tras recuperar el cuerpo: el acceso puede vencer durante la consulta a Resend.
  if (!(await repository.hasProAccess(alias.user_id))) {
    return { ok: true, ignored: "detección por correo requiere PRO" };
  }
  // Resultado del servidor receptor; nunca confía en un header proporcionado por el remitente.
  const authenticated = email.authentication?.dkim === "pass" || email.authentication?.dmarc === "pass";
  if (!authenticated && (email.authentication?.dkim === "fail" || email.authentication?.dmarc === "fail")) {
    return { ok: true, ignored: "autenticación del remitente fallida" };
  }
  // Reintentar un webhook ya procesado no vuelve a pagar IA ni cambia la propuesta.
  const existing = await repository.findSuggestion(alias, email.id);
  if (existing) {
    if (existing.status === "pending" || existing.status === "needs_review") await repository.ensureNotification(alias.user_id, existing);
    return { ok: true };
  }
  const text = email.text?.trim() || htmlToText(email.html ?? "");
  const receivedAt = new Date(email.created_at);
  if (!Number.isFinite(receivedAt.getTime())) throw new Error("Fecha de recepción inválida");
  const mapped = parseReceiptEmail({ from: email.from, subject: email.subject ?? "", text });
  const ai = !mapped && detectUnknown ? await detectUnknown({
    from: email.from, subject: email.subject ?? "", text, receivedAt: receivedAt.toISOString(),
    categories: await repository.listCategories(alias.workspace_id),
  }) : null;
  const parsed = mapped ?? ai;
  if (!parsed) return { ok: true, ignored: detectUnknown ? "correo sin movimiento confirmado" : "correo no reconocido" };
  // El plan puede vencer durante la consulta IA; tampoco crea una propuesta en ese caso.
  if (ai && !(await repository.hasProAccess(alias.user_id))) return { ok: true, ignored: "detección por correo requiere PRO" };
  const suggestion = await repository.saveSuggestion({
    ...alias, financial_app_key: parsed.financialAppKey, package_name: "email:inbound", app_label: parsed.appLabel,
    movement_type: parsed.movementType, amount: parsed.amount, currency_code: parsed.currencyCode,
    description: parsed.description, occurred_at: parsed.occurredAt ?? receivedAt.toISOString(), confidence: parsed.confidence,
    status: authenticated && !ai ? "pending" : "needs_review",
    dedupe_key: buildDedupeKey({ operationNumber: parsed.operationNumber, messageId: email.message_id ?? null,
      content: text, bank: parsed.financialAppKey, operationDate: parsed.occurredAt }),
    metadata: { source: "email", provider: "resend", app_label: parsed.appLabel, resendEmailId: email.id,
      operationNumber: parsed.operationNumber, senderAuthenticated: authenticated, dateSource: parsed.occurredAt ? "receipt" : "received",
      parser: ai ? "ai" : "mapped", ...(ai ? { categoryId: ai.categoryId, aiProvider: "deepseek" } : {}) },
  });
  // Un reintento recupera el aviso si su insert falló después de guardar la sugerencia.
  // Las sugerencias resueltas no vuelven a abrir avisos.
  if (suggestion.status === "pending" || suggestion.status === "needs_review") {
    await repository.ensureNotification(alias.user_id, suggestion);
  }
  return { ok: true };
}
