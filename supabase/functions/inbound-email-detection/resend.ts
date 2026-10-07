/** Adaptador Resend: firma Svix y lectura del correo completo. Sin dependencias de Deno. */
export type ReceivedEmail = {
  id: string; from: string; to: string[]; subject: string;
  text: string | null; html: string | null; created_at: string; message_id?: string;
  received_for?: string[];
  authentication?: { dkim?: string; dmarc?: string } | null;
};
export type ReceivedEvent = { type: string; data?: { email_id?: string; to?: string[] } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HMAC del cuerpo original, tolerancia de 5 min y comparación constante (protocolo Svix). */
export async function verifyResendWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): Promise<ReceivedEvent> {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret.startsWith("whsec_")) throw new Error("Firma incompleta");
  const timestamp = Number(headers.timestamp);
  if (!/^\d+$/.test(headers.timestamp) || !Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) throw new Error("Firma vencida");
  const keyBytes = Uint8Array.from(atob(secret.slice(6)), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...signature));
  const valid = headers.signature.split(" ").some((part) => {
    const [version, supplied] = part.split(",");
    if (version !== "v1" || !supplied || supplied.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    return difference === 0;
  });
  if (!valid) throw new Error("Firma inválida");
  const event = JSON.parse(body);
  if (!event || typeof event.type !== "string") throw new Error("Evento inválido");
  return event as ReceivedEvent;
}

export async function retrieveReceivedEmail(emailId: string, apiKey: string, request: typeof fetch = fetch): Promise<ReceivedEmail> {
  if (!UUID.test(emailId)) throw new Error("ID de correo inválido");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await request(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal,
    });
    if (!response.ok) throw new Error(`resend-http-${response.status}`);
    const email = await response.json() as ReceivedEmail;
    if (email.id !== emailId || typeof email.from !== "string" || !Array.isArray(email.to) ||
        !email.to.every((to) => typeof to === "string")) throw new Error("Respuesta de correo inválida");
    return email;
  } finally { clearTimeout(timer); }
}
