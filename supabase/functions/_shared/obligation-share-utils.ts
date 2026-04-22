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

export async function maybeSendInviteEmail(input: {
  to: string;
  shareUrl: string | null;
  mobileShareUrl: string | null;
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
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80";
  if (!apiKey || !from || !input.shareUrl) return false;

  const owner = input.ownerDisplayName ?? "DarkMoney";
  const safeOwner = escapeHtml(owner);
  const safeTitle = escapeHtml(input.obligationTitle);
  const safeShareUrl = escapeHtml(input.shareUrl);
  const primaryShareUrl = input.mobileShareUrl ?? input.shareUrl;
  const safePrimaryShareUrl = escapeHtml(primaryShareUrl);
  const safeHeroImageUrl = escapeHtml(heroImageUrl);
  const safeMessage = input.message ? escapeHtml(input.message) : null;
  const text = [
    `${owner} compartio contigo "${input.obligationTitle}".`,
    input.message ? `Mensaje: ${input.message}` : null,
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
      <body style="margin:0;padding:0;background:#f3f6fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${safeOwner} compartio contigo una obligacion en DarkMoney.
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 50px rgba(15,23,42,0.10);">
                <tr>
                  <td style="padding:0;">
                    <img src="${safeHeroImageUrl}" alt="DarkMoney" width="640" style="display:block;width:100%;max-width:640px;height:220px;object-fit:cover;border:0;">
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 30px 12px 30px;">
                    <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#e8f7ef;color:#0f8a4b;font-size:12px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">
                      Invitacion privada
                    </div>
                    <h1 style="margin:18px 0 10px 0;color:#101828;font-size:28px;line-height:1.18;font-weight:800;letter-spacing:0;">
                      ${safeOwner} compartio una obligacion contigo
                    </h1>
                    <p style="margin:0;color:#475467;font-size:16px;line-height:1.6;">
                      Puedes revisar el credito o deuda compartida en DarkMoney y darle seguimiento desde tu cuenta.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 30px 0 30px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;background:#f8fafc;border:1px solid #e4e7ec;">
                      <tr>
                        <td style="padding:18px 18px 16px 18px;">
                          <div style="font-size:13px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">
                            Obligacion compartida
                          </div>
                          <div style="font-size:20px;line-height:1.35;color:#101828;font-weight:800;">
                            ${safeTitle}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${safeMessage ? `
                <tr>
                  <td style="padding:14px 30px 0 30px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;background:#fff8eb;border:1px solid #fedf89;">
                      <tr>
                        <td style="padding:16px 18px;">
                          <div style="font-size:13px;color:#b54708;font-weight:800;margin-bottom:8px;">Mensaje de ${safeOwner}</div>
                          <div style="font-size:15px;line-height:1.55;color:#344054;">${safeMessage}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ""}
                <tr>
                  <td align="center" style="padding:26px 30px 12px 30px;">
                    <a href="${safePrimaryShareUrl}" style="display:inline-block;background:#141b34;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:15px 24px;border-radius:14px;box-shadow:0 10px 24px rgba(20,27,52,0.22);">
                      Abrir en la app
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 30px 28px 30px;">
                    <p style="margin:0;color:#667085;font-size:13px;line-height:1.6;text-align:center;">
                      Si el boton no abre la app, usa este enlace de respaldo:<br>
                      <a href="${safeShareUrl}" style="color:#2563eb;text-decoration:none;word-break:break-all;">${safeShareUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="max-width:640px;margin:18px auto 0 auto;color:#98a2b3;font-size:12px;line-height:1.5;text-align:center;">
                DarkMoney envio este correo porque alguien compartio una obligacion con tu direccion.
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
        subject: `${owner} compartio una obligacion contigo`,
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
