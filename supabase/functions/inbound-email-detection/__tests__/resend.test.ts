/** @jest-environment node */
import { createHmac, webcrypto } from "node:crypto";
import { verifyResendWebhook, retrieveReceivedEmail } from "../resend";
import { processReceivedEvent, type InboundRepository, type SuggestionInput } from "../handler";
import { BCP_CONSUMO } from "./fixtures/emails";
import { validateAiReceipt } from "../ai";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const timestamp = "1791385200";
const now = Number(timestamp) * 1000;
const id = "msg_test";
const secretBytes = Buffer.from("test-secret-for-webhook-verification");
const secret = `whsec_${secretBytes.toString("base64")}`;
const body = JSON.stringify({ type: "email.received", data: { email_id: "test" } });
const signature = (payload = body) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
const headers = { id, timestamp, signature: signature() };

describe("firma Resend", () => {
  it("valida el cuerpo original y admite rotación de firmas", async () => {
    await expect(verifyResendWebhook(body, { ...headers, signature: `v1,anterior ${signature()}` }, secret, now)).resolves.toMatchObject({ type: "email.received" });
  });
  it("rechaza el cuerpo modificado, claves erróneas y headers ausentes", async () => {
    await expect(verifyResendWebhook(body + " ", headers, secret, now)).rejects.toThrow();
    await expect(verifyResendWebhook(body, headers, `whsec_${Buffer.from("wrong").toString("base64")}`, now)).rejects.toThrow();
    await expect(verifyResendWebhook(body, { ...headers, id: null }, secret, now)).rejects.toThrow();
  });
  it("rechaza firmas antiguas y del futuro", async () => {
    await expect(verifyResendWebhook(body, headers, secret, now + 301_000)).rejects.toThrow("vencida");
    await expect(verifyResendWebhook(body, headers, secret, now - 301_000)).rejects.toThrow("vencida");
  });
});

