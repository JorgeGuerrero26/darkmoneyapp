/**
 * Serves the DarkMoney invitation banner as a public image for email clients.
 *
 * The image ships inside the code (banner-image.ts): `functions deploy` only uploads the module graph, so
 * reading banner-darkmoney.jpeg from disk returned 404 in production. After changing the .jpeg, regenerate
 * banner-image.ts with:
 *   node scripts/brand/embed-invite-banner.mjs
 *
 * Deploy:
 *   npx supabase functions deploy invite-banner --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { BANNER_JPEG_BASE64 } from "./banner-image.ts";

const bannerBytes = Uint8Array.from(atob(BANNER_JPEG_BASE64), (c) => c.charCodeAt(0));

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  return new Response(req.method === "HEAD" ? null : bannerBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bannerBytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
