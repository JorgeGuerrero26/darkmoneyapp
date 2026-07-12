// Preflight para builds de EAS: si hay cambios NATIVOS desde el último bump de
// versión en app.json, exige bumpear antes de compilar. Evita el incidente
// 2026-07-11 (tres binarios distintos etiquetados 1.0.1: imposible saber qué
// APK tiene cada teléfono, y runtimeVersion/OTA anclados a la versión).
//
// Uso: node scripts/preflight-native-version.mjs   (encadenado en npm run build:android)
import { execSync } from "node:child_process";

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

// Último commit que tocó la línea "version" de app.json (bump o setup).
const lastBump = sh(`git log -1 --format=%H -G'"version"\\s*:' -- app.json`);
if (!lastBump) {
  console.error("preflight: no se encontró ningún bump de versión en app.json");
  process.exit(1);
}

// Rutas que obligan APK nuevo (ver CLAUDE.md / docs/BUILD_APK.md).
const NATIVE_PATHS = [
  "plugins/",
  "android/app/src/",
];

const changed = sh(
  `git log --name-only --format= ${lastBump}..HEAD -- ${NATIVE_PATHS.join(" ")}`,
)
  .split("\n")
  .filter(Boolean);

// También cuenta lo NO commiteado (working tree) en esas rutas.
const dirty = sh(`git status --porcelain -- ${NATIVE_PATHS.join(" ")}`)
  .split("\n")
  .filter(Boolean);

if (changed.length || dirty.length) {
  const version = sh(`node -p "require('./app.json').expo.version"`);
  console.error(
    `preflight: hay cambios nativos posteriores al último bump (v${version}):`,
  );
  for (const f of [...new Set([...changed, ...dirty.map((l) => l.replace(/^..\s+/, ""))])].slice(0, 10)) {
    console.error(`  - ${f}`);
  }
  console.error(
    "Bumpea version + android.versionCode en app.json (y commitea) antes de compilar.",
  );
  process.exit(1);
}

console.log("preflight OK: sin cambios nativos desde el último bump de versión.");