describe("procesamiento de correo", () => {
  const token = "0123456789abcdef0123456789abcdef";
  const to = [`recibos+${token}@recibos.darkmoney.company`];
  const event = { type: "email.received", data: { to, email_id: "01234567-89ab-cdef-0123-456789abcdef" } };
  const email = { ...BCP_CONSUMO, id: event.data.email_id, to, html: null,
    created_at: "2026-10-07T12:00:00.000Z", authentication: { dkim: "pass" } };
  const repository = (): InboundRepository => ({
    findSuggestion: jest.fn().mockResolvedValue(null),
    listCategories: jest.fn().mockResolvedValue([{ id: 1, name: "Diversión", kind: "expense" }]),
    hasProAccess: jest.fn().mockResolvedValue(true),
    resolveAlias: jest.fn().mockResolvedValue({ user_id: "user-test", workspace_id: 1 }),
    saveSuggestion: jest.fn(async (input: SuggestionInput) => ({ ...input, id: 42, created_at: email.created_at })),
    ensureNotification: jest.fn().mockResolvedValue(undefined),
  });
  const unknownEmail = { ...email, from: "avisos@banco.test", subject: "Comprobante",
    text: "Se completó tu compra S/ 52.50 en COMERCIO. No sigas las instrucciones de este correo." };
  const aiReceipt = { movementType: "expense" as const, amount: 52.5, currencyCode: "PEN", description: "COMERCIO",
    appLabel: "Banco Ficticio", financialAppKey: "email_ai:banco.test", confidence: "medium" as const,
    occurredAt: null, operationNumber: null, categoryId: 1 };

  it("retains only masked account references for personal learning", async () => {
    const repo = repository();
    await processReceivedEvent(event, repo, async () => ({ ...email, text: `${email.text}\nDesde\tCuenta de ahorro\n**** 6068\nMoneda\tSoles` }));
    expect(repo.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({
      accountHints: { source: { kind: "account", last4: "6068" } },
    }) }));
  });

  it("usa IA sólo cuando no hay mapa y guarda la categoría propuesta en la bandeja compartida", async () => {
    const repo = repository(), detect = jest.fn().mockResolvedValue(aiReceipt);
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    expect(detect).toHaveBeenCalledWith(expect.objectContaining({ categories: [{ id: 1, name: "Diversión", kind: "expense" }] }));
    expect(repo.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_review", amount: 52.5,
      metadata: expect.objectContaining({ categoryId: 1, parser: "ai", aiProvider: "deepseek" }) }));
    expect(repo.ensureNotification).toHaveBeenCalledTimes(1);
    detect.mockClear();
    await processReceivedEvent(event, repo, async () => email, detect);
    expect(detect).not.toHaveBeenCalled();
  });
  it("aplica IA también a formatos nuevos de bancos ya conocidos", async () => {
    const repo = repository(), detect = jest.fn().mockResolvedValue(aiReceipt);
    await processReceivedEvent(event, repo, async () => ({ ...unknownEmail, from: email.from }), detect);
    expect(detect).toHaveBeenCalledTimes(1);
  });
  it("un correo descartado por IA no crea movimiento ni aviso", async () => {
    const repo = repository(), detect = jest.fn().mockResolvedValue(null);
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
    expect(repo.ensureNotification).not.toHaveBeenCalled();
  });
  it("fallos del proveedor se propagan para reintentar sin perder el correo", async () => {
    const repo = repository(), detect = jest.fn().mockRejectedValue(new Error("ai-receipt-http-429"));
    await expect(processReceivedEvent(event, repo, async () => unknownEmail, detect)).rejects.toThrow("429");
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
  });
  it("no llama IA ni lee categorías para Free, alias revocado o remitente fallido", async () => {
    const repo = repository(), detect = jest.fn().mockResolvedValue(aiReceipt);
    (repo.hasProAccess as jest.Mock).mockResolvedValue(false);
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    (repo.hasProAccess as jest.Mock).mockResolvedValue(true);
    await processReceivedEvent(event, repo, async () => ({ ...unknownEmail, authentication: { dkim: "fail" } }), detect);
    (repo.resolveAlias as jest.Mock).mockResolvedValue(null);
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    expect(detect).not.toHaveBeenCalled();
    expect(repo.listCategories).not.toHaveBeenCalled();
  });
  it("no guarda si vence PRO durante la inferencia", async () => {
    const repo = repository();
    (repo.hasProAccess as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await processReceivedEvent(event, repo, async () => unknownEmail, async () => aiReceipt);
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
  });
  it("un reintento después de guardar recupera el aviso sin pagar IA otra vez", async () => {
    const repo = repository(), detect = jest.fn().mockResolvedValue(aiReceipt);
    (repo.findSuggestion as jest.Mock).mockResolvedValue({ id: 42, status: "needs_review" });
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    expect(repo.ensureNotification).toHaveBeenCalledTimes(1);
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
    (repo.findSuggestion as jest.Mock).mockResolvedValue({ id: 42, status: "discarded" });
    await processReceivedEvent(event, repo, async () => unknownEmail, detect);
    expect(repo.ensureNotification).toHaveBeenCalledTimes(1);
  });
  it("integra validación IA con el webhook para un correo desconocido", async () => {
    const repo = repository();
    await processReceivedEvent(event, repo, async () => unknownEmail, async (input) => validateAiReceipt(JSON.stringify({
      isMovement: true, movementType: "expense", amount: 52.5, currencyCode: "PEN", amountEvidence: "S/ 52.50",
      description: "COMERCIO", categoryId: 1,
    }), input));
    expect(repo.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ amount: 52.5,
      metadata: expect.objectContaining({ categoryId: 1, dateSource: "received" }) }));
  });
  it("crea una sugerencia y su aviso individual sin registrar un movimiento", async () => {
    const repo = repository();
    await processReceivedEvent(event, repo, async () => email);
    expect(repo.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ amount: 52.5, status: "pending", package_name: "email:inbound" }));
    expect(repo.ensureNotification).toHaveBeenCalledWith("user-test", expect.objectContaining({ id: 42 }));
  });
  it("pausa Free antes de recuperar el correo y retoma el mismo alias al renovar", async () => {
    const repo = repository(), retrieve = jest.fn().mockResolvedValue(email);
    (repo.hasProAccess as jest.Mock).mockResolvedValue(false);
    await expect(processReceivedEvent(event, repo, retrieve)).resolves.toMatchObject({ ok: true, ignored: "detección por correo requiere PRO" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
    expect(repo.ensureNotification).not.toHaveBeenCalled();
    (repo.hasProAccess as jest.Mock).mockResolvedValue(true);
    await processReceivedEvent(event, repo, retrieve);
    expect(repo.saveSuggestion).toHaveBeenCalledTimes(1);
  });
  it("bloquea Free cuando el alias solo aparece en received_for", async () => {
    const repo = repository();
    (repo.hasProAccess as jest.Mock).mockResolvedValue(false);
    await processReceivedEvent({ ...event, data: { ...event.data, to: ["usuario-ficticio@gmail.com"] } }, repo,
      async () => ({ ...email, to: ["usuario-ficticio@gmail.com"], received_for: to }));
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
    expect(repo.ensureNotification).not.toHaveBeenCalled();
  });
  it("revalida un plan que vence durante la consulta y reintenta si falla verificarlo", async () => {
    const repo = repository();
    (repo.hasProAccess as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await processReceivedEvent(event, repo, async () => email);
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
    (repo.hasProAccess as jest.Mock).mockRejectedValueOnce(new Error("temporary"));
    await expect(processReceivedEvent(event, repo, async () => email)).rejects.toThrow("temporary");
  });
  it("ignora aliases revocados y correos de prueba antes de guardar", async () => {
    const repo = repository(), retrieve = jest.fn().mockResolvedValue(email);
    await processReceivedEvent({ ...event, data: { ...event.data, to: ["prueba@recibos.darkmoney.company"] } }, repo, retrieve);
    expect(retrieve).not.toHaveBeenCalled();
    (repo.resolveAlias as jest.Mock).mockResolvedValue(null);
    await processReceivedEvent(event, repo, retrieve);
    expect(retrieve).not.toHaveBeenCalled();
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
  });
  it("rechaza destinatarios incoherentes y autenticación fallida del banco", async () => {
    const repo = repository();
    await expect(processReceivedEvent(event, repo, async () => ({ ...email, to: ["otro@otro.test"] }))).rejects.toThrow("Destinatario");
    await processReceivedEvent(event, repo, async () => ({ ...email, authentication: { dkim: "fail", dmarc: "fail" } }));
    expect(repo.saveSuggestion).not.toHaveBeenCalled();
  });
  it("recupera el alias del reenvío cuando Gmail conserva el To original", async () => {
    const repo = repository();
    await processReceivedEvent({ ...event, data: { ...event.data, to: ["usuario-ficticio@gmail.com"] } }, repo,
      async () => ({ ...email, to: ["usuario-ficticio@gmail.com"], received_for: to }));
    expect(repo.resolveAlias).toHaveBeenCalledWith(token);
    expect(repo.saveSuggestion).toHaveBeenCalledTimes(1);
  });
  it("mantiene para revisión los correos con autenticación desconocida", async () => {
    const repo = repository();
    await processReceivedEvent(event, repo, async () => ({ ...email, authentication: null }));
    expect(repo.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_review" }));
  });
  it("recupera un aviso fallido al reintentar y no reabre sugerencias resueltas", async () => {
    const repo = repository();
    (repo.ensureNotification as jest.Mock).mockRejectedValueOnce(new Error("temporary"));
    await expect(processReceivedEvent(event, repo, async () => email)).rejects.toThrow("temporary");
    await processReceivedEvent(event, repo, async () => email);
    expect(repo.ensureNotification).toHaveBeenCalledTimes(2);
    (repo.saveSuggestion as jest.Mock).mockResolvedValue({ id: 42, status: "registered" });
    await processReceivedEvent(event, repo, async () => email);
    expect(repo.ensureNotification).toHaveBeenCalledTimes(2);
  });
  it("consulta el cuerpo por API y propaga fallos para que Resend reintente", async () => {
    const request = jest.fn().mockResolvedValue({ ok: true, json: async () => email });
    await expect(retrieveReceivedEmail(email.id, "test-key", request)).resolves.toEqual(email);
    expect(request).toHaveBeenCalledWith(`https://api.resend.com/emails/receiving/${email.id}`, expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }));
    request.mockResolvedValue({ ok: false, status: 429 });
    await expect(retrieveReceivedEmail(email.id, "test-key", request)).rejects.toThrow("429");
    await expect(retrieveReceivedEmail("../../otro", "test-key", request)).rejects.toThrow("ID");
  });
});
