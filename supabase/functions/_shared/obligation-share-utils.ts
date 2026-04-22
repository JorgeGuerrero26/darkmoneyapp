import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function numberFromBody(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function serviceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Falta configurar Supabase en la Edge Function.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedUser(req: Request, client: ReturnType<typeof serviceClient>) {
  const token = bearerToken(req);
  if (!token) throw new Error("No se recibio la sesion del usuario.");

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("No pudimos validar la sesion actual del usuario.");
  }

  return data.user;
}

export async function profileDisplayName(
  client: ReturnType<typeof serviceClient>,
  userId: string | null | undefined,
  fallbackEmail?: string | null,
): Promise<string | null> {
  if (!userId) return fallbackEmail?.split("@")[0] ?? null;
  const { data } = await client
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const fullName = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  return fullName || fallbackEmail?.split("@")[0] || null;
}

export async function findAuthUserByEmail(
  client: ReturnType<typeof serviceClient>,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  if (!email) return null;

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (match) return { id: match.id, email: match.email ?? null };
    if (data.users.length < 1000) break;
  }

  return null;
}

export function buildShareUrl(appUrl: unknown, token: string): string | null {
  const base = typeof appUrl === "string" ? appUrl.trim().replace(/\/+$/, "") : "";
  if (!base || !token) return null;
  return `${base}/share/obligations/${encodeURIComponent(token)}`;
}

export function buildMobileShareUrl(token: string): string | null {
  const scheme = (Deno.env.get("INVITE_APP_SCHEME") ?? "darkmoney").trim().replace(/:\/\/?$/, "");
  if (!scheme || !token) return null;
  return `${scheme}:///share/obligations/${encodeURIComponent(token)}`;
}

export function buildAndroidIntentShareUrl(token: string, fallbackUrl: string | null): string | null {
  const scheme = (Deno.env.get("INVITE_APP_SCHEME") ?? "darkmoney").trim().replace(/:\/\/?$/, "");
  const packageName = (Deno.env.get("INVITE_ANDROID_PACKAGE") ?? "com.darkmoney.app").trim();
  if (!scheme || !packageName || !token) return null;

  const fallbackPart = fallbackUrl
    ? `;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`
    : "";

  return `intent:///share/obligations/${encodeURIComponent(token)}#Intent;scheme=${scheme};package=${packageName}${fallbackPart};end`;
}

function defaultInviteHeroImageUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim().replace(/\/+$/, "");
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/invite-banner`;
  return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80";
}

export async function maybeSendInviteEmail(input: {
  to: string;
  shareUrl: string | null;
  mobileShareUrl: string | null;
  androidIntentShareUrl: string | null;
  obligationTitle: string;
  ownerDisplayName: string | null;
  message: string | null;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("INVITE_FROM_EMAIL") ??
    Deno.env.get("RESEND_FROM_EMAIL") ??
    Deno.env.get("FROM_EMAIL") ??
    Deno.env.get("EMAIL_FROM") ??
    "DarkMoney <onboarding@resend.dev>";
  const heroImageUrl =
    Deno.env.get("INVITE_HERO_IMAGE_URL") ??
    defaultInviteHeroImageUrl();
  if (!apiKey || !from || !input.shareUrl) return false;

  const owner = input.ownerDisplayName ?? "DarkMoney";
  const safeOwner = escapeHtml(owner);
  const safeTitle = escapeHtml(input.obligationTitle);
  const safeShareUrl = escapeHtml(input.shareUrl);
  const primaryShareUrl = input.androidIntentShareUrl ?? input.mobileShareUrl ?? input.shareUrl;
  const safePrimaryShareUrl = escapeHtml(primaryShareUrl);
  const safeMobileShareUrl = input.mobileShareUrl ? escapeHtml(input.mobileShareUrl) : null;
  const safeHeroImageUrl = escapeHtml(heroImageUrl);
  const safeMessage = input.message ? escapeHtml(input.message) : null;
  const text = [
    `${owner} te compartio un registro desde DarkMoney movil.`,
    `Registro: ${input.obligationTitle}`,
    input.message ? `Mensaje: ${input.message}` : null,
    input.androidIntentShareUrl ? `Abrir en Android: ${input.androidIntentShareUrl}` : null,
    input.mobileShareUrl ? `Abrir en la app: ${input.mobileShareUrl}` : null,
    `Enlace web de respaldo: ${input.shareUrl}`,
  ].filter(Boolean).join("\n\n");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitacion de DarkMoney</title>
      </head>
      <body style="margin:0;padding:0;background:#030711;color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${safeOwner} te compartio un registro desde DarkMoney movil.
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#030711;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#07111d;border-radius:30px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);box-shadow:0 24px 70px rgba(0,0,0,0.45);">
                <tr>
                  <td style="padding:0;background:#050b14;">
                    <img src="${safeHeroImageUrl}" alt="DarkMoney" width="640" style="display:block;width:100%;max-width:640px;height:210px;object-fit:cover;border:0;">
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 32px 12px 32px;background:linear-gradient(180deg,#07111d 0%,#050b14 100%);">
                    <div style="display:inline-block;padding:8px 13px;border-radius:999px;background:rgba(107,228,197,0.14);border:1px solid rgba(107,228,197,0.32);color:#6be4c5;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
                      Invitacion desde movil
                    </div>
                    <h1 style="margin:18px 0 10px 0;color:#f4f7fb;font-size:31px;line-height:1.12;font-weight:800;letter-spacing:0;">
                      ${safeOwner} te compartio un registro en DarkMoney
                    </h1>
                    <p style="margin:0;color:#b4c1d7;font-size:16px;line-height:1.65;">
                      Esta invitacion fue enviada desde la app movil. Abrela en tu celular para revisar y aceptar el credito o deuda compartida.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 32px 0 32px;background:#050b14;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:22px;background:#091522;border:1px solid rgba(255,255,255,0.10);">
                      <tr>
                        <td style="padding:21px 21px 19px 21px;">
                          <div style="font-size:12px;color:#8ea2bf;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:9px;">
                            Registro
                          </div>
                          <div style="font-size:21px;line-height:1.35;color:#f4f7fb;font-weight:800;">
                            ${safeTitle}
                          </div>
                          <div style="margin-top:13px;font-size:14px;line-height:1.55;color:#8ea2bf;">
                            Al aceptar, aparecera en tu seccion de creditos y deudas en modo compartido.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${safeMessage ? `
                <tr>
                  <td style="padding:14px 32px 0 32px;background:#050b14;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:20px;background:rgba(107,228,197,0.08);border:1px solid rgba(107,228,197,0.22);">
                      <tr>
                        <td style="padding:17px 19px;">
                          <div style="font-size:13px;color:#6be4c5;font-weight:800;margin-bottom:8px;">Mensaje de ${safeOwner}</div>
                          <div style="font-size:15px;line-height:1.58;color:#d9e4f2;">${safeMessage}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ""}
                <tr>
                  <td align="center" style="padding:28px 32px 12px 32px;background:#050b14;">
                    <a href="${safePrimaryShareUrl}" style="display:inline-block;background:#f3f7fd;color:#07111d;text-decoration:none;font-size:16px;font-weight:800;padding:16px 26px;border-radius:16px;box-shadow:0 14px 30px rgba(0,0,0,0.35);">
                      Abrir en movil
                    </a>
                  </td>
                </tr>
                ${safeMobileShareUrl ? `
                <tr>
                  <td align="center" style="padding:0 32px 14px 32px;background:#050b14;">
                    <a href="${safeMobileShareUrl}" style="display:inline-block;color:#6be4c5;text-decoration:none;font-size:14px;font-weight:800;">
                      Probar enlace alternativo
                    </a>
                  </td>
                </tr>
                ` : ""}
                <tr>
                  <td style="padding:8px 32px 32px 32px;background:#050b14;">
                    <p style="margin:0;color:#8ea2bf;font-size:13px;line-height:1.65;text-align:center;">
                      Si el boton no abre la app, usa este enlace de respaldo:<br>
                      <a href="${safeShareUrl}" style="color:#6be4c5;text-decoration:none;word-break:break-all;">${safeShareUrl}</a>
                      <br><br>
                      Tambien puedes revisar esta solicitud desde el modulo Notificaciones de tu app.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="max-width:640px;margin:18px auto 0 auto;color:#60718b;font-size:12px;line-height:1.5;text-align:center;">
                DarkMoney movil envio este correo porque alguien compartio un registro con tu direccion.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: `${owner} te compartio un registro desde DarkMoney movil`,
        text,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
