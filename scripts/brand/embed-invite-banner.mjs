// Mete banner-darkmoney.jpeg dentro del código de la edge function invite-banner.
// `supabase functions deploy` solo sube código: un .jpeg al lado del index.ts no llega al servidor (daba 404).
// Uso: node scripts/brand/embed-invite-banner.mjs  (y luego desplegar invite-banner)
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../supabase/functions/invite-banner/", import.meta.url);
const base64 = readFileSync(new URL("banner-darkmoney.jpeg", dir)).toString("base64");
writeFileSync(
  new URL("banner-image.ts", dir),
  "// Generado desde banner-darkmoney.jpeg por scripts/brand/embed-invite-banner.mjs. No editar a mano.\n" +
    `export const BANNER_JPEG_BASE64 =\n  "${base64}";\n`,
);
console.log(`banner-image.ts: ${base64.length} caracteres`);
