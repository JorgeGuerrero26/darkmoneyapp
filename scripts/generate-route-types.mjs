// Regenera .expo/types/router.d.ts sin levantar el dev server (CI y local).
// Usa la API interna de expo-router que @expo/cli invoca en `expo start`.
// Si expo-router cambia la API en un upgrade, este script fallará ruidosamente:
// actualizarlo junto con la dependencia.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, "app");

const require = createRequire(import.meta.url);
const { regenerateDeclarations } = require("expo-router/build/typed-routes/index.js");

const outputDir = path.join(projectRoot, ".expo", "types");
fs.mkdirSync(outputDir, { recursive: true });
regenerateDeclarations(outputDir);

// regenerateDeclarations está debounced (1s): esperar a que el timer dispare
// y escriba el archivo antes de verificar.
setTimeout(() => {
  const outFile = path.join(outputDir, "router.d.ts");
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
    console.error("router.d.ts no se generó");
    process.exit(1);
  }
  console.log(`OK: ${outFile} (${fs.statSync(outFile).size} bytes)`);
}, 1500);
