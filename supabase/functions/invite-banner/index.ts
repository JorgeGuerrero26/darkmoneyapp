/**
 * Serves the DarkMoney invitation banner as a public image for email clients.
 *
 * Deploy:
 *   npx supabase functions deploy invite-banner --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

const bannerFile = new URL("./banner-darkmoney.jpeg", import.meta.url);

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const bytes = await Deno.readFile(bannerFile);
    return new Response(req.method === "HEAD" ? null : bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[invite-banner]", error);
    return new Response("Banner not available", { status: 404 });
  }
});
