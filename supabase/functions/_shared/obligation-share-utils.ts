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

export async function maybeSendInviteEmail(input: {
  to: string;
  shareUrl: string | null;
  obligationTitle: string;
  ownerDisplayName: string | null;
  message: string | null;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INVITE_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from || !input.shareUrl) return false;

  const owner = input.ownerDisplayName ?? "DarkMoney";
  const text = [
    `${owner} compartio contigo "${input.obligationTitle}".`,
    input.message ? `Mensaje: ${input.message}` : null,
    `Abre la invitacion: ${input.shareUrl}`,
  ].filter(Boolean).join("\n\n");

  const html = `
    <p>${escapeHtml(owner)} compartio contigo <strong>${escapeHtml(input.obligationTitle)}</strong>.</p>
    ${input.message ? `<p>${escapeHtml(input.message)}</p>` : ""}
    <p><a href="${escapeHtml(input.shareUrl)}">Abrir invitacion</a></p>
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
